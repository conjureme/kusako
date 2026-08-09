import { db } from '../../db.js';
import { getGuildSetting, setGuildSetting } from '../guildSettings.js';

export interface Currency {
  name: string;
  emoji: string;
}

const DEFAULT_CURRENCY: Currency = { name: 'curds', emoji: '🧀' };

export function getCurrency(guildId: string): Currency {
  return {
    name: getGuildSetting(guildId, 'currency.name') ?? DEFAULT_CURRENCY.name,
    emoji: getGuildSetting(guildId, 'currency.emoji') ?? DEFAULT_CURRENCY.emoji,
  };
}

export function setCurrency(guildId: string, currency: Currency): void {
  setGuildSetting(guildId, 'currency.name', currency.name);
  setGuildSetting(guildId, 'currency.emoji', currency.emoji);
}

export function getBalance(guildId: string, userId: string): number {
  const row = db()
    .prepare('SELECT balance FROM balances WHERE guild_id = ? AND user_id = ?')
    .get(guildId, userId) as { balance: number } | undefined;

  return row ? row.balance : 0;
}

export interface ModifyResult {
  ok: boolean;
  balance: number;
}

export function setBalance(
  guildId: string,
  userId: string,
  value: number,
  reason: string,
): ModifyResult {
  const target = Math.trunc(value);
  if (!Number.isSafeInteger(target) || target < 0) {
    return { ok: false, balance: getBalance(guildId, userId) };
  }

  const run = db().transaction(
    (): ModifyResult =>
      modifyBalance(
        guildId,
        userId,
        target - getBalance(guildId, userId),
        reason,
      ),
  );

  return run();
}

export function modifyBalances(
  guildId: string,
  userIds: string[],
  delta: number,
  reason: string,
): boolean {
  const amount = Math.trunc(delta);
  if (!Number.isSafeInteger(amount) || userIds.length === 0) return false;

  const run = db().transaction((): boolean => {
    for (const userId of userIds) {
      const result = modifyBalance(guildId, userId, amount, reason);
      if (!result.ok) throw new Error('bulk balance change failed');
    }
    return true;
  });

  return run();
}

export function transferBalance(
  guildId: string,
  fromUserId: string,
  toUserId: string,
  amount: number,
  reason: string,
): ModifyResult {
  const value = Math.trunc(amount);
  if (!Number.isSafeInteger(value) || value <= 0) {
    return { ok: false, balance: getBalance(guildId, fromUserId) };
  }

  const run = db().transaction((): ModifyResult => {
    const taken = modifyBalance(
      guildId,
      fromUserId,
      -value,
      `${reason} to ${toUserId}`,
    );
    if (!taken.ok) return taken;

    const given = modifyBalance(
      guildId,
      toUserId,
      value,
      `${reason} from ${fromUserId}`,
    );
    if (!given.ok) throw new Error('balance transfer failed');

    return taken;
  });

  return run();
}

export function modifyBalance(
  guildId: string,
  userId: string,
  delta: number,
  reason: string,
): ModifyResult {
  const amount = Math.trunc(delta);
  if (!Number.isSafeInteger(amount)) {
    return { ok: false, balance: getBalance(guildId, userId) };
  }

  const run = db().transaction((): ModifyResult => {
    const current = getBalance(guildId, userId);
    const next = current + amount;
    if (next < 0) return { ok: false, balance: current };

    const now = Date.now();
    db()
      .prepare(
        `INSERT INTO balances (guild_id, user_id, balance, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (guild_id, user_id)
         DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at`,
      )
      .run(guildId, userId, next, now);
    db()
      .prepare(
        `INSERT INTO transactions (guild_id, user_id, delta, balance_after, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(guildId, userId, amount, next, reason, now);

    return { ok: true, balance: next };
  });

  return run();
}
