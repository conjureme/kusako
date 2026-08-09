import { Events } from 'discord.js';

import type { SakoClient } from '../client.js';
import { logger } from '../logger.js';
import { startScheduler } from '../services/scheduler.js';
import { cacheCommandIds } from '../utils/commandMentions.js';

export function registerReady(client: SakoClient): void {
  client.once(Events.ClientReady, async (c) => {
    logger.info(`logged in as ${c.user.tag} (${c.user.id})`);
    logger.info(`serving ${c.guilds.cache.size} guild(s)`);
    startScheduler(c);
    await cacheCommandIds(c);
  });
}
