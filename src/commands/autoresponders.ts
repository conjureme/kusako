import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  codeBlock,
  inlineCode,
  type AutocompleteInteraction,
  type EmbedBuilder,
  type Guild,
} from 'discord.js';

import type { SlashCommand } from '../client.js';
import {
  addAutoresponder,
  editAutoresponder,
  removeAutoresponder,
  getAutoresponder,
  listAutoresponders,
  setMatchMode,
  type MatchMode,
} from '../services/autoresponders/store.js';
import { templateIssues } from '../dsl/validate.js';
import { templateTraits, templateDetailEmbed } from '../utils/templateEmbed.js';
import { serverEmbed, NO_DMS } from '../utils/style.js';
import { commandMention } from '../utils/commandMentions.js';
import { paginate, applyPage } from '../utils/pagination.js';
import { registerPage } from '../services/pageRegistry.js';

export function responderDetailEmbed(
  guild: Guild,
  header: string,
  responder: { response: string; matchMode: MatchMode },
): EmbedBuilder {
  return templateDetailEmbed(guild, header, responder.response, {
    matchMode: responder.matchMode,
    footer: 'docs coming soon !',
  });
}

const TRIGGER_MAX = 100;
const RESPONSE_MAX = 2000;

function noResponderEmbed(guild: Guild, trigger: string) {
  return serverEmbed(guild).setDescription(
    `## there's no ${inlineCode(trigger)} autoresponder !\nmake one with ${commandMention('/autoresponders add')}, or check ${commandMention('/autoresponders list')} for the ones you have`,
  );
}

const MATCH_CHOICES = [
  { name: 'exact (message equals the trigger)', value: 'exact' },
  { name: 'starts with (whole word at the start)', value: 'startswith' },
  { name: 'ends with (whole word at the end)', value: 'endswith' },
  { name: 'includes (anywhere in the message)', value: 'includes' },
] as const;

function respondersPage(guild: Guild, _userId: string, page: number) {
  const all = listAutoresponders(guild.id);

  if (all.length === 0) {
    const embed = serverEmbed(guild)
      .setTitle('✦ autoresponders (0)')
      .setDescription(
        `no autoresponders yet,, make your first with ${inlineCode('/autoresponders add')}`,
      );

    return { embeds: [embed], components: [] };
  }

  const blocks = all.map((responder) =>
    [
      inlineCode(responder.trigger),
      responder.matchMode,
      ...templateTraits(responder.response).badges,
    ].join(' · '),
  );

  const hint = `-# see one up close with ${inlineCode('/autoresponders show')}`;
  const current = paginate(blocks, null, hint, page, '\n');
  const embed = serverEmbed(guild).setTitle(`✦ autoresponders (${all.length})`);
  const components = applyPage(embed, 'responders', current);

  return { embeds: [embed], components };
}

registerPage('responders', respondersPage);

async function respondWithTriggers(
  interaction: AutocompleteInteraction,
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused().toLowerCase();
  const choices = listAutoresponders(interaction.guildId)
    .filter((responder) => responder.triggerKey.includes(focused))
    .slice(0, 25)
    .map((responder) => ({
      name: responder.trigger,
      value: responder.trigger,
    }));

  await interaction.respond(choices);
}

export const autoresponders: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('autoresponders')
    .setDescription("manage this server's autoresponders")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('create a new autoresponder')
        .addStringOption((o) =>
          o
            .setName('trigger')
            .setDescription('the message that sets it off')
            .setMaxLength(TRIGGER_MAX)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('reply')
            .setDescription('what sako replies with !')
            .setMaxLength(RESPONSE_MAX)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('matchmode')
            .setDescription('how the trigger matches')
            .addChoices(...MATCH_CHOICES),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription('change an existing autoresponder')
        .addStringOption((o) =>
          o
            .setName('trigger')
            .setDescription('the trigger to edit')
            .setMaxLength(TRIGGER_MAX)
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName('reply')
            .setDescription('the new reply')
            .setMaxLength(RESPONSE_MAX)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('matchmode')
        .setDescription('change how a trigger matches messages')
        .addStringOption((o) =>
          o
            .setName('trigger')
            .setDescription('the trigger to change')
            .setMaxLength(TRIGGER_MAX)
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName('mode')
            .setDescription('how the trigger should match')
            .setRequired(true)
            .addChoices(...MATCH_CHOICES),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('delete an autoresponder')
        .addStringOption((o) =>
          o
            .setName('trigger')
            .setDescription('the trigger for autoresponder to delete')
            .setMaxLength(TRIGGER_MAX)
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('list every autoresponder in this server'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription('show a specific autoresponder')
        .addStringOption((o) =>
          o
            .setName('trigger')
            .setDescription('the trigger to show')
            .setMaxLength(TRIGGER_MAX)
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ) as SlashCommandBuilder,

  autocomplete: respondWithTriggers,

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
      const trigger = interaction.options.getString('trigger', true);
      const response = interaction.options.getString('reply', true);

      const lowerTrigger = trigger.trim().toLowerCase();
      const reserved = (['event', 'button'] as const).find((prefix) =>
        lowerTrigger.startsWith(`${prefix}:`),
      );
      if (reserved) {
        const owner = reserved === 'event' ? '/events' : '/buttonresponders';
        await interaction.reply({
          embeds: [
            serverEmbed(interaction.guild).setDescription(
              `## ${inlineCode(`${reserved}:`)} triggers are reserved !\nthose belong to ${commandMention(owner)},,,, pick another name for this one pls`,
            ),
          ],
        });
        return;
      }

      const issues = templateIssues(response);
      if (issues) {
        await interaction.reply({
          content: issues,
        });
        return;
      }

      const mode = interaction.options.getString('matchmode') as Exclude<
        MatchMode,
        'event'
      > | null;
      const created = addAutoresponder(
        guildId,
        trigger,
        response,
        mode ?? 'exact',
      );

      if (!created) {
        await interaction.reply({
          embeds: [
            serverEmbed(interaction.guild).setDescription(
              `## ${inlineCode(trigger)} already exists !\nchange it with ${commandMention('/autoresponders edit')}, or pick another trigger c:`,
            ),
          ],
        });
        return;
      }

      await interaction.reply({
        embeds: [
          responderDetailEmbed(
            interaction.guild,
            `added ${inlineCode(trigger)} !`,
            { response, matchMode: mode ?? 'exact' },
          ),
        ],
      });
      return;
    }

    if (sub === 'edit') {
      const trigger = interaction.options.getString('trigger', true);
      const response = interaction.options.getString('reply', true);

      const issues = templateIssues(response);
      if (issues) {
        await interaction.reply({
          content: issues,
        });
        return;
      }

      const edited = editAutoresponder(guildId, trigger, response);

      if (!edited) {
        await interaction.reply({
          embeds: [noResponderEmbed(interaction.guild, trigger)],
        });
        return;
      }

      const updated = getAutoresponder(guildId, trigger)!;
      await interaction.reply({
        embeds: [
          responderDetailEmbed(
            interaction.guild,
            `edited ${inlineCode(updated.trigger)} !`,
            updated,
          ),
        ],
      });
      return;
    }

    if (sub === 'matchmode') {
      const trigger = interaction.options.getString('trigger', true);
      const mode = interaction.options.getString('mode', true) as MatchMode;

      const changed = setMatchMode(guildId, trigger, mode);

      if (!changed) {
        await interaction.reply({
          embeds: [noResponderEmbed(interaction.guild, trigger)],
        });
        return;
      }

      const updated = getAutoresponder(guildId, trigger)!;
      await interaction.reply({
        embeds: [
          responderDetailEmbed(
            interaction.guild,
            `${inlineCode(updated.trigger)} matches as ${inlineCode(mode)} now !`,
            updated,
          ),
        ],
      });
      return;
    }

    if (sub === 'remove') {
      const trigger = interaction.options.getString('trigger', true);
      const found = getAutoresponder(guildId, trigger);

      if (!found) {
        await interaction.reply({
          embeds: [noResponderEmbed(interaction.guild, trigger)],
        });
        return;
      }

      removeAutoresponder(guildId, trigger);

      const embed = serverEmbed(interaction.guild).setDescription(
        `## removed ${inlineCode(found.trigger)} !\n${codeBlock(found.response)}\n-# add it back with ${commandMention('/autoresponders add')}`,
      );
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'list') {
      await interaction.reply(
        respondersPage(interaction.guild, interaction.user.id, 0),
      );
      return;
    }

    if (sub === 'show') {
      const trigger = interaction.options.getString('trigger', true);
      const found = getAutoresponder(guildId, trigger);

      if (!found) {
        await interaction.reply({
          embeds: [noResponderEmbed(interaction.guild, trigger)],
        });
        return;
      }

      await interaction.reply({
        embeds: [
          templateDetailEmbed(
            interaction.guild,
            inlineCode(found.trigger),
            found.response,
            {
              matchMode: found.matchMode,
              notes: [
                `change how it matches with ${commandMention('/autoresponders matchmode')}`,
              ],
              footer: 'docs coming soon !',
            },
          ),
        ],
      });
      return;
    }
  },
};
