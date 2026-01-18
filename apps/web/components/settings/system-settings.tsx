'use client';

import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';

import * as SakoConfig from '@repo/sako-config';
import type { SystemPrompt } from '@repo/sako-config';

import TemplateSelector from './template-selector';

export default function SystemSettings() {
  const [templates, setTemplates] = useState<Record<string, SystemPrompt>>({});
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [currentTemplate, setCurrentTemplate] = useState<SystemPrompt | null>(
    null,
  );

  useEffect(() => {
    const loadedTemplates = SakoConfig.getSystemTemplates();
    setTemplates(loadedTemplates);
    const active = SakoConfig.getActiveSystem();
    setActiveTemplate(active);
    if (active && loadedTemplates[active]) {
      setCurrentTemplate(loadedTemplates[active]);
    }
  }, []);

  const handleTemplateSelect = (name: string) => {
    SakoConfig.setActiveSystem(name);
    setActiveTemplate(name);
    setCurrentTemplate(templates[name] || null);
  };

  const handleTemplateCreate = (name: string) => {
    const defaultTemplate: SystemPrompt = {
      name: name,
      content: '',
    };
    SakoConfig.saveSystemTemplate(name, defaultTemplate);
    const updated = SakoConfig.getSystemTemplates();
    setTemplates(updated);
    handleTemplateSelect(name);
  };

  const handleTemplateDelete = (name: string) => {
    SakoConfig.deleteSystemTemplate(name);
    const updated = SakoConfig.getSystemTemplates();
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
    SakoConfig.renameSystemTemplate(oldName, newName);
    const updated = SakoConfig.getSystemTemplates();
    setTemplates(updated);
    if (activeTemplate === oldName) {
      setActiveTemplate(newName);
    }
  };

  const handleContentUpdate = (content: string) => {
    if (!currentTemplate || !activeTemplate) return;

    const updatedTemplate = { ...currentTemplate, content };
    SakoConfig.saveSystemTemplate(activeTemplate, updatedTemplate);
    setTemplates((prev) => ({ ...prev, [activeTemplate]: updatedTemplate }));
    setCurrentTemplate(updatedTemplate);
  };

  if (!currentTemplate) {
    return (
      <div className='py-12 text-center'>
        <div className='w-16 h-16 rounded-2xl bg-base-200 flex items-center justify-center mx-auto mb-4'>
          <Icon
            icon='material-symbols:person-outline'
            className='w-8 h-8 text-base-content/30'
          />
        </div>
        <p className='text-base-content/50'>
          loading system prompt settings...
        </p>
      </div>
    );
  }

  const charCount = currentTemplate.content.length;

  return (
    <div className='space-y-6'>
      <div>
        <h2 className='text-lg font-semibold text-base-content mb-1'>
          system prompt
        </h2>
        <p className='text-sm text-base-content/60'>
          define kusako's personality and behavior~
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

      <div className='space-y-4'>
        <div className='relative'>
          <textarea
            value={currentTemplate.content}
            onChange={(e) => handleContentUpdate(e.target.value)}
            rows={20}
            placeholder="write kusako's system prompt here... tell her who she is, how she should behave, and what makes her special!"
            className='w-full px-4 py-4 rounded-xl bg-base-200/50 border border-base-content/10 focus:border-primary focus:bg-base-100 outline-none transition-all text-sm font-mono resize-none leading-relaxed'
          />
          <div className='absolute bottom-3 right-3 px-2 py-1 rounded-lg bg-base-200/80 text-xs text-base-content/50'>
            {charCount.toLocaleString()} characters
          </div>
        </div>
      </div>
    </div>
  );
}
