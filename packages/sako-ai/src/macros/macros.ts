import type {
  InstructTemplate,
  ContextTemplate,
  SystemPrompt,
} from '@repo/sako-config';

import type { Macro, MacroValue, MacroEnv } from '../types/prompt';
import { getVariableMacros } from './variables';

type MacroFunction = (nonce: string) => string;

export class MacrosParser {
  static #macros = new Map<string, MacroValue>();
  static #descriptions = new Map<string, string>();

  static *[Symbol.iterator](): IterableIterator<{
    key: string;
    description: string | undefined;
  }> {
    for (const key of MacrosParser.#macros.keys()) {
      yield { key, description: MacrosParser.#descriptions.get(key) };
    }
  }

  static get(key: string): MacroValue | undefined {
    return MacrosParser.#macros.get(key);
  }

  static has(key: string): boolean {
    return MacrosParser.#macros.has(key);
  }

  static registerMacro(key: string, value: MacroValue, description = ''): void {
    key = key.trim();
    if (!key) throw new Error('macro key must not be empty');
    if (key.startsWith('{{') || key.endsWith('}}'))
      throw new Error('macro key must not include surrounding braces');

    MacrosParser.#macros.set(key, value);
    if (description) MacrosParser.#descriptions.set(key, description);
  }

  static unregisterMacro(key: string): void {
    key = key.trim();
    if (!key) throw new Error('macro key must not be empty');
    MacrosParser.#macros.delete(key);
    MacrosParser.#descriptions.delete(key);
  }

  static populateEnv(env: MacroEnv): void {
    if (!env || typeof env !== 'object') return;
    for (const [key, value] of MacrosParser.#macros) {
      env[key] = value;
    }
  }

  static sanitizeMacroValue(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getDiceRollMacro(): Macro {
  return {
    regex: /{{roll[ :]([^}]+)}}/gi,
    replace: (_, matchValue) => {
      let formula = matchValue.trim();
      const digitsOnly = /^\d+$/.test(formula);
      if (digitsOnly) formula = `1d${formula}`;

      const match = formula.match(/^(\d+)d(\d+)$/i);
      if (!match) return '';

      const count = parseInt(match[1]!, 10);
      const sides = parseInt(match[2]!, 10);
      if (count <= 0 || sides <= 0) return '';

      let total = 0;
      for (let i = 0; i < count; i++) {
        total += Math.floor(Math.random() * sides) + 1;
      }
      return String(total);
    },
  };
}

function getRandomReplaceMacro(): Macro {
  return {
    regex: /{{random\s?::?([^}]+)}}/gi,
    replace: (_, listString) => {
      const list = listString.includes('::')
        ? listString.split('::')
        : listString
            .replace(/\\,/g, '\x00')
            .split(',')
            .map((item: string) => item.trim().replace(/\x00/g, ','));

      if (list.length === 0) return '';
      return list[Math.floor(Math.random() * list.length)]!;
    },
  };
}

function getInstructMacros(
  instruct: InstructTemplate | null,
  context: ContextTemplate | null,
  systemPrompt: SystemPrompt | null,
): Macro[] {
  const entries: { key: string; value: string }[] = [
    {
      key: 'instructInput|instructUserPrefix',
      value: instruct?.input_sequence ?? '',
    },
    { key: 'instructUserSuffix', value: instruct?.input_suffix ?? '' },
    {
      key: 'instructOutput|instructAssistantPrefix',
      value: instruct?.output_sequence ?? '',
    },
    {
      key: 'instructSeparator|instructAssistantSuffix',
      value: instruct?.output_suffix ?? '',
    },
    { key: 'instructSystemPrefix', value: instruct?.system_sequence ?? '' },
    { key: 'instructSystemSuffix', value: instruct?.system_suffix ?? '' },
    {
      key: 'instructFirstOutput|instructFirstAssistantPrefix',
      value: instruct?.first_output_sequence || instruct?.output_sequence || '',
    },
    {
      key: 'instructLastOutput|instructLastAssistantPrefix',
      value: instruct?.last_output_sequence || instruct?.output_sequence || '',
    },
    {
      key: 'instructFirstInput|instructFirstUserPrefix',
      value: instruct?.first_input_sequence || instruct?.input_sequence || '',
    },
    {
      key: 'instructLastInput|instructLastUserPrefix',
      value: instruct?.last_input_sequence || instruct?.input_sequence || '',
    },
    { key: 'instructStop', value: instruct?.stop_sequence ?? '' },
    {
      key: 'instructUserFiller',
      value: instruct?.user_alignment_message ?? '',
    },
    {
      key: 'instructSystemInstructionPrefix',
      value: instruct?.last_system_sequence ?? '',
    },
    {
      key: 'instructStoryStringPrefix',
      value:
        (instruct as unknown as Record<string, string>)?.story_string_prefix ??
        '',
    },
    {
      key: 'instructStoryStringSuffix',
      value:
        (instruct as unknown as Record<string, string>)?.story_string_suffix ??
        '',
    },
    {
      key: 'systemPrompt|defaultSystemPrompt|instructSystem|instructSystemPrompt',
      value: systemPrompt?.content ?? '',
    },
    { key: 'chatSeparator', value: context?.example_separator ?? '' },
    { key: 'chatStart', value: context?.chat_start ?? '' },
  ];

  return entries.map(({ key, value }) => ({
    regex: new RegExp(`{{(${key})}}`, 'gi'),
    replace: () => value,
  }));
}

export interface EvaluateMacrosOptions {
  instruct?: InstructTemplate | null;
  context?: ContextTemplate | null;
  systemPrompt?: SystemPrompt | null;
  messages?: {
    content: string;
    isUser: boolean;
    isSystem?: boolean;
    timestamp?: number;
  }[];
}

function getTimeSinceLastMessage(
  messages: EvaluateMacrosOptions['messages'],
): string {
  if (!messages || messages.length === 0) return 'just now';

  let lastUserBeforeChar: { timestamp?: number } | undefined;
  let takeNext = false;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (msg.isSystem) continue;
    if (msg.isUser && takeNext) {
      lastUserBeforeChar = msg;
      break;
    }
    takeNext = true;
  }

  if (lastUserBeforeChar?.timestamp) {
    const diff = Date.now() - lastUserBeforeChar.timestamp;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return 'a few seconds';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes === 1 ? 'a minute' : `${minutes} minutes`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours === 1 ? 'an hour' : `${hours} hours`;
    const days = Math.floor(hours / 24);
    return days === 1 ? 'a day' : `${days} days`;
  }

  return 'just now';
}

function getLastMessage(messages: EvaluateMacrosOptions['messages']): string {
  if (!messages || messages.length === 0) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (!msg.isSystem) return msg.content;
  }
  return '';
}

function getLastUserMessage(
  messages: EvaluateMacrosOptions['messages'],
): string {
  if (!messages || messages.length === 0) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (msg.isUser && !msg.isSystem) return msg.content;
  }
  return '';
}

function getLastCharMessage(
  messages: EvaluateMacrosOptions['messages'],
): string {
  if (!messages || messages.length === 0) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (!msg.isUser && !msg.isSystem) return msg.content;
  }
  return '';
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function evaluateMacros(
  content: string,
  env: MacroEnv,
  options: EvaluateMacrosOptions = {},
): string {
  if (!content) return '';

  const {
    instruct = null,
    context = null,
    systemPrompt = null,
    messages = [],
  } = options;

  const preEnvMacros: Macro[] = [
    getDiceRollMacro(),
    ...getInstructMacros(instruct, context, systemPrompt),
    ...getVariableMacros(),
    { regex: /{{newline}}/gi, replace: () => '\n' },
    { regex: /(?:\r?\n)*{{trim}}(?:\r?\n)*/gi, replace: () => '' },
    { regex: /{{noop}}/gi, replace: () => '' },
  ];

  const now = new Date();
  const postEnvMacros: Macro[] = [
    { regex: /{{lastMessage}}/gi, replace: () => getLastMessage(messages) },
    {
      regex: /{{lastUserMessage}}/gi,
      replace: () => getLastUserMessage(messages),
    },
    {
      regex: /{{lastCharMessage}}/gi,
      replace: () => getLastCharMessage(messages),
    },
    {
      regex: /{{reverse:(.+?)}}/gi,
      replace: (_, str) => Array.from(str).reverse().join(''),
    },
    { regex: /\{\{\/\/([\s\S]*?)\}\}/gm, replace: () => '' },
    {
      regex: /{{time}}/gi,
      replace: () =>
        now.toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        }),
    },
    {
      regex: /{{date}}/gi,
      replace: () =>
        now.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
    },
    {
      regex: /{{weekday}}/gi,
      replace: () => now.toLocaleDateString(undefined, { weekday: 'long' }),
    },
    {
      regex: /{{isotime}}/gi,
      replace: () => `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
    },
    {
      regex: /{{isodate}}/gi,
      replace: () =>
        `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`,
    },
    {
      regex: /{{idle_duration}}/gi,
      replace: () => getTimeSinceLastMessage(messages),
    },
    getRandomReplaceMacro(),
  ];

  MacrosParser.populateEnv(env);
  const nonce = crypto.randomUUID?.() ?? String(Math.random());
  const envMacros: Macro[] = [];

  for (const varName in env) {
    if (!Object.hasOwn(env, varName)) continue;
    const envRegex = new RegExp(`{{${escapeRegex(varName)}}}`, 'gi');
    envMacros.push({
      regex: envRegex,
      replace: () => {
        const param = env[varName];
        return MacrosParser.sanitizeMacroValue(
          typeof param === 'function' ? (param as MacroFunction)(nonce) : param,
        );
      },
    });
  }

  const macros = [...preEnvMacros, ...envMacros, ...postEnvMacros];

  for (const macro of macros) {
    if (!content) break;
    if (!content.includes('{{')) break;

    try {
      content = content.replace(macro.regex, (...args: string[]) =>
        macro.replace(...args),
      );
    } catch {
      // skip failed macro replacement
    }
  }

  return content;
}
