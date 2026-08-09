import { SlashCommandBuilder, inlineCode, type Guild } from 'discord.js';

import type { SlashCommand } from '../client.js';
import { getInventory } from '../services/items/store.js';
import { paginate, applyPage } from '../utils/pagination.js';
import { registerPage } from '../services/pageRegistry.js';
import { userEmbed, spacerFile, SPACER_IMAGE, NO_DMS } from '../utils/style.js';

const FOOTER = 'global stash lives in /balance !';

function inventoryPage(guild: Guild, targetId: string, page: number) {
  const member = guild.members.cache.get(targetId);
  const entries = getInventory(guild.id, targetId);

  const embed = userEmbed(member?.user ?? guild.client.user)
    .setAuthor({
      name: `${member?.displayName ?? 'their'}'s inventory`,
      iconURL: member?.displayAvatarURL(),
    })
    .setImage(SPACER_IMAGE);

  if (entries.length === 0) {
    embed
      .setDescription(['꒰ server ꒱', '-# here be... nothing!'].join('\n'))
      .setFooter({ text: FOOTER });

    return { embeds: [embed], components: [], files: [spacerFile()] };
  }

  const total = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const kinds = entries.length === 1 ? '1 kind' : `${entries.length} kinds`;
  const things =
    total === 1 ? '1 thing' : `${total.toLocaleString('en-US')} things`;
  const header = `꒰ server ꒱ *${kinds} ⊹ ${things} total*`;
  const hint = `⁀જ➣ use one with ${inlineCode('/items use <item>')}`;

  const blocks = entries.map(({ item, quantity }) => {
    const traits = [
      item.useReply ? 'usable' : null,
      item.giftable ? 'giftable' : null,
    ].filter((trait) => trait !== null);

    const lines = [
      `${item.emoji ?? '📦'} **${item.name}** ×${quantity.toLocaleString('en-US')}`,
    ];
    if (item.description) lines.push(`-# ✧ ${item.description}`);
    if (traits.length) lines.push(`-# ✧ ${traits.join(' ━ ')}`);
    return lines.join('\n');
  });

  const current = paginate(blocks, header, hint, page);
  const components = applyPage(embed, `inv:${targetId}`, current, FOOTER);

  return { embeds: [embed], components, files: [spacerFile()] };
}

registerPage('inv', inventoryPage);

export const inventory: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription("see what you're carrying !")
    .addUserOption((o) =>
      o
        .setName('user')
        .setDescription("peek at someone else's inventory")
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
    await interaction.reply(inventoryPage(interaction.guild, target.id, 0));
  },
};
