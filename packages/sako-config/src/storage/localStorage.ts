import type { ProviderType, ProvidersConfig } from '../types/provider';
import type {
  ContextTemplate,
  InstructTemplate,
  SystemPrompt,
} from '../types/templates';
import type { SamplerSettings } from '../types/samplers';

import {
  CONTEXT_PRESETS,
  INSTRUCT_PRESETS,
  SYSTEM_PRESETS,
  SAMPLER_PRESETS,
} from '../schemas/presets';

const STORAGE_KEY = 'kusako_providers';
const ACTIVE_KEY = 'kusako_active_provider';

const CONTEXT_TEMPLATES_KEY = 'kusako_context_templates';
const INSTRUCT_TEMPLATES_KEY = 'kusako_instruct_templates';
const SYSTEM_TEMPLATES_KEY = 'kusako_system_templates';
const SAMPLER_TEMPLATES_KEY = 'kusako_sampler_templates';

const ACTIVE_CONTEXT_KEY = 'kusako_active_context';
const ACTIVE_INSTRUCT_KEY = 'kusako_active_instruct';
const ACTIVE_SYSTEM_KEY = 'kusako_active_system';
const ACTIVE_SAMPLER_KEY = 'kusako_active_sampler';

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

export function getContextTemplates(): Record<string, ContextTemplate> {
  if (typeof window === 'undefined') return CONTEXT_PRESETS;

  const stored = localStorage.getItem(CONTEXT_TEMPLATES_KEY);
  if (!stored) {
    localStorage.setItem(
      CONTEXT_TEMPLATES_KEY,
      JSON.stringify(CONTEXT_PRESETS)
    );
    return CONTEXT_PRESETS;
  }

  try {
    return JSON.parse(stored);
  } catch {
    localStorage.setItem(
      CONTEXT_TEMPLATES_KEY,
      JSON.stringify(CONTEXT_PRESETS)
    );
    return CONTEXT_PRESETS;
  }
}

export function getInstructTemplates(): Record<string, InstructTemplate> {
  if (typeof window === 'undefined') return INSTRUCT_PRESETS;

  const stored = localStorage.getItem(INSTRUCT_TEMPLATES_KEY);
  if (!stored) {
    localStorage.setItem(
      INSTRUCT_TEMPLATES_KEY,
      JSON.stringify(INSTRUCT_PRESETS)
    );
    return INSTRUCT_PRESETS;
  }

  try {
    return JSON.parse(stored);
  } catch {
    localStorage.setItem(
      INSTRUCT_TEMPLATES_KEY,
      JSON.stringify(INSTRUCT_PRESETS)
    );
    return INSTRUCT_PRESETS;
  }
}

export function getSystemTemplates(): Record<string, SystemPrompt> {
  if (typeof window === 'undefined') return SYSTEM_PRESETS;

  const stored = localStorage.getItem(SYSTEM_TEMPLATES_KEY);
  if (!stored) {
    localStorage.setItem(SYSTEM_TEMPLATES_KEY, JSON.stringify(SYSTEM_PRESETS));
    return SYSTEM_PRESETS;
  }

  try {
    return JSON.parse(stored);
  } catch {
    localStorage.setItem(SYSTEM_TEMPLATES_KEY, JSON.stringify(SYSTEM_PRESETS));
    return SYSTEM_PRESETS;
  }
}

export function getSamplerTemplates(): Record<string, SamplerSettings> {
  if (typeof window === 'undefined') return SAMPLER_PRESETS;

  const stored = localStorage.getItem(SAMPLER_TEMPLATES_KEY);
  if (!stored) {
    localStorage.setItem(
      SAMPLER_TEMPLATES_KEY,
      JSON.stringify(SAMPLER_PRESETS)
    );
    return SAMPLER_PRESETS;
  }

  try {
    return JSON.parse(stored);
  } catch {
    localStorage.setItem(
      SAMPLER_TEMPLATES_KEY,
      JSON.stringify(SAMPLER_PRESETS)
    );
    return SAMPLER_PRESETS;
  }
}

export function getActiveContext(): string | null {
  if (typeof window === 'undefined') return null;

  const active = localStorage.getItem(ACTIVE_CONTEXT_KEY);
  if (!active) {
    localStorage.setItem(ACTIVE_CONTEXT_KEY, 'chatml');
    return 'chatml';
  }
  return active;
}

export function getActiveInstruct(): string | null {
  if (typeof window === 'undefined') return null;

  const active = localStorage.getItem(ACTIVE_INSTRUCT_KEY);
  if (!active) {
    localStorage.setItem(ACTIVE_INSTRUCT_KEY, 'chatml');
    return 'chatml';
  }
  return active;
}

export function getActiveSystem(): string | null {
  if (typeof window === 'undefined') return null;

  const active = localStorage.getItem(ACTIVE_SYSTEM_KEY);
  if (!active) {
    localStorage.setItem(ACTIVE_SYSTEM_KEY, 'kusako');
    return 'kusako';
  }
  return active;
}

export function getActiveSampler(): string | null {
  if (typeof window === 'undefined') return null;

  const active = localStorage.getItem(ACTIVE_SAMPLER_KEY);
  if (!active) {
    localStorage.setItem(ACTIVE_SAMPLER_KEY, 'default');
    return 'default';
  }
  return active;
}

export function setActiveContext(name: string | null): void {
  if (typeof window === 'undefined') return;

  if (name === null) {
    localStorage.removeItem(ACTIVE_CONTEXT_KEY);
  } else {
    localStorage.setItem(ACTIVE_CONTEXT_KEY, name);
  }
}

export function setActiveInstruct(name: string | null): void {
  if (typeof window === 'undefined') return;

  if (name === null) {
    localStorage.removeItem(ACTIVE_INSTRUCT_KEY);
  } else {
    localStorage.setItem(ACTIVE_INSTRUCT_KEY, name);
  }
}

export function setActiveSystem(name: string | null): void {
  if (typeof window === 'undefined') return;

  if (name === null) {
    localStorage.removeItem(ACTIVE_SYSTEM_KEY);
  } else {
    localStorage.setItem(ACTIVE_SYSTEM_KEY, name);
  }
}

export function setActiveSampler(name: string | null): void {
  if (typeof window === 'undefined') return;

  if (name === null) {
    localStorage.removeItem(ACTIVE_SAMPLER_KEY);
  } else {
    localStorage.setItem(ACTIVE_SAMPLER_KEY, name);
  }
}
