'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@iconify/react';

import * as SakoConfig from '@repo/sako-config';
import type { SamplerSettings as SamplerSettingsType } from '@repo/sako-config';

import TemplateSelector from './template-selector';

const RANGES: Record<string, { min: number; max: number; step: number }> = {
  temp: { min: 0, max: 5, step: 0.01 },
  top_p: { min: 0, max: 1, step: 0.01 },
  top_k: { min: -1, max: 200, step: 1 },
  top_a: { min: 0, max: 1, step: 0.01 },
  tfs: { min: 0, max: 1, step: 0.01 },
  typical_p: { min: 0, max: 1, step: 0.01 },
  min_p: { min: 0, max: 1, step: 0.01 },
  rep_pen: { min: 1, max: 3, step: 0.01 },
  rep_pen_range: { min: -1, max: 204800, step: 1 },
  rep_pen_decay: { min: 0, max: 204800, step: 1 },
  rep_pen_slope: { min: 0, max: 10, step: 0.01 },
  freq_pen: { min: -2, max: 2, step: 0.01 },
  presence_pen: { min: -2, max: 2, step: 0.01 },
  min_temp: { min: 0, max: 5, step: 0.01 },
  max_temp: { min: 0, max: 5, step: 0.01 },
  dynatemp_exponent: { min: 0.001, max: 10, step: 0.001 },
  dry_multiplier: { min: 0, max: 5, step: 0.01 },
  dry_base: { min: 1, max: 4, step: 0.01 },
  dry_allowed_length: { min: 1, max: 20, step: 1 },
  dry_penalty_last_n: { min: 0, max: 204800, step: 1 },
  mirostat_mode: { min: 0, max: 2, step: 1 },
  mirostat_tau: { min: 0, max: 20, step: 0.01 },
  mirostat_eta: { min: 0, max: 1, step: 0.01 },
  xtc_threshold: { min: 0, max: 0.5, step: 0.01 },
  xtc_probability: { min: 0, max: 1, step: 0.01 },
  genamt: { min: 16, max: 32768, step: 1 },
  max_length: { min: 512, max: 204800, step: 1 },
};

interface SliderFieldProps {
  label: string;
  field: keyof SamplerSettingsType;
  value: number | undefined;
  onChange: (field: keyof SamplerSettingsType, value: number) => void;
}

function SliderField({ label, field, value, onChange }: SliderFieldProps) {
  const range = RANGES[field];
  if (!range) return null;

  const currentValue = value ?? range.min;
  const percentage =
    ((currentValue - range.min) / (range.max - range.min)) * 100;

  return (
    <div className='group'>
      <div className='flex items-center justify-between mb-2'>
        <label className='text-xs font-medium text-base-content/60 group-hover:text-base-content/80 transition-colors'>
          {label}
        </label>
        <input
          type='number'
          min={range.min}
          max={range.max}
          step={range.step}
          value={currentValue}
          onChange={(e) =>
            onChange(field, parseFloat(e.target.value) || range.min)
          }
          className='w-20 px-2 py-1 text-xs font-mono text-right bg-base-200/50 rounded-lg border border-transparent focus:border-primary focus:bg-base-100 outline-none transition-all'
        />
      </div>
      <div className='relative'>
        <input
          type='range'
          min={range.min}
          max={range.max}
          step={range.step}
          value={currentValue}
          onChange={(e) => onChange(field, parseFloat(e.target.value))}
          className='w-full h-2 bg-base-200 rounded-full appearance-none cursor-pointer slider-thumb'
          style={{
            background: `linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) ${percentage}%, var(--color-base-200) ${percentage}%, var(--color-base-200) 100%)`,
          }}
        />
      </div>
    </div>
  );
}

interface CheckboxFieldProps {
  label: string;
  field: keyof SamplerSettingsType;
  checked: boolean | undefined;
  onChange: (field: keyof SamplerSettingsType, value: boolean) => void;
}

function CheckboxField({
  label,
  field,
  checked,
  onChange,
}: CheckboxFieldProps) {
  return (
    <label className='flex items-center gap-3 p-3 rounded-xl hover:bg-base-200/50 transition-colors cursor-pointer group'>
      <div className='relative'>
        <input
          type='checkbox'
          checked={checked ?? false}
          onChange={(e) => onChange(field, e.target.checked)}
          className='peer sr-only'
        />
        <div className='w-5 h-5 rounded-md border-2 border-base-content/20 peer-checked:border-primary peer-checked:bg-primary transition-all flex items-center justify-center'>
          <Icon
            icon='material-symbols:check'
            className='w-3.5 h-3.5 text-primary-content opacity-0 peer-checked:opacity-100 transition-opacity'
          />
        </div>
      </div>
      <span className='text-sm text-base-content/70 group-hover:text-base-content transition-colors'>
        {label}
      </span>
    </label>
  );
}

export default function SamplerSettings() {
  const [templates, setTemplates] = useState<
    Record<string, SamplerSettingsType>
  >({});
  const [currentTemplate, setCurrentTemplate] =
    useState<SamplerSettingsType | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({
    basic: true,
    penalties: false,
    dynamic: false,
    dry: false,
    mirostat: false,
    xtc: false,
    generation: true,
    tokens: false,
  });

  const checkDirty = useCallback(() => {
    setIsDirty(SakoConfig.isSamplerDirty());
  }, []);

  useEffect(() => {
    const loadedTemplates = SakoConfig.getSamplerTemplates();
    setTemplates(loadedTemplates);
    const active = SakoConfig.getActiveSampler();
    setCurrentTemplate(active);
    checkDirty();
  }, [checkDirty]);

  const handleTemplateSelect = (name: string) => {
    const allTemplates = SakoConfig.getSamplerTemplates();
    const template = allTemplates[name];
    if (template) {
      const templateWithName = { ...template, name };
      SakoConfig.setActiveSampler(templateWithName);
      setCurrentTemplate(templateWithName);
      checkDirty();
    }
  };

  const handleTemplateCreate = (name: string) => {
    const defaultTemplate = SakoConfig.getSamplerTemplates()['default'];
    if (defaultTemplate) {
      const newTemplate = SakoConfig.createSamplerTemplate(
        name,
        defaultTemplate,
      );
      setTemplates(SakoConfig.getSamplerTemplates());
      setCurrentTemplate(newTemplate);
      checkDirty();
    }
  };

  const handleTemplateDelete = (name: string) => {
    SakoConfig.deleteSamplerTemplate(name);
    setTemplates(SakoConfig.getSamplerTemplates());
    setCurrentTemplate(SakoConfig.getActiveSampler());
    checkDirty();
  };

  const handleTemplateRename = (newName: string) => {
    const renamed = SakoConfig.renameSamplerTemplate(newName);
    if (renamed) {
      setTemplates(SakoConfig.getSamplerTemplates());
      setCurrentTemplate(renamed);
      checkDirty();
    }
  };

  const handleSave = () => {
    SakoConfig.commitActiveSampler();
    setTemplates(SakoConfig.getSamplerTemplates());
    checkDirty();
  };

  const handleRestore = () => {
    const restored = SakoConfig.restoreActiveSampler();
    if (restored) {
      setCurrentTemplate(restored);
      checkDirty();
    }
  };

  const handleFieldUpdate = (
    field: keyof SamplerSettingsType,
    value: string | number | boolean,
  ) => {
    if (!currentTemplate) return;

    const updated = SakoConfig.updateActiveSampler({ [field]: value });
    if (updated) {
      setCurrentTemplate(updated);
      checkDirty();
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  if (!currentTemplate) {
    return (
      <div className='py-12 text-center'>
        <div className='w-16 h-16 rounded-2xl bg-base-200 flex items-center justify-center mx-auto mb-4'>
          <Icon
            icon='material-symbols:tune'
            className='w-8 h-8 text-base-content/30'
          />
        </div>
        <p className='text-base-content/50'>loading sampler settings...</p>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <TemplateSelector
        templates={Object.keys(templates)}
        activeTemplate={currentTemplate.name || null}
        onSelect={handleTemplateSelect}
        onCreate={handleTemplateCreate}
        onDelete={handleTemplateDelete}
        onRename={handleTemplateRename}
        onSave={handleSave}
        onRestore={handleRestore}
        isDirty={isDirty}
      />

      <div className='space-y-3'>
        <CollapsibleSection
          title='basic sampling'
          icon='material-symbols:scatter-plot'
          expanded={expandedSections.basic ?? false}
          onToggle={() => toggleSection('basic')}
        >
          <div className='grid grid-cols-2 lg:grid-cols-3 gap-6'>
            <SliderField
              label='temperature'
              field='temp'
              value={currentTemplate.temp}
              onChange={handleFieldUpdate}
            />
            <SliderField
              label='top p'
              field='top_p'
              value={currentTemplate.top_p}
              onChange={handleFieldUpdate}
            />
            <SliderField
              label='top k'
              field='top_k'
              value={currentTemplate.top_k}
              onChange={handleFieldUpdate}
            />
            <SliderField
              label='top a'
              field='top_a'
              value={currentTemplate.top_a}
              onChange={handleFieldUpdate}
            />
            <SliderField
              label='min p'
              field='min_p'
              value={currentTemplate.min_p}
              onChange={handleFieldUpdate}
            />
            <SliderField
              label='typical p'
              field='typical_p'
              value={currentTemplate.typical_p}
              onChange={handleFieldUpdate}
            />
            <SliderField
              label='tfs'
              field='tfs'
              value={currentTemplate.tfs}
              onChange={handleFieldUpdate}
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title='repetition penalties'
          icon='material-symbols:block'
          expanded={expandedSections.penalties ?? false}
          onToggle={() => toggleSection('penalties')}
        >
          <div className='grid grid-cols-2 lg:grid-cols-3 gap-6'>
            <SliderField
              label='repetition penalty'
              field='rep_pen'
              value={currentTemplate.rep_pen}
              onChange={handleFieldUpdate}
            />
            <SliderField
              label='rep pen range'
              field='rep_pen_range'
              value={currentTemplate.rep_pen_range}
              onChange={handleFieldUpdate}
            />
            <SliderField
              label='rep pen slope'
              field='rep_pen_slope'
              value={currentTemplate.rep_pen_slope}
              onChange={handleFieldUpdate}
            />
            <SliderField
              label='frequency penalty'
              field='freq_pen'
              value={currentTemplate.freq_pen}
              onChange={handleFieldUpdate}
            />
            <SliderField
              label='presence penalty'
              field='presence_pen'
              value={currentTemplate.presence_pen}
              onChange={handleFieldUpdate}
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title='dynamic temperature'
          icon='material-symbols:thermostat'
          expanded={expandedSections.dynamic ?? false}
          onToggle={() => toggleSection('dynamic')}
        >
          <div className='mb-4'>
            <CheckboxField
              label='enable dynamic temperature'
              field='dynatemp'
              checked={currentTemplate.dynatemp}
              onChange={handleFieldUpdate}
            />
          </div>
          <div className='grid grid-cols-2 lg:grid-cols-3 gap-6'>
            <SliderField
              label='min temp'
              field='min_temp'
              value={currentTemplate.min_temp}
              onChange={handleFieldUpdate}
            />
            <SliderField
              label='max temp'
              field='max_temp'
              value={currentTemplate.max_temp}
              onChange={handleFieldUpdate}
            />
            <SliderField
              label='dynatemp exponent'
              field='dynatemp_exponent'
              value={currentTemplate.dynatemp_exponent}
              onChange={handleFieldUpdate}
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title='dry sampler'
          icon='material-symbols:humidity-low'
          expanded={expandedSections.dry ?? false}
          onToggle={() => toggleSection('dry')}
        >
          <div className='grid grid-cols-2 gap-6 mb-6'>
            <SliderField
              label='dry multiplier'
              field='dry_multiplier'
              value={currentTemplate.dry_multiplier}
              onChange={handleFieldUpdate}
            />
            <SliderField
              label='dry base'
              field='dry_base'
              value={currentTemplate.dry_base}
              onChange={handleFieldUpdate}
            />
            <SliderField
              label='dry allowed length'
              field='dry_allowed_length'
              value={currentTemplate.dry_allowed_length}
              onChange={handleFieldUpdate}
            />
            <SliderField
              label='dry penalty last n'
              field='dry_penalty_last_n'
              value={currentTemplate.dry_penalty_last_n}
              onChange={handleFieldUpdate}
            />
          </div>
          <div>
            <label className='block text-xs font-medium text-base-content/60 mb-2'>
              dry sequence breakers
            </label>
            <textarea
              value={currentTemplate.dry_sequence_breakers || ''}
              onChange={(e) =>
                handleFieldUpdate('dry_sequence_breakers', e.target.value)
              }
              rows={3}
              className='w-full px-4 py-3 rounded-xl bg-base-200/50 border border-base-content/10 focus:border-primary focus:bg-base-100 outline-none transition-all text-sm font-mono resize-none'
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title='mirostat'
          icon='material-symbols:auto-fix-high'
          expanded={expandedSections.mirostat ?? false}
          onToggle={() => toggleSection('mirostat')}
        >
          <div className='grid grid-cols-3 gap-6'>
            <SliderField
              label='mirostat mode'
              field='mirostat_mode'
              value={currentTemplate.mirostat_mode}
              onChange={handleFieldUpdate}
            />
            <SliderField
              label='mirostat tau'
              field='mirostat_tau'
              value={currentTemplate.mirostat_tau}
              onChange={handleFieldUpdate}
            />
            <SliderField
              label='mirostat eta'
              field='mirostat_eta'
              value={currentTemplate.mirostat_eta}
              onChange={handleFieldUpdate}
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title='xtc sampler'
          icon='material-symbols:science'
          expanded={expandedSections.xtc ?? false}
          onToggle={() => toggleSection('xtc')}
        >
          <div className='grid grid-cols-2 gap-6'>
            <SliderField
              label='xtc threshold'
              field='xtc_threshold'
              value={currentTemplate.xtc_threshold}
              onChange={handleFieldUpdate}
            />
            <SliderField
              label='xtc probability'
              field='xtc_probability'
              value={currentTemplate.xtc_probability}
              onChange={handleFieldUpdate}
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title='generation settings'
          icon='material-symbols:text-fields'
          expanded={expandedSections.generation ?? false}
          onToggle={() => toggleSection('generation')}
        >
          <div className='grid grid-cols-2 gap-6'>
            <SliderField
              label='generation amount'
              field='genamt'
              value={currentTemplate.genamt}
              onChange={handleFieldUpdate}
            />
            <SliderField
              label='max context length'
              field='max_length'
              value={currentTemplate.max_length}
              onChange={handleFieldUpdate}
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title='token settings'
          icon='material-symbols:token'
          expanded={expandedSections.tokens ?? false}
          onToggle={() => toggleSection('tokens')}
        >
          <div className='grid grid-cols-2 gap-1'>
            <CheckboxField
              label='add bos token'
              field='add_bos_token'
              checked={currentTemplate.add_bos_token}
              onChange={handleFieldUpdate}
            />
            <CheckboxField
              label='ban eos token'
              field='ban_eos_token'
              checked={currentTemplate.ban_eos_token}
              onChange={handleFieldUpdate}
            />
            <CheckboxField
              label='skip special tokens'
              field='skip_special_tokens'
              checked={currentTemplate.skip_special_tokens}
              onChange={handleFieldUpdate}
            />
            <CheckboxField
              label='ignore eos token'
              field='ignore_eos_token'
              checked={currentTemplate.ignore_eos_token}
              onChange={handleFieldUpdate}
            />
            <CheckboxField
              label='temperature last'
              field='temperature_last'
              checked={currentTemplate.temperature_last}
              onChange={handleFieldUpdate}
            />
            <CheckboxField
              label='do sample'
              field='do_sample'
              checked={currentTemplate.do_sample}
              onChange={handleFieldUpdate}
            />
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
}

interface CollapsibleSectionProps {
  title: string;
  icon: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  icon,
  expanded,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  return (
    <div className='rounded-xl border border-base-content/5 overflow-hidden'>
      <button
        onClick={onToggle}
        className='w-full flex items-center justify-between px-4 py-3 bg-base-200/30 hover:bg-base-200/50 transition-colors cursor-pointer'
      >
        <div className='flex items-center gap-3'>
          <Icon icon={icon} className='w-5 h-5 text-base-content/50' />
          <span className='text-sm font-medium text-base-content'>{title}</span>
        </div>
        <Icon
          icon='material-symbols:expand-more'
          className={`w-5 h-5 text-base-content/50 transition-transform duration-200 ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>
      {expanded && (
        <div className='p-5 border-t border-base-content/5'>{children}</div>
      )}
    </div>
  );
}
