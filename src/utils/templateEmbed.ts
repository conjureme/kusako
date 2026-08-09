import { codeBlock, type EmbedBuilder, type Guild } from 'discord.js';

import type { MatchMode } from '../services/autoresponders/store.js';
import { parse } from '../dsl/parser.js';
import { parseAmount, formatDuration } from '../dsl/args.js';
import type { PlaceholderNode } from '../dsl/ast.js';
import { isLevelingEnabled } from '../services/levels/store.js';
import { serverEmbed } from './style.js';

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
  if (has('giverole') || has('takerole') || has('togglerole')) {
    badges.push('roles');
  }
  if (has('giverole') || has('takerole')) {
    does.push('gives or takes roles');
  }
  if (has('togglerole')) {
    does.push('toggles a role on or off');
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
  if (has('ephemeral')) {
    badges.push('private');
    does.push('replies privately');
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
    } else if (node.name === 'requirelevel') {
      guards.push(`level ${arg}+`);
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

export function templateDetailEmbed(
  guild: Guild,
  header: string,
  response: string,
  options: {
    matchMode?: MatchMode;
    cooldown?: boolean;
    notes?: string[];
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: string;
  } = {},
): EmbedBuilder {
  const { matchMode, cooldown = true, notes = [], fields = [] } = options;
  const traits = templateTraits(response);
  const tags = new Set(
    parse(response)
      .filter((node): node is PlaceholderNode => node.kind === 'placeholder')
      .map((node) => node.name),
  );

  const lines = [...notes];
  if (matchMode === 'exact' && tags.has('requirearg')) {
    lines.push('heads up: {requirearg} never passes on exact mode !');
  }
  if (tags.has('requirelevel') && !isLevelingEnabled(guild.id)) {
    lines.push(
      "heads up: leveling is off, so nobody's earning xp for {requirelevel} to check !",
    );
  }
  const trailer = lines.map((line) => `\n-# ${line}`).join('');

  const embed = serverEmbed(guild).setDescription(
    `## ${header}\n${codeBlock(response)}${trailer}`,
  );
  if (options.footer !== undefined) {
    embed.setFooter({ text: options.footer });
  }

  if (matchMode) {
    embed.addFields({ name: 'match mode', value: matchMode, inline: true });
  }
  if (cooldown && traits.cooldown) {
    embed.addFields({ name: 'cooldown', value: traits.cooldown, inline: true });
  }
  for (const field of fields) embed.addFields(field);

  embed.addFields({
    name: 'only fires',
    value: traits.guards.length > 0 ? traits.guards.join(' · ') : 'always',
  });
  if (traits.does.length > 0) {
    embed.addFields({ name: 'does', value: traits.does.join(' · ') });
  }
  return embed;
}
