import { db } from '../../db.js';
import type { ModifyResult } from './guild.js';
import { env } from '../../env.js';

export interface GlobalCurrency {
  name: string;
  emoji: string;
}

export const GLOBAL_CURRENCIES = {
  thingies: { name: 'thingies', emoji: '📦' },
  doodads: { name: 'doodads', emoji: '📦' },
} as const satisfies Record<string, GlobalCurrency>;

export type GlobalCurrencyId = keyof typeof GLOBAL_CURRENCIES;

export const GLOBAL_CURRENCY_IDS = Object.keys(
  GLOBAL_CURRENCIES,
) as GlobalCurrencyId[];

export function isOwner(userId: string): boolean {
  return env.ownerId !== '' && userId === env.ownerId;
}

export function getGlobalBalance(
  userId: string,
  currency: GlobalCurrencyId,
): number {
  const row = db()
    .prepare(
      'SELECT balance FROM global_balances WHERE user_id = ? AND currency = ?',
    )
    .get(userId, currency) as { balance: number } | undefined;

  return row ? row.balance : 0;
}

export function getGlobalBalances(
  userId: string,
): Record<GlobalCurrencyId, number> {
  const rows = db()
    .prepare('SELECT currency, balance FROM global_balances WHERE user_id = ?')
    .all(userId) as Array<{ currency: string; balance: number }>;

  const result = Object.fromEntries(
    GLOBAL_CURRENCY_IDS.map((id) => [id, 0]),
  ) as Record<GlobalCurrencyId, number>;

  for (const row of rows) {
    if (row.currency in result) {
      result[row.currency as GlobalCurrencyId] = row.balance;
    }
  }

  return result;
}

export function setGlobalBalance(
  userId: string,
  currency: GlobalCurrencyId,
  value: number,
  reason: string,
): ModifyResult {
  const target = Math.trunc(value);
  if (!Number.isSafeInteger(target) || target < 0) {
    return { ok: false, balance: getGlobalBalance(userId, currency) };
  }

  const run = db().transaction(
    (): ModifyResult =>
      modifyGlobalBalance(
        userId,
        currency,
        target - getGlobalBalance(userId, currency),
        reason,
      ),
  );

  return run();
}

export function modifyGlobalBalance(
  userId: string,
  currency: GlobalCurrencyId,
  delta: number,
  reason: string,
): ModifyResult {
  const amount = Math.trunc(delta);
  if (!Number.isSafeInteger(amount)) {
    return { ok: false, balance: getGlobalBalance(userId, currency) };
  }

  const run = db().transaction((): ModifyResult => {
    const current = getGlobalBalance(userId, currency);
    const next = current + amount;
    if (next < 0) return { ok: false, balance: current };

    const now = Date.now();
    db()
      .prepare(
        `INSERT INTO global_balances (user_id, currency, balance, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, currency)
         DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at`,
      )
      .run(userId, currency, next, now);
    db()
      .prepare(
        `INSERT INTO global_transactions (user_id, currency, delta, balance_after, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(userId, currency, amount, next, reason, now);

    return { ok: true, balance: next };
  });

  return run();
}
