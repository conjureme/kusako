import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

import type { SlashCommand } from '../client.js';
import { getCurrency, setCurrency } from '../services/economy/guild.js';
import {
  getPatSettings,
  setPatSettings,
  isGameEnabled,
  setGameEnabled,
} from '../services/games/store.js';
import { setLevelingEnabled } from '../services/levels/store.js';
import { formatDuration } from '../dsl/args.js';
import {
  isValidTimeZone,
  setGuildTimezone,
  timeZones,
  zonedParts,
  formatWallTime,
} from '../services/timezone.js';
import { serverEmbed, NO_DMS } from '../utils/style.js';

const SUGGESTED_ZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
];

export const settings: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('configure sako for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('coming back soon !'),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('set')
        .setDescription('change a setting')
        .addSubcommand((sub) =>
          sub
            .setName('currency')
            .setDescription('change the server currency')
            .addStringOption((o) =>
              o
                .setName('name')
                .setDescription('what the currency is called, e.g. curds')
                .setMaxLength(32)
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName('emoji')
                .setDescription('the emoji shown next to it')
                .setMaxLength(64)
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('pat')
            .setDescription('tune the head pat minigame')
            .addIntegerOption((o) =>
              o
                .setName('min')
                .setDescription('smallest reward per pat')
                .setMinValue(1)
                .setMaxValue(1_000_000),
            )
            .addIntegerOption((o) =>
              o
                .setName('max')
                .setDescription('biggest reward per pat')
                .setMinValue(1)
                .setMaxValue(1_000_000),
            )
            .addIntegerOption((o) =>
              o
                .setName('cooldown')
                .setDescription('minutes between pats')
                .setMinValue(1)
                .setMaxValue(10_080),
            )
            .addBooleanOption((o) =>
              o
                .setName('enabled')
                .setDescription('turn /pat on or off for this server'),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('levels')
            .setDescription('turn leveling on or off')
            .addBooleanOption((o) =>
              o
                .setName('enabled')
                .setDescription('should members earn xp in this server?')
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('timezone')
            .setDescription('set the clock sako reads for scheduled posts')
            .addStringOption((o) =>
              o
                .setName('zone')
                .setDescription('a timezone like America/Chicago')
                .setAutocomplete(true)
                .setRequired(true),
            ),
        ),
    ) as SlashCommandBuilder,

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().trim().toLowerCase();
    const pool =
      focused.length === 0
        ? SUGGESTED_ZONES
        : timeZones().filter((zone) => zone.toLowerCase().includes(focused));

    await interaction.respond(
      pool.slice(0, 25).map((zone) => ({ name: zone, value: zone })),
    );
  },

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: NO_DMS,
      });
      return;
    }

    const guildId = interaction.guildId;
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (group === null && sub === 'view') {
      const embed = serverEmbed(interaction.guild).setDescription(
        "working on it !! this one is getting rebuilt, so it's away for now",
      );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (group === 'set' && sub === 'currency') {
      const name = interaction.options.getString('name', true);
      const emoji = interaction.options.getString('emoji', true);
      setCurrency(guildId, { name, emoji });

      const embed = serverEmbed(interaction.guild)
        .setTitle('✦ currency updated !')
        .setDescription(`this server's currency is now ${emoji} **${name}** !`);

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (group === 'set' && sub === 'pat') {
      const min = interaction.options.getInteger('min');
      const max = interaction.options.getInteger('max');
      const cooldown = interaction.options.getInteger('cooldown');
      const enabled = interaction.options.getBoolean('enabled');

      if (
        min === null &&
        max === null &&
        cooldown === null &&
        enabled === null
      ) {
        await interaction.reply({
          content:
            'give me something to change !! (min, max, cooldown, and/or enabled)',
        });
        return;
      }

      const current = getPatSettings(guildId);
      const nextMin = min ?? current.minReward;
      const nextMax = max ?? current.maxReward;
      if (nextMin > nextMax) {
        await interaction.reply({
          content: `min can't be bigger than max !! that would make the range ${nextMin.toLocaleString('en-US')}-${nextMax.toLocaleString('en-US')}`,
        });
        return;
      }

      setPatSettings(guildId, {
        ...(min !== null ? { minReward: min } : {}),
        ...(max !== null ? { maxReward: max } : {}),
        ...(cooldown !== null ? { cooldownSeconds: cooldown * 60 } : {}),
      });
      if (enabled !== null) setGameEnabled(guildId, 'pat', enabled);

      const now = getPatSettings(guildId);
      const currency = getCurrency(guildId);
      const state = isGameEnabled(guildId, 'pat') ? 'on' : 'off';
      const embed = serverEmbed(interaction.guild)
        .setTitle('✦ head pats updated !')
        .setDescription(
          `reward: ${currency.emoji} **${now.minReward.toLocaleString('en-US')}-${now.maxReward.toLocaleString('en-US')} ${currency.name}**, cooldown: **${formatDuration(now.cooldownSeconds)}**, pats are **${state}** !`,
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (group === 'set' && sub === 'timezone') {
      const zone = interaction.options.getString('zone', true).trim();
      if (!isValidTimeZone(zone)) {
        await interaction.reply({
          content: `i don't know the timezone **${zone}**!! pick one from the list, like \`America/Chicago\``,
        });
        return;
      }

      setGuildTimezone(guildId, zone);
      const now = zonedParts(Date.now(), zone);
      const embed = serverEmbed(interaction.guild)
        .setTitle('✦ timezone updated !')
        .setDescription(
          `scheduled posts follow **${zone}** now; it's ${formatWallTime(now.hour * 60 + now.minute)} there`,
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (group === 'set' && sub === 'levels') {
      const enabled = interaction.options.getBoolean('enabled', true);
      setLevelingEnabled(guildId, enabled);

      const embed = serverEmbed(interaction.guild)
        .setTitle('✦ leveling updated !')
        .setDescription(
          enabled
            ? 'leveling is **on** ! members earn xp by chatting now c:'
            : 'leveling is **off** ! xp is kept safe, nobody earns any for now',
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }
  },
};
