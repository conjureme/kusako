'use client';

import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';

import * as SakoConfig from '@repo/sako-config';
import type { InstructTemplate } from '@repo/sako-config';

import TemplateSelector from './template-selector';

export default function InstructSettings() {
  const [templates, setTemplates] = useState<Record<string, InstructTemplate>>(
    {},
  );
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [currentTemplate, setCurrentTemplate] =
    useState<InstructTemplate | null>(null);

  useEffect(() => {
    const loadedTemplates = SakoConfig.getInstructTemplates();
    setTemplates(loadedTemplates);
    const active = SakoConfig.getActiveInstruct();
    setActiveTemplate(active);
    if (active && loadedTemplates[active]) {
      setCurrentTemplate(loadedTemplates[active]);
    }
  }, []);

  const handleTemplateSelect = (name: string) => {
    SakoConfig.setActiveInstruct(name);
    setActiveTemplate(name);
    setCurrentTemplate(templates[name] || null);
  };

  const handleTemplateCreate = (name: string) => {
    const defaultTemplate: InstructTemplate = {
      input_sequence: '',
      output_sequence: '',
      last_output_sequence: '',
      system_sequence: '',
      stop_sequence: '',
      wrap: false,
      macro: false,
      names_behavior: 'never',
      activation_regex: '',
      system_sequence_prefix: '',
      system_sequence_suffix: '',
      first_output_sequence: '',
      skip_examples: false,
      output_suffix: '',
      input_suffix: '',
      system_suffix: '',
      user_alignment_message: '',
      system_same_as_user: false,
      last_system_sequence: '',
      first_input_sequence: '',
      last_input_sequence: '',
      names_force_groups: false,
      name: name,
    };
    SakoConfig.saveInstructTemplate(name, defaultTemplate);
    const updated = SakoConfig.getInstructTemplates();
    setTemplates(updated);
    handleTemplateSelect(name);
  };

  const handleTemplateDelete = (name: string) => {
    SakoConfig.deleteInstructTemplate(name);
    const updated = SakoConfig.getInstructTemplates();
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
    SakoConfig.renameInstructTemplate(oldName, newName);
    const updated = SakoConfig.getInstructTemplates();
    setTemplates(updated);
    if (activeTemplate === oldName) {
      setActiveTemplate(newName);
    }
  };

  const handleFieldUpdate = (
    field: keyof InstructTemplate,
    value: string | boolean,
  ) => {
    if (!currentTemplate || !activeTemplate) return;

    const updatedTemplate = { ...currentTemplate, [field]: value };
    SakoConfig.saveInstructTemplate(activeTemplate, updatedTemplate);
    setTemplates((prev) => ({ ...prev, [activeTemplate]: updatedTemplate }));
    setCurrentTemplate(updatedTemplate);
  };

  if (!currentTemplate) {
    return (
      <div className='py-12 text-center'>
        <div className='w-16 h-16 rounded-2xl bg-base-200 flex items-center justify-center mx-auto mb-4'>
          <Icon
            icon='material-symbols:code'
            className='w-8 h-8 text-base-content/30'
          />
        </div>
        <p className='text-base-content/50'>loading instruct settings...</p>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <div>
        <h2 className='text-lg font-semibold text-base-content mb-1'>
          instruct template
        </h2>
        <p className='text-sm text-base-content/60'>
          configure the instruct format for chat messages
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

      <div className='space-y-6'>
        <div className='p-4 rounded-xl bg-base-200/30 border border-base-content/5'>
          <div className='flex items-center gap-2 mb-4'>
            <Icon
              icon='material-symbols:input'
              className='w-5 h-5 text-primary'
            />
            <span className='text-sm font-medium text-base-content'>
              sequences
            </span>
          </div>
          <div className='grid grid-cols-2 gap-4'>
            <InputField
              label='input sequence'
              value={currentTemplate.input_sequence}
              onChange={(v) => handleFieldUpdate('input_sequence', v)}
              placeholder='<|im_start|>user'
            />
            <InputField
              label='output sequence'
              value={currentTemplate.output_sequence}
              onChange={(v) => handleFieldUpdate('output_sequence', v)}
              placeholder='<|im_start|>assistant'
            />
            <InputField
              label='system sequence'
              value={currentTemplate.system_sequence}
              onChange={(v) => handleFieldUpdate('system_sequence', v)}
              placeholder='<|im_start|>system'
            />
            <InputField
              label='stop sequence'
              value={currentTemplate.stop_sequence}
              onChange={(v) => handleFieldUpdate('stop_sequence', v)}
              placeholder='<|im_end|>'
            />
          </div>
        </div>

        <div className='p-4 rounded-xl bg-base-200/30 border border-base-content/5'>
          <div className='flex items-center gap-2 mb-4'>
            <Icon
              icon='material-symbols:format-list-bulleted'
              className='w-5 h-5 text-primary'
            />
            <span className='text-sm font-medium text-base-content'>
              suffixes
            </span>
          </div>
          <div className='grid grid-cols-3 gap-4'>
            <InputField
              label='input suffix'
              value={currentTemplate.input_suffix}
              onChange={(v) => handleFieldUpdate('input_suffix', v)}
              placeholder='<|im_end|>\n'
            />
            <InputField
              label='output suffix'
              value={currentTemplate.output_suffix}
              onChange={(v) => handleFieldUpdate('output_suffix', v)}
              placeholder='<|im_end|>\n'
            />
            <InputField
              label='system suffix'
              value={currentTemplate.system_suffix}
              onChange={(v) => handleFieldUpdate('system_suffix', v)}
              placeholder='<|im_end|>\n'
            />
          </div>
        </div>

        <div className='p-4 rounded-xl bg-base-200/30 border border-base-content/5'>
          <div className='flex items-center gap-2 mb-4'>
            <Icon
              icon='material-symbols:more-horiz'
              className='w-5 h-5 text-primary'
            />
            <span className='text-sm font-medium text-base-content'>
              additional sequences
            </span>
          </div>
          <div className='grid grid-cols-2 gap-4'>
            <InputField
              label='first input sequence'
              value={currentTemplate.first_input_sequence}
              onChange={(v) => handleFieldUpdate('first_input_sequence', v)}
            />
            <InputField
              label='last input sequence'
              value={currentTemplate.last_input_sequence}
              onChange={(v) => handleFieldUpdate('last_input_sequence', v)}
            />
            <InputField
              label='first output sequence'
              value={currentTemplate.first_output_sequence}
              onChange={(v) => handleFieldUpdate('first_output_sequence', v)}
            />
            <InputField
              label='last output sequence'
              value={currentTemplate.last_output_sequence}
              onChange={(v) => handleFieldUpdate('last_output_sequence', v)}
            />
            <InputField
              label='last system sequence'
              value={currentTemplate.last_system_sequence}
              onChange={(v) => handleFieldUpdate('last_system_sequence', v)}
            />
            <InputField
              label='activation regex'
              value={currentTemplate.activation_regex}
              onChange={(v) => handleFieldUpdate('activation_regex', v)}
            />
          </div>
        </div>

        <div className='p-4 rounded-xl bg-base-200/30 border border-base-content/5'>
          <div className='flex items-center gap-2 mb-4'>
            <Icon
              icon='material-symbols:settings'
              className='w-5 h-5 text-primary'
            />
            <span className='text-sm font-medium text-base-content'>
              options
            </span>
          </div>
          <div className='grid grid-cols-2 gap-4 mb-4'>
            <div>
              <label className='block text-xs font-medium text-base-content/60 mb-2'>
                names behavior
              </label>
              <select
                value={currentTemplate.names_behavior}
                onChange={(e) =>
                  handleFieldUpdate('names_behavior', e.target.value)
                }
                className='w-full px-4 py-2.5 rounded-xl bg-base-100 border border-base-content/10 focus:border-primary outline-none transition-all text-sm'
              >
                <option value='never'>never</option>
                <option value='always'>always</option>
              </select>
            </div>
          </div>
          <div className='grid grid-cols-2 gap-2'>
            <CheckboxOption
              label='wrap'
              checked={currentTemplate.wrap}
              onChange={(v) => handleFieldUpdate('wrap', v)}
            />
            <CheckboxOption
              label='macro'
              checked={currentTemplate.macro}
              onChange={(v) => handleFieldUpdate('macro', v)}
            />
            <CheckboxOption
              label='skip examples'
              checked={currentTemplate.skip_examples}
              onChange={(v) => handleFieldUpdate('skip_examples', v)}
            />
            <CheckboxOption
              label='system same as user'
              checked={currentTemplate.system_same_as_user}
              onChange={(v) => handleFieldUpdate('system_same_as_user', v)}
            />
            <CheckboxOption
              label='names force groups'
              checked={currentTemplate.names_force_groups}
              onChange={(v) => handleFieldUpdate('names_force_groups', v)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface InputFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function InputField({ label, value, onChange, placeholder }: InputFieldProps) {
  return (
    <div>
      <label className='block text-xs font-medium text-base-content/60 mb-2'>
        {label}
      </label>
      <input
        type='text'
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className='w-full px-3 py-2.5 rounded-xl bg-base-100 border border-base-content/10 focus:border-primary outline-none transition-all text-sm font-mono'
      />
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
