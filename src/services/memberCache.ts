import type { Collection, Guild, GuildMember } from 'discord.js';

const FRESH_MS = 5 * 60_000;

// stays in memory on purpose: it has to die with the cache it describes.
// persisting it would let a restart claim "fresh" over an empty cache
const fetchedAt = new Map<string, number>();

export function invalidateFreshness(): void {
  fetchedAt.clear();
}

export async function fetchMembers(guild: Guild, force = false): Promise<void> {
  if (guild.members.cache.size >= guild.memberCount) return;

  const fresh = (fetchedAt.get(guild.id) ?? 0) > Date.now() - FRESH_MS;
  if (!force && fresh) return;

  await guild.members.fetch().catch(() => null);
  fetchedAt.set(guild.id, Date.now());
}

export async function humanPool(
  guild: Guild,
): Promise<Collection<string, GuildMember>> {
  await fetchMembers(guild);
  return guild.members.cache.filter((m) => !m.user.bot);
}

export async function botPool(
  guild: Guild,
): Promise<Collection<string, GuildMember>> {
  await fetchMembers(guild);
  return guild.members.cache.filter((m) => m.user.bot);
}
