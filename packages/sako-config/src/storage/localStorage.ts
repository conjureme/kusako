import type { ProviderType, ProvidersConfig } from '../types/provider';

const STORAGE_KEY = 'kusako_providers';
const ACTIVE_KEY = 'kusako_active_provider';

const DEFAULT_PROVIDERS: ProvidersConfig = {
  koboldcpp: { baseUrl: '', apiKey: '' },
  claude: { baseUrl: 'https://api.anthropic.com/v1/', apiKey: '', model: '' },
};

const PROVIDER_TYPES = Object.keys(DEFAULT_PROVIDERS) as ProviderType[];

export function getProvidersConfig(): ProvidersConfig {
  if (typeof window === 'undefined') return DEFAULT_PROVIDERS;

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PROVIDERS));
    return DEFAULT_PROVIDERS;
  }

  try {
    return JSON.parse(stored);
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PROVIDERS));
    return DEFAULT_PROVIDERS;
  }
}

export function updateProviderConfig<T extends ProviderType>(
  type: T,
  config: ProvidersConfig[T]
): void {
  if (typeof window === 'undefined') return;

  const providers = getProvidersConfig();
  providers[type] = config;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(providers));
}

export function getProviderConfig<T extends ProviderType>(
  type: T
): ProvidersConfig[T] {
  const providers = getProvidersConfig();
  return providers[type];
}

export function setActiveProvider(type: ProviderType | null): void {
  if (typeof window === 'undefined') return;

  if (type === null) {
    localStorage.removeItem(ACTIVE_KEY);
  } else {
    localStorage.setItem(ACTIVE_KEY, type);
  }
}

export function getActiveProvider(): ProviderType | null {
  if (typeof window === 'undefined') return null;

  const active = localStorage.getItem(ACTIVE_KEY);
  if (!active) {
    localStorage.setItem(ACTIVE_KEY, '');
    return null;
  }

  if (PROVIDER_TYPES.indexOf(active as ProviderType) === -1) {
    return null;
  }
  return active as ProviderType;
}

export function getActiveProviderConfig(): {
  type: ProviderType;
  config: ProvidersConfig[ProviderType];
} | null {
  const activeType = getActiveProvider();
  if (!activeType) return null;

  const config = getProviderConfig(activeType);
  return { type: activeType, config };
}
