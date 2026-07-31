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

function roleBadge(arg: string): string {
  const trimmed = arg.trim();
  if (/^<@&\d+>$/.test(trimmed)) return trimmed;
  if (/^\d+$/.test(trimmed)) return `<@&${trimmed}>`;
  return `@${trimmed.replace(/^@/, '')}`;
}

function userBadge(arg: string): string {
  const trimmed = arg.trim();
  const mention = /^<@!?(\d+)>$/.exec(trimmed);
  if (mention) return `<@${mention[1]}>`;
  if (/^@?\d+$/.test(trimmed)) return `<@${trimmed.replace(/^@/, '')}>`;
  return trimmed;
}

function amountBadge(arg: string): string {
  const amount = parseAmount(arg);
  return amount !== null ? amount.toLocaleString('en-US') : arg.trim();
}

export function templateTraits(response: string): {
  badges: string[];
  cooldown: string | null;
  does: string[];
  guards: string[];
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

  const embedTags = nodes.filter((node) => node.name === 'embed');
  const namedEmbeds = embedTags.filter((node) => {
    const arg = (node.args[0] ?? '').trim();
    return arg.length > 0 && !arg.startsWith('#');
  });
  if (namedEmbeds.length === 1) {
    does.push(`attaches the ${(namedEmbeds[0]!.args[0] ?? '').trim()} embed`);
  } else if (namedEmbeds.length > 1) {
    does.push(`attaches ${namedEmbeds.length} embeds`);
  }
  if (embedTags.length > namedEmbeds.length) {
    does.push('wraps the reply in an embed');
  }

  const buttons = nodes.filter(
    (node) => node.name === 'addbutton' || node.name === 'addlinkbutton',
  ).length;
  if (buttons > 0) does.push(`${buttons} button${buttons === 1 ? '' : 's'}`);

  if (has('react') || has('reactreply')) does.push('reacts');
  if (has('setnick')) does.push('edits nicknames');
  const deleteReplyNode = nodes.find((node) => node.name === 'delete_reply');
  if (deleteReplyNode) {
    const seconds = parseAmount(deleteReplyNode.args[0] ?? '');
    does.push(
      seconds !== null && seconds > 0
        ? `self-deletes after ${formatDuration(seconds)}`
        : 'self-deletes',
    );
  }
  if (has('error')) does.push('custom fail message');
  const boundaries = nodes.filter(
    (node) => node.name === 'split' || node.name === 'delay',
  ).length;
  if (boundaries > 0) does.push(`sends ${boundaries + 1} messages`);

  const guards: string[] = [];
  for (const node of nodes) {
    const arg = (node.args[0] ?? '').trim();
    if (node.name === 'requirebal') {
      guards.push(`${amountBadge(arg)}+ balance`);
    } else if (node.name === 'requireitem') {
      const qty = (node.args[1] ?? '').trim();
      guards.push(qty.length > 0 ? `needs ${qty}× ${arg}` : `needs ${arg}`);
    } else if (node.name === 'requirechannel') {
      guards.push(`in ${channelBadge(arg)}`);
    } else if (node.name === 'denychannel') {
      guards.push(`not in ${channelBadge(arg)}`);
    } else if (node.name === 'requirerole') {
      guards.push(`for ${roleBadge(arg)}`);
    } else if (node.name === 'denyrole') {
      guards.push(`not for ${roleBadge(arg)}`);
    } else if (node.name === 'requireuser') {
      guards.push(`only for ${userBadge(arg)}`);
    } else if (node.name === 'denyuser') {
      guards.push(`not for ${userBadge(arg)}`);
    } else if (node.name === 'requireperm') {
      guards.push(`with ${arg} perms`);
    } else if (node.name === 'denyperm') {
      guards.push(`without ${arg} perms`);
    }
  }
  const argCounts = nodes
    .filter((node) => node.name === 'requirearg')
    .map((node) => parseAmount(node.args[0] ?? ''))
    .filter((n): n is number => n !== null && n > 0);
  if (argCounts.length > 0) {
    const max = Math.max(...argCounts);
    guards.push(`requires ${max} arg${max === 1 ? '' : 's'}`);
  } else if (has('requirearg')) {
    guards.push('requires args');
  }

  return { badges, cooldown, does, guards };
}

export function responderDetailEmbed(
  guild: Guild,
  header: string,
  responder: { response: string; matchMode: MatchMode },
): EmbedBuilder {
  const traits = templateTraits(responder.response);
  const hasRequirearg = parse(responder.response).some(
    (node) => node.kind === 'placeholder' && node.name === 'requirearg',
  );
  const warning =
    responder.matchMode === 'exact' && hasRequirearg
      ? '\n-# heads up: {requirearg} never passes on exact mode !'
      : '';

  const embed = serverEmbed(guild)
    .setDescription(`## ${header}\n${codeBlock(responder.response)}${warning}`)
    .setFooter({ text: 'docs coming soon !' })
    .addFields({
      name: 'match mode',
      value: responder.matchMode,
      inline: true,
    });
  if (traits.cooldown) {
    embed.addFields({ name: 'cooldown', value: traits.cooldown, inline: true });
  }
  embed.addFields({
    name: 'only fires',
    value: traits.guards.length > 0 ? traits.guards.join(' · ') : 'always',
  });
  if (traits.does.length > 0) {
    embed.addFields({ name: 'does', value: traits.does.join(' · ') });
  }
  return embed;
}

const TRIGGER_MAX = 100;
const RESPONSE_MAX = 2000;

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
          content: `an autoresponder for ${inlineCode(trigger)} already exists. use ${inlineCode('/autoresponders edit')} to change it.`,
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
