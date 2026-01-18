'use client';

import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';

import * as SakoConfig from '@repo/sako-config';
import type {
  ProviderType,
  KoboldCppConfig,
  ClaudeConfig,
} from '@repo/sako-config';

export default function ProviderSettings() {
  const [activeProvider, setActiveProvider] = useState<ProviderType | null>(
    null,
  );
  const [koboldConfig, setKoboldConfig] = useState<KoboldCppConfig>({
    baseUrl: '',
  });
  const [claudeConfig, setClaudeConfig] = useState<ClaudeConfig>({
    baseUrl: 'https://api.anthropic.com/v1/',
    apiKey: '',
    model: '',
  });
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    setActiveProvider(SakoConfig.getActiveProvider());
    setKoboldConfig(SakoConfig.getProviderConfig('koboldcpp'));
    setClaudeConfig(SakoConfig.getProviderConfig('claude'));
  }, []);

  const handleProviderSelect = (provider: ProviderType) => {
    setActiveProvider(provider);
    SakoConfig.setActiveProvider(provider);
  };

  const handleKoboldChange = (field: keyof KoboldCppConfig, value: string) => {
    const updated = { ...koboldConfig, [field]: value };
    setKoboldConfig(updated);
    SakoConfig.updateProviderConfig('koboldcpp', updated);
  };

  const handleClaudeChange = (field: keyof ClaudeConfig, value: string) => {
    const updated = { ...claudeConfig, [field]: value };
    setClaudeConfig(updated);
    SakoConfig.updateProviderConfig('claude', updated);
  };

  return (
    <div className='space-y-8'>
      <div>
        <h2 className='text-lg font-semibold text-base-content mb-1'>
          provider configuration
        </h2>
        <p className='text-sm text-base-content/60'>
          connect kusako to your preferred AI backend
        </p>
      </div>

      <div className='grid grid-cols-2 gap-4'>
        <button
          onClick={() => handleProviderSelect('koboldcpp')}
          className={`relative p-5 rounded-xl border-2 transition-all duration-200 text-left group ${
            activeProvider === 'koboldcpp'
              ? 'border-primary bg-primary/5'
              : 'border-base-content/10 hover:border-base-content/20 hover:bg-base-200/50'
          }`}
        >
          {activeProvider === 'koboldcpp' && (
            <div className='absolute top-3 right-3'>
              <div className='w-6 h-6 rounded-full bg-primary flex items-center justify-center'>
                <Icon
                  icon='material-symbols:check'
                  className='w-4 h-4 text-primary-content'
                />
              </div>
            </div>
          )}
          <div className='w-10 h-10 rounded-lg bg-base-200 flex items-center justify-center mb-3 group-hover:bg-base-300 transition-colors'>
            <Icon
              icon='material-symbols:terminal'
              className='w-5 h-5 text-base-content/70'
            />
          </div>
          <div className='font-medium text-base-content'>KoboldCpp</div>
          <div className='text-xs text-base-content/50 mt-1'>
            local inference server
          </div>
        </button>

        <button
          onClick={() => handleProviderSelect('claude')}
          className={`relative p-5 rounded-xl border-2 transition-all duration-200 text-left group ${
            activeProvider === 'claude'
              ? 'border-primary bg-primary/5'
              : 'border-base-content/10 hover:border-base-content/20 hover:bg-base-200/50'
          }`}
        >
          {activeProvider === 'claude' && (
            <div className='absolute top-3 right-3'>
              <div className='w-6 h-6 rounded-full bg-primary flex items-center justify-center'>
                <Icon
                  icon='material-symbols:check'
                  className='w-4 h-4 text-primary-content'
                />
              </div>
            </div>
          )}
          <div className='w-10 h-10 rounded-lg bg-base-200 flex items-center justify-center mb-3 group-hover:bg-base-300 transition-colors'>
            <Icon
              icon='simple-icons:anthropic'
              className='w-5 h-5 text-base-content/70'
            />
          </div>
          <div className='font-medium text-base-content'>Claude</div>
          <div className='text-xs text-base-content/50 mt-1'>anthropic api</div>
        </button>
      </div>

      {activeProvider === 'koboldcpp' && (
        <div className='space-y-5 pt-4 border-t border-base-content/5'>
          <div className='flex items-center gap-2 mb-4'>
            <div className='w-2 h-2 rounded-full bg-primary animate-pulse' />
            <span className='text-sm font-medium text-base-content'>
              KoboldCpp settings
            </span>
          </div>

          <div>
            <label className='block text-sm font-medium text-base-content/80 mb-2'>
              base url
            </label>
            <input
              type='text'
              value={koboldConfig.baseUrl}
              onChange={(e) => handleKoboldChange('baseUrl', e.target.value)}
              placeholder='http://localhost:5001'
              className='w-full px-4 py-3 rounded-xl bg-base-200/50 border border-base-content/10 focus:border-primary focus:bg-base-100 outline-none transition-all text-sm font-mono'
            />
            <p className='text-xs text-base-content/50 mt-2'>
              enter your KoboldCpp server address
            </p>
          </div>

          <div>
            <label className='block text-sm font-medium text-base-content/80 mb-2'>
              api key <span className='text-base-content/40'>(optional)</span>
            </label>
            <div className='relative'>
              <input
                type={showApiKey ? 'text' : 'password'}
                value={koboldConfig.apiKey || ''}
                onChange={(e) => handleKoboldChange('apiKey', e.target.value)}
                placeholder='enter api key if required'
                className='w-full px-4 py-3 pr-12 rounded-xl bg-base-200/50 border border-base-content/10 focus:border-primary focus:bg-base-100 outline-none transition-all text-sm font-mono'
              />
              <button
                type='button'
                onClick={() => setShowApiKey(!showApiKey)}
                className='absolute right-3 top-1/2 -translate-y-1/2 p-1 text-base-content/40 hover:text-base-content/70 transition-colors'
              >
                <Icon
                  icon={
                    showApiKey
                      ? 'material-symbols:visibility-off-outline'
                      : 'material-symbols:visibility-outline'
                  }
                  className='w-5 h-5'
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {activeProvider === 'claude' && (
        <div className='space-y-5 pt-4 border-t border-base-content/5'>
          <div className='flex items-center gap-2 mb-4'>
            <div className='w-2 h-2 rounded-full bg-primary animate-pulse' />
            <span className='text-sm font-medium text-base-content'>
              Claude settings
            </span>
          </div>

          <div>
            <label className='block text-sm font-medium text-base-content/80 mb-2'>
              api key
            </label>
            <div className='relative'>
              <input
                type={showApiKey ? 'text' : 'password'}
                value={claudeConfig.apiKey}
                onChange={(e) => handleClaudeChange('apiKey', e.target.value)}
                placeholder='sk-ant-...'
                className='w-full px-4 py-3 pr-12 rounded-xl bg-base-200/50 border border-base-content/10 focus:border-primary focus:bg-base-100 outline-none transition-all text-sm font-mono'
              />
              <button
                type='button'
                onClick={() => setShowApiKey(!showApiKey)}
                className='absolute right-3 top-1/2 -translate-y-1/2 p-1 text-base-content/40 hover:text-base-content/70 transition-colors'
              >
                <Icon
                  icon={
                    showApiKey
                      ? 'material-symbols:visibility-off-outline'
                      : 'material-symbols:visibility-outline'
                  }
                  className='w-5 h-5'
                />
              </button>
            </div>
            <p className='text-xs text-base-content/50 mt-2'>
              get your api key from{' '}
              <a
                href='https://console.anthropic.com/'
                target='_blank'
                rel='noopener noreferrer'
                className='text-primary hover:underline'
              >
                console.anthropic.com
              </a>
            </p>
          </div>

          <div>
            <label className='block text-sm font-medium text-base-content/80 mb-2'>
              model
            </label>
            <select
              value={claudeConfig.model}
              onChange={(e) => handleClaudeChange('model', e.target.value)}
              className='w-full px-4 py-3 rounded-xl bg-base-200/50 border border-base-content/10 focus:border-primary focus:bg-base-100 outline-none transition-all text-sm'
            >
              <option value=''>select a model</option>
              <option value='claude-sonnet-4-20250514'>claude sonnet 4</option>
              <option value='claude-opus-4-20250514'>claude opus 4</option>
              <option value='claude-3-5-sonnet-20241022'>
                claude 3.5 sonnet
              </option>
              <option value='claude-3-5-haiku-20241022'>
                claude 3.5 haiku
              </option>
            </select>
          </div>

          <div>
            <label className='block text-sm font-medium text-base-content/80 mb-2'>
              base url <span className='text-base-content/40'>(advanced)</span>
            </label>
            <input
              type='text'
              value={claudeConfig.baseUrl}
              onChange={(e) => handleClaudeChange('baseUrl', e.target.value)}
              placeholder='https://api.anthropic.com/v1/'
              className='w-full px-4 py-3 rounded-xl bg-base-200/50 border border-base-content/10 focus:border-primary focus:bg-base-100 outline-none transition-all text-sm font-mono'
            />
            <p className='text-xs text-base-content/50 mt-2'>
              only change this if using a proxy or custom endpoint
            </p>
          </div>
        </div>
      )}

      {!activeProvider && (
        <div className='py-12 text-center'>
          <div className='w-16 h-16 rounded-2xl bg-base-200 flex items-center justify-center mx-auto mb-4'>
            <Icon
              icon='material-symbols:cloud-off-outline'
              className='w-8 h-8 text-base-content/30'
            />
          </div>
          <p className='text-base-content/50'>
            select a provider to get started!
          </p>
        </div>
      )}
    </div>
  );
}
