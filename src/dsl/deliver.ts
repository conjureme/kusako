import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
  type MessageActionRowComponentBuilder,
  type GuildMember,
  type PartialGuildMember,
  type Guild,
  type GuildTextBasedChannel,
  type Message,
  type RepliableInteraction,
} from 'discord.js';

import {
  scheduleMessage,
  scheduleDeletion,
  scheduleRoleRemoval,
} from '../services/scheduler.js';
import {
  buttonCustomId,
  dropdownCustomId,
  getButtonResponder,
} from '../services/buttons/store.js';
import {
  isUsableEmoji,
  resolveButtonStyle,
} from '../services/buttons/registry.js';
import {
  getRoleMenu,
  roleMenuCustomId,
  roleMenuButtonId,
  type RoleMenu,
} from '../services/roleMenus/store.js';
import { logger } from '../logger.js';
import {
  BUTTONS_PER_ROW,
  MAX_ROWS,
  type Segment,
  type MessageActions,
} from './evaluate.js';

function responderButton(
  guildId: string,
  name: string,
  invokerId: string | undefined,
): ButtonBuilder {
  const responder = getButtonResponder(guildId, name);
  const button = new ButtonBuilder()
    .setStyle(resolveButtonStyle(responder?.style ?? null))
    .setCustomId(
      buttonCustomId(
        name,
        responder?.invokerOnly && invokerId ? invokerId : undefined,
      ),
    );

  const emoji = responder?.emoji;
  const hasEmoji =
    emoji !== null && emoji !== undefined && isUsableEmoji(emoji);
  if (hasEmoji) button.setEmoji(emoji);

  const label = responder?.label?.trim();
  if (label) {
    button.setLabel(label.slice(0, 80));
  } else if (!hasEmoji) {
    button.setLabel(name.slice(0, 80));
  }

  return button;
}

function dropdownRow(
  dropdown: MessageActions['dropdowns'][number],
  index: number,
  guildId: string,
  invokerId: string | undefined,
): ActionRowBuilder<MessageActionRowComponentBuilder> | null {
  const options = dropdown.options.map((name) => {
    const responder = getButtonResponder(guildId, name);
    const option = new StringSelectMenuOptionBuilder()
      .setValue(name.toLowerCase().slice(0, 100))
      .setLabel((responder?.label?.trim() || name).slice(0, 100));

    const emoji = responder?.emoji;
    if (emoji && isUsableEmoji(emoji)) option.setEmoji(emoji);
    return option;
  });

  if (options.length === 0) return null;

  const locked = dropdown.options.some(
    (name) => getButtonResponder(guildId, name)?.invokerOnly === true,
  );
  const select = new StringSelectMenuBuilder()
    .setCustomId(dropdownCustomId(index, locked ? invokerId : undefined))
    .addOptions(options);

  if (dropdown.placeholder.length > 0) {
    select.setPlaceholder(dropdown.placeholder.slice(0, 150));
  }

  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    select,
  );
}

function roleMenuRows(
  guildId: string,
  guild: Guild,
  name: string,
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  const menu: RoleMenu | null = getRoleMenu(guildId, name);
  if (!menu) return [];

  const live = menu.roles.filter((entry) =>
    guild.roles.cache.has(entry.roleId),
  );
  if (live.length === 0) return [];

  const labelOf = (roleId: string, label: string | null): string =>
    (label?.trim() || guild.roles.cache.get(roleId)?.name || roleId).slice(
      0,
      80,
    );

  if (menu.style === 'dropdown') {
    const select = new StringSelectMenuBuilder()
      .setCustomId(roleMenuCustomId(menu.nameKey))
      .addOptions(
        live.map((entry) => {
          const option = new StringSelectMenuOptionBuilder()
            .setValue(entry.roleId)
            .setLabel(labelOf(entry.roleId, entry.label));
          if (entry.emoji && isUsableEmoji(entry.emoji)) {
            option.setEmoji(entry.emoji);
          }
          return option;
        }),
      );

    if (menu.placeholder) select.setPlaceholder(menu.placeholder.slice(0, 150));

    return [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        select,
      ),
    ];
  }

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  for (let i = 0; i < live.length; i += BUTTONS_PER_ROW) {
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();
    for (const entry of live.slice(i, i + BUTTONS_PER_ROW)) {
      const button = new ButtonBuilder()
        .setCustomId(roleMenuButtonId(menu.nameKey, entry.roleId))
        .setStyle(resolveButtonStyle(menu.color));

      const hasEmoji = Boolean(entry.emoji && isUsableEmoji(entry.emoji));
      if (hasEmoji) button.setEmoji(entry.emoji!);
      if (entry.label?.trim() || !hasEmoji) {
        button.setLabel(labelOf(entry.roleId, entry.label));
      }

      row.addComponents(button);
    }
    rows.push(row);
  }

  return rows;
}

function buildComponentRows(
  actions: MessageActions,
  guildId: string,
  guild: Guild,
  invokerId: string | undefined,
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  const { buttons } = actions;

  if (actions.roleMenu !== null) {
    rows.push(...roleMenuRows(guildId, guild, actions.roleMenu));
  }

  for (let i = 0; i < buttons.length; i += BUTTONS_PER_ROW) {
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();
    for (const button of buttons.slice(i, i + BUTTONS_PER_ROW)) {
      row.addComponents(
        button.kind === 'link'
          ? new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel(button.label.slice(0, 80))
              .setURL(button.url)
          : responderButton(guildId, button.name, invokerId),
      );
    }
    rows.push(row);
  }

  actions.dropdowns.forEach((dropdown, index) => {
    const row = dropdownRow(dropdown, index, guildId, invokerId);
    if (row) rows.push(row);
  });

  return rows.slice(0, MAX_ROWS);
}

async function sendEphemeral(
  segments: Segment[],
  buttonRows: ActionRowBuilder<MessageActionRowComponentBuilder>[],
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
  member?: GuildMember | PartialGuildMember;
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
    ? ((await target.member?.createDM().catch(() => null)) ?? null)
    : base;

  let firstSent: Message | null = null;
  const buttonRows =
    actions.buttons.length > 0 ||
    actions.dropdowns.length > 0 ||
    actions.roleMenu !== null
      ? buildComponentRows(
          actions,
          target.channel.guild.id,
          target.channel.guild,
          target.member?.id,
        )
      : [];
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
            target.channel.guild.id,
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

  const members = target.channel.guild.members;
  for (const action of actions.roleActions) {
    const options = { user: action.userId, role: action.roleId };
    try {
      if (action.add) await members.addRole(options);
      else await members.removeRole(options);

      // only queue the removal once the grant actually landed, so a failed
      // {temprole} doesn't leave a timer that strips a role they already had
      if (action.forSeconds) {
        scheduleRoleRemoval(
          target.channel.guild.id,
          action.userId,
          action.roleId,
          action.forSeconds,
        );
      }
    } catch (err) {
      logger.warn(
        { err, ...options },
        `${action.add ? 'addrole' : 'removerole'} failed`,
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
      target.channel.guild.id,
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
