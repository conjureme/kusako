import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ChannelType,
  inlineCode,
  codeBlock,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildTextBasedChannel,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';

import type { SlashCommand } from '../client.js';
import {
  createTicketType,
  updateTicketType,
  deleteTicketType,
  getTicketType,
  listTicketTypes,
  countActiveTickets,
  getTicketCategories,
  isValidTicketKey,
  ticketKey,
  ticketOpenCustomId,
  ticketChannelName,
  TICKET_KEY_MAX,
  type TicketType,
  type TicketTypeInput,
} from '../services/tickets/store.js';
import {
  STYLE_IDS,
  resolveButtonStyle,
  isUsableEmoji,
} from '../services/buttons/registry.js';
import { templateDetailEmbed } from '../utils/templateEmbed.js';
import { commandMention } from '../utils/commandMentions.js';
import {
  ticketGreetingIssues,
  subjectlessTemplateIssues,
} from '../dsl/validate.js';
import { parse } from '../dsl/parser.js';
import { evaluate } from '../dsl/evaluate.js';
import { serverEmbed, NO_DMS } from '../utils/style.js';

const LABEL_MAX = 80;
const GREETING_MAX = 2000;
const PANEL_MAX = 2000;
const COOLDOWN_MAX_MINUTES = 1440;
const PANEL_SLOTS = 5;

const COLOR_CHOICES = STYLE_IDS.map((id) => ({ name: id, value: id }));

function roleOptions(
  sub: SlashCommandSubcommandBuilder,
  firstRequired: boolean,
): SlashCommandSubcommandBuilder {
  sub.addRoleOption((o) =>
    o
      .setName('role')
      .setDescription('who can see and answer these tickets')
      .setRequired(firstRequired),
  );

  for (const n of [2, 3]) {
    sub.addRoleOption((o) =>
      o
        .setName(`role${n}`)
        .setDescription('another role that can see these tickets')
        .setRequired(false),
    );
  }

  return sub;
}

function lookOptions(
  sub: SlashCommandSubcommandBuilder,
): SlashCommandSubcommandBuilder {
  return sub
    .addStringOption((o) =>
      o
        .setName('emoji')
        .setDescription('the emoji on the button')
        .setMaxLength(64)
        .setRequired(false),
    )
    .addStringOption((o) =>
      o
        .setName('color')
        .setDescription('the button color')
        .addChoices(...COLOR_CHOICES)
        .setRequired(false),
    )
    .addIntegerOption((o) =>
      o
        .setName('cooldown')
        .setDescription('minutes before someone can open another, 0 for none')
        .setMinValue(0)
        .setMaxValue(COOLDOWN_MAX_MINUTES)
        .setRequired(false),
    );
}

function readRoles(interaction: ChatInputCommandInteraction): string[] | null {
  const picked = ['role', 'role2', 'role3']
    .map((name) => interaction.options.getRole(name))
    .filter((role) => role !== null)
    .map((role) => role.id);

  if (picked.length === 0) return null;
  return [...new Set(picked)];
}

function readLook(
  interaction: ChatInputCommandInteraction,
): TicketTypeInput | string {
  const patch: TicketTypeInput = {};

  const emoji = interaction.options.getString('emoji');
  if (emoji !== null) {
    const trimmed = emoji.trim();
    if (trimmed.length > 0 && !isUsableEmoji(trimmed)) {
      return `${inlineCode(trimmed)} isn't an emoji i can put on a button !`;
    }
    patch.emoji = trimmed || null;
  }

  const color = interaction.options.getString('color');
  if (color !== null) patch.style = color;

  const cooldown = interaction.options.getInteger('cooldown');
  if (cooldown !== null) patch.cooldownSeconds = cooldown * 60;

  const roles = readRoles(interaction);
  if (roles !== null) patch.roleIds = roles;

  return patch;
}

function seenBy(guild: Guild, type: TicketType): string {
  if (type.roleIds.length === 0) return 'nobody but the person who opened it';

  return type.roleIds
    .map((id) => guild.roles.cache.get(id)?.toString() ?? `@${id}`)
    .join(' · ');
}

function typeDetailEmbed(guild: Guild, header: string, type: TicketType) {
  const look = [type.emoji, `**${type.label}**`, type.style ?? 'gray']
    .filter((part) => part !== null)
    .join(' · ');

  const notes = [
    `channels named: ${inlineCode(ticketChannelName(type.key, 1))}`,
  ];
  const { live, archive } = getTicketCategories(guild.id);
  if (!live) {
    notes.push(
      `set a category with ${commandMention('/settings set tickets')}`,
    );
  }
  if (!archive) {
    notes.push('no archive category set');
  }
  if (!type.greeting) {
    notes.push(
      `no first message yet... add one with ${commandMention('/tickets greeting')}`,
    );
  }

  return templateDetailEmbed(guild, header, type.greeting ?? '', {
    cooldown: false,
    fields: [
      { name: 'button', value: look, inline: true },
      { name: 'seen by', value: seenBy(guild, type), inline: true },
      {
        name: 'opens again after',
        value:
          type.cooldownSeconds > 0
            ? `${Math.round(type.cooldownSeconds / 60)} min`
            : 'no wait',
        inline: true,
      },
    ],
    notes,
  });
}

function noTypeEmbed(guild: Guild, key: string) {
  return serverEmbed(guild).setDescription(
    `## there's no ${inlineCode(key)} ticket type !\nmake one with ${commandMention('/tickets add')}, or check ${commandMention('/tickets list')}`,
  );
}

async function respondWithTypeKeys(
  interaction: AutocompleteInteraction,
): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused().toLowerCase();
  const choices = listTicketTypes(interaction.guildId)
    .filter((type) => type.key.includes(focused))
    .slice(0, 25)
    .map((type) => ({ name: `${type.key} · ${type.label}`, value: type.key }));

  await interaction.respond(choices);
}

function panelRows(types: TicketType[]): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>();

  for (const type of types) {
    const button = new ButtonBuilder()
      .setCustomId(ticketOpenCustomId(type.key))
      .setLabel(type.label)
      .setStyle(resolveButtonStyle(type.style));

    if (type.emoji && isUsableEmoji(type.emoji)) button.setEmoji(type.emoji);
    row.addComponents(button);
  }

  return [row];
}

async function runTypeAdd(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
): Promise<void> {
  const raw = interaction.options.getString('key', true);
  const key = ticketKey(raw);

  if (!isValidTicketKey(key)) {
    await interaction.reply({
      content: `${inlineCode(raw)} won't work as a key ! it becomes the channel name, so use lowercase letters, numbers, dashes or underscores, up to ${TICKET_KEY_MAX} characters`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const look = readLook(interaction);
  if (typeof look === 'string') {
    await interaction.reply({
      content: look,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const label = interaction.options.getString('label', true).trim();
  const made = createTicketType(guild.id, key, { ...look, label });

  if (!made) {
    await interaction.reply({
      content: `there's already a ${inlineCode(key)} ticket type ! edit it with ${commandMention('/tickets edit')}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const type = getTicketType(guild.id, key);
  if (!type) return;

  await interaction.reply({
    embeds: [typeDetailEmbed(guild, `made the ${key} ticket type !`, type)],
  });
}

async function runTypeEdit(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
): Promise<void> {
  const key = ticketKey(interaction.options.getString('key', true));
  if (!getTicketType(guild.id, key)) {
    await interaction.reply({ embeds: [noTypeEmbed(guild, key)] });
    return;
  }

  const look = readLook(interaction);
  if (typeof look === 'string') {
    await interaction.reply({
      content: look,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const label = interaction.options.getString('label');
  if (label !== null) look.label = label.trim();

  updateTicketType(guild.id, key, look);
  const type = getTicketType(guild.id, key);
  if (!type) return;

  await interaction.reply({
    embeds: [typeDetailEmbed(guild, `updated the ${key} ticket type !`, type)],
  });
}

async function runTypeGreeting(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
): Promise<void> {
  const key = ticketKey(interaction.options.getString('key', true));
  if (!getTicketType(guild.id, key)) {
    await interaction.reply({ embeds: [noTypeEmbed(guild, key)] });
    return;
  }

  const reply = interaction.options.getString('reply', true);
  const problems = ticketGreetingIssues(reply);
  if (problems) {
    await interaction.reply({
      content: problems,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  updateTicketType(guild.id, key, { greeting: reply });
  const type = getTicketType(guild.id, key);
  if (!type) return;

  await interaction.reply({
    embeds: [typeDetailEmbed(guild, `set the ${key} first message !`, type)],
  });
}

async function runTypeRemove(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
): Promise<void> {
  const key = ticketKey(interaction.options.getString('key', true));
  const type = getTicketType(guild.id, key);
  if (!type) {
    await interaction.reply({ embeds: [noTypeEmbed(guild, key)] });
    return;
  }

  const active = countActiveTickets(guild.id, key);
  if (active > 0) {
    await interaction.reply({
      content: `${inlineCode(key)} still has **${active}** ticket${active === 1 ? '' : 's'} open ! close them first, otherwise nobody but whoever opened them could close them after`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  deleteTicketType(guild.id, key);

  await interaction.reply({
    embeds: [
      serverEmbed(guild).setDescription(
        [
          `## removed the ${inlineCode(type.label)} ticket type !`,
          type.greeting ? codeBlock(type.greeting) : '',
          `-# panels carrying its button just do nothing now,, put it back with ${commandMention('/tickets add')}`,
        ]
          .filter((line) => line.length > 0)
          .join('\n'),
      ),
    ],
  });
}

async function runTypeList(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
): Promise<void> {
  const all = listTicketTypes(guild.id);

  if (all.length === 0) {
    await interaction.reply({
      embeds: [
        serverEmbed(guild)
          .setTitle('ticket types (0)')
          .setDescription(
            `none yet ! make one with ${commandMention('/tickets add')}, then put its button somewhere with ${commandMention('/tickets panel')}`,
          ),
      ],
    });
    return;
  }

  const { live, archive } = getTicketCategories(guild.id);
  const blocks = all.map((type) => {
    const bits = [
      `${type.roleIds.length} role${type.roleIds.length === 1 ? '' : 's'}`,
      type.greeting ? 'has a first message' : 'no first message yet',
      type.cooldownSeconds > 0
        ? `${Math.round(type.cooldownSeconds / 60)} min wait`
        : null,
    ].filter((bit) => bit !== null);

    return `ᯓ➤ **${type.key}** · ${type.label}\n-# ✧ ${bits.join(' ━ ')}`;
  });

  const where = [
    live ? `tickets open in <#${live}>` : 'no tickets category set',
    archive ? `closed ones move to <#${archive}>` : 'no archive category set',
  ].join(' ━ ');

  await interaction.reply({
    embeds: [
      serverEmbed(guild).setDescription(
        [
          `꒰ ticket types ꒱ *${all.length} of them !*`,
          '',
          blocks.join('\n\n'),
          '',
          `⁀જ➣ ${where}`,
        ].join('\n'),
      ),
    ],
  });
}

async function runTypeShow(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
): Promise<void> {
  const key = ticketKey(interaction.options.getString('key', true));
  const type = getTicketType(guild.id, key);

  if (!type) {
    await interaction.reply({ embeds: [noTypeEmbed(guild, key)] });
    return;
  }

  await interaction.reply({ embeds: [typeDetailEmbed(guild, key, type)] });
}

async function runPanel(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
): Promise<void> {
  const picked: TicketType[] = [];
  const missing: string[] = [];

  for (let n = 1; n <= PANEL_SLOTS; n += 1) {
    const raw = interaction.options.getString(n === 1 ? 'type' : `type${n}`);
    if (raw === null) continue;

    const type = getTicketType(guild.id, raw);
    if (!type) missing.push(ticketKey(raw));
    else if (!picked.some((p) => p.key === type.key)) picked.push(type);
  }

  if (missing.length > 0) {
    await interaction.reply({
      content: `i don't have a ticket type called ${missing.map((key) => inlineCode(key)).join(' or ')} !`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const message = interaction.options.getString('message', true);
  const problems = subjectlessTemplateIssues(message);
  if (problems) {
    await interaction.reply({
      content: problems,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const target = (interaction.options.getChannel('channel') ??
    interaction.channel) as GuildTextBasedChannel | null;
  if (!target?.isTextBased()) {
    await interaction.reply({
      content: 'i can only put a panel in a text channel !',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const result = await evaluate(
    parse(message),
    { guild, channel: target },
    'ticket:panel',
  );
  if (!result.ok) {
    await interaction.reply({
      content: result.message,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (result.segments.length > 1) {
    await interaction.reply({
      content:
        "a panel is one message, so {split} and {delay} can't go in it ! take them out and the buttons will all sit together",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const segment = result.segments[0];
  await target.send({
    content: segment?.content || undefined,
    embeds: segment?.embeds ?? [],
    components: panelRows(picked),
    allowedMentions: { parse: [] },
  });

  await interaction.reply({
    content: `panel is up in ${target.toString()} !`,
    flags: MessageFlags.Ephemeral,
  });
}

export const tickets: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('tickets')
    .setDescription('private channels people can open for help or reports')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      lookOptions(
        roleOptions(
          sub
            .setName('add')
            .setDescription('make a kind of ticket')
            .addStringOption((o) =>
              o
                .setName('key')
                .setDescription('short name, also the channel prefix')
                .setMaxLength(TICKET_KEY_MAX)
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName('label')
                .setDescription('the words on the button')
                .setMaxLength(LABEL_MAX)
                .setRequired(true),
            ),
          true,
        ),
      ),
    )
    .addSubcommand((sub) =>
      lookOptions(
        roleOptions(
          sub
            .setName('edit')
            .setDescription('change a ticket type, only what you pass')
            .addStringOption((o) =>
              o
                .setName('key')
                .setDescription('which one')
                .setAutocomplete(true)
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName('label')
                .setDescription('the words on the button')
                .setMaxLength(LABEL_MAX)
                .setRequired(false),
            ),
          false,
        ),
      ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('greeting')
        .setDescription('the first message sako posts in a new ticket')
        .addStringOption((o) =>
          o
            .setName('key')
            .setDescription('which one')
            .setAutocomplete(true)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('reply')
            .setDescription('the message, full dsl')
            .setMaxLength(GREETING_MAX)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('delete a ticket type')
        .addStringOption((o) =>
          o
            .setName('key')
            .setDescription('which one')
            .setAutocomplete(true)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('every ticket type you have'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription('one ticket type up close')
        .addStringOption((o) =>
          o
            .setName('key')
            .setDescription('which one')
            .setAutocomplete(true)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) => {
      sub
        .setName('panel')
        .setDescription('post the message people click to open a ticket')
        .addStringOption((o) =>
          o
            .setName('message')
            .setDescription('what the panel says, full dsl')
            .setMaxLength(PANEL_MAX)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('type')
            .setDescription('the first button')
            .setAutocomplete(true)
            .setRequired(true),
        );

      for (let n = 2; n <= PANEL_SLOTS; n += 1) {
        sub.addStringOption((o) =>
          o
            .setName(`type${n}`)
            .setDescription('another button')
            .setAutocomplete(true)
            .setRequired(false),
        );
      }

      return sub.addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('where it goes, blank uses this channel')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(false),
      );
    }) as SlashCommandBuilder,

  async autocomplete(interaction) {
    await respondWithTypeKeys(interaction);
  },

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: NO_DMS,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { guild } = interaction;
    const sub = interaction.options.getSubcommand();

    if (sub === 'panel') await runPanel(interaction, guild);
    else if (sub === 'add') await runTypeAdd(interaction, guild);
    else if (sub === 'edit') await runTypeEdit(interaction, guild);
    else if (sub === 'greeting') await runTypeGreeting(interaction, guild);
    else if (sub === 'remove') await runTypeRemove(interaction, guild);
    else if (sub === 'list') await runTypeList(interaction, guild);
    else if (sub === 'show') await runTypeShow(interaction, guild);
  },
};
