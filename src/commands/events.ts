import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  channelMention,
  codeBlock,
  inlineCode,
  type Guild,
  type SlashCommandStringOption,
} from 'discord.js';

import type { SlashCommand } from '../client.js';
import {
  setEventReply,
  getEventReply,
  setEventChannel,
  removeEventReply,
} from '../services/guildEvents/store.js';
import { EVENTS, type EventKind } from '../services/guildEvents/registry.js';
import { templateIssues } from '../dsl/validate.js';
import { parse } from '../dsl/parser.js';
import { fireEvent } from '../services/guildEvents/fire.js';
import { serverEmbed, NO_DMS } from '../utils/style.js';
import { templateDetailEmbed } from '../utils/templateEmbed.js';
import { commandMention } from '../utils/commandMentions.js';

const RESPONSE_MAX = 2000;

function eventDetailEmbed(
  guild: Guild,
  header: string,
  response: string,
  channelId: string | null,
  notes: string[] = [],
) {
  return templateDetailEmbed(guild, header, response, {
    cooldown: false,
    notes,
    fields: [
      {
        name: 'goes to',
        value: channelId ? channelMention(channelId) : 'nowhere yet !',
        inline: true,
      },
    ],
  });
}

function eventOption(o: SlashCommandStringOption): SlashCommandStringOption {
  return o
    .setName('event')
    .setDescription('which event')
    .setRequired(true)
    .addChoices(
      ...EVENTS.map((event) => ({ name: event.label, value: event.id })),
    );
}

export const events: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('events')
    .setDescription('messages sako sends when things happen')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('set the reply for an event')
        .addStringOption(eventOption)
        .addStringOption((o) =>
          o
            .setName('reply')
            .setDescription('what sako sends. variables work here !')
            .setMaxLength(RESPONSE_MAX)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('where replies for an event go')
        .addStringOption(eventOption)
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('the channel to send to')
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
            )
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription("show an event's raw message")
        .addStringOption(eventOption),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription("remove an event's message")
        .addStringOption(eventOption),
    )
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('all three events at a glance'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('test')
        .setDescription('fire an event as if you triggered it !')
        .addStringOption(eventOption),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: NO_DMS,
      });
      return;
    }

    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();
    const kind =
      sub === 'view'
        ? null
        : (interaction.options.getString('event', true) as EventKind);

    if (sub === 'set' && kind) {
      const response = interaction.options.getString('reply', true);

      const issues = templateIssues(response);
      if (issues) {
        await interaction.reply({ content: issues });
        return;
      }

      const existed = getEventReply(guildId, kind)?.response != null;
      setEventReply(guildId, kind, response);

      const channelId = getEventReply(guildId, kind)?.channelId ?? null;
      const notes: string[] = [];
      if (!channelId) {
        notes.push(
          `it won't fire until you pick a channel with ${commandMention('/events channel')} !`,
        );
      }
      if (
        parse(response).some(
          (node) =>
            node.kind === 'placeholder' && node.name === 'deletetrigger',
        )
      ) {
        notes.push(
          'psst: {deletetrigger} does nothing on events, there is no message to delete',
        );
      }

      await interaction.reply({
        embeds: [
          eventDetailEmbed(
            interaction.guild,
            `${existed ? 'updated' : 'set'} the ${inlineCode(kind)} reply !`,
            response,
            channelId,
            notes,
          ),
        ],
      });
      return;
    }

    if (sub === 'channel' && kind) {
      const channel = interaction.options.getChannel('channel', true);
      const missing = getEventReply(guildId, kind)?.response == null;
      setEventChannel(guildId, kind, channel.id);
      const embed = serverEmbed(interaction.guild).setDescription(
        [
          `## ${inlineCode(kind)} goes to ${channel.toString()} !`,
          missing
            ? `-# there's no ${inlineCode(kind)} reply yet, so nothing sends until you write one with ${commandMention('/events set')}`
            : null,
        ]
          .filter((line) => line !== null)
          .join('\n'),
      );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'show' && kind) {
      const reply = getEventReply(guildId, kind);

      if (!reply?.response) {
        const embed = serverEmbed(interaction.guild).setDescription(
          `## no ${inlineCode(kind)} reply yet !\nwrite one with ${commandMention('/events set')} and i'll say something when it happens :3`,
        );
        await interaction.reply({ embeds: [embed] });
        return;
      }

      await interaction.reply({
        embeds: [
          eventDetailEmbed(
            interaction.guild,
            `the ${inlineCode(kind)} reply`,
            reply.response,
            reply.channelId,
            [`fire it for real with ${commandMention('/events test')}`],
          ),
        ],
      });
      return;
    }

    if (sub === 'remove' && kind) {
      const found = getEventReply(guildId, kind);

      if (!found?.response) {
        const embed = serverEmbed(interaction.guild).setDescription(
          `## there's no ${inlineCode(kind)} reply to remove !\nmake one with ${commandMention('/events set')}`,
        );
        await interaction.reply({ embeds: [embed] });
        return;
      }

      removeEventReply(guildId, kind);

      const embed = serverEmbed(interaction.guild).setDescription(
        `## removed the ${inlineCode(kind)} reply !\n${codeBlock(found.response)}\n-# put it back with ${commandMention('/events set')}`,
      );
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'view') {
      const embed = serverEmbed(interaction.guild)
        .setTitle('✦ event replies')
        .setDescription(
          `-# an event with no channel never fires... try ${commandMention('/events test')}`,
        )
        .addFields(
          EVENTS.map((event) => {
            const reply = getEventReply(guildId, event.id);
            return {
              name: event.label,
              value: `${reply?.response ? '✓ reply set' : '✗ no reply'}\n${reply?.channelId ? `→ ${channelMention(reply.channelId)}` : '→ nowhere !'}`,
              inline: true,
            };
          }),
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'test' && kind) {
      const outcome = await fireEvent(
        interaction.guild,
        interaction.member,
        kind,
      );

      if (outcome.kind === 'fired') {
        const embed = serverEmbed(interaction.guild).setDescription(
          [
            `## fired a test ${inlineCode(kind)} !`,
            `it went to ${channelMention(outcome.channelId)} :3c`,
            `-# effects and cooldowns commit for real on tests !`,
          ].join('\n'),
        );
        await interaction.reply({ embeds: [embed] });
        return;
      }

      const excuse =
        outcome.kind === 'no-template'
          ? `there's no ${inlineCode(kind)} reply yet ! write one with ${commandMention('/events set')}`
          : outcome.kind === 'no-channel'
            ? `${inlineCode(kind)} has nowhere to go ! pick a channel with ${commandMention('/events channel')}`
            : `something in the reply stopped it, so nothing sent:\n> ${outcome.reason}`;

      const embed = serverEmbed(interaction.guild).setDescription(
        `## the test didn't fire !\n${excuse}`,
      );
      await interaction.reply({ embeds: [embed] });
      return;
    }
  },
};
