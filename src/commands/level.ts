import { SlashCommandBuilder } from 'discord.js';

import type { SlashCommand } from '../client.js';
import {
  getXp,
  levelFromXp,
  totalXpForLevel,
  isLevelingEnabled,
  MAX_LEVEL,
} from '../services/levels/store.js';
import { userEmbed, NO_DMS } from '../utils/style.js';

export const level: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('check your level !')
    .addUserOption((o) =>
      o
        .setName('user')
        .setDescription("peek at someone else's level")
        .setRequired(false),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: NO_DMS,
      });
      return;
    }

    if (!isLevelingEnabled(interaction.guildId)) {
      await interaction.reply({
        content: 'leveling is turned off in this server :c',
      });
      return;
    }

    const target = interaction.options.getUser('user') ?? interaction.user;
    const xp = getXp(interaction.guildId, target.id);
    const current = levelFromXp(xp);

    const into = xp - totalXpForLevel(current);
    const needed = totalXpForLevel(current + 1) - totalXpForLevel(current);
    const progress =
      current >= MAX_LEVEL
        ? 'max level !!'
        : `${into.toLocaleString('en-US')}/${needed.toLocaleString('en-US')} xp to level ${current + 1}`;

    const who =
      target.id === interaction.user.id ? "you're" : `${target.displayName} is`;
    const embed = userEmbed(target)
      .setTitle('✧･ﾟ level !')
      .setDescription(
        `${who} level **${current}** ! (${progress})\ntotal xp: **${xp.toLocaleString('en-US')}**`,
      );

    await interaction.reply({ embeds: [embed] });
  },
};
