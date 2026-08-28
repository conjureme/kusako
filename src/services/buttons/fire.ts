import {
  ActionRowBuilder,
  ButtonBuilder,
  ComponentType,
  MessageFlags,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type MessageActionRowComponentBuilder,
  type StringSelectMenuInteraction,
} from 'discord.js';

import {
  claimButtonClick,
  getButtonResponder,
  parseButtonCustomId,
  parseDropdownCustomId,
  releaseButtonClick,
  isButtonCustomId,
  isDropdownCustomId,
} from './store.js';
import {
  getButtonLimit,
  endsForEveryone,
  type ButtonLimit,
} from './registry.js';
import { buttonScope } from '../cooldowns.js';
import { parse } from '../../dsl/parser.js';
import { evaluate } from '../../dsl/evaluate.js';
import { deliver } from '../../dsl/deliver.js';
import { failureEmbed } from '../../utils/style.js';
import { logger } from '../../logger.js';

const NOT_YOURS = "this one isn't yours to press !";

type ResponderInteraction = ButtonInteraction | StringSelectMenuInteraction;

async function nudge(
  interaction: ResponderInteraction,
  message: string,
): Promise<void> {
  await interaction
    .reply({ content: message, flags: MessageFlags.Ephemeral })
    .catch(() => null);
}

async function disableComponents(
  interaction: ResponderInteraction,
  shouldDisable: (customId: string) => boolean,
): Promise<void> {
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  for (const row of interaction.message.components) {
    if (row.type !== ComponentType.ActionRow) continue;

    const rebuilt = new ActionRowBuilder<MessageActionRowComponentBuilder>();
    for (const component of row.components) {
      if (component.type === ComponentType.Button) {
        const button = ButtonBuilder.from(component);
        const id = component.customId;
        if (id !== null && shouldDisable(id)) button.setDisabled(true);
        rebuilt.addComponents(button);
        continue;
      }

      if (component.type === ComponentType.StringSelect) {
        const select = StringSelectMenuBuilder.from(component);
        if (shouldDisable(component.customId)) select.setDisabled(true);
        rebuilt.addComponents(select);
      }
    }

    if (rebuilt.components.length > 0) rows.push(rebuilt);
  }

  await interaction.message
    .edit({ components: rows })
    .catch((err: unknown) => logger.warn({ err }, 'component disable failed'));
}

async function applyLimitDisable(
  interaction: ResponderInteraction,
  limit: ButtonLimit,
): Promise<void> {
  if (!endsForEveryone(limit)) return;

  if (!limit.perButton) {
    await disableComponents(
      interaction,
      (id) => isButtonCustomId(id) || isDropdownCustomId(id),
    );
    return;
  }

  if (!interaction.isButton()) return;
  await disableComponents(interaction, (id) => id === interaction.customId);
}

async function runResponder(
  interaction: ResponderInteraction,
  nameKey: string,
  invokerId: string | null,
  invokerOnlyGated: boolean,
): Promise<void> {
  if (!interaction.inCachedGuild()) return;

  const responder = getButtonResponder(interaction.guildId, nameKey);
  if (!responder || !interaction.channel?.isTextBased()) {
    await interaction.deferUpdate();
    return;
  }

  const locked = invokerOnlyGated ? responder.invokerOnly : true;
  if (locked && invokerId !== null && invokerId !== interaction.user.id) {
    await nudge(interaction, NOT_YOURS);
    return;
  }

  const limit = getButtonLimit(responder.limitMode);
  if (
    limit &&
    !claimButtonClick(
      interaction.guildId,
      interaction.message.id,
      interaction.user.id,
      responder.nameKey,
      limit,
    )
  ) {
    await nudge(interaction, limit.blocked);
    return;
  }

  const releaseClaim = (): void => {
    if (!limit) return;
    releaseButtonClick(
      interaction.message.id,
      interaction.user.id,
      responder.nameKey,
    );
  };

  const nodes = parse(responder.response);
  const wantsEphemeral = nodes.some(
    (node) => node.kind === 'placeholder' && node.name === 'ephemeral',
  );

  // an ephemeral reply needs the token left open for it, and {ephemeral} is
  // only knowable once the template is parsed, so the defer has to wait
  if (!wantsEphemeral) await interaction.deferUpdate();

  const result = await evaluate(
    nodes,
    {
      member: interaction.member,
      guild: interaction.guild,
      channel: interaction.channel,
    },
    buttonScope(responder.nameKey),
  );
  if (!result.ok) {
    releaseClaim();
    if (result.silent) {
      if (wantsEphemeral) await interaction.deferUpdate();
      return;
    }
    if (wantsEphemeral) {
      await interaction.reply({
        embeds: [failureEmbed(result.message)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.channel.send({
      embeds: [failureEmbed(result.message)],
    });
    return;
  }

  await deliver(result.segments, result.actions, {
    member: interaction.member,
    channel: interaction.channel,
    interaction,
  });

  if (limit) await applyLimitDisable(interaction, limit);
}

export async function fireButtonResponder(
  interaction: ButtonInteraction,
): Promise<void> {
  const parsed = parseButtonCustomId(interaction.customId);
  if (parsed === null) return;

  await runResponder(interaction, parsed.nameKey, parsed.invokerId, false);
}

export async function fireDropdownSelection(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const parsed = parseDropdownCustomId(interaction.customId);
  const picked = interaction.values[0];
  if (parsed === null || picked === undefined) return;

  await runResponder(interaction, picked, parsed.invokerId, true);
}
