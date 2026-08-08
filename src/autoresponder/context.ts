import type {
  Guild,
  GuildMember,
  GuildTextBasedChannel,
  Message,
} from 'discord.js';

export class PendingEffects {
  private balances = new Map<string, number>();
  private items = new Map<string, Map<string, number>>();

  addBalance(userId: string, delta: number): void {
    this.balances.set(userId, (this.balances.get(userId) ?? 0) + delta);
  }

  addItem(userId: string, itemKey: string, delta: number): void {
    const forUser = this.items.get(userId) ?? new Map<string, number>();
    forUser.set(itemKey, (forUser.get(itemKey) ?? 0) + delta);
    this.items.set(userId, forUser);
  }

  balanceDelta(userId: string): number {
    return this.balances.get(userId) ?? 0;
  }

  itemDelta(userId: string, itemKey: string): number {
    return this.items.get(userId)?.get(itemKey) ?? 0;
  }

  itemDeltas(userId: string): Map<string, number> {
    return this.items.get(userId) ?? new Map<string, number>();
  }
}

export interface RenderContext {
  member: GuildMember;
  guild: Guild;
  channel: GuildTextBasedChannel;
  message?: Message;
  messageArgs?: string[];
  pending?: PendingEffects;
}

export interface EvalMeta {
  guildId: string;
  userId: string;
  scope: string;
}
