import type {
  KoboldCppConfig,
  ClaudeConfig,
  InstructTemplate,
} from '@repo/sako-config';

import type {
  ChatMessage,
  SendMessageOptions,
  SendMessageResult,
} from '../types/prompt';

function buildKoboldPrompt(
  systemContext: string,
  messages: ChatMessage[],
  instruct?: InstructTemplate | null,
): string {
  const parts: string[] = [];

  if (systemContext) parts.push(systemContext);

  for (const msg of messages) {
    if (instruct) {
      const prefix =
        msg.role === 'user'
          ? instruct.input_sequence
          : instruct.output_sequence;
      const suffix =
        msg.role === 'user' ? instruct.input_suffix : instruct.output_suffix;
      parts.push(`${prefix}\n${msg.content}${suffix}`);
    } else {
      const label = msg.role === 'user' ? 'User' : 'Assistant';
      parts.push(`${label}: ${msg.content}`);
    }
  }

  if (instruct) {
    parts.push(instruct.output_sequence);
  }

  return parts.join('\n');
}

async function sendToKobold(
  config: KoboldCppConfig,
  prompt: string,
  samplers?: Record<string, unknown>,
): Promise<SendMessageResult> {
  const url = `${config.baseUrl.replace(/\/+$/, '')}/api/v1/generate`;

  const body: Record<string, unknown> = {
    prompt,
    ...samplers,
  };

  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (config.apiKey) headers['authorization'] = `Bearer ${config.apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    return { content: '', error: `koboldcpp error ${res.status}: ${text}` };
  }

  const data = (await res.json()) as {
    results?: { text: string }[];
  };
  const content = data.results?.[0]?.text ?? '';
  return { content: content.trim() };
}

async function sendToClaude(
  config: ClaudeConfig,
  systemContext: string,
  messages: ChatMessage[],
  samplers?: Record<string, unknown>,
): Promise<SendMessageResult> {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/messages`;

  const claudeMessages = messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: (samplers?.max_length as number) ?? 4096,
    system: systemContext,
    messages: claudeMessages,
  };

  if (samplers?.temp !== undefined) body.temperature = samplers.temp as number;
  if (samplers?.top_p !== undefined) body.top_p = samplers.top_p as number;
  if (samplers?.top_k !== undefined) body.top_k = samplers.top_k as number;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    return { content: '', error: `claude error ${res.status}: ${text}` };
  }

  const data = (await res.json()) as {
    content?: { type: string; text: string }[];
  };
  const content = data.content?.[0]?.text ?? '';
  return { content };
}

export async function sendMessage(
  options: SendMessageOptions,
): Promise<SendMessageResult> {
  const {
    systemContext,
    messages,
    providerType,
    providerConfig,
    samplers,
    instruct,
  } = options;

  const samplerRecord = samplers
    ? (Object.fromEntries(
        Object.entries(samplers).filter(([key]) => key !== 'name'),
      ) as Record<string, unknown>)
    : undefined;

  switch (providerType) {
    case 'koboldcpp': {
      const prompt = buildKoboldPrompt(systemContext, messages, instruct);
      return sendToKobold(
        providerConfig as KoboldCppConfig,
        prompt,
        samplerRecord,
      );
    }
    case 'claude': {
      return sendToClaude(
        providerConfig as ClaudeConfig,
        systemContext,
        messages,
        samplerRecord,
      );
    }
    default:
      return { content: '', error: `unknown provider: ${providerType}` };
  }
}
