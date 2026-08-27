import { db } from '../../db.js';
import { getGuildSetting } from '../guildSettings.js';

export type TicketState = 'opening' | 'open' | 'closed';

export interface TicketType {
  guildId: string;
  key: string;
  label: string;
  emoji: string | null;
  style: string | null;
  roleIds: string[];
  greeting: string | null;
  cooldownSeconds: number;
  createdAt: number;
  updatedAt: number;
}

export interface Ticket {
  guildId: string;
  typeKey: string;
  number: number;
  channelId: string | null;
  openerId: string;
  state: TicketState;
  openedAt: number;
  closedAt: number | null;
}

export interface TicketTypeInput {
  label?: string;
  emoji?: string | null;
  style?: string | null;
  roleIds?: string[];
  greeting?: string | null;
  cooldownSeconds?: number;
}

export type ReserveResult =
  | { ok: true; number: number }
  | { ok: false; existing: Ticket };

export const TICKET_CATEGORY_KEY = 'tickets.category';
export const TICKET_ARCHIVE_KEY = 'tickets.archive_category';

export const TICKET_KEY_MAX = 25;

const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

interface TypeRow {
  guild_id: string;
  key: string;
  label: string;
  emoji: string | null;
  style: string | null;
  role_ids: string;
  greeting: string | null;
  cooldown_seconds: number;
  created_at: number;
  updated_at: number;
}

interface TicketRow {
  guild_id: string;
  type_key: string;
  number: number;
  channel_id: string | null;
  opener_id: string;
  state: string;
  opened_at: number;
  closed_at: number | null;
}

function parseRoleIds(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

function toType(row: TypeRow): TicketType {
  return {
    guildId: row.guild_id,
    key: row.key,
    label: row.label,
    emoji: row.emoji,
    style: row.style,
    roleIds: parseRoleIds(row.role_ids),
    greeting: row.greeting,
    cooldownSeconds: row.cooldown_seconds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTicket(row: TicketRow): Ticket {
  return {
    guildId: row.guild_id,
    typeKey: row.type_key,
    number: row.number,
    channelId: row.channel_id,
    openerId: row.opener_id,
    state: row.state as TicketState,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
  };
}

export function ticketKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-');
}

export function isValidTicketKey(key: string): boolean {
  return key.length <= TICKET_KEY_MAX && KEY_PATTERN.test(key);
}

export function ticketChannelName(typeKey: string, number: number): string {
  return `${typeKey}-${number.toString().padStart(4, '0')}`;
}

const OPEN_PREFIX = 'tk:open:';

export const TICKET_CLOSE_ID = 'tk:close';
export const TICKET_REOPEN_ID = 'tk:reopen';

export function ticketOpenCustomId(typeKey: string): string {
  return `${OPEN_PREFIX}${typeKey}`;
}

export function parseTicketOpenId(customId: string): string | null {
  if (!customId.startsWith(OPEN_PREFIX)) return null;

  const key = customId.slice(OPEN_PREFIX.length);
  return key.length > 0 ? key : null;
}

export function isTicketCustomId(customId: string): boolean {
  return customId.startsWith('tk:');
}

export function getTicketType(guildId: string, key: string): TicketType | null {
  const row = db()
    .prepare('SELECT * FROM ticket_types WHERE guild_id = ? AND key = ?')
    .get(guildId, ticketKey(key)) as TypeRow | undefined;

  return row ? toType(row) : null;
}

export function listTicketTypes(guildId: string): TicketType[] {
  const rows = db()
    .prepare('SELECT * FROM ticket_types WHERE guild_id = ? ORDER BY key')
    .all(guildId) as TypeRow[];

  return rows.map(toType);
}

export function createTicketType(
  guildId: string,
  key: string,
  input: TicketTypeInput & { label: string },
): boolean {
  const normalized = ticketKey(key);
  if (!isValidTicketKey(normalized)) return false;

  const now = Date.now();
  const result = db()
    .prepare(
      `INSERT OR IGNORE INTO ticket_types
        (guild_id, key, label, emoji, style, role_ids, greeting,
         cooldown_seconds, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      guildId,
      normalized,
      input.label,
      input.emoji ?? null,
      input.style ?? null,
      JSON.stringify(input.roleIds ?? []),
      input.greeting ?? null,
      input.cooldownSeconds ?? 0,
      now,
      now,
    );

  return result.changes > 0;
}

export function updateTicketType(
  guildId: string,
  key: string,
  patch: TicketTypeInput,
): boolean {
  const current = getTicketType(guildId, key);
  if (!current) return false;

  const result = db()
    .prepare(
      `UPDATE ticket_types
       SET label = ?, emoji = ?, style = ?, role_ids = ?, greeting = ?,
           cooldown_seconds = ?, updated_at = ?
       WHERE guild_id = ? AND key = ?`,
    )
    .run(
      patch.label ?? current.label,
      patch.emoji === undefined ? current.emoji : patch.emoji,
      patch.style === undefined ? current.style : patch.style,
      JSON.stringify(patch.roleIds ?? current.roleIds),
      patch.greeting === undefined ? current.greeting : patch.greeting,
      patch.cooldownSeconds ?? current.cooldownSeconds,
      Date.now(),
      guildId,
      current.key,
    );

  return result.changes > 0;
}

export function deleteTicketType(guildId: string, key: string): boolean {
  const result = db()
    .prepare('DELETE FROM ticket_types WHERE guild_id = ? AND key = ?')
    .run(guildId, ticketKey(key));

  return result.changes > 0;
}

export function reserveTicket(
  guildId: string,
  typeKey: string,
  openerId: string,
): ReserveResult {
  const key = ticketKey(typeKey);

  const run = db().transaction((): ReserveResult => {
    const existing = db()
      .prepare(
        `SELECT * FROM tickets
         WHERE guild_id = ? AND type_key = ? AND opener_id = ?
           AND state != 'closed'
         ORDER BY number LIMIT 1`,
      )
      .get(guildId, key, openerId) as TicketRow | undefined;

    if (existing) return { ok: false, existing: toTicket(existing) };

    const top = db()
      .prepare(
        `SELECT MAX(number) AS top FROM tickets
         WHERE guild_id = ? AND type_key = ?`,
      )
      .get(guildId, key) as { top: number | null };

    const number = (top.top ?? 0) + 1;

    db()
      .prepare(
        `INSERT INTO tickets
          (guild_id, type_key, number, channel_id, opener_id, state,
           opened_at, closed_at)
         VALUES (?, ?, ?, NULL, ?, 'opening', ?, NULL)`,
      )
      .run(guildId, key, number, openerId, Date.now());

    return { ok: true, number };
  });

  return run();
}

export function attachTicketChannel(
  guildId: string,
  typeKey: string,
  number: number,
  channelId: string,
): boolean {
  const result = db()
    .prepare(
      `UPDATE tickets SET channel_id = ?, state = 'open'
       WHERE guild_id = ? AND type_key = ? AND number = ? AND state = 'opening'`,
    )
    .run(channelId, guildId, ticketKey(typeKey), number);

  return result.changes > 0;
}

export function releaseReservation(
  guildId: string,
  typeKey: string,
  number: number,
): boolean {
  const result = db()
    .prepare(
      `DELETE FROM tickets
       WHERE guild_id = ? AND type_key = ? AND number = ? AND state = 'opening'`,
    )
    .run(guildId, ticketKey(typeKey), number);

  return result.changes > 0;
}

export function clearStaleReservations(): number {
  return db().prepare("DELETE FROM tickets WHERE state = 'opening'").run()
    .changes;
}

export function getTicketByChannel(channelId: string): Ticket | null {
  const row = db()
    .prepare('SELECT * FROM tickets WHERE channel_id = ?')
    .get(channelId) as TicketRow | undefined;

  return row ? toTicket(row) : null;
}

export function markTicketClosed(channelId: string): boolean {
  const result = db()
    .prepare(
      `UPDATE tickets SET state = 'closed', closed_at = ?
       WHERE channel_id = ? AND state = 'open'`,
    )
    .run(Date.now(), channelId);

  return result.changes > 0;
}

export function markTicketOpen(channelId: string): boolean {
  const result = db()
    .prepare(
      `UPDATE tickets SET state = 'open', closed_at = NULL
       WHERE channel_id = ? AND state = 'closed'`,
    )
    .run(channelId);

  return result.changes > 0;
}

export function countActiveTickets(guildId: string, typeKey: string): number {
  const row = db()
    .prepare(
      `SELECT COUNT(*) AS n FROM tickets
       WHERE guild_id = ? AND type_key = ? AND state != 'closed'`,
    )
    .get(guildId, ticketKey(typeKey)) as { n: number };

  return row.n;
}

export interface TicketCategories {
  live: string | null;
  archive: string | null;
}

export function getTicketCategories(guildId: string): TicketCategories {
  return {
    live: getGuildSetting(guildId, TICKET_CATEGORY_KEY),
    archive: getGuildSetting(guildId, TICKET_ARCHIVE_KEY),
  };
}
