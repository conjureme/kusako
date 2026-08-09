import { type Guild, type GuildMember } from 'discord.js';

import { getEventReply } from './store.js';
import { type EventKind } from './registry.js';
import { eventScope } from '../cooldowns.js';
import { parse } from '../../dsl/parser.js';
import { evaluate } from '../../dsl/evaluate.js';
import { deliver } from '../../dsl/deliver.js';

export type FireOutcome =
  | { kind: 'fired'; channelId: string }
  | { kind: 'no-template' }
  | { kind: 'no-channel' }
  | { kind: 'blocked'; reason: string };

export async function fireEvent(
  guild: Guild,
  member: GuildMember,
  kind: EventKind,
): Promise<FireOutcome> {
  const reply = getEventReply(guild.id, kind);
  if (!reply?.response) return { kind: 'no-template' };

  const channel = reply.channelId
    ? guild.channels.cache.get(reply.channelId)
    : null;
  if (!channel || !channel.isTextBased()) return { kind: 'no-channel' };

  const result = await evaluate(
    parse(reply.response),
    { member, guild, channel },
    eventScope(kind),
  );
  if (!result.ok) return { kind: 'blocked', reason: result.message };

  await deliver(result.segments, result.actions, { member, channel });
  return { kind: 'fired', channelId: channel.id };
}
