import { Events, MessageFlags } from 'discord.js';

import type { SakoClient } from '../client.js';
import { handleEmbedComponents } from '../commands/embeds.js';
import { handleItemComponents } from '../commands/items.js';
import { handleButtonResponderComponents } from '../commands/buttonresponders.js';
import { handleSettingsComponents } from '../commands/settings.js';
import { buildPage } from '../services/pageRegistry.js';
import { logger } from '../logger.js';

export function registerInteractionCreate(client: SakoClient): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (
      (interaction.isButton() || interaction.isModalSubmit()) &&
      interaction.customId.startsWith('embeds:')
    ) {
      try {
        await handleEmbedComponents(interaction);
      } catch (err) {
        logger.error({ err, id: interaction.customId }, 'embed panel failed');
      }
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('items:')) {
      try {
        await handleItemComponents(interaction);
      } catch (err) {
        logger.error({ err, id: interaction.customId }, 'item confirm failed');
      }
      return;
    }

    if (
      interaction.isButton() &&
      (interaction.customId.startsWith('br:') ||
        interaction.customId.startsWith('buttonresponders:'))
    ) {
      try {
        await handleButtonResponderComponents(interaction);
      } catch (err) {
        logger.error(
          { err, id: interaction.customId },
          'button responder failed',
        );
      }
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('page:')) {
      try {
        if (!interaction.inCachedGuild()) return;

        const parts = interaction.customId.split(':');
        const raw = parts[parts.length - 1] ?? '0';
        const key = parts[1] ?? '';
        const scope = parts.slice(2, -1).join(':');

        const payload = buildPage(
          key,
          interaction.guild,
          scope || interaction.user.id,
          Number(raw),
        );
        if (payload) await interaction.update(payload);
      } catch (err) {
        logger.error({ err, id: interaction.customId }, 'pagination failed');
      }
      return;
    }

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId.startsWith('settings:')
    ) {
      try {
        await handleSettingsComponents(interaction);
      } catch (err) {
        logger.error(
          { err, id: interaction.customId },
          'settings panel failed',
        );
        await interaction
          .reply({
            content:
              'that panel is too old to poke at ! run /settings view again c:',
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
      }
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (!command?.autocomplete) return;

      try {
        await command.autocomplete(interaction);
      } catch (err) {
        logger.error(
          { err, name: interaction.commandName },
          'autocomplete failed',
        );
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      logger.warn({ name: interaction.commandName }, 'unknown command');
      return;
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      logger.error({ err, name: interaction.commandName }, 'command failed');
      const content = 'something broke running that command. check the logs.';
      if (interaction.replied || interaction.deferred) {
        await interaction
          .followUp({ content, flags: MessageFlags.Ephemeral })
          .catch(() => {});
      } else {
        await interaction
          .reply({ content, flags: MessageFlags.Ephemeral })
          .catch(() => {});
      }
    }
  });
}
