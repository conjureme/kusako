import { SlashCommandBuilder, inlineCode } from 'discord.js';

import type { SlashCommand } from '../client.js';
import { getBalance, getCurrency } from '../economy.js';
import {
  GLOBAL_CURRENCIES,
  GLOBAL_CURRENCY_IDS,
  getGlobalBalances,
} from '../globalEconomy.js';
import { userEmbed, spacerFile, SPACER_IMAGE, NO_DMS } from '../style.js';

const NO_BUFF = '-# ₊˚⊹ nothing boosting...';

export const balance: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('check your balance !')
    .addUserOption((o) =>
      o
        .setName('user')
        .setDescription("peek at someone else's balance")
        .setRequired(false),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: NO_DMS,
      });
      return;
    }

    const target = interaction.options.getUser('user') ?? interaction.user;
    const targetMember =
      target.id === interaction.user.id
        ? interaction.member
        : interaction.options.getMember('user');
    const nickname = targetMember?.displayName ?? target.displayName;

    const currency = getCurrency(interaction.guildId);
    const amount = getBalance(interaction.guildId, target.id);

    const server = [
      '꒰ server ꒱',
      `${currency.emoji} **${amount.toLocaleString('en-US')}** ${currency.name}`,
      NO_BUFF,
    ].join('\n');

    const globalBalances = getGlobalBalances(target.id);
    const everywhere = [
      '꒰ everywhere ꒱',
      ...GLOBAL_CURRENCY_IDS.flatMap((id) => [
        `${GLOBAL_CURRENCIES[id].emoji} **${globalBalances[id].toLocaleString('en-US')}** ${GLOBAL_CURRENCIES[id].name}`,
        NO_BUFF,
      ]),
    ].join('\n');

    const stash = [
      '⊹ ࣪ ˖ **global stash** ˖ ࣪ ⊹',
      '-# here be... nothing!',
    ].join('\n');

    const embed = userEmbed(target)
      .setAuthor({
        name: `${nickname}'s pockets`,
        iconURL: target.displayAvatarURL(),
      })
      .setDescription([server, everywhere, stash].join('\n\n'))
      .setImage(SPACER_IMAGE)
      .setFooter({
        text: `server items live in /inventory !`,
      });

    await interaction.reply({ embeds: [embed], files: [spacerFile()] });
  },
};
