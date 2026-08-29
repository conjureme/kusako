import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

import type { SlashCommand } from '../client.js';
import {
  getCurrency,
  modifyBalance,
  setBalance,
} from '../services/economy/guild.js';
import { serverEmbed, NO_DMS } from '../utils/style.js';

export const modifybalance: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('modifybalance')
    .setDescription("edit a member's balance")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription("add currency to a member's balance")
        .addUserOption((o) =>
          o.setName('user').setDescription('whose balance').setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName('amount')
            .setDescription('how much to add')
            .setMinValue(1)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription("remove currency from a member's balance")
        .addUserOption((o) =>
          o.setName('user').setDescription('whose balance').setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName('amount')
            .setDescription('how much to remove')
            .setMinValue(1)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription("set a member's balance to an exact amount")
        .addUserOption((o) =>
          o.setName('user').setDescription('whose balance').setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName('amount')
            .setDescription('the new balance')
            .setMinValue(0)
            .setRequired(true),
        ),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: NO_DMS,
      });
      return;
    }

    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    const currency = getCurrency(guildId);
    const reason = `/modifybalance ${sub} by ${interaction.user.id}`;

    const result =
      sub === 'set'
        ? setBalance(guildId, user.id, amount, reason)
        : modifyBalance(
            guildId,
            user.id,
            sub === 'add' ? amount : -amount,
            reason,
          );

    if (!result.ok) {
      await interaction.reply({
        content: `${user.displayName} only has ${currency.emoji} ${result.balance.toLocaleString('en-US')}, can't remove that much !`,
      });
      return;
    }

    const prettyAmount = `${currency.emoji} **${amount.toLocaleString('en-US')}**`;
    const prettyBalance = `${currency.emoji} **${result.balance.toLocaleString('en-US')}**`;

    const descriptions = {
      add: `added ${prettyAmount} to ${user} !\ntheir balance is now ${prettyBalance} !`,
      remove: `removed ${prettyAmount} from ${user} !\ntheir balance is now ${prettyBalance} !`,
      set: `set ${user}'s balance to ${prettyBalance} !`,
    } as const;

    const embed = serverEmbed(interaction.guild)
      .setTitle('✦ balance updated !')
      .setDescription(descriptions[sub as keyof typeof descriptions]);

    await interaction.reply({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  },
};
