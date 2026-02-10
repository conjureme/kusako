'use client';

import { useState, useRef, useEffect } from 'react';

import { Icon } from '@iconify/react';
import Link from 'next/link';

import {
  getActiveProviderConfig,
  getActiveCharacter,
  getActiveContext,
  getActiveInstruct,
  getActiveSystem,
  getActiveSampler,
} from '@repo/sako-config';

import { renderStoryString, sendMessage } from '@repo/sako-ai';
import type { ChatMessage } from '@repo/sako-ai';
import Navbar from '../components/navbar';

export default function Page() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setError(null);

    const provider = getActiveProviderConfig();
    if (!provider) {
      setError('no provider configured. go to settings to set one up.');
      return;
    }

    const character = getActiveCharacter();
    const context = getActiveContext();
    const instruct = getActiveInstruct();
    const systemPrompt = getActiveSystem();
    const samplers = getActiveSampler();

    const charData = character?.data;
    const systemContext = renderStoryString(
      {
        description: charData?.description ?? '',
        personality: charData?.personality ?? '',
        persona: '',
        scenario: charData?.scenario ?? '',
        system: systemPrompt?.content ?? '',
        char: charData?.name ?? 'Assistant',
        user: 'User',
        wiBefore: '',
        wiAfter: '',
        mesExamples: charData?.mes_example ?? '',
      },
      {
        context: context ?? undefined,
        instruct: instruct ?? undefined,
        systemPrompt: systemPrompt ?? undefined,
      },
    );

    console.log('[kusako] rendered system context:', systemContext);

    const userMessage: ChatMessage = { role: 'user', content: trimmed };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    const result = await sendMessage({
      systemContext,
      messages: updatedMessages,
      providerType: provider.type,
      providerConfig: provider.config,
      samplers: samplers ?? undefined,
      instruct: instruct ?? undefined,
    });

    setIsLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: result.content },
    ]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const charName = getActiveCharacter()?.data?.name || 'assistant';

  return (
    <>
      <Navbar />
      <main className='flex flex-col h-[calc(100vh-65px)] bg-linear-to-br from-base-100 via-base-100 to-primary/5'>
        <div className='flex-1 overflow-y-auto px-4 py-6'>
          <div className='mx-auto max-w-3xl space-y-4'>
            {messages.length === 0 && (
              <div className='flex flex-col items-center justify-center h-64 text-base-content/40'>
                <Icon icon='ri:chat-3-line' className='w-12 h-12 mb-3' />
                <p className='text-lg'>start a conversation</p>
                <p className='text-sm mt-1'>
                  make sure you have a{' '}
                  <Link href='/settings' className='link link-primary'>
                    provider configured
                  </Link>
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`chat ${msg.role === 'user' ? 'chat-end' : 'chat-start'}`}
              >
                <div className='chat-header text-xs text-base-content/50 mb-1'>
                  {msg.role === 'user' ? 'you' : charName}
                </div>
                <div
                  className={`chat-bubble whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'chat-bubble-primary'
                      : 'chat-bubble-neutral'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className='chat chat-start'>
                <div className='chat-header text-xs text-base-content/50 mb-1'>
                  {charName}
                </div>
                <div className='chat-bubble chat-bubble-neutral'>
                  <span className='loading loading-dots loading-sm' />
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        </div>

        {error && (
          <div className='px-4'>
            <div className='mx-auto max-w-3xl'>
              <div role='alert' className='alert alert-error alert-sm'>
                <Icon icon='ri:error-warning-line' className='w-4 h-4' />
                <span className='text-sm'>{error}</span>
                <button
                  className='btn btn-ghost btn-xs'
                  onClick={() => setError(null)}
                >
                  dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        <div className='border-t border-base-content/5 bg-base-100 px-4 py-3'>
          <div className='mx-auto max-w-3xl flex gap-2'>
            <textarea
              className='textarea textarea-bordered flex-1 resize-none min-h-12 max-h-[200px]'
              placeholder='type a message...'
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isLoading}
            />
            <button
              className='btn btn-primary self-end'
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
            >
              <Icon icon='ri:send-plane-fill' className='w-5 h-5' />
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
