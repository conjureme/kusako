'use client';

import { useState, useRef, useEffect } from 'react';
import { Icon } from '@iconify/react';

interface TemplateSelectorProps {
  templates: string[];
  activeTemplate: string | null;
  onSelect: (name: string) => void;
  onCreate: (name: string) => void;
  onDelete: (name: string) => void;
  onRename: (newName: string) => void;
  onSave: () => void;
  onRestore: () => void;
  isDirty: boolean;
}

type ModalMode = 'create' | 'rename' | 'delete' | null;

export default function TemplateSelector({
  templates,
  activeTemplate,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  onSave,
  onRestore,
  isDirty,
}: TemplateSelectorProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [inputValue, setInputValue] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreate = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !templates.includes(trimmed)) {
      onCreate(trimmed);
      setInputValue('');
      setModalMode(null);
    }
  };

  const handleRename = () => {
    const trimmed = inputValue.trim();
    if (activeTemplate && trimmed && !templates.includes(trimmed)) {
      onRename(trimmed);
      setInputValue('');
      setModalMode(null);
    }
  };

  const handleDelete = () => {
    if (activeTemplate) {
      onDelete(activeTemplate);
      setModalMode(null);
    }
  };

  const openRenameModal = () => {
    setInputValue('');
    setModalMode('rename');
  };

  const openCreateModal = () => {
    setInputValue('');
    setModalMode('create');
  };

  const closeModal = () => {
    setModalMode(null);
    setInputValue('');
  };

  const isInputValid = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return false;
    if (templates.includes(trimmed)) return false;
    return true;
  };

  return (
    <div className='flex items-center gap-2'>
      <div className='relative' ref={dropdownRef}>
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className='flex items-center gap-2 px-4 py-2.5 rounded-xl bg-base-200/50 border border-base-content/10 hover:border-base-content/20 hover:bg-base-200 transition-all text-sm min-w-40 cursor-pointer'
        >
          <span className='flex-1 text-left truncate'>
            {activeTemplate || 'select template'}
          </span>
          {isDirty && (
            <span
              className='w-2 h-2 rounded-full bg-warning'
              title='unsaved changes'
            />
          )}
          <Icon
            icon='material-symbols:expand-more'
            className={`w-5 h-5 text-base-content/50 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isDropdownOpen && (
          <div className='absolute top-full left-0 mt-1 z-20 w-full min-w-48 py-1 bg-base-100 rounded-xl shadow-lg border border-base-content/10'>
            {templates.map((name) => (
              <button
                key={name}
                onClick={() => {
                  onSelect(name);
                  setIsDropdownOpen(false);
                }}
                className={`w-full px-4 py-2 text-sm text-left transition-colors cursor-pointer ${
                  activeTemplate === name
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-base-200 text-base-content'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className='flex items-center gap-1'>
        <button
          onClick={openCreateModal}
          className='p-2 rounded-lg hover:bg-base-200 text-base-content/50 hover:text-base-content transition-colors cursor-pointer'
          title='new template'
        >
          <Icon icon='material-symbols:add' className='w-4.5 h-4.5' />
        </button>

        <button
          onClick={openRenameModal}
          disabled={!activeTemplate}
          className='p-2 rounded-lg hover:bg-base-200 text-base-content/50 hover:text-base-content transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed'
          title='save as new template'
        >
          <Icon icon='material-symbols:edit-outline' className='w-4.5 h-4.5' />
        </button>

        <button
          onClick={onSave}
          disabled={!isDirty}
          className='p-2 rounded-lg hover:bg-success/10 text-base-content/50 hover:text-success transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed'
          title='save changes'
        >
          <Icon icon='material-symbols:save-outline' className='w-4.5 h-4.5' />
        </button>

        <button
          onClick={onRestore}
          disabled={!isDirty}
          className='p-2 rounded-lg hover:bg-warning/10 text-base-content/50 hover:text-warning transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed'
          title='restore to saved'
        >
          <Icon icon='material-symbols:restart-alt' className='w-4.5 h-4.5' />
        </button>

        <button
          onClick={() => setModalMode('delete')}
          disabled={!activeTemplate || templates.length <= 1}
          className='p-2 rounded-lg hover:bg-error/10 text-base-content/50 hover:text-error transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed'
          title='delete template'
        >
          <Icon
            icon='material-symbols:delete-outline'
            className='w-4.5 h-4.5'
          />
        </button>
      </div>

      {modalMode && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
          <div className='bg-base-100 rounded-2xl shadow-xl border border-base-content/10 p-6 w-80'>
            {modalMode === 'delete' ? (
              <>
                <h3 className='text-lg font-semibold text-base-content mb-2'>
                  delete template
                </h3>
                <p className='text-sm text-base-content/60 mb-6'>
                  are you sure you want to delete "{activeTemplate}"?
                </p>
                <div className='flex gap-3'>
                  <button
                    onClick={closeModal}
                    className='flex-1 px-4 py-2.5 text-sm rounded-xl bg-base-200 hover:bg-base-300 transition-colors'
                  >
                    cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    className='flex-1 px-4 py-2.5 text-sm rounded-xl bg-error text-error-content hover:opacity-90 transition-opacity'
                  >
                    delete
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className='text-lg font-semibold text-base-content mb-4'>
                  {modalMode === 'create'
                    ? 'new template'
                    : 'save as new template'}
                </h3>
                <input
                  type='text'
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && isInputValid()) {
                      modalMode === 'create' ? handleCreate() : handleRename();
                    }
                    if (e.key === 'Escape') closeModal();
                  }}
                  placeholder='template name'
                  autoFocus
                  className='w-full px-4 py-3 text-sm rounded-xl bg-base-200/50 border border-base-content/10 focus:border-primary outline-none mb-4'
                />
                <div className='flex gap-3'>
                  <button
                    onClick={closeModal}
                    className='flex-1 px-4 py-2.5 text-sm rounded-xl bg-base-200 hover:bg-base-300 transition-colors'
                  >
                    cancel
                  </button>
                  <button
                    onClick={
                      modalMode === 'create' ? handleCreate : handleRename
                    }
                    disabled={!isInputValid()}
                    className='flex-1 px-4 py-2.5 text-sm rounded-xl bg-primary text-primary-content hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed'
                  >
                    {modalMode === 'create' ? 'create' : 'save'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
