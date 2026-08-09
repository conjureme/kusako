import { db } from '../../db.js';
import { clearCooldowns, buttonScope } from '../cooldowns.js';

const CUSTOM_ID_PREFIX = 'br:';

export interface ButtonResponder {
  guildId: string;
  name: string;
  nameKey: string;
  response: string;
  label: string | null;
  emoji: string | null;
  style: string | null;
  limitMode: string | null;
  invokerOnly: boolean;
  createdAt: number;
  updatedAt: number;
}

interface Row {
  guild_id: string;
  name: string;
  name_key: string;
  response: string;
  label: string | null;
  emoji: string | null;
  style: string | null;
  limit_mode: string | null;
  invoker_only: number;
  created_at: number;
  updated_at: number;
}

function toModel(row: Row): ButtonResponder {
  return {
    guildId: row.guild_id,
    name: row.name,
    nameKey: row.name_key,
    response: row.response,
    label: row.label,
    emoji: row.emoji,
    style: row.style,
    limitMode: row.limit_mode,
    invokerOnly: row.invoker_only === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function buttonKey(name: string): string {
  return name.toLowerCase();
}

export function buttonCustomId(name: string): string {
  return `${CUSTOM_ID_PREFIX}${buttonKey(name)}`;
}

export function parseButtonCustomId(customId: string): string | null {
  return customId.startsWith(CUSTOM_ID_PREFIX)
    ? customId.slice(CUSTOM_ID_PREFIX.length)
    : null;
}

export function getButtonResponder(
  guildId: string,
  name: string,
): ButtonResponder | null {
  const row = db()
    .prepare(
      'SELECT * FROM button_responders WHERE guild_id = ? AND name_key = ?',
    )
    .get(guildId, buttonKey(name)) as Row | undefined;

  return row ? toModel(row) : null;
}

export function listButtonResponders(guildId: string): ButtonResponder[] {
  const rows = db()
    .prepare(
      'SELECT * FROM button_responders WHERE guild_id = ? ORDER BY name_key',
    )
    .all(guildId) as Row[];

  return rows.map(toModel);
}

export function addButtonResponder(
  guildId: string,
  name: string,
  response: string,
): boolean {
  const now = Date.now();
  const result = db()
    .prepare(
      `INSERT OR IGNORE INTO button_responders
        (guild_id, name, name_key, response, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(guildId, name.trim(), buttonKey(name), response, now, now);

  return result.changes > 0;
}

export function editButtonResponder(
  guildId: string,
  name: string,
  response: string,
): boolean {
  const result = db()
    .prepare(
      `UPDATE button_responders SET response = ?, updated_at = ?
       WHERE guild_id = ? AND name_key = ?`,
    )
    .run(response, Date.now(), guildId, buttonKey(name));

  return result.changes > 0;
}

export function removeButtonResponder(guildId: string, name: string): boolean {
  const nameKey = buttonKey(name);
  const run = db().transaction((): boolean => {
    const result = db()
      .prepare(
        'DELETE FROM button_responders WHERE guild_id = ? AND name_key = ?',
      )
      .run(guildId, nameKey);

    if (result.changes > 0) clearCooldowns(guildId, buttonScope(nameKey));
    return result.changes > 0;
  });

  return run();
}
