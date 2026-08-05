import { type Guild, type GuildMember } from 'discord.js';

import type { SakoClient } from '../client.js';
import { getEventResponder } from '../autoresponder/store.js';
import { EVENTS, type EventKind } from './registry.js';
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
  for (const definition of EVENTS) {
    definition.register(client, async (guild, member) => {
      try {
        return await fireEvent(guild, member, definition.id);
      } catch (err) {
        logger.error(
          { err, guild: guild.id, event: definition.id },
          'event failed',
        );
        return null;
      }
    });
  }
}
