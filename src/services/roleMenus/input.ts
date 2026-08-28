import { type Guild, type Message } from 'discord.js';

import { resolveRoleArg } from '../../dsl/guards.js';
import { isUsableEmoji } from '../buttons/registry.js';
import {
  getRoleMenu,
  updateRoleMenu,
  dedupeEntries,
  MAX_MENU_ROLES,
  type RoleMenuEntry,
} from './store.js';

export const LABEL_MAX = 80;
export const PENDING_MS = 5 * 60_000;
export const CANCEL_WORDS = ['cancel', 'nevermind', 'stop'];

export type ParseResult =
  | { ok: true; entries: RoleMenuEntry[] }
  | { ok: false; problems: string[] };

export function parseRoleLines(guild: Guild, text: string): ParseResult {
  const problems: string[] = [];
  const entries: RoleMenuEntry[] = [];

  const lines = text.split('\n');
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    if (line.length === 0) continue;

    const at = index + 1;
    const parts = line.split('|').map((part) => part.trim());
    const roleArg = parts[0] ?? '';

    const role = resolveRoleArg(guild, roleArg);
    if (!role) {
      problems.push(`line ${at}: i can't find a role for \`${roleArg}\``);
      continue;
    }

    const label = parts[1] ?? '';
    if (label.length > LABEL_MAX) {
      problems.push(
        `line ${at}: that label is ${label.length} characters, the cap is ${LABEL_MAX}`,
      );
      continue;
    }

    const emoji = parts[2] ?? '';
    if (emoji.length > 0 && !isUsableEmoji(emoji)) {
      problems.push(`line ${at}: \`${emoji}\` isn't an emoji i can use`);
      continue;
    }

    entries.push({
      roleId: role.id,
      label: label.length > 0 ? label : null,
      emoji: emoji.length > 0 ? emoji : null,
    });
  }

  if (problems.length === 0 && entries.length === 0) {
    problems.push("i didn't find any roles in that !");
  }

  const deduped = dedupeEntries(entries);
  if (problems.length === 0 && entries.length > MAX_MENU_ROLES) {
    problems.push(
      `that's ${entries.length} roles, but a menu holds at most ${MAX_MENU_ROLES} !`,
    );
  }

  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, entries: deduped };
}

export function serializeRoleLines(
  guild: Guild,
  entries: RoleMenuEntry[],
): string {
  return entries
    .map((entry) => {
      const name = guild.roles.cache.get(entry.roleId)?.name;
      const role = name ? `@${name}` : `<@&${entry.roleId}>`;
      const parts = [role];

      if (entry.label || entry.emoji) parts.push(entry.label ?? '');
      if (entry.emoji) parts.push(entry.emoji);

      return parts.join(' | ');
    })
    .join('\n');
}

interface Pending {
  guildId: string;
  channelId: string;
  userId: string;
  menuKey: string;
  expiresAt: number;
}

const pending = new Map<string, Pending>();

function slot(guildId: string, channelId: string, userId: string): string {
  return `${guildId}:${channelId}:${userId}`;
}

function prune(now: number): void {
  for (const [key, entry] of pending) {
    if (entry.expiresAt <= now) pending.delete(key);
  }
}

export function awaitRoleLines(
  guildId: string,
  channelId: string,
  userId: string,
  menuKey: string,
): void {
  const now = Date.now();
  prune(now);
  pending.set(slot(guildId, channelId, userId), {
    guildId,
    channelId,
    userId,
    menuKey,
    expiresAt: now + PENDING_MS,
  });
}

export function peekPending(
  guildId: string,
  channelId: string,
  userId: string,
): Pending | null {
  const key = slot(guildId, channelId, userId);
  const entry = pending.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    pending.delete(key);
    return null;
  }

  return entry;
}

export function clearPending(
  guildId: string,
  channelId: string,
  userId: string,
): boolean {
  return pending.delete(slot(guildId, channelId, userId));
}

export function pendingCount(): number {
  prune(Date.now());
  return pending.size;
}

export function problemReply(problems: string[], submitted: string): string {
  return [
    "i didn't save any of that ! here's what tripped me up:",
    ...problems.map((problem) => `• ${problem}`),
    '',
    'fix it and paste again:',
    '```',
    submitted.slice(0, 1500),
    '```',
  ].join('\n');
}

export async function handleRoleMenuInput(message: Message): Promise<boolean> {
  if (!message.inGuild()) return false;

  const waiting = peekPending(
    message.guildId,
    message.channelId,
    message.author.id,
  );
  if (!waiting) return false;

  const content = message.content.trim();
  if (CANCEL_WORDS.includes(content.toLowerCase())) {
    clearPending(message.guildId, message.channelId, message.author.id);
    await message.reply('okay, dropped that one !').catch(() => null);
    return true;
  }

  const menu = getRoleMenu(message.guildId, waiting.menuKey);
  if (!menu) {
    clearPending(message.guildId, message.channelId, message.author.id);
    await message.reply("that menu isn't around anymore !").catch(() => null);
    return true;
  }

  const result = parseRoleLines(message.guild, content);
  if (!result.ok) {
    await message
      .reply(problemReply(result.problems, content))
      .catch(() => null);
    return true;
  }

  updateRoleMenu(message.guildId, waiting.menuKey, { roles: result.entries });
  clearPending(message.guildId, message.channelId, message.author.id);

  await message.channel
    .send(
      `✦ saved **${result.entries.length}** role${result.entries.length === 1 ? '' : 's'} to ${menu.name} ! drop it somewhere with \`{rolemenu:${menu.name}}\``,
    )
    .catch(() => null);
  await message.delete().catch(() => null);

  return true;
}
