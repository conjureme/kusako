import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  channelMention,
  type Guild,
  type ChatInputCommandInteraction,
} from 'discord.js';

import type { SlashCommand } from '../client.js';
import { subjectlessTemplateIssues } from '../dsl/validate.js';
import { parseDuration, YEAR_SECONDS } from '../dsl/args.js';
import {
  createSchedule,
  getSchedule,
  listSchedules,
  nextCalendarRun,
  nextIntervalRun,
  removeSchedule,
  updateSchedule,
  MAX_SCHEDULES_PER_GUILD,
  MIN_INTERVAL_SECONDS,
  type RepeatKind,
  type ScheduleEdit,
  type ScheduledTemplate,
} from '../services/scheduled/store.js';
import {
  getGuildTimezone,
  hasGuildTimezone,
  parseWallTime,
  formatWallTime,
} from '../services/timezone.js';
import { templateDetailEmbed } from '../utils/templateEmbed.js';
import { commandMention } from '../utils/commandMentions.js';
import {
  serverEmbed,
  failureEmbed,
  spacerFile,
  SPACER_IMAGE,
  NO_DMS,
} from '../utils/style.js';

const REPLY_MAX = 2000;

const DAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

function describe(schedule: ScheduledTemplate, zone: string | null): string {
  const suffix = zone ? ` ${zone}` : '';

  if (schedule.repeatKind === 'daily') {
    return `every day at ${formatWallTime(schedule.minuteOfDay ?? 0)}${suffix}`;
  }
  if (schedule.repeatKind === 'weekly') {
    return `every ${DAYS[schedule.weekday ?? 0]} at ${formatWallTime(schedule.minuteOfDay ?? 0)}${suffix}`;
  }
  if (schedule.repeatKind === 'every') {
    return `every ${formatSeconds(schedule.intervalSeconds ?? 0)}`;
  }
  return 'just the once';
}

function preview(response: string): string {
  const flat = response.replace(/\s+/g, ' ').trim();
  return flat.length > 44 ? `${flat.slice(0, 43)}…` : flat;
}

function choiceLabel(schedule: ScheduledTemplate): string {
  const state = schedule.state === 'missed' ? ' (missed)' : '';
  const text = `${schedule.id} · ${describe(schedule, null)}${state} · ${preview(schedule.response)}`;
  return text.length > 100 ? `${text.slice(0, 99)}…` : text;
}

function readInterval(raw: string): { seconds: number } | { error: string } {
  const seconds = parseDuration(raw);
  if (seconds === null) {
    return {
      error:
        "i can't read that interval !! try something like `6h`, `30m` or `1d 12h`",
    };
  }
  if (seconds < MIN_INTERVAL_SECONDS) {
    return {
      error: `that's too often ! the shortest repeat is ${formatSeconds(MIN_INTERVAL_SECONDS)}`,
    };
  }
  if (seconds > YEAR_SECONDS) {
    return { error: "that's longer than a year !! pick something smaller" };
  }
  return { seconds };
}

function readOnceTime(
  raw: string,
  now: number,
): { at: number } | { error: string } {
  const trimmed = raw.trim();
  const asStamp = /^\d+$/.test(trimmed) ? Number(trimmed) : 0;

  if (asStamp >= 1_000_000_000) {
    const at = asStamp * 1000;
    if (at <= now) return { error: 'that timestamp is in the past !!' };
    return { at };
  }

  const delay = parseDuration(trimmed);
  if (delay === null || delay > YEAR_SECONDS) {
    return {
      error:
        "i can't read that !! try something like `3d`, `2h30m`, or a unix timestamp",
    };
  }
  return { at: now + delay * 1000 };
}

function formatSeconds(seconds: number): string {
  const units: Array<[number, string]> = [
    [604_800, 'w'],
    [86_400, 'd'],
    [3600, 'h'],
    [60, 'm'],
  ];

  let left = seconds;
  const parts: string[] = [];
  for (const [size, label] of units) {
    const n = Math.floor(left / size);
    if (n > 0) {
      parts.push(`${n}${label}`);
      left -= n * size;
    }
  }

  return parts.length > 0 ? parts.join(' ') : `${seconds}s`;
}

function stamp(at: number): string {
  return `<t:${Math.floor(at / 1000)}:R>`;
}

function detailEmbed(guild: Guild, schedule: ScheduledTemplate) {
  const zone = getGuildTimezone(guild.id);
  const when =
    schedule.state === 'missed'
      ? 'missed ! sako was down when it was due'
      : `${describe(schedule, zone)} · next ${stamp(schedule.nextRun)}`;

  return templateDetailEmbed(
    guild,
    `schedule ${schedule.id}`,
    schedule.response,
    {
      cooldown: false,
      fields: [
        { name: 'posts', value: when, inline: false },
        {
          name: 'goes to',
          value: channelMention(schedule.channelId),
          inline: false,
        },
      ],
    },
  );
}

async function handleAdd(
  interaction: ChatInputCommandInteraction<'cached'>,
  kind: RepeatKind,
): Promise<void> {
  const guildId = interaction.guildId;
  const channel = interaction.options.getChannel('channel', true);
  const reply = interaction.options.getString('reply', true);

  if (reply.length > REPLY_MAX) {
    await interaction.reply({
      embeds: [failureEmbed(`replies cap at ${REPLY_MAX} characters !`)],
    });
    return;
  }

  const issues = subjectlessTemplateIssues(reply);
  if (issues) {
    await interaction.reply({ embeds: [failureEmbed(issues)] });
    return;
  }

  const calendar = kind === 'daily' || kind === 'weekly';
  if (calendar && !hasGuildTimezone(guildId)) {
    await interaction.reply({
      embeds: [
        failureEmbed(
          `i don't know what clock this server runs on yet... set it with ${commandMention('/settings set timezone')} and try again`,
        ),
      ],
    });
    return;
  }

  const zone = getGuildTimezone(guildId);
  const now = Date.now();

  let minuteOfDay: number | null = null;
  let weekday: number | null = null;
  let intervalSeconds: number | null = null;
  let anchorAt: number | null = null;
  let nextRun = 0;

  if (calendar) {
    minuteOfDay = parseWallTime(interaction.options.getString('time', true));
    if (minuteOfDay === null) {
      await interaction.reply({
        embeds: [
          failureEmbed(
            "i can't read that time !! try something like `7pm`, `7:30pm` or `19:00`",
          ),
        ],
      });
      return;
    }

    if (kind === 'weekly') {
      weekday = interaction.options.getInteger('day', true);
    }
    nextRun = nextCalendarRun(now, zone, minuteOfDay, weekday);
  } else if (kind === 'every') {
    const read = readInterval(interaction.options.getString('interval', true));
    if ('error' in read) {
      await interaction.reply({ embeds: [failureEmbed(read.error)] });
      return;
    }

    intervalSeconds = read.seconds;
    anchorAt = now + intervalSeconds * 1000;
    nextRun = nextIntervalRun(now, anchorAt, intervalSeconds);
  } else {
    const read = readOnceTime(interaction.options.getString('in', true), now);
    if ('error' in read) {
      await interaction.reply({ embeds: [failureEmbed(read.error)] });
      return;
    }
    nextRun = read.at;
  }

  const created = createSchedule({
    guildId,
    channelId: channel.id,
    response: reply,
    authorId: interaction.user.id,
    repeatKind: kind,
    weekday,
    minuteOfDay,
    intervalSeconds,
    anchorAt,
    nextRun,
  });

  if (!created) {
    await interaction.reply({
      embeds: [
        failureEmbed(
          `this server already has ${MAX_SCHEDULES_PER_GUILD} schedules going ! remove one with ${commandMention('/schedule remove')} first`,
        ),
      ],
    });
    return;
  }

  await interaction.reply({
    embeds: [detailEmbed(interaction.guild, created)],
  });
}

async function handleEdit(
  interaction: ChatInputCommandInteraction<'cached'>,
): Promise<void> {
  const guildId = interaction.guildId;
  const id = interaction.options.getInteger('id', true);
  const found = getSchedule(guildId, id);

  if (!found) {
    await interaction.reply({
      embeds: [
        failureEmbed(
          `there's no schedule **${id}** here ! check ${commandMention('/schedule list')}`,
        ),
      ],
    });
    return;
  }

  const channel = interaction.options.getChannel('channel');
  const reply = interaction.options.getString('reply');
  const time = interaction.options.getString('time');
  const day = interaction.options.getInteger('day');
  const interval = interaction.options.getString('interval');
  const when = interaction.options.getString('in');

  if (
    channel === null &&
    reply === null &&
    time === null &&
    day === null &&
    interval === null &&
    when === null
  ) {
    await interaction.reply({
      embeds: [
        failureEmbed(
          'give me something to change !! (channel, reply, time, day, interval, or in)',
        ),
      ],
    });
    return;
  }

  const calendar =
    found.repeatKind === 'daily' || found.repeatKind === 'weekly';
  const wrongKind = (option: string, instead: string): string =>
    `schedule ${found.id} runs ${describe(found, null)}, so \`${option}:\` means nothing to it ! ${instead}`;

  if (time !== null && !calendar) {
    await interaction.reply({
      embeds: [
        failureEmbed(
          wrongKind(
            'time',
            found.repeatKind === 'every'
              ? 'use `interval:` instead'
              : 'use `in:` instead',
          ),
        ),
      ],
    });
    return;
  }
  if (day !== null && found.repeatKind !== 'weekly') {
    await interaction.reply({
      embeds: [
        failureEmbed(wrongKind('day', 'only weekly schedules have a day')),
      ],
    });
    return;
  }
  if (interval !== null && found.repeatKind !== 'every') {
    await interaction.reply({
      embeds: [
        failureEmbed(
          wrongKind(
            'interval',
            'only `/schedule add every` posts repeat on one',
          ),
        ),
      ],
    });
    return;
  }
  if (when !== null && found.repeatKind !== 'once') {
    await interaction.reply({
      embeds: [
        failureEmbed(
          wrongKind('in', 'only one time posts are scheduled that way'),
        ),
      ],
    });
    return;
  }

  const edit: ScheduleEdit = {};
  const now = Date.now();
  let retimed = false;

  if (channel) edit.channelId = channel.id;

  if (reply !== null) {
    if (reply.length > REPLY_MAX) {
      await interaction.reply({
        embeds: [failureEmbed(`replies cap at ${REPLY_MAX} characters !`)],
      });
      return;
    }

    const issues = subjectlessTemplateIssues(reply);
    if (issues) {
      await interaction.reply({ embeds: [failureEmbed(issues)] });
      return;
    }
    edit.response = reply;
  }

  if (calendar && (time !== null || day !== null)) {
    const minuteOfDay = time !== null ? parseWallTime(time) : found.minuteOfDay;
    if (minuteOfDay === null) {
      await interaction.reply({
        embeds: [
          failureEmbed(
            "i can't read that time !! try something like `7pm`, `7:30pm` or `19:00`",
          ),
        ],
      });
      return;
    }

    const weekday = day !== null ? day : found.weekday;
    edit.minuteOfDay = minuteOfDay;
    edit.weekday = weekday;
    edit.nextRun = nextCalendarRun(
      now,
      getGuildTimezone(guildId),
      minuteOfDay,
      weekday,
    );
    retimed = true;
  }

  if (interval !== null) {
    const read = readInterval(interval);
    if ('error' in read) {
      await interaction.reply({ embeds: [failureEmbed(read.error)] });
      return;
    }

    edit.intervalSeconds = read.seconds;
    edit.anchorAt = now + read.seconds * 1000;
    edit.nextRun = edit.anchorAt;
    retimed = true;
  }

  if (when !== null) {
    const read = readOnceTime(when, now);
    if ('error' in read) {
      await interaction.reply({ embeds: [failureEmbed(read.error)] });
      return;
    }

    edit.nextRun = read.at;
    retimed = true;
  }

  if (retimed) edit.state = 'active';

  const updated = updateSchedule(guildId, id, edit);
  if (!updated) {
    await interaction.reply({
      embeds: [
        failureEmbed('that schedule went missing while i was editing !'),
      ],
    });
    return;
  }

  await interaction.reply({
    embeds: [detailEmbed(interaction.guild, updated)],
  });
}

export const schedule: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('have sako post a reply on a timer')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommandGroup((group) =>
      group
        .setName('add')
        .setDescription('start a new scheduled post')
        .addSubcommand((sub) =>
          sub
            .setName('daily')
            .setDescription('post every day at a set time')
            .addChannelOption((o) =>
              o
                .setName('channel')
                .setDescription('where it goes')
                .addChannelTypes(
                  ChannelType.GuildText,
                  ChannelType.GuildAnnouncement,
                )
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName('time')
                .setDescription('like 7pm, 7:30pm or 19:00')
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName('reply')
                .setDescription('what sako posts')
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('weekly')
            .setDescription('post once a week at a set time')
            .addChannelOption((o) =>
              o
                .setName('channel')
                .setDescription('where it goes')
                .addChannelTypes(
                  ChannelType.GuildText,
                  ChannelType.GuildAnnouncement,
                )
                .setRequired(true),
            )
            .addIntegerOption((o) =>
              o
                .setName('day')
                .setDescription('which day of the week')
                .addChoices(...DAYS.map((name, value) => ({ name, value })))
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName('time')
                .setDescription('like 7pm, 7:30pm or 19:00')
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName('reply')
                .setDescription('what sako posts')
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('every')
            .setDescription('post on a repeating interval')
            .addChannelOption((o) =>
              o
                .setName('channel')
                .setDescription('where it goes')
                .addChannelTypes(
                  ChannelType.GuildText,
                  ChannelType.GuildAnnouncement,
                )
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName('interval')
                .setDescription('like 6h, 30m or 1d 12h')
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName('reply')
                .setDescription('what sako posts')
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('once')
            .setDescription('post one time, later')
            .addChannelOption((o) =>
              o
                .setName('channel')
                .setDescription('where it goes')
                .addChannelTypes(
                  ChannelType.GuildText,
                  ChannelType.GuildAnnouncement,
                )
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName('in')
                .setDescription('like 3d, 2h30m, or a unix timestamp')
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName('reply')
                .setDescription('what sako posts')
                .setRequired(true),
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('everything sako has lined up'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription('look at one scheduled post')
        .addIntegerOption((o) =>
          o
            .setName('id')
            .setDescription('which schedule')
            .setAutocomplete(true)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription('change a scheduled post')
        .addIntegerOption((o) =>
          o
            .setName('id')
            .setDescription('which schedule')
            .setAutocomplete(true)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('reply').setDescription('new text for the post'),
        )
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('move it somewhere else')
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
            ),
        )
        .addStringOption((o) =>
          o
            .setName('time')
            .setDescription('daily and weekly only, like 7pm or 19:00'),
        )
        .addIntegerOption((o) =>
          o
            .setName('day')
            .setDescription('weekly only')
            .addChoices(...DAYS.map((name, value) => ({ name, value }))),
        )
        .addStringOption((o) =>
          o
            .setName('interval')
            .setDescription('repeating posts only, like 6h or 1d 12h'),
        )
        .addStringOption((o) =>
          o
            .setName('in')
            .setDescription('one time posts only, like 3d or 2h30m'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('stop a scheduled post')
        .addIntegerOption((o) =>
          o
            .setName('id')
            .setDescription('which schedule')
            .setAutocomplete(true)
            .setRequired(true),
        ),
    ) as SlashCommandBuilder,

  async autocomplete(interaction) {
    if (!interaction.inCachedGuild()) return;

    const focused = interaction.options.getFocused().trim().toLowerCase();
    const choices = listSchedules(interaction.guildId)
      .map((row) => ({ name: choiceLabel(row), value: row.id }))
      .filter(
        (choice) =>
          focused.length === 0 || choice.name.toLowerCase().includes(focused),
      )
      .slice(0, 25);

    await interaction.respond(choices);
  },

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: NO_DMS });
      return;
    }

    const guildId = interaction.guildId;
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (group === 'add') {
      await handleAdd(interaction, sub as RepeatKind);
      return;
    }

    if (sub === 'edit') {
      await handleEdit(interaction);
      return;
    }

    if (sub === 'list') {
      const rows = listSchedules(guildId);
      if (rows.length === 0) {
        const empty = serverEmbed(interaction.guild).setDescription(
          [
            '꒰ scheduled posts ꒱',
            'nothing lined up yet !',
            `⁀જ➣ *start one with ${commandMention('/schedule add daily')}*`,
          ].join('\n\n'),
        );
        await interaction.reply({ embeds: [empty] });
        return;
      }

      const zone = getGuildTimezone(guildId);
      const header = `꒰ scheduled posts ꒱ *${rows.length} of ${MAX_SCHEDULES_PER_GUILD} ⊹ ${zone}*`;
      const blocks = rows.map((row) =>
        [
          `ᯓ➤ **${row.id}** ━ ${channelMention(row.channelId)}`,
          `-# ✧ ${describe(row, zone)}`,
          `-# ✧ ${row.state === 'missed' ? 'missed while sako was down' : `next ${stamp(row.nextRun)}`}`,
        ].join('\n'),
      );

      const embed = serverEmbed(interaction.guild)
        .setDescription(
          [
            header,
            ...blocks,
            `⁀જ➣ *${commandMention('/schedule show')} to read one !*`,
          ].join('\n\n'),
        )
        .setImage(SPACER_IMAGE);

      await interaction.reply({ embeds: [embed], files: [spacerFile()] });
      return;
    }

    const id = interaction.options.getInteger('id', true);
    const found = getSchedule(guildId, id);

    if (!found) {
      await interaction.reply({
        embeds: [
          failureEmbed(
            `there's no schedule **${id}** here ! check ${commandMention('/schedule list')}`,
          ),
        ],
      });
      return;
    }

    if (sub === 'show') {
      await interaction.reply({
        embeds: [detailEmbed(interaction.guild, found)],
      });
      return;
    }

    removeSchedule(guildId, id);
    const eulogy = serverEmbed(interaction.guild).setDescription(
      [
        `## stopped schedule ${found.id} !`,
        `it was ${describe(found, getGuildTimezone(guildId))}, in ${channelMention(found.channelId)}`,
        `\`\`\`\n${found.response.slice(0, 1800)}\n\`\`\``,
        `-# put it back with ${commandMention('/schedule add daily')}`,
      ].join('\n'),
    );

    await interaction.reply({ embeds: [eulogy] });
  },
};
