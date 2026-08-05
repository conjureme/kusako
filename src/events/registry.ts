import { Events, type Guild, type GuildMember } from 'discord.js';

import type { SakoClient } from '../client.js';

export type FireEvent = (guild: Guild, member: GuildMember) => Promise<unknown>;

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
        await fire(member.guild, member as GuildMember);
      });
    },
  },
  {
    id: 'boost',
    label: 'boost',
    blurb: 'what sako says when someone boosts !',
    register(client: SakoClient, fire: FireEvent) {
      client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
        if (oldMember.premiumSince || !newMember.premiumSince) return;
        await fire(newMember.guild, newMember);
      });
    },
  },
] as const satisfies readonly EventDefinition[];

export const EVENT_KINDS = EVENTS.map((definition) => definition.id);
export type EventKind = (typeof EVENTS)[number]['id'];
