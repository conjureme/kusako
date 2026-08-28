import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  inlineCode,
  codeBlock,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';

import type { SlashCommand } from '../client.js';
import {
  getButtonResponder,
  addButtonResponder,
  editButtonResponder,
  removeButtonResponder,
  listButtonResponders,
  parseButtonCustomId,
  type ButtonLook,
  type ButtonResponder,
} from '../services/buttons/store.js';
import {
  BUTTON_LIMITS,
  LIMIT_IDS,
  STYLE_IDS,
  getButtonLimit,
  isUsableEmoji,
} from '../services/buttons/registry.js';
import { templateTraits, templateDetailEmbed } from '../utils/templateEmbed.js';
import { fireButtonResponder } from '../services/buttons/fire.js';
import { commandMention } from '../utils/commandMentions.js';
import { templateIssues } from '../dsl/validate.js';
import { serverEmbed, NO_DMS } from '../utils/style.js';
import { paginate, applyPage } from '../utils/pagination.js';
import { registerPage } from '../services/pageRegistry.js';

const NAME_MAX = 50;
const REPLY_MAX = 2000;

function confirmRow(nameKey: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`buttonresponders:remove:${nameKey}`)
      .setLabel('delete it')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`buttonresponders:keep:${nameKey}`)
      .setLabel('nevermind')
      .setStyle(ButtonStyle.Secondary),
  );
}

export async function handleButtonResponderComponents(
  interaction: ButtonInteraction,
): Promise<void> {
  if (parseButtonCustomId(interaction.customId) !== null) {
    await fireButtonResponder(interaction);
    return;
  }

  const parts = interaction.customId.split(':');
  const action = parts[1] ?? '';
  const nameKey = parts.slice(2).join(':');

  if (!interaction.inCachedGuild()) return;
  if (action !== 'remove' && action !== 'keep') return;

  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: 'you need **manage server** to manage button responders !',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === 'keep') {
    await interaction.update({
      embeds: [
        serverEmbed(interaction.guild)
          .setTitle('phew !')
          .setDescription(`${inlineCode(nameKey)} is staying put :3`),
      ],
      components: [],
    });
    return;
  }

  const doomed = getButtonResponder(interaction.guildId, nameKey);
  const gone = !removeButtonResponder(interaction.guildId, nameKey);
  const embed = serverEmbed(interaction.guild).setDescription(
    gone || !doomed
      ? `## already gone !\n${inlineCode(nameKey)} isn't here anymore...`
      : [
          `## deleted the ${inlineCode(doomed.name)} button !`,
          codeBlock(doomed.response),
          `-# old messages carrying it just do nothing now,, put it back with ${commandMention('/buttonresponders add')}`,
        ].join('\n'),
  );

  await interaction.update({ embeds: [embed], components: [] });
}

const NO_LIMIT = 'none';

const COLOR_CHOICES = STYLE_IDS.map((id) => ({ name: id, value: id }));
const LIMIT_CHOICES = [
  { name: 'no limit', value: NO_LIMIT },
  ...LIMIT_IDS.map((id) => ({ name: BUTTON_LIMITS[id]!.label, value: id })),
];

function lookOptions(
  sub: SlashCommandSubcommandBuilder,
): SlashCommandSubcommandBuilder {
  return sub
    .addStringOption((o) =>
      o
        .setName('label')
        .setDescription('the words on the button, blank uses the name')
        .setMaxLength(80)
        .setRequired(false),
    )
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
    .addStringOption((o) =>
      o
        .setName('limit')
        .setDescription('how many times it can be clicked')
        .addChoices(...LIMIT_CHOICES)
        .setRequired(false),
    )
    .addBooleanOption((o) =>
      o
        .setName('invokeronly')
        .setDescription('only whoever triggered the message can click it')
        .setRequired(false),
    );
}

function readLook(interaction: ChatInputCommandInteraction): ButtonLook {
  const look: ButtonLook = {};

  const label = interaction.options.getString('label');
  if (label !== null) look.label = label.trim() || null;

  const emoji = interaction.options.getString('emoji');
  if (emoji !== null) look.emoji = emoji.trim() || null;

  const color = interaction.options.getString('color');
  if (color !== null) look.style = color;

  const limit = interaction.options.getString('limit');
  if (limit !== null) look.limitMode = limit === NO_LIMIT ? null : limit;

  const invokerOnly = interaction.options.getBoolean('invokeronly');
  if (invokerOnly !== null) look.invokerOnly = invokerOnly;

  return look;
}

function lookFields(name: string, look: ButtonResponder | ButtonLook) {
  const preview = [
    look.emoji ?? null,
    `**${look.label?.trim() || name}**`,
    look.style ?? 'gray',
  ].filter((part) => part !== null);

  const limit = getButtonLimit(look.limitMode ?? null);
  const limits = [
    limit ? limit.blurb : null,
    look.invokerOnly ? 'only whoever triggered the message' : null,
  ].filter((part) => part !== null);

  const fields = [
    { name: 'looks like', value: preview.join(' · '), inline: true },
  ];
  if (limits.length > 0) {
    fields.push({ name: 'limits', value: limits.join(' · '), inline: true });
  }

  return fields;
}

function buttonDetailEmbed(
  guild: Guild,
  header: string,
  name: string,
  response: string,
  look: ButtonResponder | ButtonLook,
  notes: string[] = [],
) {
  const extra = [...notes];
  if (getButtonLimit(look.limitMode ?? null)?.perButton === false) {
    extra.push(
      'the "any button here" limits only cover buttons that carry the same setting, so put it on every button in the group !',
    );
  }

  return templateDetailEmbed(guild, header, response, {
    fields: lookFields(name, look),
    notes: [
      ...extra,
      `attach it to a reply with ${inlineCode(`{button:${name}}`)} !`,
    ],
  });
}

function noButtonEmbed(guild: Guild, name: string) {
  return serverEmbed(guild).setDescription(
    `## there's no ${inlineCode(name)} button !\nmake one with ${commandMention('/buttonresponders add')}, or check ${commandMention('/buttonresponders list')} for the ones you have`,
  );
}

function brPage(guild: Guild, _userId: string, page: number) {
  const all = listButtonResponders(guild.id);

  if (all.length === 0) {
    const embed = serverEmbed(guild)
      .setTitle('✦ button responders (0)')
      .setDescription(
        `none here yet... make one with ${commandMention('/buttonresponders add')}, then drop ${inlineCode('{button:name}')} in any reply !!`,
      );

    return { embeds: [embed], components: [] };
  }

  const header = `꒰ button responders ꒱ *${all.length} of them !*`;
  const hint = `⁀જ➣ attach one with ${inlineCode('{button:name}')} in any reply`;

  const blocks = all.map(({ name, response }) => {
    const { badges } = templateTraits(response);
    const summary = badges.length > 0 ? badges.join(' · ') : 'just a message';
    return `ᯓ➤ **${name}**\n-# ✧ ${summary}`;
  });

  const current = paginate(blocks, header, hint, page);
  const embed = serverEmbed(guild);
  const components = applyPage(embed, 'buttonresponders', current);

  return { embeds: [embed], components };
}

registerPage('buttonresponders', brPage);

async function respondWithButtonNames(
  interaction: AutocompleteInteraction,
): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused().toLowerCase();
  const choices = listButtonResponders(interaction.guildId)
    .filter((responder) => responder.nameKey.includes(focused))
    .slice(0, 25)
    .map((responder) => ({ name: responder.name, value: responder.name }));

  await interaction.respond(choices);
}

export const buttonresponders: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('buttonresponders')
    .setDescription('replies that fire when someone clicks a button')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .setDMPermission(false)
    .addSubcommand((sub) =>
      lookOptions(
        sub
          .setName('add')
          .setDescription('make a button responder')
          .addStringOption((o) =>
            o
              .setName('name')
              .setDescription('the button name (its id)')
              .setMaxLength(NAME_MAX)
              .setRequired(true),
          )
          .addStringOption((o) =>
            o
              .setName('reply')
              .setDescription('what sako replies with on click')
              .setMaxLength(REPLY_MAX)
              .setRequired(true),
          ),
      ),
    )
    .addSubcommand((sub) =>
      lookOptions(
        sub
          .setName('edit')
          .setDescription('change a button responder')
          .addStringOption((o) =>
            o
              .setName('name')
              .setDescription('the button to edit')
              .setMaxLength(NAME_MAX)
              .setRequired(true)
              .setAutocomplete(true),
          )
          .addStringOption((o) =>
            o
              .setName('reply')
              .setDescription('the new reply')
              .setMaxLength(REPLY_MAX)
              .setRequired(false),
          ),
      ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('delete a button responder')
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('the button to delete')
            .setMaxLength(NAME_MAX)
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription('peek at a button responder')
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('the button to show')
            .setMaxLength(NAME_MAX)
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('all your button responders'),
    ) as SlashCommandBuilder,

  async autocomplete(interaction) {
    await respondWithButtonNames(interaction);
  },

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: NO_DMS });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'list') {
      await interaction.reply(
        brPage(interaction.guild, interaction.user.id, 0),
      );
      return;
    }

    const name = interaction.options.getString('name', true);

    const look = readLook(interaction);
    if (
      look.emoji !== undefined &&
      look.emoji !== null &&
      !isUsableEmoji(look.emoji)
    ) {
      await interaction.reply({
        content: `${inlineCode(look.emoji)} isn't an emoji i can put on a button! use a real emoji, or one of this server's like ${inlineCode('<:name:id>')}`,
      });
      return;
    }

    if (sub === 'add') {
      const reply = interaction.options.getString('reply', true);
      const issues = templateIssues(reply);
      if (issues) {
        await interaction.reply({ content: issues });
        return;
      }

      if (!addButtonResponder(guildId, name, reply, look)) {
        await interaction.reply({
          embeds: [
            serverEmbed(interaction.guild).setDescription(
              `## ${inlineCode(name)} already exists !\nchange it with ${commandMention('/buttonresponders edit')}, or pick another name c:`,
            ),
          ],
        });
        return;
      }

      await interaction.reply({
        embeds: [
          buttonDetailEmbed(
            interaction.guild,
            `made the ${inlineCode(name)} button !`,
            name,
            reply,
            look,
          ),
        ],
      });
      return;
    }

    if (sub === 'edit') {
      const reply = interaction.options.getString('reply');
      if (reply !== null) {
        const issues = templateIssues(reply);
        if (issues) {
          await interaction.reply({ content: issues });
          return;
        }
      }

      if (!editButtonResponder(guildId, name, reply, look)) {
        await interaction.reply({
          embeds: [noButtonEmbed(interaction.guild, name)],
        });
        return;
      }

      const updated = getButtonResponder(guildId, name)!;

      await interaction.reply({
        embeds: [
          buttonDetailEmbed(
            interaction.guild,
            `updated the ${inlineCode(updated.name)} button !`,
            updated.name,
            updated.response,
            updated,
          ),
        ],
      });
      return;
    }

    if (sub === 'show') {
      const responder = getButtonResponder(guildId, name);
      if (!responder) {
        await interaction.reply({
          embeds: [noButtonEmbed(interaction.guild, name)],
        });
        return;
      }

      await interaction.reply({
        embeds: [
          buttonDetailEmbed(
            interaction.guild,
            `the ${inlineCode(responder.name)} button`,
            responder.name,
            responder.response,
            responder,
          ),
        ],
      });
      return;
    }

    if (sub === 'remove') {
      const responder = getButtonResponder(guildId, name);
      if (!responder) {
        await interaction.reply({
          embeds: [noButtonEmbed(interaction.guild, name)],
        });
        return;
      }

      await interaction.reply({
        embeds: [
          serverEmbed(interaction.guild).setDescription(
            [
              `## delete the ${inlineCode(responder.name)} button ?`,
              codeBlock(responder.response),
              `-# any message still carrying this button just stops doing anything on click. there's no undo,,,, copy the reply above if you might want it back !`,
            ].join('\n'),
          ),
        ],
        components: [confirmRow(responder.name.toLowerCase())],
      });
      return;
    }
  },
};
