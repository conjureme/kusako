import type { Guild, InteractionUpdateOptions } from 'discord.js';

export type PageBuilder = (
  guild: Guild,
  userId: string,
  page: number,
) => InteractionUpdateOptions;

const builders = new Map<string, PageBuilder>();

export function registerPage(key: string, builder: PageBuilder): void {
  builders.set(key, builder);
}

export function buildPage(
  key: string,
  guild: Guild,
  userId: string,
  page: number,
): InteractionUpdateOptions | null {
  const builder = builders.get(key);
  return builder ? builder(guild, userId, page) : null;
}
