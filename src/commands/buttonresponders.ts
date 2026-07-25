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
} from 'discord.js';

import type { SlashCommand } from '../client.js';
import {
  getButtonResponder,
  addButtonResponder,
  editButtonResponder,
  removeButtonResponder,
  listButtonResponders,
  parseButtonCustomId,
} from '../autoresponder/store.js';
import { templateTraits } from './autoresponders.js';
import { templateIssues } from '../autoresponder/validate.js';
import { parse } from '../autoresponder/parser.js';
import { evaluate } from '../autoresponder/evaluate.js';
import { deliver } from '../autoresponder/deliver.js';
import { serverEmbed, failureEmbed, NO_DMS } from '../style.js';
import { paginate, applyPage } from '../pagination.js';
import { registerPage } from '../pageRegistry.js';
import { logger } from '../logger.js';

const NAME_MAX = 50;
const REPLY_MAX = 2000;

export async function fireButtonResponder(
  interaction: ButtonInteraction,
): Promise<void> {
  const name = parseButtonCustomId(interaction.customId);
  if (name === null || !interaction.inCachedGuild()) return;

  const responder = getButtonResponder(interaction.guildId, name);
  if (
    !responder ||
    !interaction.channel ||
    !interaction.channel.isTextBased()
  ) {
    await interaction.deferUpdate();
    return;
  }

  await interaction.deferUpdate();

  const result = await evaluate(
    parse(responder.response),
    {
      member: interaction.member,
      guild: interaction.guild,
      channel: interaction.channel,
    },
    responder.triggerKey,
  );
  if (!result.ok) {
    if (!result.silent) {
      await interaction.channel.send({
        embeds: [failureEmbed(result.message)],
      });
    }
    return;
  }

  await deliver(result.segments, result.actions, {
    member: interaction.member,
    channel: interaction.channel,
  });
}

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

  const gone = !removeButtonResponder(interaction.guildId, nameKey);
  await interaction.update({
    embeds: [
      serverEmbed(interaction.guild)
        .setTitle(gone ? '✦ already gone !' : '✦ button responder deleted !')
        .setDescription(
          gone
            ? `${inlineCode(nameKey)} isn't here anymore...`
            : `deleted the ${inlineCode(nameKey)} button ! old messages carrying it just do nothing now.`,
        ),
    ],
    components: [],
  });
}

function brPage(guild: Guild, _userId: string, page: number) {
  const all = listButtonResponders(guild.id);

  if (all.length === 0) {
    const embed = serverEmbed(guild)
      .setTitle('✦ button responders (0)')
      .setDescription(
        `none yet ! make one with ${inlineCode('/buttonresponders add')}, then drop ${inlineCode('{addbutton:name}')} in any reply c:`,
      );

    return { embeds: [embed], components: [] };
  }

  const header = `꒰ button responders ꒱ *${all.length} of them !*`;
  const hint = `⁀જ➣ attach one with ${inlineCode('{addbutton:name}')} in any reply`;

  const blocks = all.map(({ name, responder }) => {
    const { badges } = templateTraits(responder.response);
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
    .filter(({ name }) => name.toLowerCase().includes(focused))
    .slice(0, 25)
    .map(({ name }) => ({ name, value: name }));

  await interaction.respond(choices);
}

export const buttonresponders: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('buttonresponders')
    .setDescription('replies that fire when someone clicks a button')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('make a button responder')
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('the button name (its label + id)')
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
    )
    .addSubcommand((sub) =>
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
            .setRequired(true),
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

    if (sub === 'add') {
      const reply = interaction.options.getString('reply', true);
      const issues = templateIssues(reply);
      if (issues) {
        await interaction.reply({ content: issues });
        return;
      }

      if (!addButtonResponder(guildId, name, reply)) {
        await interaction.reply({
          content: `a button called ${inlineCode(name)} already exists ! edit it or pick another name c:`,
        });
        return;
      }

      await interaction.reply({
        embeds: [
          serverEmbed(interaction.guild)
            .setTitle('✦ button responder made !')
            .setDescription(
              `now drop ${inlineCode(`{addbutton:${name}}`)} into any reply (an autoresponder, an event, /send...) and clicking it fires this !`,
            ),
        ],
      });
      return;
    }

    if (sub === 'edit') {
      const reply = interaction.options.getString('reply', true);
      const issues = templateIssues(reply);
      if (issues) {
        await interaction.reply({ content: issues });
        return;
      }

      if (!editButtonResponder(guildId, name, reply)) {
        await interaction.reply({
          content: `there's no button called ${inlineCode(name)} yet !`,
        });
        return;
      }

      await interaction.reply({
        embeds: [
          serverEmbed(interaction.guild)
            .setTitle('✦ button responder updated !')
            .setDescription(`${inlineCode(name)} fires a new reply now c:`),
        ],
      });
      return;
    }

    if (sub === 'show') {
      const responder = getButtonResponder(guildId, name);
      if (!responder) {
        await interaction.reply({
          content: `there's no button called ${inlineCode(name)} !`,
        });
        return;
      }

      const { badges } = templateTraits(responder.response);
      const embed = serverEmbed(interaction.guild)
        .setTitle(`✦ ${responder.trigger}`)
        .setDescription(codeBlock(responder.response))
        .addFields({
          name: 'does',
          value: badges.length > 0 ? badges.join(' · ') : 'just a message',
        })
        .setFooter({
          text: `attach it with {addbutton:${responder.trigger}}`,
        });

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'remove') {
      const responder = getButtonResponder(guildId, name);
      if (!responder) {
        await interaction.reply({
          content: `there's no button called ${inlineCode(name)} !`,
        });
        return;
      }

      await interaction.reply({
        embeds: [
          serverEmbed(interaction.guild)
            .setTitle('✦ delete this button responder ?')
            .setDescription(
              `**${responder.trigger}**\n\nany message still carrying this button will just stop doing anything on click. no undo !`,
            ),
        ],
        components: [confirmRow(responder.trigger.toLowerCase())],
      });
      return;
    }
  },
};
