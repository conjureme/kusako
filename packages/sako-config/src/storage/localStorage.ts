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
  config: ProvidersConfig[T],
): void {
  if (typeof window === 'undefined') return;

  const providers = getProvidersConfig();
  providers[type] = config;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(providers));
}

export function getProviderConfig<T extends ProviderType>(
  type: T,
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
      JSON.stringify(CONTEXT_PRESETS),
    );
    return CONTEXT_PRESETS;
  }

  try {
    return JSON.parse(stored);
  } catch {
    localStorage.setItem(
      CONTEXT_TEMPLATES_KEY,
      JSON.stringify(CONTEXT_PRESETS),
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
      JSON.stringify(INSTRUCT_PRESETS),
    );
    return INSTRUCT_PRESETS;
  }

  try {
    return JSON.parse(stored);
  } catch {
    localStorage.setItem(
      INSTRUCT_TEMPLATES_KEY,
      JSON.stringify(INSTRUCT_PRESETS),
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
      JSON.stringify(SAMPLER_PRESETS),
    );
    return SAMPLER_PRESETS;
  }

  try {
    return JSON.parse(stored);
  } catch {
    localStorage.setItem(
      SAMPLER_TEMPLATES_KEY,
      JSON.stringify(SAMPLER_PRESETS),
    );
    return SAMPLER_PRESETS;
  }
}

export function getActiveContext(): ContextTemplate | null {
  if (typeof window === 'undefined') return null;

  const stored = localStorage.getItem(ACTIVE_CONTEXT_KEY);
  if (!stored) {
    const templates = getContextTemplates();
    const defaultTemplate = templates['chatml'];
    if (defaultTemplate) {
      localStorage.setItem(ACTIVE_CONTEXT_KEY, JSON.stringify(defaultTemplate));
      return defaultTemplate;
    }
    return null;
  }

  try {
    return JSON.parse(stored);
  } catch {
    const templates = getContextTemplates();
    const defaultTemplate = templates['chatml'];
    if (defaultTemplate) {
      localStorage.setItem(ACTIVE_CONTEXT_KEY, JSON.stringify(defaultTemplate));
      return defaultTemplate;
    }
    return null;
  }
}

export function getActiveInstruct(): InstructTemplate | null {
  if (typeof window === 'undefined') return null;

  const stored = localStorage.getItem(ACTIVE_INSTRUCT_KEY);
  if (!stored) {
    const templates = getInstructTemplates();
    const defaultTemplate = templates['chatml'];
    if (defaultTemplate) {
      localStorage.setItem(
        ACTIVE_INSTRUCT_KEY,
        JSON.stringify(defaultTemplate),
      );
      return defaultTemplate;
    }
    return null;
  }

  try {
    return JSON.parse(stored);
  } catch {
    const templates = getInstructTemplates();
    const defaultTemplate = templates['chatml'];
    if (defaultTemplate) {
      localStorage.setItem(
        ACTIVE_INSTRUCT_KEY,
        JSON.stringify(defaultTemplate),
      );
      return defaultTemplate;
    }
    return null;
  }
}

export function getActiveSystem(): SystemPrompt | null {
  if (typeof window === 'undefined') return null;

  const stored = localStorage.getItem(ACTIVE_SYSTEM_KEY);
  if (!stored) {
    const templates = getSystemTemplates();
    const defaultTemplate = templates['kusako'];
    if (defaultTemplate) {
      localStorage.setItem(ACTIVE_SYSTEM_KEY, JSON.stringify(defaultTemplate));
      return defaultTemplate;
    }
    return null;
  }

  try {
    return JSON.parse(stored);
  } catch {
    const templates = getSystemTemplates();
    const defaultTemplate = templates['kusako'];
    if (defaultTemplate) {
      localStorage.setItem(ACTIVE_SYSTEM_KEY, JSON.stringify(defaultTemplate));
      return defaultTemplate;
    }
    return null;
  }
}

export function getActiveSampler(): SamplerSettings | null {
  if (typeof window === 'undefined') return null;

  const stored = localStorage.getItem(ACTIVE_SAMPLER_KEY);
  if (!stored) {
    const templates = getSamplerTemplates();
    const defaultTemplate = templates['default'];
    if (defaultTemplate) {
      localStorage.setItem(ACTIVE_SAMPLER_KEY, JSON.stringify(defaultTemplate));
      return defaultTemplate;
    }
    return null;
  }

  try {
    return JSON.parse(stored);
  } catch {
    const templates = getSamplerTemplates();
    const defaultTemplate = templates['default'];
    if (defaultTemplate) {
      localStorage.setItem(ACTIVE_SAMPLER_KEY, JSON.stringify(defaultTemplate));
      return defaultTemplate;
    }
    return null;
  }
}

export function setActiveContext(template: ContextTemplate | null): void {
  if (typeof window === 'undefined') return;

  if (template === null) {
    localStorage.removeItem(ACTIVE_CONTEXT_KEY);
  } else {
    localStorage.setItem(ACTIVE_CONTEXT_KEY, JSON.stringify(template));
  }
}

export function setActiveInstruct(template: InstructTemplate | null): void {
  if (typeof window === 'undefined') return;

  if (template === null) {
    localStorage.removeItem(ACTIVE_INSTRUCT_KEY);
  } else {
    localStorage.setItem(ACTIVE_INSTRUCT_KEY, JSON.stringify(template));
  }
}

export function setActiveSystem(template: SystemPrompt | null): void {
  if (typeof window === 'undefined') return;

  if (template === null) {
    localStorage.removeItem(ACTIVE_SYSTEM_KEY);
  } else {
    localStorage.setItem(ACTIVE_SYSTEM_KEY, JSON.stringify(template));
  }
}

export function setActiveSampler(template: SamplerSettings | null): void {
  if (typeof window === 'undefined') return;

  if (template === null) {
    localStorage.removeItem(ACTIVE_SAMPLER_KEY);
  } else {
    localStorage.setItem(ACTIVE_SAMPLER_KEY, JSON.stringify(template));
  }
}

export function updateActiveContext(
  updates: Partial<ContextTemplate>,
): ContextTemplate | null {
  const current = getActiveContext();
  if (!current) return null;

  const updated = { ...current, ...updates };
  setActiveContext(updated);
  return updated;
}

export function updateActiveInstruct(
  updates: Partial<InstructTemplate>,
): InstructTemplate | null {
  const current = getActiveInstruct();
  if (!current) return null;

  const updated = { ...current, ...updates };
  setActiveInstruct(updated);
  return updated;
}

export function updateActiveSystem(
  updates: Partial<SystemPrompt>,
): SystemPrompt | null {
  const current = getActiveSystem();
  if (!current) return null;

  const updated = { ...current, ...updates };
  setActiveSystem(updated);
  return updated;
}

export function updateActiveSampler(
  updates: Partial<SamplerSettings>,
): SamplerSettings | null {
  const current = getActiveSampler();
  if (!current) return null;

  const updated = { ...current, ...updates };
  setActiveSampler(updated);
  return updated;
}

export function saveContextTemplate(
  name: string,
  template: ContextTemplate,
): void {
  if (typeof window === 'undefined') return;
  const templates = getContextTemplates();
  templates[name] = { ...template, name };
  localStorage.setItem(CONTEXT_TEMPLATES_KEY, JSON.stringify(templates));
}

export function saveInstructTemplate(
  name: string,
  template: InstructTemplate,
): void {
  if (typeof window === 'undefined') return;
  const templates = getInstructTemplates();
  templates[name] = { ...template, name };
  localStorage.setItem(INSTRUCT_TEMPLATES_KEY, JSON.stringify(templates));
}

export function saveSystemTemplate(name: string, template: SystemPrompt): void {
  if (typeof window === 'undefined') return;
  const templates = getSystemTemplates();
  templates[name] = { ...template, name };
  localStorage.setItem(SYSTEM_TEMPLATES_KEY, JSON.stringify(templates));
}

export function saveSamplerTemplate(
  name: string,
  template: SamplerSettings,
): void {
  if (typeof window === 'undefined') return;
  const templates = getSamplerTemplates();
  templates[name] = template;
  localStorage.setItem(SAMPLER_TEMPLATES_KEY, JSON.stringify(templates));
}

export function commitActiveContext(): void {
  const active = getActiveContext();
  if (!active) return;
  saveContextTemplate(active.name, active);
}

export function commitActiveInstruct(): void {
  const active = getActiveInstruct();
  if (!active) return;
  saveInstructTemplate(active.name, active);
}

export function commitActiveSystem(): void {
  const active = getActiveSystem();
  if (!active) return;
  saveSystemTemplate(active.name, active);
}

export function commitActiveSampler(): void {
  const active = getActiveSampler();
  if (!active || !active.name) return;
  saveSamplerTemplate(active.name, active);
}

export function restoreActiveContext(): ContextTemplate | null {
  const active = getActiveContext();
  if (!active) return null;

  const templates = getContextTemplates();
  const saved = templates[active.name];
  if (saved) {
    setActiveContext(saved);
    return saved;
  }
  return null;
}

export function restoreActiveInstruct(): InstructTemplate | null {
  const active = getActiveInstruct();
  if (!active) return null;

  const templates = getInstructTemplates();
  const saved = templates[active.name];
  if (saved) {
    setActiveInstruct(saved);
    return saved;
  }
  return null;
}

export function restoreActiveSystem(): SystemPrompt | null {
  const active = getActiveSystem();
  if (!active) return null;

  const templates = getSystemTemplates();
  const saved = templates[active.name];
  if (saved) {
    setActiveSystem(saved);
    return saved;
  }
  return null;
}

export function restoreActiveSampler(): SamplerSettings | null {
  const active = getActiveSampler();
  if (!active || !active.name) return null;

  const templates = getSamplerTemplates();
  const saved = templates[active.name];
  if (saved) {
    setActiveSampler({ ...saved, name: active.name });
    return { ...saved, name: active.name };
  }
  return null;
}

export function deleteContextTemplate(name: string): void {
  if (typeof window === 'undefined') return;
  const templates = getContextTemplates();
  delete templates[name];
  localStorage.setItem(CONTEXT_TEMPLATES_KEY, JSON.stringify(templates));

  const active = getActiveContext();
  if (active?.name === name) {
    const remaining = Object.keys(templates);
    if (remaining.length > 0) {
      const next = templates[remaining[0]!];
      if (next) setActiveContext(next);
    } else {
      setActiveContext(null);
    }
  }
}

export function deleteInstructTemplate(name: string): void {
  if (typeof window === 'undefined') return;
  const templates = getInstructTemplates();
  delete templates[name];
  localStorage.setItem(INSTRUCT_TEMPLATES_KEY, JSON.stringify(templates));

  const active = getActiveInstruct();
  if (active?.name === name) {
    const remaining = Object.keys(templates);
    if (remaining.length > 0) {
      const next = templates[remaining[0]!];
      if (next) setActiveInstruct(next);
    } else {
      setActiveInstruct(null);
    }
  }
}

export function deleteSystemTemplate(name: string): void {
  if (typeof window === 'undefined') return;
  const templates = getSystemTemplates();
  delete templates[name];
  localStorage.setItem(SYSTEM_TEMPLATES_KEY, JSON.stringify(templates));

  const active = getActiveSystem();
  if (active?.name === name) {
    const remaining = Object.keys(templates);
    if (remaining.length > 0) {
      const next = templates[remaining[0]!];
      if (next) setActiveSystem(next);
    } else {
      setActiveSystem(null);
    }
  }
}

export function deleteSamplerTemplate(name: string): void {
  if (typeof window === 'undefined') return;
  const templates = getSamplerTemplates();
  delete templates[name];
  localStorage.setItem(SAMPLER_TEMPLATES_KEY, JSON.stringify(templates));

  const active = getActiveSampler();
  if (active?.name === name) {
    const remaining = Object.keys(templates);
    if (remaining.length > 0) {
      const next = templates[remaining[0]!];
      if (next) setActiveSampler({ ...next, name: remaining[0]! });
    } else {
      setActiveSampler(null);
    }
  }
}

export function createContextTemplate(
  name: string,
  template: ContextTemplate,
): ContextTemplate {
  const newTemplate = { ...template, name };
  saveContextTemplate(name, newTemplate);
  setActiveContext(newTemplate);
  return newTemplate;
}

export function createInstructTemplate(
  name: string,
  template: InstructTemplate,
): InstructTemplate {
  const newTemplate = { ...template, name };
  saveInstructTemplate(name, newTemplate);
  setActiveInstruct(newTemplate);
  return newTemplate;
}

export function createSystemTemplate(
  name: string,
  template: SystemPrompt,
): SystemPrompt {
  const newTemplate = { ...template, name };
  saveSystemTemplate(name, newTemplate);
  setActiveSystem(newTemplate);
  return newTemplate;
}

export function createSamplerTemplate(
  name: string,
  template: SamplerSettings,
): SamplerSettings {
  const newTemplate = { ...template, name };
  saveSamplerTemplate(name, newTemplate);
  setActiveSampler(newTemplate);
  return newTemplate;
}

export function renameContextTemplate(newName: string): ContextTemplate | null {
  const active = getActiveContext();
  if (!active) return null;

  const newTemplate = { ...active, name: newName };
  saveContextTemplate(newName, newTemplate);
  setActiveContext(newTemplate);
  return newTemplate;
}

export function renameInstructTemplate(
  newName: string,
): InstructTemplate | null {
  const active = getActiveInstruct();
  if (!active) return null;

  const newTemplate = { ...active, name: newName };
  saveInstructTemplate(newName, newTemplate);
  setActiveInstruct(newTemplate);
  return newTemplate;
}

export function renameSystemTemplate(newName: string): SystemPrompt | null {
  const active = getActiveSystem();
  if (!active) return null;

  const newTemplate = { ...active, name: newName };
  saveSystemTemplate(newName, newTemplate);
  setActiveSystem(newTemplate);
  return newTemplate;
}

export function renameSamplerTemplate(newName: string): SamplerSettings | null {
  const active = getActiveSampler();
  if (!active) return null;

  const newTemplate = { ...active, name: newName };
  saveSamplerTemplate(newName, newTemplate);
  setActiveSampler(newTemplate);
  return newTemplate;
}

export function isContextDirty(): boolean {
  const active = getActiveContext();
  if (!active) return false;

  const templates = getContextTemplates();
  const saved = templates[active.name];
  if (!saved) return true;

  return JSON.stringify(active) !== JSON.stringify(saved);
}

export function isInstructDirty(): boolean {
  const active = getActiveInstruct();
  if (!active) return false;

  const templates = getInstructTemplates();
  const saved = templates[active.name];
  if (!saved) return true;

  return JSON.stringify(active) !== JSON.stringify(saved);
}

export function isSystemDirty(): boolean {
  const active = getActiveSystem();
  if (!active) return false;

  const templates = getSystemTemplates();
  const saved = templates[active.name];
  if (!saved) return true;

  return JSON.stringify(active) !== JSON.stringify(saved);
}

export function isSamplerDirty(): boolean {
  const active = getActiveSampler();
  if (!active || !active.name) return false;

  const templates = getSamplerTemplates();
  const saved = templates[active.name];
  if (!saved) return true;

  const activeWithoutName = { ...active };
  const savedWithName = { ...saved, name: active.name };

  return JSON.stringify(activeWithoutName) !== JSON.stringify(savedWithName);
}
