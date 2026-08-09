import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  inlineCode,
  type APIEmbed,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type Guild,
} from 'discord.js';

import type { SlashCommand } from '../client.js';
import {
  getEmbed,
  listEmbeds,
  createEmbed,
  updateEmbed,
  upsertEmbed,
  deleteEmbed,
  validateEmbedData,
  parseEmbedJson,
  parseColor,
  isRenderable,
  EMBED_LIMITS,
  URLISH,
  type EmbedData,
  type EmbedRecord,
} from '../services/embeds/store.js';
import { colors, serverEmbed, NO_DMS } from '../utils/style.js';
import { listAllTemplates } from '../services/templates.js';
import { listItems } from '../services/items/store.js';
import { parse } from '../dsl/parser.js';
import type { PlaceholderNode } from '../dsl/ast.js';
import { paginate, applyPage } from '../utils/pagination.js';
import { registerPage } from '../services/pageRegistry.js';

const NAME_MAX = 50;
const JSON_MAX = 6000;
const MODAL_INPUT_MAX = 4000;

interface FieldSpec {
  id: string;
  label: string;
  style: TextInputStyle;
  max: number;
  read(data: EmbedData): string | undefined;
  write(data: EmbedData, value: string | undefined): void;
}

const sections: Record<string, { label: string; fields: FieldSpec[] }> = {
  text: {
    label: 'text',
    fields: [
      {
        id: 'title',
        label: 'title',
        style: TextInputStyle.Short,
        max: EMBED_LIMITS.title,
        read: (data) => data.title,
        write: (data, value) => {
          if (value) data.title = value;
          else delete data.title;
        },
      },
      {
        id: 'description',
        label: 'description',
        style: TextInputStyle.Paragraph,
        max: MODAL_INPUT_MAX,
        read: (data) => data.description,
        write: (data, value) => {
          if (value) data.description = value;
          else delete data.description;
        },
      },
      {
        id: 'url',
        label: 'title link url',
        style: TextInputStyle.Short,
        max: EMBED_LIMITS.url,
        read: (data) => data.url,
        write: (data, value) => {
          if (value) data.url = value;
          else delete data.url;
        },
      },
    ],
  },
  author: {
    label: 'author',
    fields: [
      {
        id: 'name',
        label: 'author name',
        style: TextInputStyle.Short,
        max: EMBED_LIMITS.authorName,
        read: (data) => data.author?.name,
        write: (data, value) => {
          if (value) data.author = { ...data.author, name: value };
          else delete data.author;
        },
      },
      {
        id: 'icon',
        label: 'author icon url',
        style: TextInputStyle.Short,
        max: EMBED_LIMITS.url,
        read: (data) => data.author?.icon_url,
        write: (data, value) => {
          if (!data.author) return;
          if (value) data.author.icon_url = value;
          else delete data.author.icon_url;
        },
      },
      {
        id: 'link',
        label: 'author link url',
        style: TextInputStyle.Short,
        max: EMBED_LIMITS.url,
        read: (data) => data.author?.url,
        write: (data, value) => {
          if (!data.author) return;
          if (value) data.author.url = value;
          else delete data.author.url;
        },
      },
    ],
  },
  footer: {
    label: 'footer',
    fields: [
      {
        id: 'text',
        label: 'footer text',
        style: TextInputStyle.Paragraph,
        max: EMBED_LIMITS.footerText,
        read: (data) => data.footer?.text,
        write: (data, value) => {
          if (value) data.footer = { ...data.footer, text: value };
          else delete data.footer;
        },
      },
      {
        id: 'icon',
        label: 'footer icon url',
        style: TextInputStyle.Short,
        max: EMBED_LIMITS.url,
        read: (data) => data.footer?.icon_url,
        write: (data, value) => {
          if (!data.footer) return;
          if (value) data.footer.icon_url = value;
          else delete data.footer.icon_url;
        },
      },
    ],
  },
  images: {
    label: 'images',
    fields: [
      {
        id: 'image',
        label: 'big image url',
        style: TextInputStyle.Short,
        max: EMBED_LIMITS.url,
        read: (data) => data.image?.url,
        write: (data, value) => {
          if (value) data.image = { url: value };
          else delete data.image;
        },
      },
      {
        id: 'thumbnail',
        label: 'thumbnail url',
        style: TextInputStyle.Short,
        max: EMBED_LIMITS.url,
        read: (data) => data.thumbnail?.url,
        write: (data, value) => {
          if (value) data.thumbnail = { url: value };
          else delete data.thumbnail;
        },
      },
    ],
  },
};

function previewOf(data: EmbedData): { embed: APIEmbed; hidden: string[] } {
  const hidden: string[] = [];
  const embed = structuredClone(data) as APIEmbed;

  const check = (
    label: string,
    value: string | undefined,
    remove: () => void,
  ) => {
    if (value !== undefined && !URLISH.test(value)) {
      hidden.push(label);
      remove();
    }
  };

  check('title link', embed.url, () => delete embed.url);
  check(
    'author icon',
    embed.author?.icon_url,
    () => delete embed.author?.icon_url,
  );
  check('author link', embed.author?.url, () => delete embed.author?.url);
  check(
    'footer icon',
    embed.footer?.icon_url,
    () => delete embed.footer?.icon_url,
  );
  check('image', embed.image?.url, () => delete embed.image);
  check('thumbnail', embed.thumbnail?.url, () => delete embed.thumbnail);

  if (!isRenderable(embed as EmbedData)) {
    return {
      embed: {
        description:
          '( this embed is empty ! use the buttons below to build it c: )',
        color: colors.cream,
      },
      hidden,
    };
  }

  return { embed, hidden };
}

interface EmbedUsage {
  users: string[];
  dynamic: number;
}

function usageIndex(guildId: string): Map<string, EmbedUsage> {
  const index = new Map<string, EmbedUsage>();
  let dynamic = 0;

  for (const source of listAllTemplates(guildId)) {
    const names = parse(source.response)
      .filter(
        (node): node is PlaceholderNode =>
          node.kind === 'placeholder' && node.name === 'embed',
      )
      .map((node) => (node.args[0] ?? '').trim())
      .filter((arg) => arg !== '');

    for (const name of names) {
      if (name.startsWith('#')) continue;
      if (name.includes('[')) {
        dynamic += 1;
        continue;
      }

      const nameKey = name.toLowerCase();
      const entry = index.get(nameKey) ?? { users: [], dynamic: 0 };
      if (!entry.users.includes(source.label)) entry.users.push(source.label);
      index.set(nameKey, entry);
    }
  }

  if (dynamic > 0) {
    for (const entry of index.values()) entry.dynamic = dynamic;
    if (index.size === 0) index.set('', { users: [], dynamic });
  }

  return index;
}

function structureOf(data: EmbedData): string[] {
  const parts: string[] = [];
  if (data.title) parts.push('title');
  if (data.description) parts.push('description');
  if (data.author) parts.push('author');
  if (data.footer) parts.push('footer');
  if (data.image) parts.push('image');
  if (data.thumbnail) parts.push('thumbnail');
  if (data.fields?.length) {
    parts.push(
      data.fields.length === 1 ? '1 field' : `${data.fields.length} fields`,
    );
  }
  if (data.color !== undefined) parts.push('custom color');
  return parts;
}

function usageLine(usage: EmbedUsage | undefined): string {
  if (!usage || usage.users.length === 0) return 'not used anywhere yet';

  const shown = usage.users.slice(0, 3).join(' ━ ');
  const extra =
    usage.users.length > 3 ? ` +${usage.users.length - 3} more` : '';
  return `used by ${shown}${extra}`;
}

function embedsPage(guild: Guild, _userId: string, page: number) {
  const all = listEmbeds(guild.id);

  if (all.length === 0) {
    const embed = serverEmbed(guild)
      .setTitle('no embeds yet !')
      .setDescription(
        `nothing saved here,, make your first one with ${inlineCode('/embeds add')} c:`,
      );

    return { embeds: [embed], components: [] };
  }

  const usage = usageIndex(guild.id);
  const header = `꒰ saved embeds ꒱ *${all.length} of them !*`;
  const hint = `⁀જ➣ preview one with ${inlineCode('/embeds show <name>')}`;

  const blocks = all.map((record) => {
    const structure = structureOf(record.data);
    return [
      `ᯓ➤ **${record.name}**`,
      structure.length
        ? `-# ✧ ${structure.join(' ━ ')}`
        : '-# ✧ still empty,, nothing in it yet',
      `-# ✧ ${usageLine(usage.get(record.nameKey))}`,
    ].join('\n');
  });

  const dynamic = [...usage.values()].reduce(
    (max, entry) => Math.max(max, entry.dynamic),
    0,
  );

  const current = paginate(blocks, header, hint, page);
  const embed = serverEmbed(guild);
  const components = applyPage(
    embed,
    'embeds',
    current,
    dynamic ? `${dynamic} more picked by a capture at send time` : undefined,
  );

  return { embeds: [embed], components };
}

registerPage('embeds', embedsPage);

function confirmRow(nameKey: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`embeds:confirmremove:${nameKey}`)
      .setLabel('delete it')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`embeds:keep:${nameKey}`)
      .setLabel('nevermind')
      .setStyle(ButtonStyle.Secondary),
  );
}

function buttonRows(nameKey: string): ActionRowBuilder<ButtonBuilder>[] {
  const section = (id: string, label: string) =>
    new ButtonBuilder()
      .setCustomId(`embeds:${id}:${nameKey}`)
      .setLabel(label)
      .setStyle(ButtonStyle.Secondary);

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      section('text', 'text'),
      section('author', 'author'),
      section('footer', 'footer'),
      section('images', 'images'),
      section('color', 'color'),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`embeds:import:${nameKey}`)
        .setLabel('import json')
        .setStyle(ButtonStyle.Primary),
    ),
  ];
}

function panelPayload(record: EmbedRecord) {
  const { embed, hidden } = previewOf(record.data);
  const note =
    hidden.length > 0
      ? `\n-# ${hidden.join(', ')} hidden in preview,, placeholder urls resolve when it sends !`
      : '';

  return {
    content: `✦ editing the ${inlineCode(record.name)} embed ! the preview updates as you go${note}`,
    embeds: [embed],
    components: buttonRows(record.nameKey),
  };
}

function sectionModal(sectionId: string, record: EmbedRecord): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`embeds:${sectionId}:${record.nameKey}`)
    .setTitle(`edit ${sectionId}`);

  if (sectionId === 'color') {
    const input = new TextInputBuilder()
      .setCustomId('color')
      .setLabel('hex color (blank to clear)')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(10)
      .setRequired(false);
    if (record.data.color !== undefined) {
      input.setValue(`#${record.data.color.toString(16).padStart(6, '0')}`);
    }
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(input),
    );
    return modal;
  }

  if (sectionId === 'import') {
    const input = new TextInputBuilder()
      .setCustomId('json')
      .setLabel('embed json (replaces everything !)')
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(MODAL_INPUT_MAX)
      .setRequired(true);
    const current = JSON.stringify(record.data);
    if (current !== '{}' && current.length <= MODAL_INPUT_MAX) {
      input.setValue(current);
    }
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(input),
    );
    return modal;
  }

  for (const field of sections[sectionId]!.fields) {
    const input = new TextInputBuilder()
      .setCustomId(field.id)
      .setLabel(field.label)
      .setStyle(field.style)
      .setMaxLength(field.max)
      .setRequired(false);
    const value = field.read(record.data);
    if (value) input.setValue(value.slice(0, field.max));
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(input),
    );
  }
  return modal;
}

export async function handleEmbedComponents(
  interaction: ButtonInteraction | ModalSubmitInteraction,
): Promise<void> {
  const parts = interaction.customId.split(':');
  const sectionId = parts[1] ?? '';
  const nameKey = parts.slice(2).join(':');

  if (!interaction.inCachedGuild()) return;

  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: 'you need **manage server** to edit embeds !',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sectionId === 'keep' || sectionId === 'confirmremove') {
    if (!interaction.isButton()) return;

    if (sectionId === 'keep') {
      const embed = serverEmbed(interaction.guild)
        .setTitle('phew !')
        .setDescription(
          `${inlineCode(nameKey)} is staying right where it is :3`,
        );

      await interaction.update({ embeds: [embed], components: [] });
      return;
    }

    const existing = getEmbed(interaction.guildId, nameKey);
    const embed = serverEmbed(interaction.guild);

    if (!existing) {
      embed
        .setTitle('✦ already gone !')
        .setDescription(`${inlineCode(nameKey)} isn't here anymore...`);
    } else {
      deleteEmbed(interaction.guildId, nameKey);
      embed
        .setTitle('✦ embed deleted !')
        .setDescription(`deleted the ${inlineCode(existing.name)} embed.`);
    }

    await interaction.update({ embeds: [embed], components: [] });
    return;
  }

  const record = getEmbed(interaction.guildId, nameKey);
  if (!record) {
    await interaction.reply({
      content: "this embed doesn't exist anymore...",
    });
    return;
  }

  const isKnownSection =
    sectionId === 'color' || sectionId === 'import' || sectionId in sections;
  if (!isKnownSection) return;

  if (interaction.isButton()) {
    await interaction.showModal(sectionModal(sectionId, record));
    return;
  }

  let data = structuredClone(record.data);

  if (sectionId === 'color') {
    const raw = interaction.fields.getTextInputValue('color').trim();
    if (raw.length === 0) {
      delete data.color;
    } else {
      const color = parseColor(raw);
      if (color === null) {
        await interaction.reply({
          content:
            "that doesn't look like a hex color ! try something like #faf0e7",
        });
        return;
      }
      data.color = color;
    }
  } else if (sectionId === 'import') {
    const parsed = parseEmbedJson(interaction.fields.getTextInputValue('json'));
    if (!parsed.ok) {
      await interaction.reply({
        content: `hmm, that json has some problems !!\n${parsed.errors.map((e) => `• ${e}`).join('\n')}`,
      });
      return;
    }
    data = parsed.data;
  } else {
    for (const field of sections[sectionId]!.fields) {
      const value = interaction.fields.getTextInputValue(field.id).trim();
      field.write(data, value.length > 0 ? value : undefined);
    }
  }

  const validation = validateEmbedData(data);
  if (!validation.ok) {
    await interaction.reply({
      content: `hmm, that embed has some problems !!\n${validation.errors.map((e) => `• ${e}`).join('\n')}`,
    });
    return;
  }

  updateEmbed(interaction.guildId, record.name, validation.data);
  const updated = getEmbed(interaction.guildId, record.name)!;

  if (interaction.isFromMessage()) {
    await interaction.update(panelPayload(updated));
  } else {
    await interaction.reply({
      content: `updated the ${inlineCode(updated.name)} embed c:`,
    });
  }
}

export async function respondWithEmbedNames(
  interaction: AutocompleteInteraction,
): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused().toLowerCase();
  const choices = listEmbeds(interaction.guildId)
    .filter((record) => record.nameKey.includes(focused))
    .slice(0, 25)
    .map((record) => ({ name: record.name, value: record.name }));

  await interaction.respond(choices);
}

export const embeds: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('embeds')
    .setDescription("manage this server's saved embeds")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('create a new embed and open the builder')
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('the embed name')
            .setMaxLength(NAME_MAX)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription('open the builder for an existing embed')
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('the embed to edit')
            .setMaxLength(NAME_MAX)
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('import')
        .setDescription('create or replace an embed from json')
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('the embed name to import into')
            .setMaxLength(NAME_MAX)
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName('json')
            .setDescription('the embed json')
            .setMaxLength(JSON_MAX)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('list every saved embed in this server'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription('preview a saved embed')
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('the embed to show')
            .setMaxLength(NAME_MAX)
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('delete a saved embed')
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('the embed to delete')
            .setMaxLength(NAME_MAX)
            .setRequired(true)
            .setAutocomplete(true),
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

    if (sub === 'add') {
      const name = interaction.options.getString('name', true);
      const created = createEmbed(guildId, name, {});

      if (!created) {
        await interaction.reply({
          content: `an embed named ${inlineCode(name)} already exists. use ${inlineCode('/embeds edit')} to change it.`,
        });
        return;
      }

      const record = getEmbed(guildId, name)!;
      await interaction.reply({
        ...panelPayload(record),
      });
      return;
    }

    if (sub === 'edit') {
      const name = interaction.options.getString('name', true);
      const record = getEmbed(guildId, name);

      if (!record) {
        await interaction.reply({
          content: `no embed named ${inlineCode(name)} exists yet. use ${inlineCode('/embeds add')} to make one.`,
        });
        return;
      }

      await interaction.reply({
        ...panelPayload(record),
      });
      return;
    }

    if (sub === 'import') {
      const name = interaction.options.getString('name', true);
      const parsed = parseEmbedJson(
        interaction.options.getString('json', true),
      );

      if (!parsed.ok) {
        await interaction.reply({
          content: `hmm, that json has some problems !!\n${parsed.errors.map((e) => `• ${e}`).join('\n')}`,
        });
        return;
      }

      const outcome = upsertEmbed(guildId, name, parsed.data);
      const record = getEmbed(guildId, name)!;

      await interaction.reply({
        ...panelPayload(record),
        content: `${outcome === 'created' ? 'imported' : 'replaced'} the ${inlineCode(record.name)} embed c: keep tweaking below !`,
      });
      return;
    }

    if (sub === 'list') {
      await interaction.reply(
        embedsPage(interaction.guild, interaction.user.id, 0),
      );
      return;
    }

    if (sub === 'show') {
      const name = interaction.options.getString('name', true);
      const record = getEmbed(guildId, name);

      if (!record) {
        await interaction.reply({
          content: `no embed named ${inlineCode(name)} ! see them all with ${inlineCode('/embeds list')}`,
        });
        return;
      }

      const { embed, hidden } = previewOf(record.data);
      await interaction.reply({
        content:
          hidden.length > 0
            ? `-# ${hidden.join(', ')} hidden in preview,, placeholder urls resolve when it sends !`
            : undefined,
        embeds: [embed],
      });
      return;
    }

    if (sub === 'remove') {
      const name = interaction.options.getString('name', true);
      const record = getEmbed(guildId, name);

      if (!record) {
        await interaction.reply({
          content: `no embed named ${inlineCode(name)} ! see them all with ${inlineCode('/embeds list')}`,
        });
        return;
      }

      const usage = usageIndex(guildId).get(record.nameKey);
      const stakes =
        usage && usage.users.length > 0
          ? `-# ✧ ${usageLine(usage)},, those will show the tag as plain text instead`
          : '-# ✧ nothing references it right now';

      const embed = serverEmbed(interaction.guild)
        .setTitle('✦ delete this embed ?')
        .setDescription(
          [
            `ᯓ➤ **${record.name}**`,
            stakes,
            '',
            "there's no undo,, you'd have to build it again from scratch :c",
          ].join('\n'),
        );

      await interaction.reply({
        embeds: [embed],
        components: [confirmRow(record.nameKey)],
      });
      return;
    }
  },

  async autocomplete(interaction) {
    await respondWithEmbedNames(interaction);
  },
};
