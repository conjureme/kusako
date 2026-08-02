import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';

import type { SlashCommand } from '../client.js';
import { parse } from '../autoresponder/parser.js';
import { templateIssues } from '../autoresponder/validate.js';
import { evaluate } from '../autoresponder/evaluate.js';
import { deliver } from '../autoresponder/deliver.js';
import { userEmbed, failureEmbed, NO_DMS } from '../style.js';

const MESSAGE_MAX = 2000;

function sendIssues(message: string): string | null {
  const hasCooldown = parse(message).some(
    (node) => node.kind === 'placeholder' && node.name === 'cooldown',
  );
  if (hasCooldown) {
    return "{cooldown} doesn't work here,, sowwy";
  }
  return templateIssues(message);
}

export const send: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('send')
    .setDescription('make sako say something... once')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) =>
      o
        .setName('message')
        .setDescription('what should i say !')
        .setMaxLength(MESSAGE_MAX)
        .setRequired(true),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: NO_DMS,
      });
      return;
    }

    const channel = interaction.channel;
    if (!channel) {
      await interaction.reply({ content: "i can't see this channel !" });
      return;
    }

    const message = interaction.options.getString('message', true);

    const issues = sendIssues(message);
    if (issues) {
      await interaction.reply({
        content: issues,
        allowedMentions: { parse: [] },
      });
      return;
    }

    const nodes = parse(message);
    const wantsEphemeral = nodes.some(
      (node) => node.kind === 'placeholder' && node.name === 'ephemeral',
    );

    const result = await evaluate(
      nodes,
      {
        member: interaction.member,
        guild: interaction.guild,
        channel,
      },
      'send',
    );

    if (!result.ok) {
      await interaction.reply({
        embeds: [failureEmbed(result.message)],
        ...(wantsEphemeral ? { flags: MessageFlags.Ephemeral } : {}),
      });
      return;
    }

    if (!result.actions.ephemeral) {
      const destination = result.actions.dm
        ? 'your dms'
        : result.actions.sendToChannelId &&
            result.actions.sendToChannelId !== channel.id
          ? `<#${result.actions.sendToChannelId}>`
          : null;

      const embed = userEmbed(interaction.user).setTitle('✦ sent !');
      if (destination)
        embed.setDescription(`your message went to ${destination} !`);
      await interaction.reply({ embeds: [embed] });
    }

    await deliver(result.segments, result.actions, {
      member: interaction.member,
      channel,
      interaction,
    });
  },
};
