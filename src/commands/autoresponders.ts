import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  codeBlock,
  inlineCode,
  type AutocompleteInteraction,
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
} from '../autoresponder/store.js';
import { templateIssues } from '../autoresponder/validate.js';
import { parse } from '../autoresponder/parser.js';
import { parseAmount, formatDuration } from '../autoresponder/args.js';
import type { PlaceholderNode } from '../autoresponder/ast.js';
import { serverEmbed, NO_DMS } from '../style.js';
import { paginate, applyPage } from '../pagination.js';
import { registerPage } from '../pageRegistry.js';

function channelBadge(arg: string): string {
  const trimmed = arg.trim();
  if (/^<#\d+>$/.test(trimmed)) return trimmed;
  if (/^\d+$/.test(trimmed)) return `<#${trimmed}>`;
  return `#${trimmed.replace(/^#/, '')}`;
}

export function templateTraits(response: string): {
  badges: string[];
  cooldown: string | null;
  does: string[];
} {
  const nodes = parse(response).filter(
    (node): node is PlaceholderNode => node.kind === 'placeholder',
  );
  const has = (name: string) => nodes.some((node) => node.name === name);

  let cooldown: string | null = null;
  const cooldownNode = nodes.find((node) => node.name === 'cooldown');
  if (cooldownNode) {
    const seconds = parseAmount(cooldownNode.args[0] ?? '');
    cooldown =
      seconds !== null && seconds > 0 ? formatDuration(seconds) : 'dynamic';
  }

  const sendNode = nodes.find((node) => node.name === 'send');
  const sendTo = sendNode ? channelBadge(sendNode.args[0] ?? '') : null;

  const badges: string[] = [];
  const does: string[] = [];
  if (has('modifybal')) {
    badges.push('currency');
    does.push('moves currency');
  }
  if (has('modifyinv')) {
    badges.push('items');
    does.push('moves items');
  }
  if (has('giverole') || has('takerole')) {
    badges.push('roles');
    does.push('gives or takes roles');
  }
  if (has('temprole')) {
    badges.push('temp roles');
    does.push('gives a role for a while');
  }
  if (cooldown) badges.push(`${cooldown} cooldown`);
  if (has('silent')) {
    badges.push('silent');
    does.push('fails silently');
  }
  if (has('dm')) {
    badges.push('dms');
    does.push('replies in dms');
  }
  if (sendTo) {
    badges.push(`→ ${sendTo}`);
    does.push(`sends to ${sendTo}`);
  }
  if (has('deletetrigger')) does.push('deletes the trigger');

  return { badges, cooldown, does };
}

const TRIGGER_MAX = 100;
const RESPONSE_MAX = 2000;

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
            .addChoices(
              { name: 'exact (message equals the trigger)', value: 'exact' },
              {
                name: 'starts with (whole word at the start)',
                value: 'startswith',
              },
              {
                name: 'ends with (whole word at the end)',
                value: 'endswith',
              },
              {
                name: 'includes (anywhere in the message)',
                value: 'includes',
              },
            ),
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
      if (lowerTrigger.startsWith('event:')) {
        await interaction.reply({
          content: `trigger names starting with ${inlineCode('event:')} are reserved for ${inlineCode('/events')} !`,
        });
        return;
      }
      if (lowerTrigger.startsWith('button:')) {
        await interaction.reply({
          content: `trigger names starting with ${inlineCode('button:')} are reserved for ${inlineCode('/buttonresponders')} !`,
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

      const created = addAutoresponder(guildId, trigger, response);

      await interaction.reply({
        content: created
          ? `added an autoresponder for ${inlineCode(trigger)} c:`
          : `an autoresponder for ${inlineCode(trigger)} already exists. use ${inlineCode('/autoresponders edit')} to change it.`,
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

      await interaction.reply({
        content: edited
          ? `updated the autoresponder for ${inlineCode(trigger)} c:`
          : `no autoresponder for ${inlineCode(trigger)} exists yet. use ${inlineCode('/autoresponders add')} to make one.`,
      });
      return;
    }

    if (sub === 'matchmode') {
      const trigger = interaction.options.getString('trigger', true);
      const mode = interaction.options.getString('mode', true) as MatchMode;

      const changed = setMatchMode(guildId, trigger, mode);

      await interaction.reply({
        content: changed
          ? `${inlineCode(trigger)} now matches as ${inlineCode(mode)} c:`
          : `no autoresponder for ${inlineCode(trigger)} exists yet. use ${inlineCode('/autoresponders add')} to make one.`,
      });
      return;
    }

    if (sub === 'remove') {
      const trigger = interaction.options.getString('trigger', true);
      const removed = removeAutoresponder(guildId, trigger);

      await interaction.reply({
        content: removed
          ? `removed the autoresponder for ${inlineCode(trigger)}.`
          : `no autoresponder for ${inlineCode(trigger)} to remove.`,
      });
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
          content: `no autoresponder for ${inlineCode(trigger)} found.`,
        });
        return;
      }

      const traits = templateTraits(found.response);
      const embed = serverEmbed(interaction.guild)
        .setTitle(`✦ ${found.trigger}`)
        .setDescription(
          `${codeBlock(found.response)}\n-# change matching with ${inlineCode('/autoresponders matchmode')}`,
        )
        .addFields({
          name: 'match mode',
          value: found.matchMode,
          inline: true,
        });
      if (traits.cooldown) {
        embed.addFields({
          name: 'cooldown',
          value: traits.cooldown,
          inline: true,
        });
      }
      if (traits.does.length > 0) {
        embed.addFields({
          name: 'does',
          value: traits.does.join('\n'),
          inline: true,
        });
      }

      await interaction.reply({ embeds: [embed] });
      return;
    }
  },
};
