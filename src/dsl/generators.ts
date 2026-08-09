import { humanPool } from '../services/memberCache.js';
import type { RenderContext } from './context.js';

export interface GeneratorResult {
  value: string;
  index?: number;
}

export type Generator = (
  ctx: RenderContext,
  args: string[],
  indices: ReadonlyMap<string, number>,
) => GeneratorResult | Promise<GeneratorResult>;

export const RANGE_FORMAT = /^(-?\d+)\s*-\s*(-?\d+)$/;
export const WEIGHTED_OPTION = /^(\d+)\s+(.+)$/;

export const generators = new Map<string, Generator>([
  [
    'range',
    (_ctx, args) => {
      const match = RANGE_FORMAT.exec(args[0] ?? '');
      if (!match) throw new Error(`bad range: ${args[0] ?? ''}`);

      const a = Number(match[1]);
      const b = Number(match[2]);
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);

      return { value: String(lo + Math.floor(Math.random() * (hi - lo + 1))) };
    },
  ],
  [
    'choice',
    (_ctx, args) => {
      const options = args
        .map((option, index) => ({ option, index }))
        .filter((entry) => entry.option.length > 0);
      if (options.length === 0) throw new Error('choice needs options');

      const picked = options[Math.floor(Math.random() * options.length)]!;
      return { value: picked.option, index: picked.index };
    },
  ],
  [
    'weightedchoice',
    (_ctx, args) => {
      const options = args.map((arg, index) => {
        const match = WEIGHTED_OPTION.exec(arg);
        if (!match) throw new Error(`bad weighted option: ${arg}`);

        const weight = Number(match[1]);
        if (weight <= 0) throw new Error(`bad weight: ${arg}`);
        return { weight, value: match[2]!, index };
      });
      if (options.length === 0) throw new Error('weightedchoice needs options');

      const total = options.reduce((sum, entry) => sum + entry.weight, 0);
      let roll = Math.random() * total;
      for (const entry of options) {
        roll -= entry.weight;
        if (roll < 0) return { value: entry.value, index: entry.index };
      }
      const last = options[options.length - 1]!;
      return { value: last.value, index: last.index };
    },
  ],
  [
    'lockedchoice',
    (_ctx, args, indices) => {
      const source = (args[0] ?? '').trim().toLowerCase();
      if (source.length === 0) throw new Error('lockedchoice needs a source');

      const index = indices.get(source);
      if (index === undefined) {
        throw new Error(`no choice bound as ${source}`);
      }

      const value = args[index + 1];
      if (value === undefined || value.length === 0) {
        throw new Error(`lockedchoice has no option ${index + 1}`);
      }

      return { value, index };
    },
  ],
  [
    'randommember',
    async (ctx) => {
      const pool = await humanPool(ctx.guild);
      const member = pool.random();
      if (!member) throw new Error('no cached members');

      return { value: member.toString() };
    },
  ],
]);
