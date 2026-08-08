import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  inlineCode,
  type AutocompleteInteraction,
  type Guild,
} from 'discord.js';

import type { SlashCommand } from '../client.js';
import { getItem, listItems } from '../items.js';
import {
  getListing,
  listShop,
  setListing,
  removeListing,
  purchase,
} from '../shop.js';
import { getCurrency } from '../economy.js';
import { paginate, applyPage } from '../pagination.js';
import { registerPage } from '../pageRegistry.js';
import { serverEmbed, userEmbed, NO_DMS } from '../style.js';

const NAME_MAX = 50;

const ADMIN_SUBS = new Set(['add', 'remove']);

function shopPage(guild: Guild, _userId: string, page: number) {
  const entries = listShop(guild.id);

  if (entries.length === 0) {
    const embed = serverEmbed(guild)
      .setTitle('oh no... the shop is empty !')
      .setDescription(
        `the shelves are all empty,, sako has nothing to sell to you!\n\n-# admins can add items with ${inlineCode('/shop add')}`,
      );

    return { embeds: [embed], components: [] };
  }

  const currency = getCurrency(guild.id);
  const greeting = "꒰^ >ヮ<^꒱ *hiiii! here's what i've got for sale:*";
  const buyHint = `⁀જ buy with ${inlineCode('/shop buy <item>')}`;

  const blocks = entries.map(({ item, listing }) => {
    const stock =
      listing.stock === null
        ? 'unlimited'
        : listing.stock <= 0
          ? 'sold out :c'
          : `\`${listing.stock}\``;
    const requires = listing.requiredRoleId
      ? `<@&${listing.requiredRoleId}>`
      : 'none';

    const lines = [
      `ᯓ➤ **${item.name}** · ${currency.emoji} \`${listing.price.toLocaleString('en-US')}\``,
    ];
    if (item.description) lines.push(`-# ✧ ${item.description}`);
    lines.push(`-# ✧ stock: ${stock} ━ requires: ${requires}`);
    return lines.join('\n');
  });

  const current = paginate(blocks, greeting, buyHint, page);
  const embed = serverEmbed(guild);
  const components = applyPage(embed, 'shop', current);

  return { embeds: [embed], components };
}

registerPage('shop', shopPage);

async function respondWithShopNames(
  interaction: AutocompleteInteraction,
): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused().toLowerCase();
  const names =
    interaction.options.getSubcommand() === 'add'
      ? listItems(interaction.guildId).map((item) => item.name)
      : listShop(interaction.guildId).map((entry) => entry.item.name);

  await interaction.respond(
    names
      .filter((name) => name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((name) => ({ name, value: name })),
  );
}

export const shop: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('buy server items here !')
    .addSubcommand((sub) =>
      sub.setName('list').setDescription("everything that's for sale"),
    )
    .addSubcommand((sub) =>
      sub
        .setName('buy')
        .setDescription('buy an item !')
        .addStringOption((o) =>
          o
            .setName('item')
            .setDescription('the item to buy')
            .setMaxLength(NAME_MAX)
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('put an item in the shop, or update its listing')
        .addStringOption((o) =>
          o
            .setName('item')
            .setDescription('an existing item')
            .setMaxLength(NAME_MAX)
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addIntegerOption((o) =>
          o
            .setName('price')
            .setDescription('what it costs')
            .setMinValue(1)
            .setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName('stock')
            .setDescription('how many can be bought, 0 = unlimited')
            .setMinValue(0)
            .setRequired(false),
        )
        .addRoleOption((o) =>
          o
            .setName('requiredrole')
            .setDescription('only members with this role can buy it')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('take an item out of the shop')
        .addStringOption((o) =>
          o
            .setName('item')
            .setDescription('the listing to remove')
            .setMaxLength(NAME_MAX)
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ) as SlashCommandBuilder,

  autocomplete: respondWithShopNames,

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: NO_DMS,
      });
      return;
    }

    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (
      ADMIN_SUBS.has(sub) &&
      !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)
    ) {
      await interaction.reply({
        content: 'you need **manage server** to manage the shop !',
      });
      return;
    }

    if (sub === 'list') {
      await interaction.reply(
        shopPage(interaction.guild, interaction.user.id, 0),
      );
      return;
    }

    if (sub === 'buy') {
      const name = interaction.options.getString('item', true);
      const listing = getListing(guildId, name);

      if (!listing) {
        await interaction.reply({
          content: `${inlineCode(name)} isn't for sale !`,
        });
        return;
      }

      if (listing.requiredRoleId) {
        const role = interaction.guild.roles.cache.get(listing.requiredRoleId);
        if (!role) {
          await interaction.reply({
            content:
              "that listing needs a role that doesn't exist anymore... tell an admin !",
          });
          return;
        }
        if (!interaction.member.roles.cache.has(role.id)) {
          await interaction.reply({
            content: `you need the **${role.name}** role to buy that !`,
          });
          return;
        }
      }

      const result = purchase(guildId, interaction.user.id, name);
      const currency = getCurrency(guildId);

      if (!result.ok) {
        let message: string;
        if (result.reason === 'poor') {
          message = `you need ${currency.emoji} **${result.price.toLocaleString('en-US')} ${currency.name}** for that ! you only have ${result.balance.toLocaleString('en-US')} !`;
        } else if (result.reason === 'sold-out') {
          message = "it's sold out :c come back later !";
        } else {
          message = `${inlineCode(name)} isn't for sale !`;
        }
        await interaction.reply({ content: message });
        return;
      }

      const { item } = result;
      const usable = item.useReply
        ? `\n-# use it with ${inlineCode('/items use')} !`
        : '';
      const stockLine =
        result.remainingStock === null
          ? ''
          : `\n-# ${result.remainingStock} left in stock`;
      const embed = userEmbed(interaction.user)
        .setTitle('✧･ﾟ purchased !')
        .setDescription(
          `you bought ${item.emoji ?? '📦'} **${item.name}** for ${currency.emoji} **${result.price.toLocaleString('en-US')}** !${usable}${stockLine}`,
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'add') {
      const name = interaction.options.getString('item', true);
      const price = interaction.options.getInteger('price', true);
      const stockOption = interaction.options.getInteger('stock') ?? 0;
      const requiredRole = interaction.options.getRole('requiredrole');

      const item = getItem(guildId, name);
      if (!item) {
        await interaction.reply({
          content: `there's no item called ${inlineCode(name)} ! make it first with ${inlineCode('/items add')}`,
        });
        return;
      }

      const existed = getListing(guildId, name) !== null;
      const stock = stockOption === 0 ? null : stockOption;
      setListing(guildId, name, price, stock, requiredRole?.id ?? null);

      const currency = getCurrency(guildId);
      const details = [
        `${currency.emoji} ${price.toLocaleString('en-US')} ${currency.name}`,
        stock === null ? 'unlimited stock' : `${stock} in stock`,
        requiredRole ? `needs ${requiredRole.toString()}` : null,
      ].filter((d) => d !== null);
      const embed = serverEmbed(interaction.guild)
        .setTitle(existed ? '✦ listing updated !' : '✦ up for sale !')
        .setDescription(
          `${item.emoji ?? '📦'} **${item.name}**\n-# ${details.join(' · ')}`,
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'remove') {
      const name = interaction.options.getString('item', true);
      const removed = removeListing(guildId, name);

      if (!removed) {
        await interaction.reply({
          content: `${inlineCode(name)} isn't in the shop !`,
        });
        return;
      }

      const embed = serverEmbed(interaction.guild)
        .setTitle('✦ off the shelf !')
        .setDescription(
          `${inlineCode(name)} is no longer for sale. inventories are untouched !`,
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }
  },
};
