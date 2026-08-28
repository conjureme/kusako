import type { Node } from './ast.js';
import { parse } from './parser.js';
import { generators, RANGE_FORMAT, WEIGHTED_OPTION } from './generators.js';
import { parseAmount, DYNAMIC_ARG, YEAR_SECONDS } from './args.js';
import { parseColor } from '../services/embeds/store.js';
import {
  ARG_TYPES,
  resolvePermArg,
  FAILURE_CAPTURES,
  GUARD_TARGETS,
  guards,
} from './guards.js';
import { MAX_LEVEL } from '../services/levels/store.js';
import { placeholders, targetArgIndex } from './placeholders.js';
import {
  MAX_BUTTONS,
  MAX_ROWS,
  BUTTONS_PER_ROW,
  MAX_DROPDOWN_OPTIONS,
  rowsUsed,
} from './evaluate.js';
import { URLISH } from '../services/embeds/store.js';

const MAX_SEGMENTS = 3;
const MAX_REACTIONS = 3;
const MAX_EMBEDS = 3;
const MAX_ROLE_TAGS = 25;

const EPHEMERAL_CONFLICTS: Array<[string, string]> = [
  ['delay', 'a private reply only lasts as long as the click does'],
  ['split', 'a private reply is always one message'],
  ['delete_reply', "private replies fade on their own, i can't delete them"],
  ['reactreply', 'nobody can react to a private reply'],
];

const TICKET_CONFLICTS = new Map<string, string>([
  ['dm', 'the greeting has to land in the ticket itself'],
  ['send', 'the greeting has to land in the ticket itself'],
  ['ephemeral', 'everyone in the ticket needs to see the greeting'],
  ['delete_reply', 'that takes the greeting and the close button with it'],
  ['cooldown', 'the ticket type carries its own cooldown already'],
]);

function checkDuration(
  arg: string | undefined,
  tag: string,
  min: number,
  errors: string[],
  example = `{${tag}:540}`,
): void {
  const value = arg ?? '';
  if (DYNAMIC_ARG.test(value.trim())) return;

  const seconds = parseAmount(value);
  if (seconds === null || seconds < min || seconds > YEAR_SECONDS) {
    errors.push(
      `{${tag}} needs seconds between ${min} and ${YEAR_SECONDS.toLocaleString('en-US')} (or a [capture]), like ${example}`,
    );
  }
}

function checkAmount(
  arg: string | undefined,
  tag: string,
  allowNegative: boolean,
  errors: string[],
): void {
  const value = arg ?? '';
  const trimmed = value.trim();
  const dynamic = allowNegative ? trimmed.replace(/^-/, '') : trimmed;
  if (DYNAMIC_ARG.test(dynamic)) return;

  const amount = parseAmount(value);
  const bad = amount === null || amount === 0 || (!allowNegative && amount < 0);
  if (bad) {
    errors.push(
      `{${tag}} needs a ${allowNegative ? 'non-zero' : 'positive'} whole number (or a [capture])`,
    );
  }
}

function checkTargetArg(
  arg: string | undefined,
  tag: string,
  errors: string[],
): void {
  const value = (arg ?? '').trim();
  if (value.length === 0) return;
  if (DYNAMIC_ARG.test(value)) return;

  if (!/^(<@!?\d+>|@?\d+)$/.test(value)) {
    errors.push(
      `{${tag}}'s target needs a user id, mention, or something like [$1],, usernames don't work !`,
    );
  }
}

function issueMessage(errors: string[]): string | null {
  if (errors.length === 0) return null;

  return `hmm, that reply has some problems !!\n${errors.map((e) => `• ${e}`).join('\n')}`;
}

export function templateIssues(response: string): string | null {
  return issueMessage(validateTemplate(parse(response)));
}

export function subjectlessTemplateIssues(response: string): string | null {
  const nodes = parse(response);
  return issueMessage([
    ...validateTemplate(nodes),
    ...subjectlessIssues(nodes),
  ]);
}

const NO_SUBJECT = new Map<string, string>([
  ['cooldown', '{cooldown} has nobody to cool down here'],
  ['togglerole', '{togglerole} is self only, so it has nobody to toggle here'],
  ['dm', '{dm} has nobody to send to here'],
  [
    'requireuser',
    '{requireuser} checks whoever triggered a reply, and nothing triggers this one',
  ],
  [
    'denyuser',
    '{denyuser} checks whoever triggered a reply, and nothing triggers this one',
  ],
  [
    'requirearg',
    '{requirearg} reads the triggering message, and there is no message here',
  ],
]);

const SUBJECT_ARGS = new Map<string, number>([
  ['modifybal', 1],
  ['modifyinv', 2],
  ['addrole', 1],
  ['removerole', 1],
  ['temprole', 2],
  ['setnick', 1],
]);

export function subjectlessIssues(nodes: Node[]): string[] {
  const found = new Set<string>();

  for (const node of nodes) {
    if (node.kind !== 'placeholder') continue;

    const never = NO_SUBJECT.get(node.name);
    if (never) {
      found.add(never);
      continue;
    }

    const needsUser = (index: number): void => {
      if ((node.args[index] ?? '').trim().length > 0) return;
      found.add(
        `nothing triggers this reply, so {${node.name}} needs a user named as its last argument`,
      );
    };

    const acts = SUBJECT_ARGS.get(node.name) ?? GUARD_TARGETS.get(node.name);
    if (acts !== undefined) {
      needsUser(acts);
      continue;
    }

    const target = placeholders.get(node.name)?.target;
    if (target === 'user' || target === 'user1') {
      needsUser(targetArgIndex(target));
    }
  }

  return [...found];
}

export function ticketIssues(nodes: Node[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    if (node.kind !== 'placeholder') continue;
    if (seen.has(node.name)) continue;

    if (guards.has(node.name)) {
      seen.add(node.name);
      errors.push(
        `{${node.name}} can't go in a ticket greeting ! the channel already exists by the time this runs, so a guard failing would just leave an empty ticket behind`,
      );
      continue;
    }

    const why = TICKET_CONFLICTS.get(node.name);
    if (why) {
      seen.add(node.name);
      errors.push(`{${node.name}} can't go in a ticket greeting ! ${why}`);
    }
  }

  return errors;
}

export function ticketGreetingIssues(response: string): string | null {
  const nodes = parse(response);
  return issueMessage([...validateTemplate(nodes), ...ticketIssues(nodes)]);
}

export function validateTemplate(nodes: Node[]): string[] {
  const errors: string[] = [];
  const bound = new Set<string>();
  const optionCounts = new Map<string, number>();
  let boundaries = 0;
  let cooldowns = 0;
  let deleteReplies = 0;
  let reactions = 0;
  let embedTags = 0;
  let roleTags = 0;
  let buttons = 0;
  let dropdowns = 0;
  let roleMenus = 0;
  let errorTags = 0;
  let ephemerals = 0;

  for (const node of nodes) {
    if (node.kind === 'capture-ref') {
      if (/^\$\d+\+?$/.test(node.name)) continue;
      if (!bound.has(node.name)) {
        errors.push(
          `[${node.name}] has nothing creating it before that point. add a tag like {range as ${node.name}: 10-100} first !`,
        );
      }
      continue;
    }

    if (node.kind !== 'placeholder') continue;

    // togglerole is an effect, but it binds its outcome like a generator so
    // {lockedchoice} can pair text against it. two options: added, removed
    if (node.name === 'togglerole') {
      const captureName = node.captureName ?? node.name;
      if (bound.has(captureName)) {
        errors.push(
          `two tags both create [${captureName}]. give one its own name with "as", like {togglerole as something:@stinks}`,
        );
      }
      bound.add(captureName);
      optionCounts.set(captureName, 2);
    }

    if (generators.has(node.name)) {
      const captureName = node.captureName ?? node.name;

      if (bound.has(captureName)) {
        errors.push(
          `two tags both create [${captureName}]. give one its own name with "as", like {${node.name} as something: ...}`,
        );
      }
      bound.add(captureName);

      if (node.name === 'range' && !RANGE_FORMAT.test(node.args[0] ?? '')) {
        errors.push(
          /\sas\s+\w+/i.test(node.args[0] ?? '')
            ? `"as" goes before the colon ! write {range as name: 10-100}, not {range:10-100 as name}`
            : `{range} needs a number span, like {range:10-100}`,
        );
      }
      if (node.name === 'choice') {
        if (node.args.filter((option) => option.length > 0).length < 2) {
          errors.push(`{choice} needs at least two options split by |`);
        }
        optionCounts.set(captureName, node.args.length);
      }

      if (node.name === 'weightedchoice') {
        if (node.args.length < 2) {
          errors.push('{weightedchoice} needs at least two options split by |');
        }
        for (const option of node.args) {
          const match = WEIGHTED_OPTION.exec(option);
          if (!match || Number(match[1]) <= 0) {
            errors.push(
              `"${option}" needs a weight in front ! write {weightedchoice as name: 70 common | 25 rare | 5 legendary}`,
            );
          }
        }
        optionCounts.set(captureName, node.args.length);
      }

      if (node.name === 'lockedchoice') {
        const source = (node.args[0] ?? '').trim().toLowerCase();
        const options = node.args.length - 1;

        if (source.length === 0 || options < 1) {
          errors.push(
            '{lockedchoice} needs a source choice then options, like {lockedchoice as flavor: catch | ew | wow | hm}',
          );
        } else if (!optionCounts.has(source)) {
          errors.push(
            `{lockedchoice} points at [${source}], but no choice with that name comes before it !`,
          );
        } else if (optionCounts.get(source) !== options) {
          errors.push(
            `{lockedchoice} has ${options} option${options === 1 ? '' : 's'} but [${source}] has ${optionCounts.get(source)}. they pair up by position, so the counts must match !`,
          );
        }
        optionCounts.set(captureName, options);
      }
      continue;
    }

    if (node.captureName && node.name !== 'togglerole') {
      if (!placeholders.has(node.name)) {
        errors.push(
          `"as ${node.captureName}" doesn't work on {${node.name}}. "as" is only for tags that create a value, like {range}, {choice}, or a {user.*} placeholder !`,
        );
        continue;
      }

      if (bound.has(node.captureName)) {
        errors.push(
          `two tags both create [${node.captureName}]. give one its own name with "as", like {${node.name} as something}`,
        );
      }
      bound.add(node.captureName);
    }

    const guardTarget = GUARD_TARGETS.get(node.name);
    if (guardTarget !== undefined) {
      checkTargetArg(node.args[guardTarget], node.name, errors);
    }

    if (node.name === 'split' || node.name === 'delay') {
      boundaries += 1;
      if (node.name === 'delay') {
        checkDuration(node.args[0], 'delay', 0, errors);
      }
      continue;
    }

    if (node.name === 'cooldown') {
      cooldowns += 1;
      if (cooldowns === 2) {
        errors.push('only one {cooldown} per autoresponder !');
      }
      checkDuration(node.args[0], 'cooldown', 1, errors);
      continue;
    }

    if (node.name === 'delete_reply') {
      deleteReplies += 1;
      if (deleteReplies === 2) {
        errors.push('only one {delete_reply} per autoresponder !');
      }
      checkDuration(node.args[0], 'delete_reply', 1, errors);
      continue;
    }

    if (node.name === 'ephemeral') {
      ephemerals += 1;
      if (ephemerals === 2) {
        errors.push('only one {ephemeral} per reply !');
      }
      continue;
    }

    if (node.name === 'error') {
      errorTags += 1;
      if (errorTags === 2) {
        errors.push('only one {error} per autoresponder !');
      }
      if ((node.args[0] ?? '').trim().length === 0) {
        errors.push('{error} needs a message, like {error: slow your roll !!}');
      }
      for (const ref of node.args[0]?.matchAll(/\[([\w.]+\.[\w.]+)\]/g) ?? []) {
        const name = ref[1]!.toLowerCase();
        if (!FAILURE_CAPTURES.has(name)) {
          errors.push(
            `[${name}] isn't a thing {error} can show. try one like [cooldown.remaining] or [requirebal.short]`,
          );
        }
      }
      continue;
    }

    if (node.name === 'button') {
      buttons += 1;
      if (buttons === MAX_BUTTONS + 1) {
        errors.push(`max ${MAX_BUTTONS} buttons per reply !`);
      }
      if ((node.args[0] ?? '').trim().length === 0) {
        errors.push('{button} needs a name, like {button:verify}');
      }
      continue;
    }

    if (node.name === 'rolemenu') {
      roleMenus += 1;
      if (roleMenus === 2) {
        errors.push(
          'only one {rolemenu} per reply! put the second one in its own message',
        );
      }
      if ((node.args[0] ?? '').trim().length === 0) {
        errors.push('{rolemenu} needs a name, like {rolemenu:regions}');
      }
      continue;
    }

    if (node.name === 'dropdown') {
      dropdowns += 1;
      const options = node.args
        .slice(1)
        .map((option) => option.trim())
        .filter((option) => option.length > 0);

      if (options.length === 0) {
        errors.push(
          '{dropdown} needs a placeholder then at least one button responder, like {dropdown: pick a role | pink | blue}',
        );
      }
      if (options.length > MAX_DROPDOWN_OPTIONS) {
        errors.push(`max ${MAX_DROPDOWN_OPTIONS} options per dropdown !`);
      }
      continue;
    }

    if (node.name === 'linkbutton') {
      buttons += 1;
      if (buttons === MAX_BUTTONS + 1) {
        errors.push(`max ${MAX_BUTTONS} buttons per reply !`);
      }
      if ((node.args[0] ?? '').trim().length === 0) {
        errors.push(
          '{linkbutton} needs a label and a url, like {linkbutton:our site | https://frie.rent}',
        );
      } else if (!URLISH.test((node.args[1] ?? '').trim())) {
        errors.push(
          '{linkbutton} needs a real url (http/https), like {linkbutton:our site | https://frie.rent}',
        );
      }
      continue;
    }

    if (node.name === 'requirebal') {
      checkAmount(node.args[0], 'requirebal', false, errors);
      continue;
    }

    if (node.name === 'requirelevel') {
      checkAmount(node.args[0], 'requirelevel', false, errors);
      const level = parseAmount(node.args[0] ?? '');
      if (level !== null && level > MAX_LEVEL) {
        errors.push(`{requirelevel} can't go past level ${MAX_LEVEL} !`);
      }
      continue;
    }

    if (node.name === 'requirearg') {
      checkAmount(node.args[0], 'requirearg', false, errors);
      if (node.args.length > 1) {
        const type = (node.args[1] ?? '').trim().toLowerCase();
        if (!ARG_TYPES.has(type)) {
          errors.push(
            `{requirearg} only knows the types ${[...ARG_TYPES.keys()].join(' / ')}, like {requirearg:2|number}`,
          );
        }
      }
      continue;
    }

    if (node.name === 'requireitem') {
      if ((node.args[0] ?? '').length === 0) {
        errors.push(
          '{requireitem} needs an item name, like {requireitem:shop pass} or {requireitem:milk|3}',
        );
      }
      if (/^<@!?\d+>$/.test((node.args[1] ?? '').trim())) {
        errors.push(
          '{requireitem} needs the amount before the user, like {requireitem:fish|1|@someone}',
        );
      } else if (node.args.length > 1) {
        checkAmount(node.args[1], 'requireitem', false, errors);
      }
      continue;
    }

    if (node.name === 'requirechannel') {
      if ((node.args[0] ?? '').trim().length === 0) {
        errors.push(
          '{requirechannel} needs a channel, like {requirechannel:#bot-spam} or a channel id',
        );
      }
      continue;
    }

    if (node.name === 'requirerole') {
      if ((node.args[0] ?? '').trim().length === 0) {
        errors.push(
          '{requirerole} needs a role, like {requirerole:@fisher} or a role id',
        );
      }
      continue;
    }

    if (node.name === 'react') {
      reactions += 1;
      if (reactions === MAX_REACTIONS + 1) {
        errors.push(
          `max ${MAX_REACTIONS} {react}/{reactreply} tags per autoresponder !`,
        );
      }
      if ((node.args[0] ?? '').trim().length === 0) {
        errors.push('{react} needs an emoji, like {react:🔥}');
      }
      continue;
    }

    if (node.name === 'embed') {
      embedTags += 1;
      if (embedTags === MAX_EMBEDS + 1) {
        errors.push(`max ${MAX_EMBEDS} {embed} tags per autoresponder !`);
      }
      const arg = (node.args[0] ?? '').trim();
      if (arg.startsWith('#') && parseColor(arg) === null) {
        errors.push(
          `{embed:${arg}} isn't a valid hex color ! try something like {embed:#faf0e7}`,
        );
      }
      continue;
    }

    if (node.name === 'reactreply') {
      reactions += 1;
      if (reactions === MAX_REACTIONS + 1) {
        errors.push(
          `max ${MAX_REACTIONS} {react}/{reactreply} tags per autoresponder !`,
        );
      }
      if ((node.args[0] ?? '').trim().length === 0) {
        errors.push('{reactreply} needs an emoji, like {reactreply:🔥}');
      }
      continue;
    }

    if (node.name === 'send') {
      if ((node.args[0] ?? '').trim().length === 0) {
        errors.push(
          '{send} needs a channel, like {send:#showcase} or a channel id',
        );
      }
      continue;
    }

    if (node.name === 'requireuser' || node.name === 'denyuser') {
      const arg = (node.args[0] ?? '').trim();
      if (!/^(<@!?\d+>|@?\d+)$/.test(arg)) {
        errors.push(
          `{${node.name}} needs a user id or mention, like {${node.name}:395526710101278721}`,
        );
      }
      continue;
    }

    if (node.name === 'requireperm' || node.name === 'denyperm') {
      if (resolvePermArg(node.args[0] ?? '') === null) {
        errors.push(
          `{${node.name}} needs a permission, like {${node.name}:manage_server} or {${node.name}:manage messages}`,
        );
      }
      continue;
    }

    if (node.name === 'denychannel') {
      if ((node.args[0] ?? '').trim().length === 0) {
        errors.push(
          '{denychannel} needs a channel, like {denychannel:#general} or a channel id',
        );
      }
      continue;
    }

    if (
      node.name === 'addrole' ||
      node.name === 'removerole' ||
      node.name === 'temprole' ||
      node.name === 'togglerole'
    ) {
      roleTags += 1;
      if (roleTags === MAX_ROLE_TAGS + 1) {
        errors.push(
          `max ${MAX_ROLE_TAGS} {addrole}/{removerole}/{temprole}/{togglerole} tags per autoresponder !`,
        );
      }
      if ((node.args[0] ?? '').trim().length === 0) {
        errors.push(
          `{${node.name}} needs a role, like {${node.name}:@fisher} or a role id`,
        );
      }
      if (node.name === 'temprole') {
        checkDuration(
          node.args[1],
          'temprole',
          1,
          errors,
          '{temprole:@stinky|86400}',
        );
        checkTargetArg(node.args[2], node.name, errors);
      } else if (node.name === 'togglerole') {
        if ((node.args[1] ?? '').trim().length > 0) {
          errors.push(
            '{togglerole} only works on whoever triggered it, so it takes just a role, like {togglerole:@stinks}',
          );
        }
      } else {
        checkTargetArg(node.args[1], node.name, errors);
      }
      continue;
    }

    if (node.name === 'denyrole') {
      if ((node.args[0] ?? '').trim().length === 0) {
        errors.push(
          '{denyrole} needs a role, like {denyrole:@mischievous} or a role id',
        );
      }
      continue;
    }

    if (node.name === 'setnick') {
      if ((node.args[0] ?? '').trim().length === 0) {
        errors.push('{setnick} needs a nickname, like {setnick:a real cutie}');
      }
      checkTargetArg(node.args[1], 'setnick', errors);
      continue;
    }

    if (
      node.name === 'user.itemcount' &&
      (node.args[0] ?? '').trim().length === 0
    ) {
      errors.push(
        '{user.itemcount} needs an item name, like {user.itemcount:fish}',
      );
    }

    const target = placeholders.get(node.name)?.target;
    if (target === 'user' || target === 'user1') {
      checkTargetArg(node.args[targetArgIndex(target)], node.name, errors);
      continue;
    }

    if (node.name === 'modifybal') {
      checkAmount(node.args[0], 'modifybal', true, errors);
      checkTargetArg(node.args[1], 'modifybal', errors);
      continue;
    }

    if (node.name === 'modifyinv') {
      if ((node.args[0] ?? '').length === 0 || node.args.length < 2) {
        errors.push(
          '{modifyinv} needs an item and an amount, like {modifyinv:milk|-3}',
        );
      } else {
        checkAmount(node.args[1], 'modifyinv', true, errors);
        checkTargetArg(node.args[2], 'modifyinv', errors);
      }
      continue;
    }
  }

  if (boundaries > MAX_SEGMENTS - 1) {
    errors.push(
      `that would send more than ${MAX_SEGMENTS} messages ! max is ${MAX_SEGMENTS} (so up to ${MAX_SEGMENTS - 1} {split}/{delay} tags)`,
    );
  }

  if (ephemerals > 0) {
    const has = (name: string) =>
      nodes.some((node) => node.kind === 'placeholder' && node.name === name);
    for (const [tag, why] of EPHEMERAL_CONFLICTS) {
      if (has(tag)) {
        errors.push(`{ephemeral} and {${tag}} can't go together ! ${why}`);
      }
    }
  }

  if (dropdowns > 0 || roleMenus > 0) {
    const rows = rowsUsed(
      Math.min(buttons, MAX_BUTTONS),
      dropdowns + roleMenus,
    );
    if (rows > MAX_ROWS) {
      errors.push(
        `that's ${rows} rows of components and discord only allows ${MAX_ROWS} ! every dropdown takes a whole row, and buttons sit ${BUTTONS_PER_ROW} to a row`,
      );
    }
  }

  return errors;
}
