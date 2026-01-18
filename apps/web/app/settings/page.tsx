'use client';

import { useState } from 'react';

import Navbar from '../../components/navbar';
import SettingsNav from '../../components/settings/settings-nav';
import ProviderSettings from '../../components/settings/provider-settings';
import SamplerSettings from '../../components/settings/sampler-settings';
import ContextSettings from '../../components/settings/context-settings';
import InstructSettings from '../../components/settings/instruct-settings';
import SystemSettings from '../../components/settings/system-settings';

type SettingsTab = 'provider' | 'samplers' | 'context' | 'instruct' | 'system';

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
      default:
        return <ProviderSettings />;
    }
  };

  return (
    <>
      <Navbar />
      <main className='min-h-screen bg-linear-to-br from-base-100 via-base-100 to-primary/5'>
        <div className='mx-auto max-w-[1440px] px-6 py-8'>
          <div className='mb-8'>
            <h1 className='text-3xl font-bold text-base-content'>settings</h1>
            <p className='text-base-content/60 mt-1'>
              configure provider and other things
            </p>
          </div>

          <div className='flex gap-8'>
            <SettingsNav activeTab={activeTab} onTabChange={setActiveTab} />

            <div className='flex-1 min-w-0'>
              <div className='bg-base-100 rounded-2xl border border-base-content/5 p-6 shadow-sm'>
                {renderContent()}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
