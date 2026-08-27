import { Events } from 'discord.js';

import type { SakoClient } from '../client.js';
import { logger } from '../logger.js';
import { startScheduler } from '../services/scheduler.js';
import { startScheduleSweep } from '../services/scheduled/fire.js';
import { applyPresence } from '../services/presence.js';
import { cacheCommandIds } from '../utils/commandMentions.js';
import { clearStaleReservations } from '../services/tickets/store.js';

export function registerReady(client: SakoClient): void {
  client.once(Events.ClientReady, async (c) => {
    logger.info(`logged in as ${c.user.tag} (${c.user.id})`);
    logger.info(`serving ${c.guilds.cache.size} guild(s)`);
    const stale = clearStaleReservations();
    if (stale > 0) logger.warn(`cleared ${stale} stale ticket reservation(s)`);

    startScheduler(c);
    startScheduleSweep(c);
    applyPresence(c);
    await cacheCommandIds(c);
  });

  client.on(Events.ShardReady, () => applyPresence(client));
  client.on(Events.ShardResume, () => applyPresence(client));
}
