import { env } from './env.js';
import { createClient } from './client.js';
import { commands } from './commands/index.js';
import { registerReady } from './events/ready.js';
import { registerInteractionCreate } from './events/interactionCreate.js';
import { registerMessageCreate } from './events/messageCreate.js';
import { registerGuildEvents } from './events/guildMembers.js';

import { logger } from './logger.js';
import { db } from './db.js';

async function main(): Promise<void> {
  db();

  const client = createClient();

  for (const command of commands) {
    client.commands.set(command.data.name, command);
  }

  registerReady(client);
  registerInteractionCreate(client);
  registerMessageCreate(client);
  registerGuildEvents(client);

  await client.login(env.botToken);
}

main().catch((err) => {
  logger.fatal({ err }, 'fatal startup error');
  process.exit(1);
});
