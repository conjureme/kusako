'use client';

import { Icon } from '@iconify/react';

type SettingsTab =
  | 'provider'
  | 'samplers'
  | 'context'
  | 'instruct'
  | 'system'
  | 'character';

interface SettingsNavProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

interface TabItem {
  id: SettingsTab;
  label: string;
  icon: string;
  description: string;
}

const generationTabs: TabItem[] = [
  {
    id: 'provider',
    label: 'provider',
    icon: 'material-symbols:cloud-outline',
    description: 'api connections',
  },
  {
    id: 'samplers',
    label: 'samplers',
    icon: 'material-symbols:tune',
    description: 'generation settings',
  },
  {
    id: 'context',
    label: 'context',
    icon: 'material-symbols:article-outline',
    description: 'context template',
  },
  {
    id: 'instruct',
    label: 'instruct',
    icon: 'material-symbols:code',
    description: 'instruct format',
  },
  {
    id: 'system',
    label: 'system',
    icon: 'material-symbols:person-outline',
    description: 'system prompt',
  },
];

const characterTabs: TabItem[] = [
  {
    id: 'character',
    label: 'character',
    icon: 'material-symbols:face-6',
    description: 'character cards',
  },
];

export default function SettingsNav({
  activeTab,
  onTabChange,
}: SettingsNavProps) {
  const renderTab = (tab: TabItem) => (
    <button
      key={tab.id}
      onClick={() => onTabChange(tab.id)}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer group ${
        activeTab === tab.id
          ? 'bg-primary/10 text-primary'
          : 'hover:bg-base-200 text-base-content/70 hover:text-base-content'
      }`}
    >
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
          activeTab === tab.id
            ? 'bg-primary/20'
            : 'bg-base-200 group-hover:bg-base-300'
        }`}
      >
        <Icon icon={tab.icon} className='w-5 h-5' />
      </div>
      <div className='text-left'>
        <div className='font-medium text-sm'>{tab.label}</div>
        <div
          className={`text-xs ${
            activeTab === tab.id ? 'text-primary/70' : 'text-base-content/50'
          }`}
        >
          {tab.description}
        </div>
      </div>
    </button>
  );

  return (
    <nav className='w-64 shrink-0'>
      <div className='bg-base-100 rounded-2xl border border-base-content/5 p-3 shadow-sm'>
        <div className='space-y-1'>{generationTabs.map(renderTab)}</div>

        <div className='my-3 border-t border-base-content/5' />

        <div className='space-y-1'>{characterTabs.map(renderTab)}</div>
      </div>
    </nav>
  );
}
