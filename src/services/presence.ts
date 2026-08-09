import {
  ActivityType,
  type ActivitiesOptions,
  type Client,
  type PresenceStatusData,
} from 'discord.js';

import {
  getBotSetting,
  setBotSetting,
  clearBotSetting,
} from './botSettings.js';
import { logger } from '../logger.js';

const KIND_KEY = 'presence.kind';
const TEXT_KEY = 'presence.text';
const DOT_KEY = 'presence.dot';

export const ACTIVITY_KINDS = {
  playing: ActivityType.Playing,
  watching: ActivityType.Watching,
  listening: ActivityType.Listening,
  competing: ActivityType.Competing,
  custom: ActivityType.Custom,
} as const;

export type ActivityKind = keyof typeof ACTIVITY_KINDS;

export const ACTIVITY_NAMES = Object.keys(ACTIVITY_KINDS) as ActivityKind[];

export const DOTS = ['online', 'idle', 'dnd'] as const;

export type Dot = (typeof DOTS)[number];

export const TEXT_MAX = 128;

export function isActivityKind(value: string): value is ActivityKind {
  return value in ACTIVITY_KINDS;
}

export function isDot(value: string): value is Dot {
  return (DOTS as readonly string[]).includes(value);
}

export interface PresenceConfig {
  kind: ActivityKind | null;
  text: string | null;
  dot: Dot;
}

export function getPresence(): PresenceConfig {
  const kind = getBotSetting(KIND_KEY);
  const text = getBotSetting(TEXT_KEY);
  const dot = getBotSetting(DOT_KEY);

  return {
    kind: kind !== null && isActivityKind(kind) ? kind : null,
    text,
    dot: dot !== null && isDot(dot) ? dot : 'online',
  };
}

export function setActivity(kind: ActivityKind, text: string): void {
  setBotSetting(KIND_KEY, kind);
  setBotSetting(TEXT_KEY, text);
}

export function clearActivity(): void {
  clearBotSetting(KIND_KEY);
  clearBotSetting(TEXT_KEY);
}

export function setDot(dot: Dot): void {
  setBotSetting(DOT_KEY, dot);
}

function activityFor(kind: ActivityKind, text: string): ActivitiesOptions {
  if (kind === 'custom') {
    return { name: 'custom', type: ActivityType.Custom, state: text };
  }
  return { name: text, type: ACTIVITY_KINDS[kind] };
}

export function applyPresence(client: Client): void {
  if (!client.user) return;

  const { kind, text, dot } = getPresence();
  const activities =
    kind !== null && text !== null ? [activityFor(kind, text)] : [];

  try {
    client.user.setPresence({
      activities,
      status: dot satisfies PresenceStatusData,
    });
  } catch (err) {
    logger.error({ err }, 'could not apply presence');
  }
}
