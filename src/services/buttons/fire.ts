import {
  ActionRowBuilder,
  ButtonBuilder,
  ComponentType,
  MessageFlags,
  type ButtonInteraction,
} from 'discord.js';

import {
  claimButtonClick,
  getButtonResponder,
  parseButtonCustomId,
  releaseButtonClick,
  isButtonCustomId,
} from './store.js';
import { getButtonLimit, endsForEveryone } from './registry.js';
import { buttonScope } from '../cooldowns.js';
import { parse } from '../../dsl/parser.js';
import { evaluate } from '../../dsl/evaluate.js';
import { deliver } from '../../dsl/deliver.js';
import { failureEmbed } from '../../utils/style.js';
import { logger } from '../../logger.js';

const NOT_YOURS = "this one isn't yours to press !";

async function nudge(
  interaction: ButtonInteraction,
  message: string,
): Promise<void> {
  await interaction
    .reply({ content: message, flags: MessageFlags.Ephemeral })
    .catch(() => null);
}

async function disableButtons(
  interaction: ButtonInteraction,
  onlyThisOne: boolean,
): Promise<void> {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (const row of interaction.message.components) {
    if (row.type !== ComponentType.ActionRow) continue;

    const rebuilt = new ActionRowBuilder<ButtonBuilder>();
    for (const component of row.components) {
      if (component.type !== ComponentType.Button) continue;
      const button = ButtonBuilder.from(component);
      const id = component.customId;
      const gated = id !== null && isButtonCustomId(id);
      const match = onlyThisOne ? id === interaction.customId : gated;
      if (match) button.setDisabled(true);
      rebuilt.addComponents(button);
    }

    if (rebuilt.components.length > 0) rows.push(rebuilt);
  }

  await interaction.message
    .edit({ components: rows })
    .catch((err: unknown) => logger.warn({ err }, 'button disable failed'));
}

export async function fireButtonResponder(
  interaction: ButtonInteraction,
): Promise<void> {
  const parsed = parseButtonCustomId(interaction.customId);
  if (parsed === null || !interaction.inCachedGuild()) return;

  const responder = getButtonResponder(interaction.guildId, parsed.nameKey);
  if (
    !responder ||
    !interaction.channel ||
    !interaction.channel.isTextBased()
  ) {
    await interaction.deferUpdate();
    return;
  }

  if (parsed.invokerId !== null && parsed.invokerId !== interaction.user.id) {
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

  if (limit && endsForEveryone(limit)) {
    await disableButtons(interaction, limit.perButton);
  }
}
