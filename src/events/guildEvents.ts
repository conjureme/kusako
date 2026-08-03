import { Events, type Guild, type GuildMember } from 'discord.js';

import type { SakoClient } from '../client.js';
import { getEventResponder, type EventKind } from '../autoresponder/store.js';
import { getGuildSetting, eventChannelKey } from '../settings.js';
import { parse } from '../autoresponder/parser.js';
import { evaluate } from '../autoresponder/evaluate.js';
import { deliver } from '../autoresponder/deliver.js';
import { logger } from '../logger.js';

export type FireOutcome =
  | { kind: 'fired'; channelId: string }
  | { kind: 'no-template' }
  | { kind: 'no-channel' }
  | { kind: 'blocked'; reason: string };

export { eventChannelKey };

export async function fireEvent(
  guild: Guild,
  member: GuildMember,
  kind: EventKind,
): Promise<FireOutcome> {
  const responder = getEventResponder(guild.id, kind);
  if (!responder) return { kind: 'no-template' };

  const channelId = getGuildSetting(guild.id, eventChannelKey(kind));
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  if (!channel || !channel.isTextBased()) return { kind: 'no-channel' };

  const result = await evaluate(
    parse(responder.response),
    { member, guild, channel },
    responder.triggerKey,
  );
  if (!result.ok) return { kind: 'blocked', reason: result.message };

  await deliver(result.segments, result.actions, { member, channel });
  return { kind: 'fired', channelId: channel.id };
}

export function registerGuildEvents(client: SakoClient): void {
  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      await fireEvent(member.guild, member, 'join');
    } catch (err) {
      logger.error({ err, guild: member.guild.id }, 'join event failed');
    }
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    try {
      await fireEvent(member.guild, member as GuildMember, 'leave');
    } catch (err) {
      logger.error({ err, guild: member.guild.id }, 'leave event failed');
    }
  });

  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    if (oldMember.premiumSince || !newMember.premiumSince) return;
    try {
      await fireEvent(newMember.guild, newMember, 'boost');
    } catch (err) {
      logger.error({ err, guild: newMember.guild.id }, 'boost event failed');
    }
  });
}
