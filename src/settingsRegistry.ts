import { channelMention } from 'discord.js';

import { getCurrency } from './economy.js';
import { getPatSettings, isGameEnabled } from './games.js';
import { isLevelingEnabled } from './levels.js';
import { getEventReply } from './events/store.js';
import { EVENTS } from './events/registry.js';
import { formatDuration } from './autoresponder/args.js';

export interface SettingEntry {
  id: string;
  group: string;
  label: string;
  blurb: string;
  command: string;
  knobs: string[];
  render(guildId: string): string[];
}

export interface SettingGroup {
  id: string;
  label: string;
  settings: SettingEntry[];
}

export const GROUP_LABELS: Record<string, string> = {
  economy: 'economy',
  leveling: 'leveling',
  events: 'events',
};

export const SETTINGS: SettingEntry[] = [
  {
    id: 'currency',
    group: 'economy',
    label: 'currency',
    blurb: 'what members earn and spend in this server !',
    command: '/settings set currency',
    knobs: ['name', 'emoji'],
    render(guildId) {
      const currency = getCurrency(guildId);
      return [`${currency.emoji} ${currency.name}`];
    },
  },
  {
    id: 'pat',
    group: 'economy',
    label: 'head pats',
    blurb: 'sako tips members for patting her head !',
    command: '/settings set pat',
    knobs: ['min', 'max', 'cooldown', 'enabled'],
    render(guildId) {
      const enabled = isGameEnabled(guildId, 'pat');
      if (!enabled) return ['off'];

      const pat = getPatSettings(guildId);
      const currency = getCurrency(guildId);
      return [
        `on ━ ${currency.emoji} ${pat.minReward.toLocaleString('en-US')}-${pat.maxReward.toLocaleString('en-US')} per pat`,
        `every ${formatDuration(pat.cooldownSeconds)}`,
      ];
    },
  },
  {
    id: 'levels',
    group: 'leveling',
    label: 'xp earning',
    blurb: 'members earn xp by chatting, and level up as they go !',
    command: '/settings set levels',
    knobs: ['enabled'],
    render(guildId) {
      return [isLevelingEnabled(guildId) ? 'on' : 'off'];
    },
  },
  ...EVENTS.map((event) => ({
    id: `event:${event.id}`,
    group: 'events',
    label: event.label,
    blurb: event.blurb,
    command: '/events set',
    knobs: ['reply', 'channel'],
    render(guildId: string): string[] {
      const reply = getEventReply(guildId, event.id);
      return [
        reply?.response ? 'reply set' : 'no reply yet',
        reply?.channelId
          ? `→ ${channelMention(reply.channelId)}`
          : '→ nowhere !',
      ];
    },
  })),
];

export function groups(): SettingGroup[] {
  const byId = new Map<string, SettingGroup>();

  for (const setting of SETTINGS) {
    const existing = byId.get(setting.group);
    if (existing) {
      existing.settings.push(setting);
      continue;
    }
    byId.set(setting.group, {
      id: setting.group,
      label: GROUP_LABELS[setting.group] ?? setting.group,
      settings: [setting],
    });
  }

  return [...byId.values()];
}

export function findGroup(id: string): SettingGroup | null {
  return groups().find((group) => group.id === id) ?? null;
}

export function findSetting(id: string): SettingEntry | null {
  return SETTINGS.find((setting) => setting.id === id) ?? null;
}
