import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

import type { SlashCommand } from '../client.js';
import { getCurrency, modifyBalances } from '../services/economy/guild.js';
import { fetchMembers } from '../services/memberCache.js';
import { serverEmbed, NO_DMS } from '../utils/style.js';

export const modifyrolebalance: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('modifyrolebalance')
    .setDescription('pay everyone with a role at once')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addRoleOption((o) =>
      o.setName('role').setDescription('who gets paid').setRequired(true),
    )
    .addIntegerOption((o) =>
      o
        .setName('amount')
        .setDescription('how much each of them gets')
        .setMinValue(1)
        .setRequired(true),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: NO_DMS,
      });
      return;
    }

    const guildId = interaction.guildId;
    const role = interaction.options.getRole('role', true);
    const amount = interaction.options.getInteger('amount', true);
    const currency = getCurrency(guildId);

    const money = (value: number) =>
      `${currency.emoji} **${value.toLocaleString('en-US')}**`;

    await interaction.deferReply();
    await fetchMembers(interaction.guild, true);

    const paid = role.members.filter((member) => !member.user.bot);

    if (paid.size === 0) {
      await interaction.editReply({
        content: `nobody has ${role.name}... no one to pay !`,
        allowedMentions: { parse: [] },
      });
      return;
    }

    modifyBalances(
      guildId,
      [...paid.keys()],
      amount,
      `/modifyrolebalance ${role.id} by ${interaction.user.id}`,
    );

    const embed = serverEmbed(interaction.guild)
      .setTitle('✦ balances updated !')
      .setDescription(
        `gave ${money(amount)} to everyone with ${role} !\n-# ✧ ${paid.size.toLocaleString('en-US')} members ⊹ ${money(amount * paid.size)} handed out`,
      );

    await interaction.editReply({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  },
};
