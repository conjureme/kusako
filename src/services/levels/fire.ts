import type { GuildMember, GuildTextBasedChannel } from 'discord.js';

import { getLevelReply } from './store.js';
import { levelScope } from '../cooldowns.js';
import { parse } from '../../dsl/parser.js';
import { evaluate } from '../../dsl/evaluate.js';
import { deliver } from '../../dsl/deliver.js';
import { logger } from '../../logger.js';

export async function fireLevelUps(
  member: GuildMember,
  channel: GuildTextBasedChannel,
  fromLevel: number,
  toLevel: number,
): Promise<void> {
  for (let level = fromLevel + 1; level <= toLevel; level += 1) {
    const reply = getLevelReply(member.guild.id, level);
    if (!reply) continue;

    try {
      const result = await evaluate(
        parse(reply.response),
        { member, guild: member.guild, channel },
        levelScope(level),
      );
      if (!result.ok) continue;

      await deliver(result.segments, result.actions, { member, channel });
    } catch (err) {
      logger.error(
        { err, guild: member.guild.id, level },
        'level up reply failed',
      );
    }
  }
}
