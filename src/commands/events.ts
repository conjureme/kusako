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
  setEventResponder,
  getEventResponder,
  removeEventResponder,
  EVENT_KINDS,
  type EventKind,
} from '../autoresponder/store.js';
import { getGuildSetting, setGuildSetting } from '../settings.js';
import { templateIssues } from '../autoresponder/validate.js';
import { parse } from '../autoresponder/parser.js';
import { fireEvent, eventChannelKey } from '../events/guildEvents.js';
import { serverEmbed, NO_DMS } from '../style.js';
import { templateDetailEmbed } from './autoresponders.js';
import { commandMention } from '../commandMentions.js';

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
      { name: 'join', value: 'join' },
      { name: 'leave', value: 'leave' },
      { name: 'boost', value: 'boost' },
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

      const existed = getEventResponder(guildId, kind) !== null;
      setEventResponder(guildId, kind, response);

      const channelId = getGuildSetting(guildId, eventChannelKey(kind));
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
      setGuildSetting(guildId, eventChannelKey(kind), channel.id);

      const missing = getEventResponder(guildId, kind) === null;
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
      const responder = getEventResponder(guildId, kind);

      if (!responder) {
        const embed = serverEmbed(interaction.guild).setDescription(
          `## no ${inlineCode(kind)} reply yet !\nwrite one with ${commandMention('/events set')} and i'll say something when it happens :3`,
        );
        await interaction.reply({ embeds: [embed] });
        return;
      }

      const channelId = getGuildSetting(guildId, eventChannelKey(kind));
      await interaction.reply({
        embeds: [
          eventDetailEmbed(
            interaction.guild,
            `the ${inlineCode(kind)} reply`,
            responder.response,
            channelId,
            [`fire it for real with ${commandMention('/events test')}`],
          ),
        ],
      });
      return;
    }

    if (sub === 'remove' && kind) {
      const found = getEventResponder(guildId, kind);

      if (!found) {
        const embed = serverEmbed(interaction.guild).setDescription(
          `## there's no ${inlineCode(kind)} reply to remove !\nmake one with ${commandMention('/events set')}`,
        );
        await interaction.reply({ embeds: [embed] });
        return;
      }

      removeEventResponder(guildId, kind);

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
          EVENT_KINDS.map((eventKind) => {
            const responder = getEventResponder(guildId, eventKind);
            const channelId = getGuildSetting(
              guildId,
              eventChannelKey(eventKind),
            );
            return {
              name: eventKind,
              value: `${responder ? '✓ reply set' : '✗ no reply'}\n${channelId ? `→ ${channelMention(channelId)}` : '→ nowhere !'}`,
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
