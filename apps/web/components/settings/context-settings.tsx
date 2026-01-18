'use client';

import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';

import * as SakoConfig from '@repo/sako-config';
import type { ContextTemplate } from '@repo/sako-config';

import TemplateSelector from './template-selector';

export default function ContextSettings() {
  const [templates, setTemplates] = useState<Record<string, ContextTemplate>>(
    {},
  );
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [currentTemplate, setCurrentTemplate] =
    useState<ContextTemplate | null>(null);

  useEffect(() => {
    const loadedTemplates = SakoConfig.getContextTemplates();
    setTemplates(loadedTemplates);
    const active = SakoConfig.getActiveContext();
    setActiveTemplate(active);
    if (active && loadedTemplates[active]) {
      setCurrentTemplate(loadedTemplates[active]);
    }
  }, []);

  const handleTemplateSelect = (name: string) => {
    SakoConfig.setActiveContext(name);
    setActiveTemplate(name);
    setCurrentTemplate(templates[name] || null);
  };

  const handleTemplateCreate = (name: string) => {
    const defaultTemplate: ContextTemplate = {
      story_string: '',
      example_separator: '',
      chat_start: '',
      use_stop_strings: false,
      allow_jailbreak: false,
      names_as_stop_strings: false,
      always_force_name2: false,
      trim_sentences: false,
      single_line: false,
      name: name,
    };
    SakoConfig.saveContextTemplate(name, defaultTemplate);
    const updated = SakoConfig.getContextTemplates();
    setTemplates(updated);
    handleTemplateSelect(name);
  };

  const handleTemplateDelete = (name: string) => {
    SakoConfig.deleteContextTemplate(name);
    const updated = SakoConfig.getContextTemplates();
    setTemplates(updated);
    const remaining = Object.keys(updated);
    if (remaining.length > 0) {
      handleTemplateSelect(remaining[0]!);
    } else {
      setActiveTemplate(null);
      setCurrentTemplate(null);
    }
  };

  const handleTemplateRename = (oldName: string, newName: string) => {
    SakoConfig.renameContextTemplate(oldName, newName);
    const updated = SakoConfig.getContextTemplates();
    setTemplates(updated);
    if (activeTemplate === oldName) {
      setActiveTemplate(newName);
    }
  };

  const handleFieldUpdate = (
    field: keyof ContextTemplate,
    value: string | boolean,
  ) => {
    if (!currentTemplate || !activeTemplate) return;

    const updatedTemplate = { ...currentTemplate, [field]: value };
    SakoConfig.saveContextTemplate(activeTemplate, updatedTemplate);
    setTemplates((prev) => ({ ...prev, [activeTemplate]: updatedTemplate }));
    setCurrentTemplate(updatedTemplate);
  };

  if (!currentTemplate) {
    return (
      <div className='py-12 text-center'>
        <div className='w-16 h-16 rounded-2xl bg-base-200 flex items-center justify-center mx-auto mb-4'>
          <Icon
            icon='material-symbols:article-outline'
            className='w-8 h-8 text-base-content/30'
          />
        </div>
        <p className='text-base-content/50'>loading context settings...</p>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <div>
        <h2 className='text-lg font-semibold text-base-content mb-1'>
          context template
        </h2>
        <p className='text-sm text-base-content/60'>
          define how context is structured for the AI
        </p>
      </div>

      <TemplateSelector
        templates={Object.keys(templates)}
        activeTemplate={activeTemplate}
        onSelect={handleTemplateSelect}
        onCreate={handleTemplateCreate}
        onDelete={handleTemplateDelete}
        onRename={handleTemplateRename}
      />

      <div className='space-y-5'>
        <div>
          <label className='block text-sm font-medium text-base-content/80 mb-2'>
            story string
          </label>
          <textarea
            value={currentTemplate.story_string}
            onChange={(e) => handleFieldUpdate('story_string', e.target.value)}
            rows={12}
            placeholder='enter your story string template with handlebars syntax...'
            className='w-full px-4 py-3 rounded-xl bg-base-200/50 border border-base-content/10 focus:border-primary focus:bg-base-100 outline-none transition-all text-sm font-mono resize-none'
          />
          <p className='text-xs text-base-content/50 mt-2'>
            use handlebars syntax like {'{{system}}'}, {'{{description}}'},{' '}
            {'{{persona}}'} etc.
          </p>
        </div>

        <div className='grid grid-cols-2 gap-4'>
          <div>
            <label className='block text-sm font-medium text-base-content/80 mb-2'>
              example separator
            </label>
            <input
              type='text'
              value={currentTemplate.example_separator}
              onChange={(e) =>
                handleFieldUpdate('example_separator', e.target.value)
              }
              placeholder='separator between examples'
              className='w-full px-4 py-3 rounded-xl bg-base-200/50 border border-base-content/10 focus:border-primary focus:bg-base-100 outline-none transition-all text-sm font-mono'
            />
          </div>

          <div>
            <label className='block text-sm font-medium text-base-content/80 mb-2'>
              chat start
            </label>
            <input
              type='text'
              value={currentTemplate.chat_start}
              onChange={(e) => handleFieldUpdate('chat_start', e.target.value)}
              placeholder='string to mark chat start'
              className='w-full px-4 py-3 rounded-xl bg-base-200/50 border border-base-content/10 focus:border-primary focus:bg-base-100 outline-none transition-all text-sm font-mono'
            />
          </div>
        </div>

        <div className='pt-4 border-t border-base-content/5'>
          <label className='block text-sm font-medium text-base-content/80 mb-4'>
            options
          </label>
          <div className='grid grid-cols-2 gap-2'>
            <CheckboxOption
              label='use stop strings'
              checked={currentTemplate.use_stop_strings}
              onChange={(v) => handleFieldUpdate('use_stop_strings', v)}
            />
            <CheckboxOption
              label='allow jailbreak'
              checked={currentTemplate.allow_jailbreak}
              onChange={(v) => handleFieldUpdate('allow_jailbreak', v)}
            />
            <CheckboxOption
              label='names as stop strings'
              checked={currentTemplate.names_as_stop_strings}
              onChange={(v) => handleFieldUpdate('names_as_stop_strings', v)}
            />
            <CheckboxOption
              label='always force name2'
              checked={currentTemplate.always_force_name2}
              onChange={(v) => handleFieldUpdate('always_force_name2', v)}
            />
            <CheckboxOption
              label='trim sentences'
              checked={currentTemplate.trim_sentences}
              onChange={(v) => handleFieldUpdate('trim_sentences', v)}
            />
            <CheckboxOption
              label='single line'
              checked={currentTemplate.single_line}
              onChange={(v) => handleFieldUpdate('single_line', v)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface CheckboxOptionProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function CheckboxOption({ label, checked, onChange }: CheckboxOptionProps) {
  return (
    <label className='flex items-center gap-3 p-3 rounded-xl hover:bg-base-200/50 transition-colors cursor-pointer group'>
      <div className='relative flex items-center'>
        <input
          type='checkbox'
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className='peer sr-only'
        />
        <div className='w-5 h-5 rounded-md border-2 border-base-content/20 peer-checked:border-primary peer-checked:bg-primary transition-all flex items-center justify-center'>
          {checked && (
            <Icon
              icon='material-symbols:check'
              className='w-3.5 h-3.5 text-primary-content'
            />
          )}
        </div>
      </div>
      <span className='text-sm text-base-content/70 group-hover:text-base-content transition-colors'>
        {label}
      </span>
    </label>
  );
}
