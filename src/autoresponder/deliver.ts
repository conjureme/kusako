import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type GuildMember,
  type GuildTextBasedChannel,
  type Message,
  type RepliableInteraction,
} from 'discord.js';

import {
  scheduleMessage,
  scheduleDeletion,
  scheduleRoleRemoval,
} from '../scheduler.js';
import { buttonCustomId } from './store.js';
import { logger } from '../logger.js';
import type { Segment, MessageActions } from './evaluate.js';

function buildButtonRows(
  buttons: MessageActions['buttons'],
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const button of buttons.slice(i, i + 5)) {
      row.addComponents(
        button.kind === 'link'
          ? new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel(button.label.slice(0, 80))
              .setURL(button.url)
          : new ButtonBuilder()
              .setStyle(ButtonStyle.Secondary)
              .setLabel(button.name.slice(0, 80))
              .setCustomId(buttonCustomId(button.name)),
      );
    }
    rows.push(row);
  }
  return rows;
}

async function sendEphemeral(
  segments: Segment[],
  buttonRows: ActionRowBuilder<ButtonBuilder>[],
  interaction: RepliableInteraction,
): Promise<void> {
  const content = segments
    .map((segment) => segment.content)
    .join('\n')
    .trim()
    .slice(0, 2000);
  const embeds = segments.flatMap((segment) => segment.embeds);
  if (content.length === 0 && embeds.length === 0 && buttonRows.length === 0) {
    // a textless {ephemeral} reply (pure {togglerole}, say) still has to answer
    // the interaction or discord leaves it spinning
    if (!interaction.deferred && !interaction.replied) {
      if (interaction.isMessageComponent()) {
        await interaction.deferUpdate().catch(() => null);
      } else {
        await interaction
          .reply({ content: 'done !', flags: MessageFlags.Ephemeral })
          .catch(() => null);
      }
    }
    return;
  }

  const payload = {
    content: content.length > 0 ? content : undefined,
    embeds,
    components: buttonRows,
    allowedMentions: { parse: [] as const },
  };

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    }
  } catch (err) {
    logger.warn({ err }, 'ephemeral reply failed');
  }
}

export interface DeliveryTarget {
  member: GuildMember;
  channel: GuildTextBasedChannel;
  triggerMessage?: Message;
  interaction?: RepliableInteraction;
}

const DM_FAIL_NOTICE = "i couldn't dm you ! check your privacy settings :c";

export async function deliver(
  segments: Segment[],
  actions: MessageActions,
  target: DeliveryTarget,
): Promise<void> {
  const redirect =
    actions.sendToChannelId && actions.sendToChannelId !== target.channel.id
      ? target.channel.guild.channels.cache.get(actions.sendToChannelId)
      : null;
  const base = redirect && redirect.isTextBased() ? redirect : target.channel;

  const destination = actions.dm
    ? await target.member.createDM().catch(() => null)
    : base;

  let firstSent: Message | null = null;
  const buttonRows =
    actions.buttons.length > 0 ? buildButtonRows(actions.buttons) : [];
  let buttonsAttached = false;

  const ephemeral = actions.ephemeral && !actions.dm && target.interaction;
  if (ephemeral) {
    await sendEphemeral(segments, buttonRows, target.interaction!);
  } else if (!destination) {
    if (target.triggerMessage) {
      await target.triggerMessage.reply({
        content: DM_FAIL_NOTICE,
        allowedMentions: { parse: [] },
      });
    }
  } else {
    let offset = 0;
    for (const segment of segments) {
      offset += segment.delaySeconds;
      const content = segment.content.slice(0, 2000);
      if (content.length === 0 && segment.embeds.length === 0) continue;

      try {
        if (offset === 0) {
          const attachButtons = !buttonsAttached && buttonRows.length > 0;
          const sent = await destination.send({
            content: content.length > 0 ? content : undefined,
            embeds: segment.embeds,
            components: attachButtons ? buttonRows : undefined,
            allowedMentions: { parse: ['users', 'roles'] },
          });
          if (attachButtons) buttonsAttached = true;
          firstSent ??= sent;
        } else {
          scheduleMessage(
            destination.id,
            content,
            offset,
            segment.embeds,
            target.member.guild.id,
          );
        }
      } catch (err) {
        if (!actions.dm) throw err;
        if (target.triggerMessage) {
          await target.triggerMessage.reply({
            content: DM_FAIL_NOTICE,
            allowedMentions: { parse: [] },
          });
        }
        break;
      }
    }

    if (!buttonsAttached && buttonRows.length > 0) {
      try {
        const sent = await destination.send({ components: buttonRows });
        firstSent ??= sent;
      } catch (err) {
        logger.warn({ err }, 'button-only message failed');
      }
    }
  }

  const reactionSets: Array<[Message | null, string[]]> = [
    [target.triggerMessage ?? firstSent, actions.reactions],
    [firstSent, actions.replyReactions],
  ];
  for (const [reactTarget, emojis] of reactionSets) {
    if (!reactTarget) continue;
    for (const emoji of emojis) {
      try {
        await reactTarget.react(emoji);
      } catch (err) {
        logger.warn({ err, emoji }, 'react failed');
      }
    }
  }

  const members = target.member.guild.members;
  for (const action of actions.roleActions) {
    const options = { user: action.userId, role: action.roleId };
    try {
      if (action.add) await members.addRole(options);
      else await members.removeRole(options);

      // only queue the removal once the grant actually landed, so a failed
      // {temprole} doesn't leave a timer that strips a role they already had
      if (action.forSeconds) {
        scheduleRoleRemoval(
          target.member.guild.id,
          action.userId,
          action.roleId,
          action.forSeconds,
        );
      }
    } catch (err) {
      logger.warn(
        { err, ...options },
        `${action.add ? 'giverole' : 'takerole'} failed`,
      );
    }
  }

  for (const action of actions.nickActions) {
    try {
      await members.edit(action.userId, { nick: action.nick });
    } catch (err) {
      logger.warn({ err, user: action.userId }, 'setnick failed');
    }
  }

  if (actions.deleteReplyAfter !== null && firstSent && !actions.dm) {
    scheduleDeletion(
      firstSent.channelId,
      firstSent.id,
      actions.deleteReplyAfter,
      target.member.guild.id,
    );
  }

  if (actions.deleteTrigger && target.triggerMessage) {
    try {
      await target.triggerMessage.delete();
    } catch (err) {
      logger.warn({ err }, 'deletetrigger failed');
    }
  }
}
