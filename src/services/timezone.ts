import { getGuildSetting, setGuildSetting } from './guildSettings.js';

const TIMEZONE_KEY = 'schedule.timezone';

export const DEFAULT_TIMEZONE = 'UTC';

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  const existing = formatters.get(zone);
  if (existing) return existing;

  const created = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  formatters.set(zone, created);
  return created;
}

export function isValidTimeZone(zone: string): boolean {
  if (zone.trim().length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function timeZones(): string[] {
  return Intl.supportedValuesOf('timeZone');
}

export function getGuildTimezone(guildId: string): string {
  const stored = getGuildSetting(guildId, TIMEZONE_KEY);
  return stored && isValidTimeZone(stored) ? stored : DEFAULT_TIMEZONE;
}

export function setGuildTimezone(guildId: string, zone: string): void {
  setGuildSetting(guildId, TIMEZONE_KEY, zone);
}

export function hasGuildTimezone(guildId: string): boolean {
  return getGuildSetting(guildId, TIMEZONE_KEY) !== null;
}

export function zonedParts(at: number, zone: string): ZonedParts {
  const parts = formatterFor(zone).formatToParts(new Date(at));
  const read = (type: string): number => {
    const found = parts.find((part) => part.type === type);
    return found ? Number(found.value) : 0;
  };

  const hour = read('hour');
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: hour === 24 ? 0 : hour,
    minute: read('minute'),
    second: read('second'),
  };
}

function offsetAt(at: number, zone: string): number {
  const parts = zonedParts(at, zone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - (at - (at % 1000));
}

export function instantOf(
  year: number,
  month: number,
  day: number,
  minuteOfDay: number,
  zone: string,
): number {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const wall = Date.UTC(year, month - 1, day, hour, minute);

  const first = wall - offsetAt(wall, zone);
  const refined = wall - offsetAt(first, zone);

  const landed = zonedParts(refined, zone);
  if (landed.hour === hour && landed.minute === minute) return refined;
  return first;
}

export function wallDayStart(at: number, zone: string): number {
  const parts = zonedParts(at, zone);
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

export function parseWallTime(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, '');
  const match = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/.exec(text);
  if (!match) return null;

  const minute = match[2] ? Number(match[2]) : 0;
  if (minute > 59) return null;

  let hour = Number(match[1]);
  const suffix = match[3];

  if (suffix) {
    if (hour < 1 || hour > 12) return null;
    if (suffix === 'am') hour = hour === 12 ? 0 : hour;
    else if (hour !== 12) hour += 12;
  } else if (hour > 23) {
    return null;
  }

  return hour * 60 + minute;
}

export function formatWallTime(minuteOfDay: number): string {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const suffix = hour < 12 ? 'am' : 'pm';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0
    ? `${display}${suffix}`
    : `${display}:${String(minute).padStart(2, '0')}${suffix}`;
}
