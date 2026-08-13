import { db } from '../../db.js';
import { instantOf, wallDayStart } from '../timezone.js';

export const REPEAT_KINDS = ['daily', 'weekly', 'every', 'once'] as const;
export type RepeatKind = (typeof REPEAT_KINDS)[number];
export type ScheduleState = 'active' | 'missed';

export const MIN_INTERVAL_SECONDS = 300;
export const MAX_SCHEDULES_PER_GUILD = 10;
export const GRACE_MS = 120_000;

const DAY_MS = 86_400_000;

export interface ScheduledTemplate {
  guildId: string;
  id: number;
  channelId: string;
  response: string;
  repeatKind: RepeatKind;
  weekday: number | null;
  minuteOfDay: number | null;
  intervalSeconds: number | null;
  anchorAt: number | null;
  nextRun: number;
  state: ScheduleState;
  authorId: string;
  createdAt: number;
  updatedAt: number;
}

export interface NewSchedule {
  guildId: string;
  channelId: string;
  response: string;
  authorId: string;
  repeatKind: RepeatKind;
  weekday?: number | null;
  minuteOfDay?: number | null;
  intervalSeconds?: number | null;
  anchorAt?: number | null;
  nextRun: number;
}

interface Row {
  guild_id: string;
  id: number;
  channel_id: string;
  response: string;
  repeat_kind: RepeatKind;
  weekday: number | null;
  minute_of_day: number | null;
  interval_seconds: number | null;
  anchor_at: number | null;
  next_run: number;
  state: ScheduleState;
  author_id: string;
  created_at: number;
  updated_at: number;
}

function toModel(row: Row): ScheduledTemplate {
  return {
    guildId: row.guild_id,
    id: row.id,
    channelId: row.channel_id,
    response: row.response,
    repeatKind: row.repeat_kind,
    weekday: row.weekday,
    minuteOfDay: row.minute_of_day,
    intervalSeconds: row.interval_seconds,
    anchorAt: row.anchor_at,
    nextRun: row.next_run,
    state: row.state,
    authorId: row.author_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function isRepeatKind(value: string): value is RepeatKind {
  return (REPEAT_KINDS as readonly string[]).includes(value);
}

export function nextCalendarRun(
  from: number,
  zone: string,
  minuteOfDay: number,
  weekday: number | null,
): number {
  const start = wallDayStart(from, zone);

  for (let step = 0; step <= 8; step += 1) {
    const probe = new Date(start + step * DAY_MS);
    if (weekday !== null && probe.getUTCDay() !== weekday) continue;

    const candidate = instantOf(
      probe.getUTCFullYear(),
      probe.getUTCMonth() + 1,
      probe.getUTCDate(),
      minuteOfDay,
      zone,
    );
    if (candidate > from) return candidate;
  }

  return from + DAY_MS;
}

export function nextIntervalRun(
  from: number,
  anchorAt: number,
  intervalSeconds: number,
): number {
  const step = intervalSeconds * 1000;
  if (anchorAt > from) return anchorAt;

  const steps = Math.floor((from - anchorAt) / step) + 1;
  return anchorAt + steps * step;
}

export function computeNextRun(
  schedule: ScheduledTemplate,
  from: number,
  zone: string,
): number | null {
  if (schedule.repeatKind === 'once') return null;

  if (schedule.repeatKind === 'every') {
    if (schedule.anchorAt === null || schedule.intervalSeconds === null) {
      return null;
    }
    return nextIntervalRun(from, schedule.anchorAt, schedule.intervalSeconds);
  }

  if (schedule.minuteOfDay === null) return null;
  return nextCalendarRun(from, zone, schedule.minuteOfDay, schedule.weekday);
}

export function listSchedules(guildId: string): ScheduledTemplate[] {
  const rows = db()
    .prepare('SELECT * FROM scheduled_templates WHERE guild_id = ? ORDER BY id')
    .all(guildId) as Row[];

  return rows.map(toModel);
}

export function getSchedule(
  guildId: string,
  id: number,
): ScheduledTemplate | null {
  const row = db()
    .prepare('SELECT * FROM scheduled_templates WHERE guild_id = ? AND id = ?')
    .get(guildId, id) as Row | undefined;

  return row ? toModel(row) : null;
}

export function countActiveSchedules(guildId: string): number {
  const row = db()
    .prepare(
      `SELECT COUNT(*) AS n FROM scheduled_templates
       WHERE guild_id = ? AND state = 'active'`,
    )
    .get(guildId) as { n: number };

  return row.n;
}

export function createSchedule(input: NewSchedule): ScheduledTemplate | null {
  const now = Date.now();

  const insert = db().transaction((): ScheduledTemplate | null => {
    if (countActiveSchedules(input.guildId) >= MAX_SCHEDULES_PER_GUILD) {
      return null;
    }

    const next = db()
      .prepare(
        `SELECT COALESCE(MAX(id), 0) + 1 AS n FROM scheduled_templates
         WHERE guild_id = ?`,
      )
      .get(input.guildId) as { n: number };

    db()
      .prepare(
        `INSERT INTO scheduled_templates
           (guild_id, id, channel_id, response, repeat_kind, weekday,
            minute_of_day, interval_seconds, anchor_at, next_run, state,
            author_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      )
      .run(
        input.guildId,
        next.n,
        input.channelId,
        input.response,
        input.repeatKind,
        input.weekday ?? null,
        input.minuteOfDay ?? null,
        input.intervalSeconds ?? null,
        input.anchorAt ?? null,
        input.nextRun,
        input.authorId,
        now,
        now,
      );

    return getSchedule(input.guildId, next.n);
  });

  return insert();
}

export interface ScheduleEdit {
  channelId?: string;
  response?: string;
  weekday?: number | null;
  minuteOfDay?: number | null;
  intervalSeconds?: number | null;
  anchorAt?: number | null;
  nextRun?: number;
  state?: ScheduleState;
}

const EDIT_COLUMNS: Record<keyof ScheduleEdit, string> = {
  channelId: 'channel_id',
  response: 'response',
  weekday: 'weekday',
  minuteOfDay: 'minute_of_day',
  intervalSeconds: 'interval_seconds',
  anchorAt: 'anchor_at',
  nextRun: 'next_run',
  state: 'state',
};

export function updateSchedule(
  guildId: string,
  id: number,
  edit: ScheduleEdit,
): ScheduledTemplate | null {
  const assignments: string[] = [];
  const values: Array<string | number | null> = [];

  for (const [key, column] of Object.entries(EDIT_COLUMNS)) {
    const value = edit[key as keyof ScheduleEdit];
    if (value === undefined) continue;
    assignments.push(`${column} = ?`);
    values.push(value);
  }

  if (assignments.length === 0) return getSchedule(guildId, id);

  db()
    .prepare(
      `UPDATE scheduled_templates SET ${assignments.join(', ')}, updated_at = ?
       WHERE guild_id = ? AND id = ?`,
    )
    .run(...values, Date.now(), guildId, id);

  return getSchedule(guildId, id);
}

export function dueSchedules(now: number, limit: number): ScheduledTemplate[] {
  const rows = db()
    .prepare(
      `SELECT * FROM scheduled_templates
       WHERE state = 'active' AND next_run <= ?
       ORDER BY next_run LIMIT ?`,
    )
    .all(now, limit) as Row[];

  return rows.map(toModel);
}

export function advanceSchedule(
  guildId: string,
  id: number,
  nextRun: number,
): void {
  db()
    .prepare(
      `UPDATE scheduled_templates SET next_run = ?, updated_at = ?
       WHERE guild_id = ? AND id = ?`,
    )
    .run(nextRun, Date.now(), guildId, id);
}

export function markScheduleMissed(guildId: string, id: number): void {
  db()
    .prepare(
      `UPDATE scheduled_templates SET state = 'missed', updated_at = ?
       WHERE guild_id = ? AND id = ?`,
    )
    .run(Date.now(), guildId, id);
}

export function removeSchedule(guildId: string, id: number): boolean {
  const result = db()
    .prepare('DELETE FROM scheduled_templates WHERE guild_id = ? AND id = ?')
    .run(guildId, id);

  return result.changes > 0;
}
