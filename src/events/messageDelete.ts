import { Events } from 'discord.js';

import type { SakoClient } from '../client.js';
import { clearMessageClicks } from '../services/buttons/store.js';
import { logger } from '../logger.js';

export function registerMessageDelete(client: SakoClient): void {
  client.on(Events.MessageDelete, (message) => {
    try {
      clearMessageClicks(message.id);
    } catch (err) {
      logger.error({ err, id: message.id }, 'button click cleanup failed');
    }
  });

  client.on(Events.MessageBulkDelete, (messages) => {
    for (const id of messages.keys()) {
      try {
        clearMessageClicks(id);
      } catch (err) {
        logger.error({ err, id }, 'button click cleanup failed');
      }
    }
  });
}
