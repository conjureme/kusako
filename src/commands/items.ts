import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  inlineCode,
  type AutocompleteInteraction,
  type ButtonInteraction,
} from 'discord.js';

import type { Guild } from 'discord.js';

import type { SlashCommand } from '../client.js';
import {
  createItem,
  editItem,
  deleteItem,
  getItem,
  getCirculation,
  listItems,
  transferItem,
  type Item,
} from '../items.js';
import { getListing } from '../shop.js';
import { serverEmbed, userEmbed, failureEmbed, NO_DMS } from '../style.js';
import { parse } from '../autoresponder/parser.js';
import type { Node, PlaceholderNode } from '../autoresponder/ast.js';
import { templateIssues } from '../autoresponder/validate.js';
import { evaluate } from '../autoresponder/evaluate.js';
import { deliver } from '../autoresponder/deliver.js';
import { paginate, applyPage } from '../pagination.js';
import { registerPage } from '../pageRegistry.js';

const NAME_MAX = 50;
const DESCRIPTION_MAX = 200;
const EMOJI_MAX = 64;
const REPLY_MAX = 2000;

const ADMIN_SUBS = new Set(['add', 'edit', 'remove']);

function itemReplyIssues(reply: string): string | null {
  const hasCooldown = parse(reply).some(
    (node) => node.kind === 'placeholder' && node.name === 'cooldown',
  );
  if (hasCooldown) {
    return "{cooldown} doesn't work in item replies ! the item getting used up is already the limit c:";
  }
  return templateIssues(reply);
}

function rolesOnUse(useReply: string | null): string {
  if (!useReply) return 'none';
  const roles = parse(useReply)
    .filter(
      (node): node is PlaceholderNode =>
        node.kind === 'placeholder' && node.name === 'giverole',
    )
    .map((node) => (node.args[0] ?? '').trim())
    .filter((arg) => arg !== '')
    .map((arg) => (/^\d+$/.test(arg) ? `<@&${arg}>` : arg));
  return roles.length ? roles.join(', ') : 'none';
}

function itemDetailEmbed(guild: Guild, title: string, item: Item) {
  return serverEmbed(guild)
    .setTitle(title)
    .setDescription(`${item.emoji ?? '📦'} **${item.name}**`)
    .addFields(
      {
        name: 'description',
        value: item.description ?? 'none',
      },
      {
        name: 'reply',
        value: item.useReply ? 'yes !' : 'none',
        inline: true,
      },
      {
        name: 'role on use',
        value: rolesOnUse(item.useReply),
        inline: true,
      },
      {
        name: 'giftable',
        value: item.giftable ? 'yes !' : 'no',
        inline: true,
      },
    );
}

function confirmEmbed(guild: Guild, item: Item) {
  const circulation = getCirculation(guild.id, item.name);
  const listed = getListing(guild.id, item.name) !== null;

  const stakes = [
    circulation > 0
      ? `-# ✧ ${circulation.toLocaleString('en-US')} of them out there in inventories`
      : '-# ✧ nobody is holding any right now',
    listed ? '-# it gets pulled from the shop too' : null,
  ].filter((line) => line !== null);

  return serverEmbed(guild)
    .setTitle('✦ delete this item ?')
    .setDescription(
      [
        `${item.emoji ?? '📦'} **${item.name}**`,
        ...stakes,
        '',
        "this wipes it from every inventory, for good ! there's no undo,, and i can't give it back after :c",
      ].join('\n'),
    );
}

function confirmRow(nameKey: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`items:remove:${nameKey}`)
      .setLabel('delete it')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`items:keep:${nameKey}`)
      .setLabel('nevermind')
      .setStyle(ButtonStyle.Secondary),
  );
}

export async function handleItemComponents(
  interaction: ButtonInteraction,
): Promise<void> {
  const parts = interaction.customId.split(':');
  const action = parts[1] ?? '';
  const nameKey = parts.slice(2).join(':');

  if (!interaction.inCachedGuild()) return;
  if (action !== 'remove' && action !== 'keep') return;

  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: 'you need **manage server** to manage items !',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === 'keep') {
    const embed = serverEmbed(interaction.guild)
      .setTitle('phew !')
      .setDescription(`${inlineCode(nameKey)} is staying right where it is :3`);

    await interaction.update({ embeds: [embed], components: [] });
    return;
  }

  const item = getItem(interaction.guildId, nameKey);
  if (!item) {
    const embed = serverEmbed(interaction.guild)
      .setTitle('✦ already gone !')
      .setDescription(`${inlineCode(nameKey)} isn't here anymore...`);

    await interaction.update({ embeds: [embed], components: [] });
    return;
  }

  deleteItem(interaction.guildId, nameKey);

  const embed = serverEmbed(interaction.guild)
    .setTitle('✦ item deleted !')
    .setDescription(
      `deleted ${item.emoji ?? '📦'} **${item.name}** and removed it from everyone's inventories.`,
    );

  await interaction.update({ embeds: [embed], components: [] });
}

function itemsPage(guild: Guild, _userId: string, page: number) {
  const all = listItems(guild.id);

  if (all.length === 0) {
    const embed = serverEmbed(guild)
      .setTitle('✦ server items (0)')
      .setDescription(
        `no items yet. make one with ${inlineCode('/items add')} c:`,
      );

    return { embeds: [embed], components: [] };
  }

  const header = `꒰ server items ꒱ *${all.length} of them !*`;
  const hint = `⁀જ➣ look closer with ${inlineCode('/items info <name>')}`;

  const blocks = all.map((item) => {
    const traits = [
      item.useReply ? 'usable' : null,
      item.giftable ? 'giftable' : null,
    ].filter((trait) => trait !== null);

    const circulation = getCirculation(guild.id, item.name);
    const meta = [
      traits.length ? traits.join(' ━ ') : null,
      circulation > 0
        ? `${circulation.toLocaleString('en-US')} out there`
        : null,
    ].filter((part) => part !== null);

    const lines = [`${item.emoji ?? '📦'} **${item.name}**`];
    if (item.description) lines.push(`-# ✧ ${item.description}`);
    if (meta.length) lines.push(`-# ✧ ${meta.join(' ⊹ ')}`);
    return lines.join('\n');
  });

  const current = paginate(blocks, header, hint, page);
  const embed = serverEmbed(guild);
  const components = applyPage(embed, 'items', current);

  return { embeds: [embed], components };
}

registerPage('items', itemsPage);

export async function respondWithItemNames(
  interaction: AutocompleteInteraction,
): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused().toLowerCase();
  const choices = listItems(interaction.guildId)
    .filter((item) => item.nameKey.includes(focused))
    .slice(0, 25)
    .map((item) => ({ name: item.name, value: item.name }));

  await interaction.respond(choices);
}

export const items: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('items')
    .setDescription("this server's items ! browse, use, and gift them")
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('create a new item')
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('the item name')
            .setMaxLength(NAME_MAX)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('description')
            .setDescription('what is this thing?')
            .setMaxLength(DESCRIPTION_MAX)
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName('emoji')
            .setDescription('the emoji shown next to it')
            .setMaxLength(EMOJI_MAX)
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName('reply')
            .setDescription('what happens when someone uses it')
            .setMaxLength(REPLY_MAX)
            .setRequired(false),
        )
        .addRoleOption((o) =>
          o
            .setName('role')
            .setDescription('role given on use')
            .setRequired(false),
        )
        .addBooleanOption((o) =>
          o
            .setName('giftable')
            .setDescription('can this item be gifted?')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription('change an item')
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('the item to edit')
            .setMaxLength(NAME_MAX)
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName('description')
            .setDescription('the new description')
            .setMaxLength(DESCRIPTION_MAX)
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName('emoji')
            .setDescription('the new emoji')
            .setMaxLength(EMOJI_MAX)
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName('reply')
            .setDescription('the new use reply, blank clears it')
            .setMaxLength(REPLY_MAX)
            .setRequired(false),
        )
        .addRoleOption((o) =>
          o
            .setName('role')
            .setDescription('role given on use')
            .setRequired(false),
        )
        .addBooleanOption((o) =>
          o
            .setName('giftable')
            .setDescription('can this item be gifted?')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('delete an item')
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('the item to delete')
            .setMaxLength(NAME_MAX)
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('list every item in this server'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('info')
        .setDescription('show details about an item')
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('the item to look at')
            .setMaxLength(NAME_MAX)
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('use')
        .setDescription('use an item from your inventory !')
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('the item to use')
            .setMaxLength(NAME_MAX)
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('gift')
        .setDescription('gift an item to someone !')
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('the item to gift')
            .setMaxLength(NAME_MAX)
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addUserOption((o) =>
          o.setName('user').setDescription('who gets it').setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName('amount')
            .setDescription('how many')
            .setMinValue(1)
            .setRequired(false),
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

    if (
      ADMIN_SUBS.has(sub) &&
      !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)
    ) {
      await interaction.reply({
        content: 'you need **manage server** to manage items !',
      });
      return;
    }

    if (sub === 'add') {
      const name = interaction.options.getString('name', true);
      const description = interaction.options.getString('description');
      const emoji = interaction.options.getString('emoji');
      const reply = interaction.options.getString('reply');
      const role = interaction.options.getRole('role');
      const giftable = interaction.options.getBoolean('giftable') ?? true;

      let useReply = reply?.trim() || null;
      if (role) useReply = `${useReply ?? ''}{giverole:${role.id}}`;

      if (useReply) {
        const issues = itemReplyIssues(useReply);
        if (issues) {
          await interaction.reply({
            content: issues,
            allowedMentions: { parse: [] },
          });
          return;
        }
      }

      const created = createItem(
        guildId,
        name,
        description,
        emoji,
        useReply,
        giftable,
      );

      if (!created) {
        await interaction.reply({
          content: `an item called ${inlineCode(name)} already exists (or the name is empty). use ${inlineCode('/items edit')} to change it !`,
        });
        return;
      }

      const item = getItem(guildId, name)!;
      const embed = itemDetailEmbed(
        interaction.guild,
        '✦ item created !',
        item,
      );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'edit') {
      const name = interaction.options.getString('name', true);
      const description = interaction.options.getString('description');
      const emoji = interaction.options.getString('emoji');
      const reply = interaction.options.getString('reply');
      const role = interaction.options.getRole('role');
      const giftable = interaction.options.getBoolean('giftable');

      if (
        description === null &&
        emoji === null &&
        reply === null &&
        role === null &&
        giftable === null
      ) {
        await interaction.reply({
          content: 'give me something to change !! c:',
        });
        return;
      }

      const existing = getItem(guildId, name);
      if (!existing) {
        await interaction.reply({
          content: `there's no item called ${inlineCode(name)} !`,
        });
        return;
      }

      let useReply: string | null | undefined;
      if (reply !== null) useReply = reply.trim() || null;
      if (role) {
        const base = useReply === undefined ? existing.useReply : useReply;
        useReply = `${base ?? ''}{giverole:${role.id}}`;
      }

      if (typeof useReply === 'string') {
        const issues = itemReplyIssues(useReply);
        if (issues) {
          await interaction.reply({
            content: issues,
            allowedMentions: { parse: [] },
          });
          return;
        }
      }

      editItem(guildId, name, {
        description: description ?? undefined,
        emoji: emoji ?? undefined,
        useReply,
        giftable: giftable ?? undefined,
      });

      const updated = getItem(guildId, name)!;
      const embed = itemDetailEmbed(
        interaction.guild,
        '✦ item updated !',
        updated,
      );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'remove') {
      const name = interaction.options.getString('name', true);
      const item = getItem(guildId, name);

      if (!item) {
        await interaction.reply({
          content: `there's no item called ${inlineCode(name)} !`,
        });
        return;
      }

      await interaction.reply({
        embeds: [confirmEmbed(interaction.guild, item)],
        components: [confirmRow(item.nameKey)],
      });
      return;
    }

    if (sub === 'list') {
      await interaction.reply(
        itemsPage(interaction.guild, interaction.user.id, 0),
      );
      return;
    }

    if (sub === 'info') {
      const name = interaction.options.getString('name', true);
      const item = getItem(guildId, name);

      if (!item) {
        await interaction.reply({
          content: `there's no item called ${inlineCode(name)} !`,
        });
        return;
      }

      const all = listItems(guildId);
      const position = all.findIndex((i) => i.nameKey === item.nameKey) + 1;

      const embed = serverEmbed(interaction.guild)
        .setAuthor({
          name: `${interaction.guild.name} ⋆ item details`,
          iconURL: interaction.guild.iconURL({ size: 256 }) ?? undefined,
        })
        .setTitle(`${item.emoji ?? '📦'} ${item.name}`)
        .setDescription(
          item.description
            ? `> *${item.description}*`
            : '> *no description,,, scary*',
        )
        .addFields(
          {
            name: 'reply',
            value: item.useReply ? 'yes' : 'no',
            inline: true,
          },
          {
            name: 'giftable',
            value: item.giftable ? 'yes' : 'no',
            inline: true,
          },
          {
            name: 'gives role',
            value: rolesOnUse(item.useReply),
            inline: true,
          },
        )
        .setFooter({
          text: `item ${position} of ${all.length}`,
        })
        .setTimestamp(item.createdAt);

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'use') {
      const name = interaction.options.getString('name', true);
      const item = getItem(guildId, name);

      if (!item) {
        await interaction.reply({
          content: `there's no item called ${inlineCode(name)} !`,
        });
        return;
      }

      if (!item.useReply) {
        await interaction.reply({
          content: `${item.emoji ?? '📦'} **${item.name}** can't be used ! it's just for holding c:`,
        });
        return;
      }

      const channel = interaction.channel;
      if (!channel) {
        await interaction.reply({ content: "i can't see this channel !" });
        return;
      }

      const nodes: Node[] = [
        {
          kind: 'placeholder',
          name: 'modifyinv',
          args: [item.name, '-1'],
          captureName: null,
          raw: `{modifyinv:${item.name}|-1}`,
        },
        ...parse(item.useReply),
      ];

      const result = await evaluate(
        nodes,
        {
          member: interaction.member,
          guild: interaction.guild,
          channel,
        },
        `item:${item.nameKey}`,
      );

      if (!result.ok) {
        await interaction.reply({
          embeds: [failureEmbed(result.message)],
        });
        return;
      }

      const embed = userEmbed(interaction.user)
        .setTitle('✧･ﾟ item used !')
        .setDescription(`you use ${item.emoji ?? '📦'} **${item.name}** !`);
      await interaction.reply({ embeds: [embed] });

      await deliver(result.segments, result.actions, {
        member: interaction.member,
        channel,
      });
      return;
    }

    if (sub === 'gift') {
      const name = interaction.options.getString('name', true);
      const target = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount') ?? 1;

      if (target.bot) {
        await interaction.reply({
          content: "bots can't hold items ! they have no pockets :c",
        });
        return;
      }

      if (target.id === interaction.user.id) {
        await interaction.reply({
          content: "that's already yours, silly !!",
        });
        return;
      }

      const item = getItem(guildId, name);
      if (!item) {
        await interaction.reply({
          content: `there's no item called ${inlineCode(name)} !`,
        });
        return;
      }

      if (!item.giftable) {
        await interaction.reply({
          content: `${item.emoji ?? '📦'} **${item.name}** can't be gifted !`,
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
          content: `you don't have ${amount}× ${item.emoji ?? '📦'} **${item.name}** to give ! you only have ${result.quantity} !`,
        });
        return;
      }

      const embed = userEmbed(interaction.user)
        .setTitle('✧･ﾟ gift sent !')
        .setDescription(
          `${interaction.user} gave ${amount}× ${item.emoji ?? '📦'} **${item.name}** to ${target} !`,
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }
  },
};
