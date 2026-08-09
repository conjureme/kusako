import { getCurrency, modifyBalance } from '../services/economy/guild.js';
import { getItem, modifyInventory } from '../services/items/store.js';
import type { EvalMeta } from './context.js';
import { parseAmount } from './args.js';
import { userIdOf } from './guards.js';

export class EffectError extends Error {
  readonly data?: Record<string, string>;

  constructor(message: string, data?: Record<string, string>) {
    super(message);
    this.data = data;
  }
}

export type Effect = (meta: EvalMeta, args: string[]) => void;

function targetIdOf(meta: EvalMeta, arg: string | undefined): string | null {
  const raw = (arg ?? '').trim();
  return raw.length > 0 ? userIdOf(raw) : meta.userId;
}

export type PendingDelta =
  | { kind: 'balance'; userId: string; delta: number }
  | { kind: 'item'; userId: string; itemKey: string; delta: number };

export function pendingOf(
  name: string,
  meta: EvalMeta,
  args: string[],
): PendingDelta | null {
  if (name === 'modifybal') {
    const amount = parseAmount(args[0] ?? '');
    const targetId = targetIdOf(meta, args[1]);
    if (amount === null || !targetId) return null;
    return { kind: 'balance', userId: targetId, delta: amount };
  }

  if (name === 'modifyinv') {
    const delta = parseAmount(args[1] ?? '');
    const targetId = targetIdOf(meta, args[2]);
    const item = getItem(meta.guildId, args[0] ?? '');
    if (delta === null || !targetId || !item) return null;
    return { kind: 'item', userId: targetId, itemKey: item.nameKey, delta };
  }

  return null;
}

export const effects = new Map<string, Effect>([
  [
    'modifybal',
    (meta, args) => {
      const amount = parseAmount(args[0] ?? '');
      const targetId = targetIdOf(meta, args[1]);
      if (amount === null || !targetId) {
        throw new EffectError(
          'this autoresponder has a broken {modifybal} tag !',
        );
      }
      if (amount === 0) return;

      const result = modifyBalance(
        meta.guildId,
        targetId,
        amount,
        `autoresponder ${meta.scope}`,
      );

      if (!result.ok) {
        const currency = getCurrency(meta.guildId);
        const who =
          targetId === meta.userId ? "you don't" : `<@${targetId}> doesn't`;
        throw new EffectError(
          `${who} have enough ${currency.emoji} ${currency.name} for that,,`,
          {
            'modifybal.have': result.balance.toLocaleString('en-US'),
            'modifybal.short': Math.max(
              0,
              Math.abs(amount) - result.balance,
            ).toLocaleString('en-US'),
          },
        );
      }
    },
  ],
  [
    'modifyinv',
    (meta, args) => {
      const name = args[0] ?? '';
      const delta = parseAmount(args[1] ?? '');
      const targetId = targetIdOf(meta, args[2]);
      if (name.length === 0 || delta === null || !targetId) {
        throw new EffectError(
          'this autoresponder has a broken {modifyinv} tag !',
        );
      }
      if (delta === 0) return;

      const item = getItem(meta.guildId, name);
      if (!item) {
        throw new EffectError(
          "that needs an item that doesn't exist anymore...",
        );
      }

      const result = modifyInventory(meta.guildId, targetId, name, delta);
      if (!result.ok) {
        const who =
          targetId === meta.userId ? "you don't" : `<@${targetId}> doesn't`;
        throw new EffectError(
          `${who} have enough ${item.emoji ?? '📦'} **${item.name}** for that,,`,
          {
            'modifyinv.item': item.name,
            'modifyinv.have': result.quantity.toLocaleString('en-US'),
            'modifyinv.short': Math.max(
              0,
              Math.abs(delta) - result.quantity,
            ).toLocaleString('en-US'),
          },
        );
      }
    },
  ],
]);
