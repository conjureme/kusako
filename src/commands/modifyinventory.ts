import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  inlineCode,
} from 'discord.js';

import type { SlashCommand } from '../client.js';
import {
  getItem,
  modifyInventory,
  setInventory,
} from '../services/items/store.js';
import { serverEmbed, NO_DMS } from '../utils/style.js';
import { respondWithItemNames } from './items.js';

const NAME_MAX = 50;

export const modifyinventory: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('modifyinventory')
    .setDescription("edit a member's inventory")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription("add an item to a member's inventory")
        .addUserOption((o) =>
          o.setName('user').setDescription('whose inventory').setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('item')
            .setDescription('which item')
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
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription("remove an item from a member's inventory")
        .addUserOption((o) =>
          o.setName('user').setDescription('whose inventory').setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('item')
            .setDescription('which item')
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
    )
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('set exactly how many of an item a member has')
        .addUserOption((o) =>
          o.setName('user').setDescription('whose inventory').setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('item')
            .setDescription('which item')
            .setMaxLength(NAME_MAX)
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addIntegerOption((o) =>
          o
            .setName('amount')
            .setDescription('the new quantity')
            .setMinValue(0)
            .setRequired(true),
        ),
    ) as SlashCommandBuilder,

  autocomplete: respondWithItemNames,

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
    const itemName = interaction.options.getString('item', true);
    const amount = interaction.options.getInteger('amount') ?? 1;

    const item = getItem(guildId, itemName);
    if (!item) {
      await interaction.reply({
        content: `there's no item called ${inlineCode(itemName)} !`,
      });
      return;
    }

    const result =
      sub === 'set'
        ? setInventory(guildId, user.id, itemName, amount)
        : modifyInventory(
            guildId,
            user.id,
            itemName,
            sub === 'add' ? amount : -amount,
          );

    if (!result.ok) {
      await interaction.reply({
        content: `${user.displayName} only has ${result.quantity.toLocaleString('en-US')} ${item.emoji ?? '📦'} ${item.name}, can't remove that many !`,
      });
      return;
    }

    const prettyItem = `${item.emoji ?? '📦'} **${item.name}**`;
    const descriptions = {
      add: `added ${prettyItem} × ${amount.toLocaleString('en-US')} to ${user} !\nthey now have ${result.quantity.toLocaleString('en-US')} !`,
      remove: `removed ${prettyItem} × ${amount.toLocaleString('en-US')} from ${user} !\nthey now have ${result.quantity.toLocaleString('en-US')} !`,
      set: `set ${user}'s ${prettyItem} to ${result.quantity.toLocaleString('en-US')} !`,
    } as const;

    const embed = serverEmbed(interaction.guild)
      .setTitle('✦ inventory updated !')
      .setDescription(descriptions[sub as keyof typeof descriptions]);

    await interaction.reply({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  },
};
