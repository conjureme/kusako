import type {
  ContextTemplate,
  InstructTemplate,
  SystemPrompt,
  ProviderType,
  KoboldCppConfig,
  ClaudeConfig,
  SamplerSettings,
} from '@repo/sako-config';

export interface Macro {
  regex: RegExp;
  replace: (...args: string[]) => string;
}

export type MacroValue = string | ((nonce: string) => string);

export interface StoryStringParams {
  description: string;
  personality: string;
  persona: string;
  scenario: string;
  system: string;
  char: string;
  user: string;
  wiBefore: string;
  wiAfter: string;
  mesExamples: string;
  [key: string]: string;
}

export interface RenderOptions {
  storyString?: string;
  instruct?: InstructTemplate;
  context?: ContextTemplate;
  systemPrompt?: SystemPrompt;
}

export interface MacroEnv {
  [key: string]: MacroValue;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SendMessageOptions {
  systemContext: string;
  messages: ChatMessage[];
  providerType: ProviderType;
  providerConfig: KoboldCppConfig | ClaudeConfig;
  samplers?: SamplerSettings;
  instruct?: InstructTemplate;
}

export interface SendMessageResult {
  content: string;
  error?: string;
}
