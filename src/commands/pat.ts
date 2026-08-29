import { SlashCommandBuilder } from 'discord.js';

import type { SlashCommand } from '../client.js';
import { getCurrency, modifyBalance } from '../services/economy/guild.js';
import {
  getPatSettings,
  getGameCooldownRemaining,
  setGameCooldown,
  isGameEnabled,
} from '../services/games/store.js';
import { formatDuration } from '../dsl/args.js';
import { userEmbed, NO_DMS } from '../utils/style.js';

const LINES = [
  'thank u for the pats!! here, take {{pay}} 𐔌˙.',
  'whaaa?! {{pay}} fell out while you were patting !!',
  ':33333 take these ! {{pay}}',
  '{{pay}} for you,,, come back soon !',
];

export const pat: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('pat')
    .setDescription('give sako head pats. she tips for good ones'),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: NO_DMS,
      });
      return;
    }

    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    if (!isGameEnabled(guildId, 'pat')) {
      await interaction.reply({
        content: 'head pats are turned off in this server :c',
      });
      return;
    }

    const settings = getPatSettings(guildId);

    const remaining = getGameCooldownRemaining(guildId, 'pat', userId);
    if (remaining > 0) {
      const embed = userEmbed(interaction.user)
        .setTitle('✧･ﾟ head pats !')
        .setDescription(
          `STOPPP !! i don't want any right now... come back in **${formatDuration(remaining)}**`,
        );
      await interaction.reply({ embeds: [embed] });
      return;
    }

    const low = Math.min(settings.minReward, settings.maxReward);
    const high = Math.max(settings.minReward, settings.maxReward);
    const reward = Math.floor(Math.random() * (high - low + 1)) + low;

    modifyBalance(guildId, userId, reward, 'pat');
    setGameCooldown(guildId, 'pat', userId, settings.cooldownSeconds);

    const currency = getCurrency(guildId);
    const pay = `${currency.emoji} **${reward.toLocaleString('en-US')}**`;
    const line = LINES[Math.floor(Math.random() * LINES.length)]!.replaceAll(
      '{{pay}}',
      pay,
    );

    const embed = userEmbed(interaction.user)
      .setTitle('✧･ﾟ head pats !')
      .setDescription(line)
      .setFooter({
        text: `you can pat again in ${formatDuration(settings.cooldownSeconds)} !`,
      });

    await interaction.reply({ embeds: [embed] });
  },
};
