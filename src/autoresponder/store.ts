import { db } from '../db.js';
import type { EventKind } from '../events/registry.js';

export type MatchMode =
  | 'exact'
  | 'startswith'
  | 'endswith'
  | 'includes'
  | 'event';

export function eventTriggerKey(kind: EventKind): string {
  return `event:${kind}`;
}

export interface Autoresponder {
  guildId: string;
  trigger: string;
  triggerKey: string;
  response: string;
  matchMode: MatchMode;
  createdAt: number;
  updatedAt: number;
}

interface Row {
  guild_id: string;
  trigger: string;
  trigger_key: string;
  response: string;
  match_mode: MatchMode;
  created_at: number;
  updated_at: number;
}

function toModel(row: Row): Autoresponder {
  return {
    guildId: row.guild_id,
    trigger: row.trigger,
    triggerKey: row.trigger_key,
    response: row.response,
    matchMode: row.match_mode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function key(trigger: string): string {
  return trigger.toLowerCase();
}

export function getAutoresponder(
  guildId: string,
  trigger: string,
): Autoresponder | null {
  const row = db()
    .prepare(
      `SELECT * FROM autoresponders
       WHERE guild_id = ? AND trigger_key = ? AND match_mode != 'event'`,
    )
    .get(guildId, key(trigger)) as Row | undefined;

  return row ? toModel(row) : null;
}

export function listAllTemplates(
  guildId: string,
): Array<{ label: string; response: string }> {
  const rows = db()
    .prepare(
      'SELECT * FROM autoresponders WHERE guild_id = ? ORDER BY trigger_key',
    )
    .all(guildId) as Row[];

  return rows.map((row) => ({
    label:
      row.match_mode === 'event'
        ? row.trigger_key.startsWith(BUTTON_KEY_PREFIX)
          ? `${row.trigger} (button)`
          : row.trigger_key
        : `.${row.trigger}`,
    response: row.response,
  }));
}

export function listAutoresponders(guildId: string): Autoresponder[] {
  const rows = db()
    .prepare(
      `SELECT * FROM autoresponders
       WHERE guild_id = ? AND match_mode != 'event' ORDER BY trigger_key`,
    )
    .all(guildId) as Row[];

  return rows.map(toModel);
}

export function addAutoresponder(
  guildId: string,
  trigger: string,
  response: string,
  mode: Exclude<MatchMode, 'event'> = 'exact',
): boolean {
  const now = Date.now();
  const result = db()
    .prepare(
      `INSERT OR IGNORE INTO autoresponders
        (guild_id, trigger, trigger_key, response, match_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(guildId, trigger, key(trigger), response, mode, now, now);

  return result.changes > 0;
}

export function editAutoresponder(
  guildId: string,
  trigger: string,
  response: string,
): boolean {
  const result = db()
    .prepare(
      `UPDATE autoresponders SET response = ?, updated_at = ?
       WHERE guild_id = ? AND trigger_key = ? AND match_mode != 'event'`,
    )
    .run(response, Date.now(), guildId, key(trigger));

  return result.changes > 0;
}

export function setMatchMode(
  guildId: string,
  trigger: string,
  mode: MatchMode,
): boolean {
  const result = db()
    .prepare(
      `UPDATE autoresponders SET match_mode = ?, updated_at = ?
       WHERE guild_id = ? AND trigger_key = ? AND match_mode != 'event'`,
    )
    .run(mode, Date.now(), guildId, key(trigger));

  return result.changes > 0;
}

export function removeAutoresponder(guildId: string, trigger: string): boolean {
  const result = db()
    .prepare(
      `DELETE FROM autoresponders
       WHERE guild_id = ? AND trigger_key = ? AND match_mode != 'event'`,
    )
    .run(guildId, key(trigger));

  return result.changes > 0;
}

export function setEventResponder(
  guildId: string,
  kind: EventKind,
  response: string,
): void {
  const now = Date.now();
  const triggerKey = eventTriggerKey(kind);
  db()
    .prepare(
      `INSERT INTO autoresponders
        (guild_id, trigger, trigger_key, response, match_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'event', ?, ?)
       ON CONFLICT (guild_id, trigger_key)
       DO UPDATE SET response = excluded.response, updated_at = excluded.updated_at`,
    )
    .run(guildId, triggerKey, triggerKey, response, now, now);
}

export function getEventResponder(
  guildId: string,
  kind: EventKind,
): Autoresponder | null {
  const row = db()
    .prepare(
      `SELECT * FROM autoresponders
       WHERE guild_id = ? AND trigger_key = ? AND match_mode = 'event'`,
    )
    .get(guildId, eventTriggerKey(kind)) as Row | undefined;

  return row ? toModel(row) : null;
}

export function removeEventResponder(
  guildId: string,
  kind: EventKind,
): boolean {
  const result = db()
    .prepare(
      `DELETE FROM autoresponders
       WHERE guild_id = ? AND trigger_key = ? AND match_mode = 'event'`,
    )
    .run(guildId, eventTriggerKey(kind));

  return result.changes > 0;
}

const LEVEL_KEY_PREFIX = 'event:level:';

export function levelTriggerKey(level: number): string {
  return `${LEVEL_KEY_PREFIX}${level}`;
}

export function setLevelResponder(
  guildId: string,
  level: number,
  response: string,
): void {
  const now = Date.now();
  const triggerKey = levelTriggerKey(level);
  db()
    .prepare(
      `INSERT INTO autoresponders
        (guild_id, trigger, trigger_key, response, match_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'event', ?, ?)
       ON CONFLICT (guild_id, trigger_key)
       DO UPDATE SET response = excluded.response, updated_at = excluded.updated_at`,
    )
    .run(guildId, triggerKey, triggerKey, response, now, now);
}

export function getLevelResponder(
  guildId: string,
  level: number,
): Autoresponder | null {
  const row = db()
    .prepare(
      `SELECT * FROM autoresponders
       WHERE guild_id = ? AND trigger_key = ? AND match_mode = 'event'`,
    )
    .get(guildId, levelTriggerKey(level)) as Row | undefined;

  return row ? toModel(row) : null;
}

export function removeLevelResponder(guildId: string, level: number): boolean {
  const result = db()
    .prepare(
      `DELETE FROM autoresponders
       WHERE guild_id = ? AND trigger_key = ? AND match_mode = 'event'`,
    )
    .run(guildId, levelTriggerKey(level));

  return result.changes > 0;
}

export function listLevelResponders(
  guildId: string,
): Array<{ level: number; responder: Autoresponder }> {
  const rows = db()
    .prepare(
      `SELECT * FROM autoresponders
       WHERE guild_id = ? AND match_mode = 'event' AND trigger_key LIKE ?`,
    )
    .all(guildId, `${LEVEL_KEY_PREFIX}%`) as Row[];

  return rows
    .map((row) => ({
      level: Number(row.trigger_key.slice(LEVEL_KEY_PREFIX.length)),
      responder: toModel(row),
    }))
    .filter((entry) => Number.isSafeInteger(entry.level))
    .sort((a, b) => a.level - b.level);
}

export const BUTTON_KEY_PREFIX = 'button:';
const BUTTON_CUSTOM_ID_PREFIX = 'br:';

export function buttonTriggerKey(name: string): string {
  return `${BUTTON_KEY_PREFIX}${key(name)}`;
}

export function buttonCustomId(name: string): string {
  return `${BUTTON_CUSTOM_ID_PREFIX}${key(name)}`;
}

export function parseButtonCustomId(customId: string): string | null {
  return customId.startsWith(BUTTON_CUSTOM_ID_PREFIX)
    ? customId.slice(BUTTON_CUSTOM_ID_PREFIX.length)
    : null;
}

export function getButtonResponder(
  guildId: string,
  name: string,
): Autoresponder | null {
  const row = db()
    .prepare(
      `SELECT * FROM autoresponders
       WHERE guild_id = ? AND trigger_key = ? AND match_mode = 'event'`,
    )
    .get(guildId, buttonTriggerKey(name)) as Row | undefined;

  return row ? toModel(row) : null;
}

export function addButtonResponder(
  guildId: string,
  name: string,
  response: string,
): boolean {
  const now = Date.now();
  const result = db()
    .prepare(
      `INSERT OR IGNORE INTO autoresponders
        (guild_id, trigger, trigger_key, response, match_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'event', ?, ?)`,
    )
    .run(guildId, name.trim(), buttonTriggerKey(name), response, now, now);

  return result.changes > 0;
}

export function editButtonResponder(
  guildId: string,
  name: string,
  response: string,
): boolean {
  const result = db()
    .prepare(
      `UPDATE autoresponders SET response = ?, updated_at = ?
       WHERE guild_id = ? AND trigger_key = ? AND match_mode = 'event'`,
    )
    .run(response, Date.now(), guildId, buttonTriggerKey(name));

  return result.changes > 0;
}

export function removeButtonResponder(guildId: string, name: string): boolean {
  const result = db()
    .prepare(
      `DELETE FROM autoresponders
       WHERE guild_id = ? AND trigger_key = ? AND match_mode = 'event'`,
    )
    .run(guildId, buttonTriggerKey(name));

  return result.changes > 0;
}

export function listButtonResponders(
  guildId: string,
): Array<{ name: string; responder: Autoresponder }> {
  const rows = db()
    .prepare(
      `SELECT * FROM autoresponders
       WHERE guild_id = ? AND match_mode = 'event' AND trigger_key LIKE ?`,
    )
    .all(guildId, `${BUTTON_KEY_PREFIX}%`) as Row[];

  return rows
    .map((row) => ({
      name: row.trigger,
      responder: toModel(row),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
