import Handlebars from 'handlebars';

import type {
  StoryStringParams,
  RenderOptions,
  MacroEnv,
} from '../types/prompt';
import { evaluateMacros } from '../macros/macros';

Handlebars.registerHelper('trim', () => '{{trim}}');

Handlebars.registerHelper(
  'helperMissing',
  function (this: unknown, ...args: unknown[]) {
    const options = args[args.length - 1] as { name: string };
    return `{{${options.name}}}`;
  },
);

export function renderStoryString(
  params: StoryStringParams,
  options: RenderOptions = {},
): string {
  const storyString =
    options.storyString ?? options.context?.story_string ?? '';
  if (!storyString) return '';

  try {
    const compiled = Handlebars.compile(storyString, { noEscape: true });
    let output = compiled(params);

    const env: MacroEnv = {
      char: params.char,
      user: params.user,
      description: params.description,
      personality: params.personality,
      scenario: params.scenario,
      persona: params.persona,
      mesExamples: params.mesExamples,
    };

    for (const key in params) {
      if (!Object.hasOwn(params, key)) continue;
      if (!(key in env)) env[key] = params[key]!;
    }

    output = evaluateMacros(output, env, {
      instruct: options.instruct ?? null,
      context: options.context ?? null,
      systemPrompt: options.systemPrompt ?? null,
    });

    output = output.replace(/^\n+/, '');

    if (output.length > 0 && !output.endsWith('\n')) {
      output += '\n';
    }

    return output;
  } catch (e) {
    console.error('failed to render story string:', e);
    return '';
  }
}
