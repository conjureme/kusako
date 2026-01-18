import type { KoboldCppSamplers, ClaudeSamplers } from './samplers';

export interface BaseProviderConfig {
  baseUrl: string;
}

export interface KoboldCppConfig extends BaseProviderConfig {
  apiKey?: string;
  samplers?: KoboldCppSamplers;
}

export interface ClaudeConfig extends BaseProviderConfig {
  apiKey: string;
  model: string;
  samplers?: ClaudeSamplers;
}

export interface ProvidersConfig {
  koboldcpp: KoboldCppConfig;
  claude: ClaudeConfig;
}

export type ProviderType = keyof ProvidersConfig;

export interface ProviderStorage {
  providers: ProvidersConfig;
  activeProvider: ProviderType | null;
}
