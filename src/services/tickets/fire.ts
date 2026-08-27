import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type OverwriteResolvable,
  type TextChannel,
} from 'discord.js';

import {
  attachTicketChannel,
  getTicketByChannel,
  getTicketCategories,
  getTicketType,
  markTicketClosed,
  markTicketOpen,
  parseTicketOpenId,
  releaseReservation,
  reserveTicket,
  ticketChannelName,
  TICKET_CLOSE_ID,
  TICKET_REOPEN_ID,
  type Ticket,
  type TicketType,
} from './store.js';
import {
  getCooldownRemaining,
  setCooldown,
  ticketScope,
} from '../cooldowns.js';
import { formatDuration } from '../../dsl/args.js';
import { parse } from '../../dsl/parser.js';
import { evaluate } from '../../dsl/evaluate.js';
import { deliver } from '../../dsl/deliver.js';
import { logger } from '../../logger.js';

const TICKET_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AddReactions,
] as const;

const REQUIRED_PERMS: Array<[bigint, string]> = [
  [PermissionFlagsBits.ManageChannels, 'manage channels'],
  [PermissionFlagsBits.ManageRoles, 'manage roles'],
];

export function missingTicketPerms(guild: Guild): string[] {
  const me = guild.members.me;
  if (!me) return [];

  return REQUIRED_PERMS.filter(([flag]) => !me.permissions.has(flag)).map(
    ([, label]) => label,
  );
}

export function grantableAllows(guild: Guild): bigint[] {
  const me = guild.members.me;
  if (!me) return [];

  return TICKET_ALLOW.filter((flag) => me.permissions.has(flag));
}

function buildOverwrites(
  guild: Guild,
  type: TicketType,
  openerId: string,
): OverwriteResolvable[] {
  const allow = grantableAllows(guild);
  const overwrites: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: openerId, allow },
  ];

  const me = guild.members.me;
  if (me) overwrites.push({ id: me.id, allow });

  for (const roleId of type.roleIds) {
    if (!guild.roles.cache.has(roleId)) continue;
    overwrites.push({ id: roleId, allow });
  }

  return overwrites;
}

function categoryId(guild: Guild, which: 'live' | 'archive'): string | null {
  const id = getTicketCategories(guild.id)[which];
  if (!id) return null;

  const category = guild.channels.cache.get(id);
  return category?.type === ChannelType.GuildCategory ? id : null;
}

export function controlRow(open: boolean): ActionRowBuilder<ButtonBuilder> {
  const button = open
    ? new ButtonBuilder()
        .setCustomId(TICKET_CLOSE_ID)
        .setLabel('close ticket')
        .setStyle(ButtonStyle.Danger)
    : new ButtonBuilder()
        .setCustomId(TICKET_REOPEN_ID)
        .setLabel('reopen ticket')
        .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
}

function canManageTicket(
  member: GuildMember,
  ticket: Ticket,
  type: TicketType | null,
): boolean {
  if (member.id === ticket.openerId) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (!type) return false;

  return type.roleIds.some((id) => member.roles.cache.has(id));
}

async function postGreeting(
  channel: TextChannel,
  type: TicketType,
  opener: GuildMember,
): Promise<void> {
  if (!type.greeting) return;

  const result = await evaluate(
    parse(type.greeting),
    { member: opener, guild: channel.guild, channel },
    ticketScope(type.key),
  );

  if (!result.ok) {
    logger.warn(
      { type: type.key, reason: result.message },
      'ticket greeting was blocked',
    );
    return;
  }

  await deliver(result.segments, result.actions, {
    member: opener,
    channel,
  });
}

export async function openTicket(
  interaction: ButtonInteraction,
): Promise<void> {
  const typeKey = parseTicketOpenId(interaction.customId);
  if (typeKey === null || !interaction.inCachedGuild()) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { guild } = interaction;
  const opener = interaction.member;
  const type = getTicketType(guild.id, typeKey);

  if (!type) {
    await interaction.editReply("that ticket type isn't around anymore !");
    return;
  }

  const scope = ticketScope(type.key);
  const remaining = getCooldownRemaining(guild.id, scope, opener.id);
  if (remaining > 0) {
    await interaction.editReply(
      `hold on a moment,, you can open another in **${formatDuration(remaining)}**`,
    );
    return;
  }

  const reserved = reserveTicket(guild.id, type.key, opener.id);
  if (!reserved.ok) {
    const existing = reserved.existing.channelId;
    await interaction.editReply(
      existing
        ? `you've already got one open over at <#${existing}> !`
        : "you've already got one being made right now !",
    );
    return;
  }

  const { number } = reserved;
  let channel: TextChannel;

  try {
    channel = await guild.channels.create({
      name: ticketChannelName(type.key, number),
      type: ChannelType.GuildText,
      parent: categoryId(guild, 'live') ?? undefined,
      topic: `opened by <@${opener.id}>`,
      permissionOverwrites: buildOverwrites(guild, type, opener.id),
      reason: `ticket ${type.key} #${number} opened by ${opener.user.tag}`,
    });
  } catch (err) {
    releaseReservation(guild.id, type.key, number);
    logger.error(
      { err, type: type.key, number },
      'ticket channel create failed',
    );
    await interaction.editReply(
      "i couldn't make that channel,, poke an admin to check my permissions !",
    );
    return;
  }

  attachTicketChannel(guild.id, type.key, number, channel.id);
  if (type.cooldownSeconds > 0) {
    setCooldown(guild.id, scope, opener.id, type.cooldownSeconds);
  }

  await interaction.editReply(`made you a ticket ! <#${channel.id}>`);

  try {
    await postGreeting(channel, type, opener);
  } catch (err) {
    logger.error(
      { err, channel: channel.id },
      'ticket greeting failed to send',
    );
  }

  await channel
    .send({ components: [controlRow(true)] })
    .catch((err: unknown) =>
      logger.error({ err, channel: channel.id }, 'ticket controls failed'),
    );
}

async function nudge(
  interaction: ButtonInteraction,
  message: string,
): Promise<void> {
  await interaction
    .followUp({ content: message, flags: MessageFlags.Ephemeral })
    .catch(() => null);
}

export async function closeTicket(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.inCachedGuild() || !interaction.channel) return;

  await interaction.deferUpdate();

  const { guild, channel } = interaction;
  const ticket = getTicketByChannel(channel.id);
  if (!ticket) {
    await nudge(interaction, "i don't have a record of this ticket !");
    return;
  }

  const type = getTicketType(guild.id, ticket.typeKey);
  if (!canManageTicket(interaction.member, ticket, type)) {
    await nudge(interaction, "this one isn't yours to close !");
    return;
  }

  if (ticket.state !== 'open') {
    await nudge(interaction, 'that one is already closed !');
    return;
  }

  if (channel.type !== ChannelType.GuildText) return;

  try {
    await channel.permissionOverwrites.edit(
      ticket.openerId,
      { SendMessages: false },
      { reason: `ticket closed by ${interaction.user.tag}` },
    );
  } catch (err) {
    logger.error({ err, channel: channel.id }, 'ticket lock failed');
    await nudge(
      interaction,
      "i couldn't lock this one,, check my permissions and try again !",
    );
    return;
  }

  markTicketClosed(channel.id);
  await interaction.message
    .edit({ components: [controlRow(false)] })
    .catch(() => null);

  const archive = categoryId(guild, 'archive');
  let moved = archive === null;
  if (archive !== null) {
    try {
      await channel.setParent(archive, {
        lockPermissions: false,
        reason: `ticket closed by ${interaction.user.tag}`,
      });
      moved = true;
    } catch (err) {
      logger.warn({ err, channel: channel.id }, 'ticket archive move failed');
    }
  }

  await channel
    .send({
      content: `-# ✦ closed by <@${interaction.user.id}>${moved ? '' : ' · i left it here, the archive category is full or missing'}`,
      allowedMentions: { parse: [] },
    })
    .catch(() => null);
}

export async function reopenTicket(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.inCachedGuild() || !interaction.channel) return;

  await interaction.deferUpdate();

  const { guild, channel } = interaction;
  const ticket = getTicketByChannel(channel.id);
  if (!ticket) {
    await nudge(interaction, "i don't have a record of this ticket !");
    return;
  }

  const type = getTicketType(guild.id, ticket.typeKey);
  if (!canManageTicket(interaction.member, ticket, type)) {
    await nudge(interaction, "this one isn't yours to reopen !");
    return;
  }

  if (ticket.state !== 'closed') {
    await nudge(interaction, 'that one is already open !');
    return;
  }

  if (channel.type !== ChannelType.GuildText) return;

  try {
    await channel.permissionOverwrites.edit(
      ticket.openerId,
      { SendMessages: true },
      { reason: `ticket reopened by ${interaction.user.tag}` },
    );
  } catch (err) {
    logger.error({ err, channel: channel.id }, 'ticket unlock failed');
    await nudge(
      interaction,
      "i couldn't unlock this one,, check my permissions and try again !",
    );
    return;
  }

  markTicketOpen(channel.id);
  await interaction.message
    .edit({ components: [controlRow(true)] })
    .catch(() => null);

  const live = categoryId(guild, 'live');
  let moved = live === null;
  if (live !== null) {
    try {
      await channel.setParent(live, {
        lockPermissions: false,
        reason: `ticket reopened by ${interaction.user.tag}`,
      });
      moved = true;
    } catch (err) {
      logger.warn({ err, channel: channel.id }, 'ticket unarchive move failed');
    }
  }

  const byOpener = interaction.user.id === ticket.openerId;
  const notice = byOpener
    ? 'ticket reopened !'
    : `<@${ticket.openerId}> your ticket was reopened by <@${interaction.user.id}> !`;

  await channel
    .send({
      content: moved
        ? notice
        : `${notice}\n-# ✦ i couldn't move it back, the tickets category is full or missing`,
      allowedMentions: { users: byOpener ? [] : [ticket.openerId] },
    })
    .catch(() => null);
}
