import type { Client } from 'discord.js';

import { logger } from '../logger.js';

const ids = new Map<string, string>();

export async function cacheCommandIds(client: Client<true>): Promise<void> {
  try {
    const global = await client.application.commands.fetch();
    for (const command of global.values()) ids.set(command.name, command.id);

    for (const guild of client.guilds.cache.values()) {
      const local = await guild.commands.fetch();
      for (const command of local.values()) ids.set(command.name, command.id);
    }

    logger.info(`cached ${ids.size} command id(s) for mentions`);
  } catch (err) {
    logger.error({ err }, 'could not cache command ids');
  }
}

export function commandMention(path: string): string {
  const trimmed = path.trim().replace(/^\//, '');
  const root = trimmed.split(' ')[0] ?? '';
  const id = ids.get(root);

  return id ? `</${trimmed}:${id}>` : `\`/${trimmed}\``;
}
