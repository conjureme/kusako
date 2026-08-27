import {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type SlashCommandBuilder,
} from 'discord.js';

import { invalidateFreshness } from './services/memberCache.js';

export interface SlashCommand {
  data: SlashCommandBuilder;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}

export interface SakoClient extends Client {
  commands: Collection<string, SlashCommand>;
}

export function createClient(): SakoClient {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
    sweepers: {
      guildMembers: {
        interval: 600,
        filter: () => {
          invalidateFreshness();
          return (member) => member.id !== member.client.user.id;
        },
      },
      users: {
        interval: 600,
        filter: () => (user) => user.id !== user.client.user.id,
      },
    },
  }) as SakoClient;

  client.commands = new Collection();
  return client;
}
