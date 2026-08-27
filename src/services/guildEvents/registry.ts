import {
  Events,
  type Guild,
  type GuildMember,
  type PartialGuildMember,
} from 'discord.js';

import type { SakoClient } from '../../client.js';
import { syncBoostState } from './store.js';

const BOOST_RECENT_MS = 5 * 60_000;

export type EventMember = GuildMember | PartialGuildMember;

export type FireEvent = (guild: Guild, member: EventMember) => Promise<unknown>;

export interface EventDefinition {
  id: string;
  label: string;
  blurb: string;
  register(client: SakoClient, fire: FireEvent): void;
}

export const EVENTS = [
  {
    id: 'join',
    label: 'join',
    blurb: 'what sako says when someone joins !',
    register(client: SakoClient, fire: FireEvent) {
      client.on(Events.GuildMemberAdd, async (member) => {
        await fire(member.guild, member);
      });
    },
  },
  {
    id: 'leave',
    label: 'leave',
    blurb: 'what sako says when someone leaves !',
    register(client: SakoClient, fire: FireEvent) {
      client.on(Events.GuildMemberRemove, async (member) => {
        await fire(member.guild, member);
      });
    },
  },
  {
    id: 'boost',
    label: 'boost',
    blurb: 'what sako says when someone boosts !',
    register(client: SakoClient, fire: FireEvent) {
      client.on(Events.GuildMemberUpdate, async (_oldMember, newMember) => {
        const premiumSince = newMember.premiumSinceTimestamp;
        const transition = syncBoostState(
          newMember.guild.id,
          newMember.id,
          premiumSince,
        );

        if (transition !== 'started') return;
        if (
          premiumSince === null ||
          premiumSince <= Date.now() - BOOST_RECENT_MS
        )
          return;

        await fire(newMember.guild, newMember);
      });
    },
  },
] as const satisfies readonly EventDefinition[];

export const EVENT_KINDS = EVENTS.map((definition) => definition.id);
export type EventKind = (typeof EVENTS)[number]['id'];
