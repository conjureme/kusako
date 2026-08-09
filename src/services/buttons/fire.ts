import { MessageFlags, type ButtonInteraction } from 'discord.js';

import { getButtonResponder, parseButtonCustomId } from './store.js';
import { buttonScope } from '../cooldowns.js';
import { parse } from '../../dsl/parser.js';
import { evaluate } from '../../dsl/evaluate.js';
import { deliver } from '../../dsl/deliver.js';
import { failureEmbed } from '../../utils/style.js';

export async function fireButtonResponder(
  interaction: ButtonInteraction,
): Promise<void> {
  const name = parseButtonCustomId(interaction.customId);
  if (name === null || !interaction.inCachedGuild()) return;

  const responder = getButtonResponder(interaction.guildId, name);
  if (
    !responder ||
    !interaction.channel ||
    !interaction.channel.isTextBased()
  ) {
    await interaction.deferUpdate();
    return;
  }

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
}
