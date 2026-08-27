import {
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
  getTicketCategories,
  getTicketType,
  parseTicketOpenId,
  releaseReservation,
  reserveTicket,
  ticketChannelName,
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

function liveCategoryId(guild: Guild): string | undefined {
  const { live } = getTicketCategories(guild.id);
  if (!live) return undefined;

  const category = guild.channels.cache.get(live);
  return category?.type === ChannelType.GuildCategory ? live : undefined;
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
      parent: liveCategoryId(guild),
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
}
