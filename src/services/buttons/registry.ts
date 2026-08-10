import { ButtonStyle } from 'discord.js';

export interface ButtonLimit {
  id: string;
  label: string;
  blurb: string;
  blocked: string;
  perUser: boolean;
  perButton: boolean;
}

export const BUTTON_LIMITS: Record<string, ButtonLimit> = {
  'button-user': {
    id: 'button-user',
    label: 'this button, once per person',
    blurb: 'this button once per person',
    blocked: "you've already pressed that one !",
    perUser: true,
    perButton: true,
  },
  'button-all': {
    id: 'button-all',
    label: 'this button, once total',
    blurb: 'this button once, ever',
    blocked: 'someone already grabbed that one !',
    perUser: false,
    perButton: true,
  },
  'message-user': {
    id: 'message-user',
    label: 'any button here, once per person',
    blurb: 'one button here per person',
    blocked: 'you already made your pick here !',
    perUser: true,
    perButton: false,
  },
  'message-all': {
    id: 'message-all',
    label: 'any button here, once total',
    blurb: 'one button here, ever',
    blocked: 'someone already claimed this one !',
    perUser: false,
    perButton: false,
  },
};

export const LIMIT_IDS = Object.keys(BUTTON_LIMITS);

export function getButtonLimit(id: string | null): ButtonLimit | null {
  return id === null ? null : (BUTTON_LIMITS[id] ?? null);
}

export function endsForEveryone(limit: ButtonLimit): boolean {
  return !limit.perUser;
}

export const BUTTON_STYLES: Record<string, ButtonStyle> = {
  gray: ButtonStyle.Secondary,
  blurple: ButtonStyle.Primary,
  green: ButtonStyle.Success,
  red: ButtonStyle.Danger,
};

export const STYLE_IDS = Object.keys(BUTTON_STYLES);

export function resolveButtonStyle(id: string | null): ButtonStyle {
  return (id === null ? null : BUTTON_STYLES[id]) ?? ButtonStyle.Secondary;
}

const CUSTOM_EMOJI = /^<a?:\w{2,32}:\d{17,20}>$/;
const PICTOGRAPHIC = /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;

export function isUsableEmoji(raw: string): boolean {
  const emoji = raw.trim();
  if (CUSTOM_EMOJI.test(emoji)) return true;
  return emoji.length > 0 && emoji.length <= 16 && PICTOGRAPHIC.test(emoji);
}
