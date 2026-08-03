import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  codeBlock,
  inlineCode,
  type Guild,
} from 'discord.js';

import type { SlashCommand } from '../client.js';
import {
  setLevelResponder,
  getLevelResponder,
  removeLevelResponder,
  listLevelResponders,
} from '../autoresponder/store.js';
import { templateIssues } from '../autoresponder/validate.js';
import { isLevelingEnabled, MAX_LEVEL } from '../levels.js';
import { serverEmbed, NO_DMS } from '../style.js';
import { templateTraits, templateDetailEmbed } from './autoresponders.js';
import { commandMention } from '../commandMentions.js';
import { paginate, applyPage } from '../pagination.js';
import { registerPage } from '../pageRegistry.js';

const RESPONSE_MAX = 2000;

function levelDetailEmbed(
  guild: Guild,
  header: string,
  level: number,
  response: string,
  notes: string[] = [],
) {
  const off = !isLevelingEnabled(guild.id);
  return templateDetailEmbed(guild, header, response, {
    notes: off
      ? [
          ...notes,
          `leveling is OFF here, so this never fires yet ! flip it on with ${commandMention('/settings set levels')}`,
        ]
      : notes,
    fields: [
      {
        name: 'fires at',
        value: `level ${level}`,
        inline: true,
      },
    ],
  });
}

function levelsPage(guild: Guild, _userId: string, page: number) {
  const entries = listLevelResponders(guild.id);

  if (entries.length === 0) {
    const embed = serverEmbed(guild)
      .setTitle('✦ level replies (0)')
      .setDescription(
        `no level replies yet ! add one with ${commandMention('/levels set')}`,
      );

    return { embeds: [embed], components: [] };
  }

  const off = isLevelingEnabled(guild.id)
    ? null
    : `-# leveling is off,, none of these fire until ${commandMention('/settings set levels')}`;

  const blocks = entries.map(({ level, responder }) => {
    const badges = templateTraits(responder.response).badges;
    const summary = badges.length ? badges.join(' · ') : 'just a message';
    return `ᯓ➤ **level ${level}**\n-# ✧ ${summary}`;
  });

  const hint = `⁀જ➣ see one up close with ${inlineCode('/levels show <level>')}`;
  const current = paginate(blocks, off, hint, page);
  const embed = serverEmbed(guild).setTitle(
    `✦ level replies (${entries.length})`,
  );
  const components = applyPage(embed, 'levels', current);

  return { embeds: [embed], components };
}

registerPage('levels', levelsPage);

export const levels: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('levels')
    .setDescription('personalized level up replies for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('set the reply for reaching a level')
        .addIntegerOption((o) =>
          o
            .setName('level')
            .setDescription('which level to celebrate')
            .setMinValue(2)
            .setMaxValue(MAX_LEVEL)
            .setRequired(true),
        )
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
        .setName('show')
        .setDescription("show a level's raw reply")
        .addIntegerOption((o) =>
          o
            .setName('level')
            .setDescription('which level')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription("remove a level's reply")
        .addIntegerOption((o) =>
          o
            .setName('level')
            .setDescription('which level')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('every level with a reply'),
    ) as SlashCommandBuilder,

  async autocomplete(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.respond([]);
      return;
    }

    const query = interaction.options.getFocused();
    const entries = listLevelResponders(interaction.guildId)
      .filter((entry) => entry.level.toString().startsWith(query))
      .slice(0, 25)
      .map((entry) => ({
        name: `level ${entry.level}`,
        value: entry.level,
      }));

    await interaction.respond(entries);
  },

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: NO_DMS,
      });
      return;
    }

    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const level = interaction.options.getInteger('level', true);
      const reply = interaction.options.getString('reply', true);

      const issues = templateIssues(reply);
      if (issues) {
        await interaction.reply({ content: issues });
        return;
      }

      const existed = getLevelResponder(guildId, level) !== null;
      setLevelResponder(guildId, level, reply);

      await interaction.reply({
        embeds: [
          levelDetailEmbed(
            interaction.guild,
            `${existed ? 'updated' : 'set'} the level ${level} reply !`,
            level,
            reply,
          ),
        ],
      });
      return;
    }

    if (sub === 'show') {
      const level = interaction.options.getInteger('level', true);
      const responder = getLevelResponder(guildId, level);

      if (!responder) {
        const embed = serverEmbed(interaction.guild).setDescription(
          `## level ${level} doesn't have a reply !\nwrite one with ${commandMention('/levels set')} and i'll celebrate when someone gets there :3`,
        );
        await interaction.reply({ embeds: [embed] });
        return;
      }

      await interaction.reply({
        embeds: [
          levelDetailEmbed(
            interaction.guild,
            `the level ${level} reply`,
            level,
            responder.response,
          ),
        ],
      });
      return;
    }

    if (sub === 'remove') {
      const level = interaction.options.getInteger('level', true);
      const found = getLevelResponder(guildId, level);

      if (!found) {
        const embed = serverEmbed(interaction.guild).setDescription(
          `## level ${level} doesn't have a reply !\nnothing to clean up here,, make one with ${commandMention('/levels set')}`,
        );
        await interaction.reply({ embeds: [embed] });
        return;
      }

      removeLevelResponder(guildId, level);

      const embed = serverEmbed(interaction.guild).setDescription(
        `## removed the level ${level} reply !\n${codeBlock(found.response)}\n-# level ${level} goes by quietly now,, put it back with ${commandMention('/levels set')}`,
      );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'list') {
      await interaction.reply(
        levelsPage(interaction.guild, interaction.user.id, 0),
      );
      return;
    }
  },
};
