import type { Message } from 'discord.js';

import {
  GLOBAL_CURRENCIES,
  GLOBAL_CURRENCY_IDS,
  type GlobalCurrencyId,
  getGlobalBalances,
  isOwner,
  modifyGlobalBalance,
  setGlobalBalance,
} from '../services/economy/global.js';
import {
  ACTIVITY_NAMES,
  DOTS,
  TEXT_MAX,
  applyPresence,
  clearActivity,
  getPresence,
  isActivityKind,
  isDot,
  setActivity,
  setDot,
} from '../services/presence.js';
import { logger } from '../logger.js';

const PREFIX = ';';

const USAGE = [
  'here is currency syntax !',
  '`;global add <user> <currency> <amount>`',
  '`;global remove <user> <currency> <amount>`',
  '`;global set <user> <currency> <amount>`',
  '`;global show [user]`',
  `-# currencies: ${GLOBAL_CURRENCY_IDS.join(', ')}`,
].join('\n');

const STATUS_USAGE = [
  'here is status syntax !',
  `\`;status <${ACTIVITY_NAMES.join('|')}> <text>\``,
  `\`;status dot <${DOTS.join('|')}>\``,
  '`;status clear`',
  '`;status show`',
].join('\n');

function userIdOf(arg: string | undefined): string | null {
  if (!arg) return null;
  const match = /^(?:<@!?(\d{17,20})>|(\d{17,20}))$/.exec(arg);
  if (!match) return null;
  return match[1] ?? match[2] ?? null;
}

function currencyOf(arg: string | undefined): GlobalCurrencyId | null {
  const key = arg?.toLowerCase();
  if (key && key in GLOBAL_CURRENCIES) return key as GlobalCurrencyId;
  return null;
}

function balanceLine(currency: GlobalCurrencyId, amount: number): string {
  const { name, emoji } = GLOBAL_CURRENCIES[currency];
  return `${emoji} **${amount.toLocaleString('en-US')}** ${name}`;
}

async function reply(message: Message, content: string): Promise<void> {
  await message.reply({
    content,
    allowedMentions: { parse: [], repliedUser: false },
  });
}

export async function handleOwnerCommand(message: Message): Promise<boolean> {
  if (!message.content.startsWith(PREFIX)) return false;
  if (!isOwner(message.author.id)) return false;

  const [command, ...args] = message.content
    .slice(PREFIX.length)
    .trim()
    .split(/\s+/);
  const name = command?.toLowerCase();
  if (name !== 'global' && name !== 'status') return false;

  try {
    if (name === 'global') await runGlobal(message, args);
    else await runStatus(message, args);
  } catch (err) {
    logger.error({ err, user: message.author.id }, 'owner command failed');
  }
  return true;
}

function presenceLine(): string {
  const { kind, text, dot } = getPresence();
  const activity = kind && text ? `**${kind}** ${text}` : 'nothing at all';
  return `i'm ${activity},, dot is **${dot}**`;
}

async function runStatus(message: Message, args: string[]): Promise<void> {
  const action = args[0]?.toLowerCase() ?? '';

  if (action === 'show') {
    await reply(message, presenceLine());
    return;
  }

  if (action === 'clear') {
    clearActivity();
    applyPresence(message.client);
    await reply(message, 'status cleared :3');
    return;
  }

  if (action === 'dot') {
    const dot = args[1]?.toLowerCase() ?? '';
    if (!isDot(dot)) {
      await reply(message, STATUS_USAGE);
      return;
    }
    setDot(dot);
    applyPresence(message.client);
    await reply(message, `dot is **${dot}** now !`);
    return;
  }

  if (!isActivityKind(action)) {
    await reply(message, STATUS_USAGE);
    return;
  }

  const text = args.slice(1).join(' ').trim();
  if (text.length === 0) {
    await reply(message, 'give me something to say silly !');
    return;
  }
  if (text.length > TEXT_MAX) {
    await reply(
      message,
      `that's ${text.length} characters... keep it under ${TEXT_MAX} for me`,
    );
    return;
  }

  setActivity(action, text);
  applyPresence(message.client);
  await reply(message, `okay! ${presenceLine()}`);
}

async function runGlobal(message: Message, args: string[]): Promise<void> {
  const action = args[0]?.toLowerCase();

  if (action === 'show') {
    const userId =
      args[1] === undefined ? message.author.id : userIdOf(args[1]);
    if (!userId) {
      await reply(
        message,
        "GRRRRRR that doesn't look like a user id or mention!",
      );
      return;
    }
    const balances = getGlobalBalances(userId);
    const lines = GLOBAL_CURRENCY_IDS.map((id) =>
      balanceLine(id, balances[id]),
    );
    await reply(message, `<@${userId}>'s global pockets:\n${lines.join('\n')}`);
    return;
  }

  if (action !== 'add' && action !== 'remove' && action !== 'set') {
    await reply(message, USAGE);
    return;
  }

  const userId = userIdOf(args[1]);
  const currency = currencyOf(args[2]);
  const amount = /^\d+$/.test(args[3] ?? '') ? Number(args[3]) : null;

  if (
    !userId ||
    !currency ||
    amount === null ||
    !Number.isSafeInteger(amount)
  ) {
    await reply(message, USAGE);
    return;
  }
  if (amount === 0 && action !== 'set') {
    await reply(
      message,
      'zero of something is... nothing at all. please give me a real amount!!!',
    );
    return;
  }

  const result =
    action === 'set'
      ? setGlobalBalance(userId, currency, amount, ';global set')
      : modifyGlobalBalance(
          userId,
          currency,
          action === 'remove' ? -amount : amount,
          `;global ${action}`,
        );

  if (!result.ok) {
    await reply(
      message,
      `<@${userId}> only has ${balanceLine(currency, result.balance)},, can't take ${amount.toLocaleString('en-US')} !`,
    );
    return;
  }

  await reply(
    message,
    `done ! <@${userId}> now has ${balanceLine(currency, result.balance)}`,
  );
}
