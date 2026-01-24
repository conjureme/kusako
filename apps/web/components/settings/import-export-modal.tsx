'use client';

import { useState, useRef } from 'react';
import { Icon } from '@iconify/react';

import * as SakoConfig from '@repo/sako-config';
import type {
  ContextTemplate,
  InstructTemplate,
  SystemPrompt,
  SamplerSettings,
} from '@repo/sako-config';

type TemplateType = 'context' | 'instruct' | 'sysprompt' | 'preset';

interface SillyTavernExport {
  instruct?: InstructTemplate;
  context?: ContextTemplate;
  sysprompt?: SystemPrompt;
  preset?: SamplerSettings;
}

interface ImportExportModalProps {
  mode: 'import' | 'export';
  onClose: () => void;
  onImportComplete?: () => void;
  currentType?: TemplateType;
}

const TYPE_LABELS: Record<TemplateType, string> = {
  context: 'context template',
  instruct: 'instruct template',
  sysprompt: 'system prompt',
  preset: 'sampler preset',
};

const TYPE_ICONS: Record<TemplateType, string> = {
  context: 'material-symbols:article-outline',
  instruct: 'material-symbols:code',
  sysprompt: 'material-symbols:person-outline',
  preset: 'material-symbols:tune',
};

function generateUniqueName(baseName: string, existingNames: string[]): string {
  if (!existingNames.includes(baseName)) return baseName;

  let counter = 1;
  let newName = `${baseName} (${counter})`;
  while (existingNames.includes(newName)) {
    counter++;
    newName = `${baseName} (${counter})`;
  }
  return newName;
}

export default function ImportExportModal({
  mode,
  onClose,
  onImportComplete,
  currentType,
}: ImportExportModalProps) {
  const [selectedTypes, setSelectedTypes] = useState<Set<TemplateType>>(
    currentType ? new Set([currentType]) : new Set(),
  );
  const [importData, setImportData] = useState<SillyTavernExport | null>(null);
  const [importResults, setImportResults] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleType = (type: TemplateType) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        setImportData(json);
        setError(null);

        const detected = new Set<TemplateType>();
        if (json.context) detected.add('context');
        if (json.instruct) detected.add('instruct');
        if (json.sysprompt) detected.add('sysprompt');
        if (json.preset) detected.add('preset');
        setSelectedTypes(detected);
      } catch {
        setError('invalid JSON file');
        setImportData(null);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (!importData) return;

    const results: string[] = [];

    if (selectedTypes.has('context') && importData.context) {
      const existingNames = Object.keys(SakoConfig.getContextTemplates());
      const name = generateUniqueName(importData.context.name, existingNames);
      SakoConfig.saveContextTemplate(name, { ...importData.context, name });
      results.push(`imported context template: "${name}"`);
    }

    if (selectedTypes.has('instruct') && importData.instruct) {
      const existingNames = Object.keys(SakoConfig.getInstructTemplates());
      const name = generateUniqueName(importData.instruct.name, existingNames);
      SakoConfig.saveInstructTemplate(name, { ...importData.instruct, name });
      results.push(`imported instruct template: "${name}"`);
    }

    if (selectedTypes.has('sysprompt') && importData.sysprompt) {
      const existingNames = Object.keys(SakoConfig.getSystemTemplates());
      const name = generateUniqueName(importData.sysprompt.name, existingNames);
      SakoConfig.saveSystemTemplate(name, { ...importData.sysprompt, name });
      results.push(`imported system prompt: "${name}"`);
    }

    if (selectedTypes.has('preset') && importData.preset) {
      const existingNames = Object.keys(SakoConfig.getSamplerTemplates());
      const baseName = importData.preset.name || 'imported preset';
      const name = generateUniqueName(baseName, existingNames);
      SakoConfig.saveSamplerTemplate(name, { ...importData.preset, name });
      results.push(`imported sampler preset: "${name}"`);
    }

    setImportResults(results);
    onImportComplete?.();
  };

  const handleExport = () => {
    const exportData: SillyTavernExport = {};

    if (selectedTypes.has('context')) {
      const active = SakoConfig.getActiveContext();
      if (active) exportData.context = active;
    }

    if (selectedTypes.has('instruct')) {
      const active = SakoConfig.getActiveInstruct();
      if (active) exportData.instruct = active;
    }

    if (selectedTypes.has('sysprompt')) {
      const active = SakoConfig.getActiveSystem();
      if (active) exportData.sysprompt = active;
    }

    if (selectedTypes.has('preset')) {
      const active = SakoConfig.getActiveSampler();
      if (active) exportData.preset = active;
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const names = Object.values(exportData)
      .map((t) => t?.name)
      .filter(Boolean);
    const filename =
      names.length === 1 ? `${names[0]}.json` : 'kusako-templates.json';

    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  const availableTypes: TemplateType[] =
    mode === 'import' && importData
      ? (['context', 'instruct', 'sysprompt', 'preset'] as const).filter(
          (type) => {
            if (type === 'context') return !!importData.context;
            if (type === 'instruct') return !!importData.instruct;
            if (type === 'sysprompt') return !!importData.sysprompt;
            if (type === 'preset') return !!importData.preset;
            return false;
          },
        )
      : ['context', 'instruct', 'sysprompt', 'preset'];

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
      <div className='bg-base-100 rounded-2xl shadow-xl border border-base-content/10 p-6 w-96'>
        <div className='flex items-center justify-between mb-6'>
          <h3 className='text-lg font-semibold text-base-content'>
            {mode === 'import' ? 'import templates' : 'export templates'}
          </h3>
          <button
            onClick={onClose}
            className='p-1.5 rounded-lg hover:bg-base-200 text-base-content/50 hover:text-base-content transition-colors cursor-pointer'
          >
            <Icon icon='material-symbols:close' className='w-5 h-5' />
          </button>
        </div>

        {mode === 'import' && !importData && (
          <div className='mb-6'>
            <input
              ref={fileInputRef}
              type='file'
              accept='.json'
              onChange={handleFileSelect}
              className='hidden'
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className='w-full py-8 border-2 border-dashed border-base-content/20 rounded-xl hover:border-primary hover:bg-primary/5 transition-all cursor-pointer flex flex-col items-center gap-2'
            >
              <Icon
                icon='material-symbols:upload-file'
                className='w-8 h-8 text-base-content/40'
              />
              <span className='text-sm text-base-content/60'>
                click to select a JSON file
              </span>
            </button>
            {error && (
              <p className='mt-3 text-sm text-error text-center'>{error}</p>
            )}
          </div>
        )}

        {(mode === 'export' || importData) && importResults.length === 0 && (
          <>
            <p className='text-sm text-base-content/60 mb-4'>
              {mode === 'import'
                ? 'select which templates to import:'
                : 'select which templates to export:'}
            </p>

            <div className='space-y-2 mb-6'>
              {availableTypes.map((type) => (
                <label
                  key={type}
                  className='flex items-center gap-3 p-3 rounded-xl hover:bg-base-200/50 transition-colors cursor-pointer group'
                >
                  <div className='relative'>
                    <input
                      type='checkbox'
                      checked={selectedTypes.has(type)}
                      onChange={() => toggleType(type)}
                      className='peer sr-only'
                    />
                    <div className='w-5 h-5 rounded-md border-2 border-base-content/20 peer-checked:border-primary peer-checked:bg-primary transition-all flex items-center justify-center'>
                      {selectedTypes.has(type) && (
                        <Icon
                          icon='material-symbols:check'
                          className='w-3.5 h-3.5 text-primary-content'
                        />
                      )}
                    </div>
                  </div>
                  <Icon
                    icon={TYPE_ICONS[type]}
                    className='w-5 h-5 text-base-content/40 group-hover:text-base-content/60 transition-colors'
                  />
                  <span className='text-sm text-base-content/70 group-hover:text-base-content transition-colors'>
                    {TYPE_LABELS[type]}
                  </span>
                </label>
              ))}
            </div>

            <div className='flex gap-3'>
              <button
                onClick={onClose}
                className='flex-1 px-4 py-2.5 text-sm rounded-xl bg-base-200 hover:bg-base-300 transition-colors cursor-pointer'
              >
                cancel
              </button>
              <button
                onClick={mode === 'import' ? handleImport : handleExport}
                disabled={selectedTypes.size === 0}
                className='flex-1 px-4 py-2.5 text-sm rounded-xl bg-primary text-primary-content hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer'
              >
                {mode === 'import' ? 'import' : 'export'}
              </button>
            </div>
          </>
        )}

        {importResults.length > 0 && (
          <>
            <div className='mb-6'>
              <div className='flex items-center gap-2 mb-4'>
                <Icon
                  icon='material-symbols:check-circle'
                  className='w-6 h-6 text-success'
                />
                <span className='text-sm font-medium text-base-content'>
                  import complete
                </span>
              </div>
              <ul className='space-y-2'>
                {importResults.map((result, i) => (
                  <li
                    key={i}
                    className='text-sm text-base-content/70 pl-4 border-l-2 border-success/30'
                  >
                    {result}
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={onClose}
              className='w-full px-4 py-2.5 text-sm rounded-xl bg-primary text-primary-content hover:opacity-90 transition-opacity cursor-pointer'
            >
              done
            </button>
          </>
        )}
      </div>
    </div>
  );
}
