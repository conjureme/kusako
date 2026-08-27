import { db } from '../../db.js';
import type { EventKind } from './registry.js';

export interface EventReply {
  guildId: string;
  kind: EventKind;
  response: string | null;
  channelId: string | null;
  createdAt: number;
  updatedAt: number;
}

interface Row {
  guild_id: string;
  kind: EventKind;
  response: string | null;
  channel_id: string | null;
  created_at: number;
  updated_at: number;
}

function toModel(row: Row): EventReply {
  return {
    guildId: row.guild_id,
    kind: row.kind,
    response: row.response,
    channelId: row.channel_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getEventReply(
  guildId: string,
  kind: EventKind,
): EventReply | null {
  const row = db()
    .prepare('SELECT * FROM event_replies WHERE guild_id = ? AND kind = ?')
    .get(guildId, kind) as Row | undefined;

  return row ? toModel(row) : null;
}

export function setEventReply(
  guildId: string,
  kind: EventKind,
  response: string,
): void {
  const now = Date.now();
  db()
    .prepare(
      `INSERT INTO event_replies (guild_id, kind, response, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (guild_id, kind)
       DO UPDATE SET response = excluded.response, updated_at = excluded.updated_at`,
    )
    .run(guildId, kind, response, now, now);
}

export function setEventChannel(
  guildId: string,
  kind: EventKind,
  channelId: string,
): void {
  const now = Date.now();
  db()
    .prepare(
      `INSERT INTO event_replies (guild_id, kind, channel_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (guild_id, kind)
       DO UPDATE SET channel_id = excluded.channel_id, updated_at = excluded.updated_at`,
    )
    .run(guildId, kind, channelId, now, now);
}

export type BoostTransition = 'started' | 'ended' | null;

export function syncBoostState(
  guildId: string,
  userId: string,
  premiumSince: number | null,
): BoostTransition {
  const row = db()
    .prepare(
      'SELECT premium_since FROM boosters WHERE guild_id = ? AND user_id = ?',
    )
    .get(guildId, userId) as { premium_since: number } | undefined;

  if (premiumSince === null) {
    if (!row) return null;

    db()
      .prepare('DELETE FROM boosters WHERE guild_id = ? AND user_id = ?')
      .run(guildId, userId);
    return 'ended';
  }

  if (row?.premium_since === premiumSince) return null;

  db()
    .prepare(
      `INSERT INTO boosters (guild_id, user_id, premium_since, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (guild_id, user_id)
       DO UPDATE SET premium_since = excluded.premium_since, updated_at = excluded.updated_at`,
    )
    .run(guildId, userId, premiumSince, Date.now());

  return 'started';
}

export function removeEventReply(guildId: string, kind: EventKind): boolean {
  const result = db()
    .prepare(
      `UPDATE event_replies SET response = NULL, updated_at = ?
       WHERE guild_id = ? AND kind = ? AND response IS NOT NULL`,
    )
    .run(Date.now(), guildId, kind);

  return result.changes > 0;
}
