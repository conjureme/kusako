'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from '@iconify/react';

import * as SakoConfig from '@repo/sako-config';
import type { CharacterCard, CharacterCardData } from '@repo/sako-config';

import TemplateSelector from './template-selector';

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

export default function CharacterSettings() {
  const [cards, setCards] = useState<Record<string, CharacterCard>>({});
  const [currentCard, setCurrentCard] = useState<CharacterCard | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const checkDirty = useCallback(() => {
    setIsDirty(SakoConfig.isCharacterDirty());
  }, []);

  useEffect(() => {
    const loadedCards = SakoConfig.getCharacterCards();
    setCards(loadedCards);
    const active = SakoConfig.getActiveCharacter();
    setCurrentCard(active);
    checkDirty();
  }, [checkDirty]);

  const handleCardSelect = (name: string) => {
    const allCards = SakoConfig.getCharacterCards();
    const card = allCards[name];
    if (card) {
      SakoConfig.setActiveCharacter(card);
      setCurrentCard(card);
      checkDirty();
    }
  };

  const handleCardCreate = (name: string) => {
    if (!currentCard) return;
    const newCard = SakoConfig.createCharacterCard(name, currentCard);
    setCards(SakoConfig.getCharacterCards());
    setCurrentCard(newCard);
    checkDirty();
  };

  const handleCardDelete = (name: string) => {
    SakoConfig.deleteCharacterCard(name);
    setCards(SakoConfig.getCharacterCards());
    setCurrentCard(SakoConfig.getActiveCharacter());
    checkDirty();
  };

  const handleCardRename = (newName: string) => {
    const renamed = SakoConfig.renameCharacterCard(newName);
    if (renamed) {
      setCards(SakoConfig.getCharacterCards());
      setCurrentCard(renamed);
      checkDirty();
    }
  };

  const handleSave = () => {
    SakoConfig.commitActiveCharacter();
    setCards(SakoConfig.getCharacterCards());
    checkDirty();
  };

  const handleRestore = () => {
    const restored = SakoConfig.restoreActiveCharacter();
    if (restored) {
      setCurrentCard(restored);
      checkDirty();
    }
  };

  const handleFieldUpdate = (
    field: keyof CharacterCardData,
    value: string | string[],
  ) => {
    if (!currentCard) return;

    const updated = SakoConfig.updateActiveCharacter({ [field]: value });
    if (updated) {
      setCurrentCard(updated);
      checkDirty();
    }
  };

  const handleImport = () => {
    setImportError(null);
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      let card: CharacterCard;

      if (file.name.endsWith('.png')) {
        card = await SakoConfig.extractCharacterFromPng(file);
      } else {
        const text = await file.text();
        const json = JSON.parse(text);

        if (json.spec === 'chara_card_v2' && json.data) {
          card = json as CharacterCard;
        } else if (json.name || json.description) {
          card = {
            spec: 'chara_card_v2',
            spec_version: '2.0',
            data: {
              name: json.name || 'imported character',
              description: json.description || '',
              personality: json.personality || '',
              scenario: json.scenario || '',
              first_mes: json.first_mes || '',
              mes_example: json.mes_example || '',
              creator_notes: json.creator_notes || '',
              system_prompt: json.system_prompt || '',
              post_history_instructions: json.post_history_instructions || '',
              alternate_greetings: json.alternate_greetings || [],
              tags: json.tags || [],
              creator: json.creator || '',
              character_version: json.character_version || '',
              extensions: json.extensions || {},
            },
          };
        } else {
          throw new Error('unrecognized character card format');
        }
      }

      const existingNames = Object.keys(SakoConfig.getCharacterCards());
      const name = generateUniqueName(card.data.name, existingNames);
      card = { ...card, data: { ...card.data, name } };

      SakoConfig.saveCharacterCard(name, card);
      SakoConfig.setActiveCharacter(card);
      setCards(SakoConfig.getCharacterCards());
      setCurrentCard(card);
      checkDirty();
      setImportError(null);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : 'failed to import character',
      );
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExport = () => {
    if (!currentCard) return;

    const blob = new Blob([JSON.stringify(currentCard, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentCard.data.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!currentCard) {
    return (
      <div className='py-12 text-center'>
        <div className='w-16 h-16 rounded-2xl bg-base-200 flex items-center justify-center mx-auto mb-4'>
          <Icon
            icon='material-symbols:face-6'
            className='w-8 h-8 text-base-content/30'
          />
        </div>
        <p className='text-base-content/50'>loading character settings...</p>
      </div>
    );
  }

  const { data } = currentCard;

  return (
    <div className='space-y-6'>
      <input
        ref={fileInputRef}
        type='file'
        accept='.json,.png'
        onChange={handleFileSelect}
        className='hidden'
      />

      <TemplateSelector
        templates={Object.keys(cards)}
        activeTemplate={data.name || null}
        onSelect={handleCardSelect}
        onCreate={handleCardCreate}
        onDelete={handleCardDelete}
        onRename={handleCardRename}
        onSave={handleSave}
        onRestore={handleRestore}
        isDirty={isDirty}
        onImport={handleImport}
        onExport={handleExport}
      />

      {importError && (
        <div className='flex items-center gap-2 px-4 py-3 rounded-xl bg-error/10 border border-error/20'>
          <Icon
            icon='material-symbols:error-outline'
            className='w-5 h-5 text-error shrink-0'
          />
          <p className='text-sm text-error'>{importError}</p>
          <button
            onClick={() => setImportError(null)}
            className='ml-auto p-1 rounded-lg hover:bg-error/10 text-error/50 hover:text-error transition-colors cursor-pointer'
          >
            <Icon icon='material-symbols:close' className='w-4 h-4' />
          </button>
        </div>
      )}

      <div className='space-y-5'>
        <div className='grid grid-cols-3 gap-4'>
          <div>
            <label className='block text-sm font-medium text-base-content/80 mb-2'>
              creator
            </label>
            <input
              type='text'
              value={data.creator}
              onChange={(e) => handleFieldUpdate('creator', e.target.value)}
              placeholder='who made this character'
              className='w-full px-4 py-3 rounded-xl bg-base-200/50 border border-base-content/10 focus:border-primary focus:bg-base-100 outline-none transition-all text-sm'
            />
          </div>
          <div>
            <label className='block text-sm font-medium text-base-content/80 mb-2'>
              version
            </label>
            <input
              type='text'
              value={data.character_version}
              onChange={(e) =>
                handleFieldUpdate('character_version', e.target.value)
              }
              placeholder='e.g. v1.0'
              className='w-full px-4 py-3 rounded-xl bg-base-200/50 border border-base-content/10 focus:border-primary focus:bg-base-100 outline-none transition-all text-sm'
            />
          </div>
          <div>
            <label className='block text-sm font-medium text-base-content/80 mb-2'>
              tags
            </label>
            <input
              type='text'
              value={data.tags.join(', ')}
              onChange={(e) =>
                handleFieldUpdate(
                  'tags',
                  e.target.value
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
                )
              }
              placeholder='comma separated tags'
              className='w-full px-4 py-3 rounded-xl bg-base-200/50 border border-base-content/10 focus:border-primary focus:bg-base-100 outline-none transition-all text-sm'
            />
          </div>
        </div>

        <div>
          <label className='block text-sm font-medium text-base-content/80 mb-2'>
            description
          </label>
          <textarea
            value={data.description}
            onChange={(e) => handleFieldUpdate('description', e.target.value)}
            rows={8}
            placeholder="describe the character's appearance, background, world, and traits..."
            className='w-full px-4 py-3 rounded-xl bg-base-200/50 border border-base-content/10 focus:border-primary focus:bg-base-100 outline-none transition-all text-sm font-mono resize-none leading-relaxed'
          />
        </div>

        <div>
          <label className='block text-sm font-medium text-base-content/80 mb-2'>
            personality
          </label>
          <textarea
            value={data.personality}
            onChange={(e) => handleFieldUpdate('personality', e.target.value)}
            rows={3}
            placeholder='personality summary (some cards leave this empty and put it in description instead)'
            className='w-full px-4 py-3 rounded-xl bg-base-200/50 border border-base-content/10 focus:border-primary focus:bg-base-100 outline-none transition-all text-sm font-mono resize-none leading-relaxed'
          />
        </div>

        <div>
          <label className='block text-sm font-medium text-base-content/80 mb-2'>
            scenario
          </label>
          <textarea
            value={data.scenario}
            onChange={(e) => handleFieldUpdate('scenario', e.target.value)}
            rows={3}
            placeholder='the scenario or context for the conversation...'
            className='w-full px-4 py-3 rounded-xl bg-base-200/50 border border-base-content/10 focus:border-primary focus:bg-base-100 outline-none transition-all text-sm font-mono resize-none leading-relaxed'
          />
        </div>

        <div>
          <label className='block text-sm font-medium text-base-content/80 mb-2'>
            first message
          </label>
          <textarea
            value={data.first_mes}
            onChange={(e) => handleFieldUpdate('first_mes', e.target.value)}
            rows={6}
            placeholder="the character's opening message..."
            className='w-full px-4 py-3 rounded-xl bg-base-200/50 border border-base-content/10 focus:border-primary focus:bg-base-100 outline-none transition-all text-sm font-mono resize-none leading-relaxed'
          />
        </div>

        <div>
          <label className='block text-sm font-medium text-base-content/80 mb-2'>
            example messages
          </label>
          <textarea
            value={data.mes_example}
            onChange={(e) => handleFieldUpdate('mes_example', e.target.value)}
            rows={6}
            placeholder={'<START>\n{{user}}: hello!\n{{char}}: hey there!'}
            className='w-full px-4 py-3 rounded-xl bg-base-200/50 border border-base-content/10 focus:border-primary focus:bg-base-100 outline-none transition-all text-sm font-mono resize-none leading-relaxed'
          />
        </div>

        <div className='pt-4 border-t border-base-content/5'>
          <label className='block text-sm font-medium text-base-content/80 mb-2'>
            creator notes
          </label>
          <textarea
            value={data.creator_notes}
            onChange={(e) => handleFieldUpdate('creator_notes', e.target.value)}
            rows={3}
            placeholder='notes from the character creator (not sent to the AI)'
            className='w-full px-4 py-3 rounded-xl bg-base-200/50 border border-base-content/10 focus:border-primary focus:bg-base-100 outline-none transition-all text-sm resize-none leading-relaxed'
          />
        </div>

        <div>
          <label className='block text-sm font-medium text-base-content/80 mb-2'>
            character system prompt
          </label>
          <textarea
            value={data.system_prompt}
            onChange={(e) => handleFieldUpdate('system_prompt', e.target.value)}
            rows={4}
            placeholder='per-character system prompt override (leave empty to use global system prompt)'
            className='w-full px-4 py-3 rounded-xl bg-base-200/50 border border-base-content/10 focus:border-primary focus:bg-base-100 outline-none transition-all text-sm font-mono resize-none leading-relaxed'
          />
        </div>

        <div>
          <label className='block text-sm font-medium text-base-content/80 mb-2'>
            post history instructions
          </label>
          <textarea
            value={data.post_history_instructions}
            onChange={(e) =>
              handleFieldUpdate('post_history_instructions', e.target.value)
            }
            rows={3}
            placeholder='instructions injected after chat history (jailbreak position)'
            className='w-full px-4 py-3 rounded-xl bg-base-200/50 border border-base-content/10 focus:border-primary focus:bg-base-100 outline-none transition-all text-sm font-mono resize-none leading-relaxed'
          />
        </div>

        <AlternateGreetings
          greetings={data.alternate_greetings}
          onChange={(greetings) =>
            handleFieldUpdate('alternate_greetings', greetings)
          }
        />
      </div>
    </div>
  );
}

interface AlternateGreetingsProps {
  greetings: string[];
  onChange: (greetings: string[]) => void;
}

function AlternateGreetings({ greetings, onChange }: AlternateGreetingsProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleAdd = () => {
    onChange([...greetings, '']);
  };

  const handleUpdate = (index: number, value: string) => {
    const updated = [...greetings];
    updated[index] = value;
    onChange(updated);
  };

  const handleRemove = (index: number) => {
    onChange(greetings.filter((_, i) => i !== index));
  };

  return (
    <div className='pt-4 border-t border-base-content/5'>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className='flex items-center gap-2 text-sm font-medium text-base-content/80 cursor-pointer hover:text-base-content transition-colors'
      >
        <Icon
          icon='material-symbols:expand-more'
          className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-0' : '-rotate-90'}`}
        />
        alternate greetings ({greetings.length})
      </button>

      {isOpen && (
        <div className='mt-3 space-y-3'>
          {greetings.map((greeting, i) => (
            <div key={i} className='relative'>
              <textarea
                value={greeting}
                onChange={(e) => handleUpdate(i, e.target.value)}
                rows={4}
                placeholder={`alternate greeting ${i + 1}...`}
                className='w-full px-4 py-3 pr-10 rounded-xl bg-base-200/50 border border-base-content/10 focus:border-primary focus:bg-base-100 outline-none transition-all text-sm font-mono resize-none leading-relaxed'
              />
              <button
                onClick={() => handleRemove(i)}
                className='absolute top-3 right-3 p-1 rounded-lg hover:bg-error/10 text-base-content/30 hover:text-error transition-colors cursor-pointer'
              >
                <Icon icon='material-symbols:close' className='w-4 h-4' />
              </button>
            </div>
          ))}

          <button
            onClick={handleAdd}
            className='flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-base-content/20 hover:border-primary hover:bg-primary/5 transition-all text-sm text-base-content/50 hover:text-primary cursor-pointer w-full justify-center'
          >
            <Icon icon='material-symbols:add' className='w-4 h-4' />
            add greeting
          </button>
        </div>
      )}
    </div>
  );
}
