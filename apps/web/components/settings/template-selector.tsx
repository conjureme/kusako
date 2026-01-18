'use client';

import { useState } from 'react';
import { Icon } from '@iconify/react';

interface TemplateSelectorProps {
  templates: string[];
  activeTemplate: string | null;
  onSelect: (name: string) => void;
  onCreate: (name: string) => void;
  onDelete: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
}

export default function TemplateSelector({
  templates,
  activeTemplate,
  onSelect,
  onCreate,
  onDelete,
  onRename,
}: TemplateSelectorProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [isRenaming, setIsRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(
    null,
  );

  const handleCreate = () => {
    if (newName.trim() && !templates.includes(newName.trim())) {
      onCreate(newName.trim());
      setNewName('');
      setIsCreating(false);
    }
  };

  const handleRename = (oldName: string) => {
    if (newName.trim() && !templates.includes(newName.trim())) {
      onRename(oldName, newName.trim());
      setNewName('');
      setIsRenaming(null);
    }
  };

  const handleDelete = (name: string) => {
    onDelete(name);
    setShowDeleteConfirm(null);
  };

  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-2 flex-wrap'>
        {templates.map((name) => (
          <div key={name} className='relative group'>
            {isRenaming === name ? (
              <div className='flex items-center gap-1'>
                <input
                  type='text'
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(name);
                    if (e.key === 'Escape') {
                      setIsRenaming(null);
                      setNewName('');
                    }
                  }}
                  placeholder={name}
                  autoFocus
                  className='px-3 py-1.5 text-sm rounded-lg bg-base-200 border border-primary outline-none w-32'
                />
                <button
                  onClick={() => handleRename(name)}
                  className='p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors'
                >
                  <Icon icon='material-symbols:check' className='w-4 h-4' />
                </button>
                <button
                  onClick={() => {
                    setIsRenaming(null);
                    setNewName('');
                  }}
                  className='p-1.5 text-base-content/50 hover:bg-base-200 rounded-lg transition-colors'
                >
                  <Icon icon='material-symbols:close' className='w-4 h-4' />
                </button>
              </div>
            ) : (
              <button
                onClick={() => onSelect(name)}
                className={`px-4 py-2 text-sm rounded-xl transition-all duration-200 flex items-center gap-2 ${
                  activeTemplate === name
                    ? 'bg-primary text-primary-content shadow-sm'
                    : 'bg-base-200/50 text-base-content/70 hover:bg-base-200 hover:text-base-content'
                }`}
              >
                <span>{name}</span>
                {activeTemplate === name && (
                  <div className='flex items-center gap-0.5 ml-1'>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsRenaming(name);
                        setNewName(name);
                      }}
                      className='p-1 hover:bg-primary-content/20 rounded transition-colors'
                      title='rename template'
                    >
                      <Icon
                        icon='material-symbols:edit-outline'
                        className='w-3.5 h-3.5'
                      />
                    </button>
                    {templates.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDeleteConfirm(name);
                        }}
                        className='p-1 hover:bg-primary-content/20 rounded transition-colors'
                        title='delete template'
                      >
                        <Icon
                          icon='material-symbols:delete-outline'
                          className='w-3.5 h-3.5'
                        />
                      </button>
                    )}
                  </div>
                )}
              </button>
            )}

            {showDeleteConfirm === name && (
              <div className='absolute top-full left-0 mt-2 z-10 p-3 bg-base-100 rounded-xl shadow-lg border border-base-content/10 min-w-48'>
                <p className='text-sm text-base-content mb-3'>
                  delete "{name}"?
                </p>
                <div className='flex gap-2'>
                  <button
                    onClick={() => handleDelete(name)}
                    className='flex-1 px-3 py-1.5 text-sm bg-error text-error-content rounded-lg hover:opacity-90 transition-opacity'
                  >
                    delete
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(null)}
                    className='flex-1 px-3 py-1.5 text-sm bg-base-200 rounded-lg hover:bg-base-300 transition-colors'
                  >
                    cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {isCreating ? (
          <div className='flex items-center gap-1'>
            <input
              type='text'
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') {
                  setIsCreating(false);
                  setNewName('');
                }
              }}
              placeholder='template name'
              autoFocus
              className='px-3 py-1.5 text-sm rounded-lg bg-base-200 border border-primary outline-none w-36'
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || templates.includes(newName.trim())}
              className='p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
            >
              <Icon icon='material-symbols:check' className='w-4 h-4' />
            </button>
            <button
              onClick={() => {
                setIsCreating(false);
                setNewName('');
              }}
              className='p-1.5 text-base-content/50 hover:bg-base-200 rounded-lg transition-colors'
            >
              <Icon icon='material-symbols:close' className='w-4 h-4' />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsCreating(true)}
            className='px-3 py-2 text-sm rounded-xl border-2 border-dashed border-base-content/20 text-base-content/50 hover:border-primary/50 hover:text-primary transition-all duration-200 flex items-center gap-1.5'
          >
            <Icon icon='material-symbols:add' className='w-4 h-4' />
            <span>new</span>
          </button>
        )}
      </div>
    </div>
  );
}
