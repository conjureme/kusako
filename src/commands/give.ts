import { SlashCommandBuilder, inlineCode } from 'discord.js';

import type { SlashCommand } from '../client.js';
import { getCurrency, transferBalance } from '../economy.js';
import { getItem, transferItem } from '../items.js';
import { respondWithItemNames } from './items.js';
import { userEmbed, NO_DMS } from '../style.js';

const MIN_GIVE = 10;
const MAX_GIVE = 1_000_000;
const NAME_MAX = 50;

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
    )
    .addSubcommand((sub) =>
      sub
        .setName('item')
        .setDescription('give a member something from your inventory')
        .addUserOption((o) =>
          o
            .setName('user')
            .setDescription('who to give it to')
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('the item to give')
            .setMaxLength(NAME_MAX)
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addIntegerOption((o) =>
          o
            .setName('amount')
            .setDescription('how many')
            .setMinValue(1)
            .setRequired(false),
        ),
    ) as SlashCommandBuilder,

  autocomplete: (interaction) =>
    respondWithItemNames(interaction, (item) => item.giftable),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: NO_DMS,
      });
      return;
    }

    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser('user', true);

    if (target.bot) {
      await interaction.reply({
        content: "bots can't hold onto anything! they have no pockets :c",
      });
      return;
    }

    if (target.id === interaction.user.id) {
      await interaction.reply({
        content: "that's already yours, silly !",
      });
      return;
    }

    if (sub === 'currency') {
      const amount = interaction.options.getInteger('amount', true);
      const currency = getCurrency(guildId);

      const money = (value: number) =>
        `${currency.emoji} **${value.toLocaleString('en-US')}**`;

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
        .setDescription(`successfully gave ${money(amount)} to ${target} !`);

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'item') {
      const name = interaction.options.getString('name', true);
      const amount = interaction.options.getInteger('amount') ?? 1;

      const item = getItem(guildId, name);
      if (!item) {
        await interaction.reply({
          content: `there's no item called ${inlineCode(name)} !`,
        });
        return;
      }

      const label = `${item.emoji ?? '📦'} **${item.name}**`;

      if (!item.giftable) {
        await interaction.reply({
          content: `${label} can't be given away !`,
        });
        return;
      }

      const result = transferItem(
        guildId,
        interaction.user.id,
        target.id,
        name,
        amount,
      );

      if (!result.ok) {
        await interaction.reply({
          content: `you've only got ${result.quantity}× ${label},,,, that's not enough to give away !`,
        });
        return;
      }

      const embed = userEmbed(interaction.user)
        .setTitle('✧･ﾟ handed over !')
        .setDescription(`successfully gave ${amount}× ${label} to ${target} !`);

      await interaction.reply({ embeds: [embed] });
      return;
    }
  },
};
