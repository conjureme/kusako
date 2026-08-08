import { SlashCommandBuilder } from 'discord.js';

import type { SlashCommand } from '../client.js';
import { getCurrency, transferBalance } from '../economy.js';
import { userEmbed, NO_DMS } from '../style.js';

const MIN_GIVE = 10;
const MAX_GIVE = 1_000_000;

export const give: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('give')
    .setDescription('hand some of your things to someone else')
    .addSubcommand((sub) =>
      sub
        .setName('currency')
        .setDescription('give a member some of your currency')
        .addUserOption((o) =>
          o
            .setName('user')
            .setDescription('who to give it to')
            .setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName('amount')
            .setDescription('how much to give')
            .setMinValue(MIN_GIVE)
            .setMaxValue(MAX_GIVE)
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
    const target = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    const currency = getCurrency(guildId);

    const money = (value: number) =>
      `${currency.emoji} **${value.toLocaleString('en-US')} ${currency.name}**`;

    if (target.bot) {
      await interaction.reply({
        content: "bots can't hold currency! nowhere to put it :c",
      });
      return;
    }

    if (target.id === interaction.user.id) {
      await interaction.reply({
        content: "that's already yours, silly !",
      });
      return;
    }

    const result = transferBalance(
      guildId,
      interaction.user.id,
      target.id,
      amount,
      '/give currency',
    );

    if (!result.ok) {
      await interaction.reply({
        content: `you've only got ${money(result.balance)},,,, that's not enough to give away !`,
      });
      return;
    }

    const embed = userEmbed(interaction.user)
      .setTitle('✧･ﾟ handed over !')
      .setDescription(
        `${interaction.user} gave ${money(amount)} to ${target} !\n-# you've got ${money(result.balance)} left`,
      );

    await interaction.reply({ embeds: [embed] });
  },
};
