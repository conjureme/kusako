'use client';

import { useState, useEffect } from 'react';
import Navbar from '../../components/Navbar';

import * as SakoConfig from '@repo/sako-config';

export default function Page() {
  const [providers, setProviders] = useState<SakoConfig.ProvidersConfig | null>(
    null
  );
  const [activeProvider, setActiveProviderState] =
    useState<SakoConfig.ProviderType | null>(null);

  const [contextTemplates, setContextTemplates] = useState<
    Record<string, SakoConfig.ContextTemplate>
  >({});
  const [instructTemplates, setInstructTemplates] = useState<
    Record<string, SakoConfig.InstructTemplate>
  >({});
  const [systemTemplates, setSystemTemplates] = useState<
    Record<string, SakoConfig.SystemPrompt>
  >({});
  const [samplerTemplates, setSamplerTemplates] = useState<
    Record<string, SakoConfig.SamplerSettings>
  >({});

  const [activeContext, setActiveContextState] = useState<string | null>(null);
  const [activeInstruct, setActiveInstructState] = useState<string | null>(
    null
  );
  const [activeSystem, setActiveSystemState] = useState<string | null>(null);
  const [activeSampler, setActiveSamplerState] = useState<string | null>(null);

  useEffect(() => {
    setProviders(SakoConfig.getProvidersConfig());
    setActiveProviderState(SakoConfig.getActiveProvider());

    setContextTemplates(SakoConfig.getContextTemplates());
    setInstructTemplates(SakoConfig.getInstructTemplates());
    setSystemTemplates(SakoConfig.getSystemTemplates());
    setSamplerTemplates(SakoConfig.getSamplerTemplates());

    setActiveContextState(SakoConfig.getActiveContext());
    setActiveInstructState(SakoConfig.getActiveInstruct());
    setActiveSystemState(SakoConfig.getActiveSystem());
    setActiveSamplerState(SakoConfig.getActiveSampler());
  }, []);

  const handleProviderSelect = (type: SakoConfig.ProviderType) => {
    SakoConfig.setActiveProvider(type);
    setActiveProviderState(type);
  };

  const handleConfigUpdate = (
    type: SakoConfig.ProviderType,
    field: string,
    value: string
  ) => {
    if (!providers) return;

    const updatedConfig = { ...providers[type], [field]: value };
    SakoConfig.updateProviderConfig(type, updatedConfig);
    setProviders(SakoConfig.getProvidersConfig());
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

        <div className='mt-12 border-t pt-8'>
          <h2 className='text-2xl mb-4'>templates</h2>

          <div className='mb-8'>
            <h3 className='text-lg mb-2'>context template</h3>
            <select
              value={activeContext || ''}
              onChange={(e) => {
                SakoConfig.setActiveContext(e.target.value);
                setActiveContextState(e.target.value);
              }}
              className='px-4 py-2 border'
            >
              {Object.keys(contextTemplates).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className='mb-8'>
            <h3 className='text-lg mb-2'>instruct template</h3>
            <select
              value={activeInstruct || ''}
              onChange={(e) => {
                SakoConfig.setActiveInstruct(e.target.value);
                setActiveInstructState(e.target.value);
              }}
              className='px-4 py-2 border'
            >
              {Object.keys(instructTemplates).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className='mb-8'>
            <h3 className='text-lg mb-2'>system prompt</h3>
            <select
              value={activeSystem || ''}
              onChange={(e) => {
                SakoConfig.setActiveSystem(e.target.value);
                setActiveSystemState(e.target.value);
              }}
              className='px-4 py-2 border'
            >
              {Object.keys(systemTemplates).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {activeSystem && systemTemplates[activeSystem] && (
              <div className='mt-4 p-4 border bg-base-200'>
                <p className='text-sm'>
                  {systemTemplates[activeSystem].content}
                </p>
              </div>
            )}
          </div>

          <div className='mb-8'>
            <h3 className='text-lg mb-2'>sampler preset</h3>
            <select
              value={activeSampler || ''}
              onChange={(e) => {
                SakoConfig.setActiveSampler(e.target.value);
                setActiveSamplerState(e.target.value);
              }}
              className='px-4 py-2 border'
            >
              {Object.keys(samplerTemplates).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {activeSampler && samplerTemplates[activeSampler] && (
              <div className='mt-4 p-4 border bg-base-200 max-w-md'>
                <p className='text-sm mb-1'>
                  temp: {samplerTemplates[activeSampler].temp}
                </p>
                <p className='text-sm mb-1'>
                  top_p: {samplerTemplates[activeSampler].top_p}
                </p>
                <p className='text-sm mb-1'>
                  top_k: {samplerTemplates[activeSampler].top_k}
                </p>
                <p className='text-sm mb-1'>
                  max_length: {samplerTemplates[activeSampler].max_length}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
