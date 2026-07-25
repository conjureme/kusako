import { PermissionFlagsBits, type PermissionsString } from 'discord.js';

import { getBalance, getCurrency } from '../economy.js';
import { getItem, getQuantity } from '../items.js';
import type { EvalMeta, RenderContext } from './context.js';
import { parseAmount } from './args.js';

export type GuardResult = { ok: true } | { ok: false; message: string };
export type Guard = (
  meta: EvalMeta,
  args: string[],
  ctx: RenderContext,
) => GuardResult | Promise<GuardResult>;

const CHANNEL_MENTION = /^<#(\d+)>$/;
const ROLE_MENTION = /^<@&?(\d+)>$/;
const USER_MENTION = /^<@!?(\d+)>$/;

function targetOf(raw: string, mention: RegExp, prefix: string): string {
  const match = mention.exec(raw);
  if (match) return match[1]!;
  return raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
}

export function resolveChannelArg(ctx: RenderContext, raw: string) {
  const target = targetOf(raw.trim(), CHANNEL_MENTION, '#');
  if (target.length === 0) return null;

  const lower = target.toLowerCase();
  return (
    (/^\d+$/.test(target) ? ctx.guild.channels.cache.get(target) : null) ??
    ctx.guild.channels.cache.find((c) => c.name.toLowerCase() === lower) ??
    null
  );
}

export function resolveRoleArg(ctx: RenderContext, raw: string) {
  const target = targetOf(raw.trim(), ROLE_MENTION, '@');
  if (target.length === 0) return null;

  const lower = target.toLowerCase();
  return (
    (/^\d+$/.test(target) ? ctx.guild.roles.cache.get(target) : null) ??
    ctx.guild.roles.cache.find((r) => r.name.toLowerCase() === lower) ??
    null
  );
}

export function userIdOf(raw: string): string | null {
  const target = targetOf(raw.trim(), USER_MENTION, '@');
  return /^\d+$/.test(target) ? target : null;
}

export async function resolveMemberArg(ctx: RenderContext, raw: string) {
  const id = userIdOf(raw);
  if (!id) return null;
  return (
    ctx.guild.members.cache.get(id) ??
    (await ctx.guild.members.fetch(id).catch(() => null))
  );
}

const normalizePerm = (raw: string) => raw.toLowerCase().replace(/[\s_]/g, '');

const PERM_NAMES = new Map<string, PermissionsString>([
  ['manageserver', 'ManageGuild'],
  ...Object.keys(PermissionFlagsBits).map(
    (name) => [normalizePerm(name), name as PermissionsString] as const,
  ),
]);

export function resolvePermArg(raw: string): PermissionsString | null {
  return PERM_NAMES.get(normalizePerm(raw.trim())) ?? null;
}

export const ARG_TYPES = new Map<
  string,
  {
    ok: (ctx: RenderContext, word: string) => boolean | Promise<boolean>;
    describe: string;
  }
>([
  [
    'number',
    { ok: (_ctx, word) => parseAmount(word) !== null, describe: 'a number' },
  ],
  [
    'user',
    {
      ok: async (ctx, word) => (await resolveMemberArg(ctx, word)) !== null,
      describe: 'someone in this server (a mention or id)',
    },
  ],
  [
    'channel',
    {
      ok: (ctx, word) => resolveChannelArg(ctx, word) !== null,
      describe: 'a channel',
    },
  ],
  [
    'role',
    {
      ok: (ctx, word) => resolveRoleArg(ctx, word) !== null,
      describe: 'a role',
    },
  ],
]);

export const guards = new Map<string, Guard>([
  [
    'requirebal',
    (meta, args, ctx) => {
      const amount = parseAmount(args[0] ?? '');
      if (amount === null || amount <= 0) {
        return {
          ok: false,
          message: 'this autoresponder has a broken {requirebal} tag !',
        };
      }

      const balance =
        getBalance(meta.guildId, meta.userId) +
        (ctx.pending?.balanceDelta(meta.userId) ?? 0);
      if (balance >= amount) return { ok: true };

      const currency = getCurrency(meta.guildId);
      return {
        ok: false,
        message: `you need ${currency.emoji} **${amount.toLocaleString('en-US')} ${currency.name}** for that,, you've only got ${balance.toLocaleString('en-US')} !`,
      };
    },
  ],
  [
    'requireitem',
    (meta, args, ctx) => {
      const name = args[0] ?? '';
      const quantity = args.length > 1 ? parseAmount(args[1] ?? '') : 1;
      if (name.length === 0 || quantity === null || quantity <= 0) {
        return {
          ok: false,
          message: 'this autoresponder has a broken {requireitem} tag !',
        };
      }

      const item = getItem(meta.guildId, name);
      if (!item) {
        return {
          ok: false,
          message: "that needs an item that doesn't exist anymore...",
        };
      }

      const have =
        getQuantity(meta.guildId, meta.userId, name) +
        (ctx.pending?.itemDelta(meta.userId, item.nameKey) ?? 0);
      if (have >= quantity) return { ok: true };

      return {
        ok: false,
        message: `you need ${quantity}× ${item.emoji ?? '📦'} **${item.name}** for that !`,
      };
    },
  ],
  [
    'requirechannel',
    (_meta, args, ctx) => {
      const raw = (args[0] ?? '').trim();
      if (raw.length === 0) {
        return {
          ok: false,
          message: 'this autoresponder has a broken {requirechannel} tag !',
        };
      }

      const channel = resolveChannelArg(ctx, raw);
      if (!channel) {
        return {
          ok: false,
          message: "that needs a channel that doesn't exist anymore...",
        };
      }

      if (ctx.channel.id === channel.id) return { ok: true };

      return {
        ok: false,
        message: `psst, that only works in ${channel.toString()} ~`,
      };
    },
  ],
  [
    'denychannel',
    (_meta, args, ctx) => {
      const channel = resolveChannelArg(ctx, args[0] ?? '');
      if (channel && ctx.channel.id === channel.id) {
        return {
          ok: false,
          message: `not here ! that one's off-limits in ${channel.toString()}`,
        };
      }
      return { ok: true };
    },
  ],
  [
    'requirerole',
    (_meta, args, ctx) => {
      const raw = (args[0] ?? '').trim();
      if (raw.length === 0) {
        return {
          ok: false,
          message: 'this autoresponder has a broken {requirerole} tag !',
        };
      }

      const role = resolveRoleArg(ctx, raw);
      if (!role) {
        return {
          ok: false,
          message: "that needs a role that doesn't exist anymore...",
        };
      }

      if (ctx.member.roles.cache.has(role.id)) return { ok: true };

      return {
        ok: false,
        message: `you need the **${role.name}** role for that !`,
      };
    },
  ],
  [
    'denyrole',
    (_meta, args, ctx) => {
      const role = resolveRoleArg(ctx, args[0] ?? '');
      if (role && ctx.member.roles.cache.has(role.id)) {
        return {
          ok: false,
          message: `sorry, the **${role.name}** role can't touch this one~`,
        };
      }
      return { ok: true };
    },
  ],
  [
    'requireuser',
    (meta, args) => {
      const id = userIdOf(args[0] ?? '');
      if (!id) {
        return {
          ok: false,
          message: 'this autoresponder has a broken {requireuser} tag !',
        };
      }

      if (meta.userId === id) return { ok: true };

      return { ok: false, message: "this one's not for you,," };
    },
  ],
  [
    'requirearg',
    async (_meta, args, ctx) => {
      const needed = parseAmount(args[0] ?? '');
      const typeName = (args[1] ?? '').trim().toLowerCase();
      const type = typeName.length > 0 ? ARG_TYPES.get(typeName) : undefined;
      if (needed === null || needed <= 0 || (typeName.length > 0 && !type)) {
        return {
          ok: false,
          message: 'this autoresponder has a broken {requirearg} tag !',
        };
      }

      const words = ctx.messageArgs ?? [];
      if (words.length < needed) {
        return {
          ok: false,
          message: `that needs at least ${needed} word${needed === 1 ? '' : 's'} with it..... you gave ${words.length}`,
        };
      }

      if (type && !(await type.ok(ctx, words[needed - 1]!))) {
        return {
          ok: false,
          message: `word ${needed} needs to be ${type.describe} !`,
        };
      }

      return { ok: true };
    },
  ],
  [
    'denyuser',
    (meta, args) => {
      const id = userIdOf(args[0] ?? '');
      if (id && meta.userId === id) {
        return { ok: false, message: "this one's not for you,,," };
      }
      return { ok: true };
    },
  ],
  [
    'requireperm',
    (_meta, args, ctx) => {
      const perm = resolvePermArg(args[0] ?? '');
      if (!perm) {
        return {
          ok: false,
          message: 'this autoresponder has a broken {requireperm} tag !',
        };
      }

      if (ctx.member.permissions.has(perm)) return { ok: true };

      return { ok: false, message: "you're not allowed to do that !" };
    },
  ],
  [
    'denyperm',
    (_meta, args, ctx) => {
      const perm = resolvePermArg(args[0] ?? '');
      if (perm && ctx.member.permissions.has(perm)) {
        return { ok: false, message: "nuh uh, this one's not for you" };
      }
      return { ok: true };
    },
  ],
]);
