import type { GuildMember, GuildBasedChannel } from 'discord.js';

import { getBalance, getCurrency } from '../economy.js';
import { getItem, getQuantity, getInventory } from '../items.js';

import type { RenderContext } from './context.js';
import { resolveMemberArg, resolveChannelArg } from './guards.js';
import { getXp, levelFromXp } from '../levels.js';
import { botPool } from '../memberCache.js';

export type Resolver = (
  ctx: RenderContext,
  args: string[],
) => string | Promise<string>;

export type TargetKind = 'user' | 'user1' | 'channel';

export interface Placeholder {
  resolve: Resolver;
  target?: TargetKind;
  // reads the pending-effect ledger, so its value depends on where it sits in
  // the template. these can never be hoisted out of template order !!
  ledger?: true;
}

const TARGET_ARG: Record<TargetKind, number> = {
  user: 0,
  user1: 1,
  channel: 0,
};

export function targetArgIndex(kind: TargetKind): number {
  return TARGET_ARG[kind];
}

function discordTimestamp(ms: number): string {
  return `<t:${Math.floor(ms / 1000)}:R>`;
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n.toLocaleString('en-US')}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n.toLocaleString('en-US')}${suffix}`;
}

const INVENTORY_LINES = 15;

async function memberOf(
  ctx: RenderContext,
  target: string | undefined,
): Promise<GuildMember> {
  const raw = (target ?? '').trim();
  if (raw.length === 0) return ctx.member;

  const member = await resolveMemberArg(ctx, raw);
  if (!member) throw new Error(`no member: ${raw}`);
  return member;
}

function channelOf(
  ctx: RenderContext,
  target: string | undefined,
): GuildBasedChannel {
  const raw = (target ?? '').trim();
  if (raw.length === 0) return ctx.channel;

  const channel = resolveChannelArg(ctx, raw);
  if (!channel) throw new Error(`no channel: ${raw}`);
  return channel;
}

const BOOST_THRESHOLDS = [2, 7, 14];
const MAX_LEVEL_REACHED = 'max level reached !';

function nextBoostLevel(ctx: RenderContext): number | null {
  const tier = ctx.guild.premiumTier;
  return tier >= BOOST_THRESHOLDS.length ? null : tier + 1;
}

async function botCount(ctx: RenderContext): Promise<number> {
  return (await botPool(ctx.guild)).size;
}

async function humanCount(ctx: RenderContext): Promise<number> {
  return Math.max(0, ctx.guild.memberCount - (await botCount(ctx)));
}

function balanceOf(ctx: RenderContext, userId: string): number {
  return (
    getBalance(ctx.guild.id, userId) + (ctx.pending?.balanceDelta(userId) ?? 0)
  );
}

function quantityOf(
  ctx: RenderContext,
  userId: string,
  itemKey: string,
): number {
  return (
    getQuantity(ctx.guild.id, userId, itemKey) +
    (ctx.pending?.itemDelta(userId, itemKey) ?? 0)
  );
}

function itemLine(
  emoji: string | null,
  name: string,
  quantity: number,
): string {
  return `${quantity.toLocaleString('en-US')} × ${emoji ?? '📦'} ${name}`;
}

function requireMessage(ctx: RenderContext) {
  if (!ctx.message) throw new Error('no triggering message');
  return ctx.message;
}

export const placeholders = new Map<string, Placeholder>([
  ['newline', { resolve: () => '\n' }],
  [
    'user',
    {
      target: 'user',
      resolve: async (ctx, args) => (await memberOf(ctx, args[0])).toString(),
    },
  ],
  [
    'user.name',
    {
      target: 'user',
      resolve: async (ctx, args) =>
        (await memberOf(ctx, args[0])).user.username,
    },
  ],
  [
    'user.nickname',
    {
      target: 'user',
      resolve: async (ctx, args) => (await memberOf(ctx, args[0])).displayName,
    },
  ],
  [
    'user.id',
    {
      target: 'user',
      resolve: async (ctx, args) => (await memberOf(ctx, args[0])).id,
    },
  ],
  [
    'user.avatar',
    {
      target: 'user',
      resolve: async (ctx, args) =>
        (await memberOf(ctx, args[0])).displayAvatarURL(),
    },
  ],
  [
    'user.joinedat',
    {
      target: 'user',
      resolve: async (ctx, args) => {
        const joined = (await memberOf(ctx, args[0])).joinedTimestamp;
        if (joined === null) throw new Error('no join date');
        return discordTimestamp(joined);
      },
    },
  ],
  [
    'user.createdat',
    {
      target: 'user',
      resolve: async (ctx, args) =>
        discordTimestamp((await memberOf(ctx, args[0])).user.createdTimestamp),
    },
  ],
  [
    'user.displaycolor',
    {
      target: 'user',
      resolve: async (ctx, args) =>
        (await memberOf(ctx, args[0])).displayHexColor,
    },
  ],
  [
    'user.boostsince',
    {
      target: 'user',
      resolve: async (ctx, args) => {
        const since = (await memberOf(ctx, args[0])).premiumSinceTimestamp;
        return since ? discordTimestamp(since) : 'not a booster';
      },
    },
  ],
  [
    'user.item',
    {
      target: 'user1',
      ledger: true,
      resolve: async (ctx, args) => {
        const name = (args[0] ?? '').trim();
        if (name.length === 0) throw new Error('item needs a name');

        const item = getItem(ctx.guild.id, name);
        if (!item) throw new Error(`no item: ${name}`);

        const member = await memberOf(ctx, args[1]);
        return itemLine(
          item.emoji,
          item.name,
          quantityOf(ctx, member.id, item.nameKey),
        );
      },
    },
  ],
  [
    'user.inventory',
    {
      target: 'user',
      ledger: true,
      resolve: async (ctx, args) => {
        const member = await memberOf(ctx, args[0]);
        let entries = getInventory(ctx.guild.id, member.id);

        const deltas = ctx.pending?.itemDeltas(member.id);
        if (deltas && deltas.size > 0) {
          const byKey = new Map(
            entries.map((entry) => [entry.item.nameKey, entry]),
          );
          for (const [itemKey, delta] of deltas) {
            const existing = byKey.get(itemKey);
            if (existing) {
              existing.quantity += delta;
            } else if (delta > 0) {
              const item = getItem(ctx.guild.id, itemKey);
              if (item) byKey.set(itemKey, { item, quantity: delta });
            }
          }
          entries = [...byKey.values()]
            .filter((entry) => entry.quantity > 0)
            .sort((a, b) => a.item.nameKey.localeCompare(b.item.nameKey));
        }

        if (entries.length === 0) return 'nothing yet...';

        const lines = entries
          .slice(0, INVENTORY_LINES)
          .map((entry) =>
            itemLine(entry.item.emoji, entry.item.name, entry.quantity),
          );
        if (entries.length > INVENTORY_LINES) {
          lines.push(`+ ${entries.length - INVENTORY_LINES} more...`);
        }
        return lines.join('\n');
      },
    },
  ],
  [
    'user.itemcount',
    {
      target: 'user1',
      ledger: true,
      resolve: async (ctx, args) => {
        const name = (args[0] ?? '').trim();
        if (name.length === 0) throw new Error('itemcount needs an item');

        const item = getItem(ctx.guild.id, name);
        if (!item) throw new Error(`no item: ${name}`);

        const member = await memberOf(ctx, args[1]);
        return quantityOf(ctx, member.id, item.nameKey).toLocaleString('en-US');
      },
    },
  ],
  [
    'channel',
    {
      target: 'channel',
      resolve: (ctx, args) => channelOf(ctx, args[0]).toString(),
    },
  ],
  [
    'channel.name',
    { target: 'channel', resolve: (ctx, args) => channelOf(ctx, args[0]).name },
  ],
  [
    'channel.id',
    { target: 'channel', resolve: (ctx, args) => channelOf(ctx, args[0]).id },
  ],
  [
    'channel.createdat',
    {
      target: 'channel',
      resolve: (ctx, args) => {
        const created = channelOf(ctx, args[0]).createdTimestamp;
        if (created === null) throw new Error('no channel create date');
        return discordTimestamp(created);
      },
    },
  ],
  ['date', { resolve: () => `<t:${Math.floor(Date.now() / 1000)}:f>` }],
  ['message.id', { resolve: (ctx) => requireMessage(ctx).id }],
  ['message.content', { resolve: (ctx) => requireMessage(ctx).content }],
  ['message.link', { resolve: (ctx) => requireMessage(ctx).url }],
  ['server.name', { resolve: (ctx) => ctx.guild.name }],
  ['server.id', { resolve: (ctx) => ctx.guild.id }],
  ['server.owner', { resolve: (ctx) => `<@${ctx.guild.ownerId}>` }],
  ['server.owner.id', { resolve: (ctx) => ctx.guild.ownerId }],
  [
    'server.createdat',
    { resolve: (ctx) => discordTimestamp(ctx.guild.createdTimestamp) },
  ],
  [
    'server.membercount.ordinal',
    { resolve: (ctx) => ordinal(ctx.guild.memberCount) },
  ],
  [
    'server.membercount.nobots',
    { resolve: async (ctx) => (await humanCount(ctx)).toString() },
  ],
  [
    'server.membercount.nobots.ordinal',
    { resolve: async (ctx) => ordinal(await humanCount(ctx)) },
  ],
  [
    'server.botcount',
    { resolve: async (ctx) => (await botCount(ctx)).toString() },
  ],
  [
    'server.botcount.ordinal',
    { resolve: async (ctx) => ordinal(await botCount(ctx)) },
  ],
  [
    'server.rolecount',
    { resolve: (ctx) => (ctx.guild.roles.cache.size - 1).toString() },
  ],
  [
    'server.channelcount',
    { resolve: (ctx) => ctx.guild.channels.cache.size.toString() },
  ],
  ['server.boostlevel', { resolve: (ctx) => ctx.guild.premiumTier.toString() }],
  [
    'server.boostcount',
    { resolve: (ctx) => (ctx.guild.premiumSubscriptionCount ?? 0).toString() },
  ],
  [
    'server.nextboostlevel',
    {
      resolve: (ctx) => {
        const next = nextBoostLevel(ctx);
        return next === null ? MAX_LEVEL_REACHED : next.toString();
      },
    },
  ],
  [
    'server.nextboostlevel.required',
    {
      resolve: (ctx) => {
        const next = nextBoostLevel(ctx);
        return next === null
          ? MAX_LEVEL_REACHED
          : BOOST_THRESHOLDS[next - 1]!.toString();
      },
    },
  ],
  [
    'server.nextboostlevel.until_required',
    {
      resolve: (ctx) => {
        const next = nextBoostLevel(ctx);
        if (next === null) return MAX_LEVEL_REACHED;
        const need =
          BOOST_THRESHOLDS[next - 1]! -
          (ctx.guild.premiumSubscriptionCount ?? 0);
        return Math.max(0, need).toString();
      },
    },
  ],
  [
    'server.icon',
    {
      resolve: (ctx) => {
        const icon = ctx.guild.iconURL();
        if (!icon) throw new Error('no server icon');
        return icon;
      },
    },
  ],
  [
    'server.membercount',
    { resolve: (ctx) => ctx.guild.memberCount.toString() },
  ],
  [
    'user.balance',
    {
      target: 'user',
      ledger: true,
      resolve: async (ctx, args) =>
        balanceOf(ctx, (await memberOf(ctx, args[0])).id).toLocaleString(
          'en-US',
        ),
    },
  ],
  [
    'user.level',
    {
      target: 'user',
      resolve: async (ctx, args) =>
        levelFromXp(
          getXp(ctx.guild.id, (await memberOf(ctx, args[0])).id),
        ).toString(),
    },
  ],
  [
    'user.xp',
    {
      target: 'user',
      resolve: async (ctx, args) =>
        getXp(ctx.guild.id, (await memberOf(ctx, args[0])).id).toLocaleString(
          'en-US',
        ),
    },
  ],
  ['server.currency', { resolve: (ctx) => getCurrency(ctx.guild.id).name }],
  [
    'server.currencyemoji',
    { resolve: (ctx) => getCurrency(ctx.guild.id).emoji },
  ],
]);
