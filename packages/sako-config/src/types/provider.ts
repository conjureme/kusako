export interface BaseProviderConfig {
  baseUrl: string;
}

export interface KoboldCppConfig extends BaseProviderConfig {
  apiKey?: string;
}

export interface ClaudeConfig extends BaseProviderConfig {
  apiKey: string;
  model: string;
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
