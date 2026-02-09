'use client';

import { useState } from 'react';

import Navbar from '../../components/navbar';
import SettingsNav from '../../components/settings/settings-nav';
import ProviderSettings from '../../components/settings/provider-settings';
import SamplerSettings from '../../components/settings/sampler-settings';
import ContextSettings from '../../components/settings/context-settings';
import InstructSettings from '../../components/settings/instruct-settings';
import SystemSettings from '../../components/settings/system-settings';
import CharacterSettings from '../../components/settings/character-settings';

type SettingsTab =
  | 'provider'
  | 'samplers'
  | 'context'
  | 'instruct'
  | 'system'
  | 'character';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('provider');

  const renderContent = () => {
    switch (activeTab) {
      case 'provider':
        return <ProviderSettings />;
      case 'samplers':
        return <SamplerSettings />;
      case 'context':
        return <ContextSettings />;
      case 'instruct':
        return <InstructSettings />;
      case 'system':
        return <SystemSettings />;
      case 'character':
        return <CharacterSettings />;
      default:
        return <ProviderSettings />;
    }
  };

  return (
    <>
      <Navbar />
      <main className='h-[calc(100vh-65px)] overflow-hidden bg-linear-to-br from-base-100 via-base-100 to-primary/5'>
        <div className='mx-auto max-w-[1440px] px-6 py-6 h-full'>
          <div className='flex gap-6 h-full'>
            <SettingsNav activeTab={activeTab} onTabChange={setActiveTab} />

            <div className='flex-1 min-w-0 overflow-hidden'>
              <div className='bg-base-100 rounded-2xl border border-base-content/5 p-6 shadow-sm h-full overflow-y-auto'>
                {renderContent()}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
