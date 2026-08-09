import type { SakoClient } from '../client.js';
import { EVENTS } from '../services/guildEvents/registry.js';
import { fireEvent } from '../services/guildEvents/fire.js';
import { logger } from '../logger.js';

export function registerGuildEvents(client: SakoClient): void {
  for (const definition of EVENTS) {
    definition.register(client, async (guild, member) => {
      try {
        return await fireEvent(guild, member, definition.id);
      } catch (err) {
        logger.error(
          { err, guild: guild.id, event: definition.id },
          'event failed',
        );
        return null;
      }
    });
  }
}
