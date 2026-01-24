'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@iconify/react';

import * as SakoConfig from '@repo/sako-config';
import type { SystemPrompt } from '@repo/sako-config';

import TemplateSelector from './template-selector';

export default function SystemSettings() {
  const [templates, setTemplates] = useState<Record<string, SystemPrompt>>({});
  const [currentTemplate, setCurrentTemplate] = useState<SystemPrompt | null>(
    null,
  );
  const [isDirty, setIsDirty] = useState(false);

  const checkDirty = useCallback(() => {
    setIsDirty(SakoConfig.isSystemDirty());
  }, []);

  useEffect(() => {
    const loadedTemplates = SakoConfig.getSystemTemplates();
    setTemplates(loadedTemplates);
    const active = SakoConfig.getActiveSystem();
    setCurrentTemplate(active);
    checkDirty();
  }, [checkDirty]);

  const handleTemplateSelect = (name: string) => {
    const allTemplates = SakoConfig.getSystemTemplates();
    const template = allTemplates[name];
    if (template) {
      SakoConfig.setActiveSystem(template);
      setCurrentTemplate(template);
      checkDirty();
    }
  };

  const handleTemplateCreate = (name: string) => {
    const defaultTemplate: SystemPrompt = {
      name: name,
      content: '',
    };
    const newTemplate = SakoConfig.createSystemTemplate(name, defaultTemplate);
    setTemplates(SakoConfig.getSystemTemplates());
    setCurrentTemplate(newTemplate);
    checkDirty();
  };

  const handleTemplateDelete = (name: string) => {
    SakoConfig.deleteSystemTemplate(name);
    setTemplates(SakoConfig.getSystemTemplates());
    setCurrentTemplate(SakoConfig.getActiveSystem());
    checkDirty();
  };

  const handleTemplateRename = (newName: string) => {
    const renamed = SakoConfig.renameSystemTemplate(newName);
    if (renamed) {
      setTemplates(SakoConfig.getSystemTemplates());
      setCurrentTemplate(renamed);
      checkDirty();
    }
  };

  const handleSave = () => {
    SakoConfig.commitActiveSystem();
    setTemplates(SakoConfig.getSystemTemplates());
    checkDirty();
  };

  const handleRestore = () => {
    const restored = SakoConfig.restoreActiveSystem();
    if (restored) {
      setCurrentTemplate(restored);
      checkDirty();
    }
  };

  const handleContentUpdate = (content: string) => {
    if (!currentTemplate) return;

    const updated = SakoConfig.updateActiveSystem({ content });
    if (updated) {
      setCurrentTemplate(updated);
      checkDirty();
    }
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
