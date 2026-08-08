import { Events } from 'discord.js';

import type { SakoClient } from '../client.js';
import { listAutoresponders } from '../autoresponder/store.js';
import { matchesTrigger, extractArgs } from '../autoresponder/matcher.js';
import { parse } from '../autoresponder/parser.js';
import { evaluate } from '../autoresponder/evaluate.js';
import { deliver } from '../autoresponder/deliver.js';
import {
  isLevelingEnabled,
  levelFromXp,
  modifyXp,
  XP_MIN,
  XP_MAX,
  XP_COOLDOWN_SECONDS,
} from '../levels.js';
import { getGameCooldownRemaining, setGameCooldown } from '../games.js';
import { autoresponderScope } from '../cooldowns.js';
import { fireLevelUps } from '../levelups.js';
import { handleOwnerCommand } from '../ownerCommand.js';
import { failureEmbed } from '../style.js';
import { logger } from '../logger.js';

export function registerMessageCreate(client: SakoClient): void {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (await handleOwnerCommand(message)) return;
    if (!message.inGuild()) return;
    if (!message.member) return;

    if (
      isLevelingEnabled(message.guildId) &&
      getGameCooldownRemaining(message.guildId, 'xp', message.author.id) === 0
    ) {
      try {
        const gain = XP_MIN + Math.floor(Math.random() * (XP_MAX - XP_MIN + 1));
        const result = modifyXp(message.guildId, message.author.id, gain);
        setGameCooldown(
          message.guildId,
          'xp',
          message.author.id,
          XP_COOLDOWN_SECONDS,
        );

        if (result.ok) {
          const from = levelFromXp(result.xp - gain);
          const to = levelFromXp(result.xp);
          if (to > from) {
            await fireLevelUps(message.member, message.channel, from, to);
          }
        }
      } catch (err) {
        logger.error(
          { err, guild: message.guildId, user: message.author.id },
          'xp grant failed',
        );
      }
    }

    const responders = listAutoresponders(message.guildId);
    if (responders.length === 0) return;

    for (const responder of responders) {
      if (
        !matchesTrigger(message.content, responder.trigger, responder.matchMode)
      ) {
        continue;
      }

      try {
        const result = await evaluate(
          parse(responder.response),
          {
            member: message.member,
            guild: message.guild,
            channel: message.channel,
            message,
            messageArgs: extractArgs(
              message.content,
              responder.trigger,
              responder.matchMode,
            ),
          },
          autoresponderScope(responder.triggerKey),
        );

        if (!result.ok) {
          if (!result.silent) {
            await message.channel.send({
              embeds: [failureEmbed(result.message)],
            });
          }
          continue;
        }

        await deliver(result.segments, result.actions, {
          member: message.member,
          channel: message.channel,
          triggerMessage: message,
        });
      } catch (err) {
        logger.error(
          { err, guild: message.guildId, trigger: responder.trigger },
          'autoresponder failed',
        );
      }
    }
  });
}
