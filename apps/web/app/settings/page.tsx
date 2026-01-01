'use client';

import { useState, useEffect } from 'react';
import Navbar from '../../components/Navbar';
import {
  getProvidersConfig,
  getActiveProvider,
  setActiveProvider,
  updateProviderConfig,
  type ProviderType,
  type ProvidersConfig,
} from '@repo/sako-config';

export default function Page() {
  const [providers, setProviders] = useState<ProvidersConfig | null>(null);
  const [activeProvider, setActiveProviderState] =
    useState<ProviderType | null>(null);

  useEffect(() => {
    setProviders(getProvidersConfig());
    setActiveProviderState(getActiveProvider());
  }, []);

  const handleProviderSelect = (type: ProviderType) => {
    setActiveProvider(type);
    setActiveProviderState(type);
  };

  const handleConfigUpdate = (
    type: ProviderType,
    field: string,
    value: string
  ) => {
    if (!providers) return;

    const updatedConfig = { ...providers[type], [field]: value };
    updateProviderConfig(type, updatedConfig);
    setProviders(getProvidersConfig());
  };

  if (!providers) return <div>loading...</div>;

  return (
    <div className='min-h-screen bg-base-100'>
      <Navbar />
      <main className='p-8'>
        <h1 className='text-2xl mb-4'>settings</h1>

        <div className='mb-8'>
          <h2 className='text-xl mb-2'>select provider</h2>
          <div className='flex gap-4'>
            <button
              onClick={() => handleProviderSelect('koboldcpp')}
              className={`px-4 py-2 border ${activeProvider === 'koboldcpp' ? 'bg-primary text-white' : ''}`}
            >
              koboldcpp
            </button>
            <button
              onClick={() => handleProviderSelect('claude')}
              className={`px-4 py-2 border ${activeProvider === 'claude' ? 'bg-primary text-white' : ''}`}
            >
              claude
            </button>
          </div>
        </div>

        {activeProvider && (
          <div className='mt-8'>
            <h2 className='text-xl mb-2'>{activeProvider} configuration</h2>
            <div className='flex flex-col gap-4 max-w-md'>
              <div>
                <label className='block mb-1'>base url</label>
                <input
                  type='text'
                  value={providers[activeProvider].baseUrl}
                  onChange={(e) =>
                    handleConfigUpdate(
                      activeProvider,
                      'baseUrl',
                      e.target.value
                    )
                  }
                  className='w-full px-3 py-2 border'
                  disabled={activeProvider === 'claude'}
                />
              </div>

              {activeProvider === 'koboldcpp' && (
                <div>
                  <label className='block mb-1'>api key (optional)</label>
                  <input
                    type='password'
                    value={providers.koboldcpp.apiKey || ''}
                    onChange={(e) =>
                      handleConfigUpdate('koboldcpp', 'apiKey', e.target.value)
                    }
                    className='w-full px-3 py-2 border'
                  />
                </div>
              )}

              {activeProvider === 'claude' && (
                <>
                  <div>
                    <label className='block mb-1'>api key</label>
                    <input
                      type='password'
                      value={providers.claude.apiKey}
                      onChange={(e) =>
                        handleConfigUpdate('claude', 'apiKey', e.target.value)
                      }
                      className='w-full px-3 py-2 border'
                    />
                  </div>
                  <div>
                    <label className='block mb-1'>model</label>
                    <input
                      type='text'
                      value={providers.claude.model}
                      onChange={(e) =>
                        handleConfigUpdate('claude', 'model', e.target.value)
                      }
                      className='w-full px-3 py-2 border'
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
