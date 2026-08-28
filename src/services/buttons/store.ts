import { db } from '../../db.js';
import { clearCooldowns, buttonScope } from '../cooldowns.js';
import type { ButtonLimit } from './registry.js';

const CUSTOM_ID_PREFIX = 'br:';
const LOCKED_ID_PREFIX = 'bri:';

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

export function buttonCustomId(name: string, invokerId?: string): string {
  return invokerId
    ? `${LOCKED_ID_PREFIX}${invokerId}:${buttonKey(name)}`
    : `${CUSTOM_ID_PREFIX}${buttonKey(name)}`;
}

export interface ParsedButtonId {
  nameKey: string;
  invokerId: string | null;
}

export function parseButtonCustomId(customId: string): ParsedButtonId | null {
  if (customId.startsWith(LOCKED_ID_PREFIX)) {
    const rest = customId.slice(LOCKED_ID_PREFIX.length);
    const split = rest.indexOf(':');
    if (split < 1) return null;
    return {
      nameKey: rest.slice(split + 1),
      invokerId: rest.slice(0, split),
    };
  }

  return customId.startsWith(CUSTOM_ID_PREFIX)
    ? { nameKey: customId.slice(CUSTOM_ID_PREFIX.length), invokerId: null }
    : null;
}

export function isButtonCustomId(customId: string): boolean {
  return (
    customId.startsWith(CUSTOM_ID_PREFIX) ||
    customId.startsWith(LOCKED_ID_PREFIX)
  );
}

const DROPDOWN_PREFIX = 'dd:';
const DROPDOWN_LOCKED_PREFIX = 'ddi:';

export function dropdownCustomId(index: number, invokerId?: string): string {
  return invokerId
    ? `${DROPDOWN_LOCKED_PREFIX}${invokerId}:${index}`
    : `${DROPDOWN_PREFIX}${index}`;
}

export function parseDropdownCustomId(
  customId: string,
): { invokerId: string | null } | null {
  if (customId.startsWith(DROPDOWN_LOCKED_PREFIX)) {
    const rest = customId.slice(DROPDOWN_LOCKED_PREFIX.length);
    const split = rest.indexOf(':');
    if (split < 1) return null;
    return { invokerId: rest.slice(0, split) };
  }

  return customId.startsWith(DROPDOWN_PREFIX) ? { invokerId: null } : null;
}

export function isDropdownCustomId(customId: string): boolean {
  return (
    customId.startsWith(DROPDOWN_PREFIX) ||
    customId.startsWith(DROPDOWN_LOCKED_PREFIX)
  );
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

export interface ButtonLook {
  label?: string | null;
  emoji?: string | null;
  style?: string | null;
  limitMode?: string | null;
  invokerOnly?: boolean;
}

export function addButtonResponder(
  guildId: string,
  name: string,
  response: string,
  look: ButtonLook = {},
): boolean {
  const now = Date.now();
  const result = db()
    .prepare(
      `INSERT OR IGNORE INTO button_responders
        (guild_id, name, name_key, response, label, emoji, style,
         limit_mode, invoker_only, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      guildId,
      name.trim(),
      buttonKey(name),
      response,
      look.label ?? null,
      look.emoji ?? null,
      look.style ?? null,
      look.limitMode ?? null,
      look.invokerOnly ? 1 : 0,
      now,
      now,
    );

  return result.changes > 0;
}

export function editButtonResponder(
  guildId: string,
  name: string,
  response: string | null,
  look: ButtonLook = {},
): boolean {
  const existing = getButtonResponder(guildId, name);
  if (!existing) return false;

  const result = db()
    .prepare(
      `UPDATE button_responders
       SET response = ?, label = ?, emoji = ?, style = ?,
           limit_mode = ?, invoker_only = ?, updated_at = ?
       WHERE guild_id = ? AND name_key = ?`,
    )
    .run(
      response ?? existing.response,
      look.label === undefined ? existing.label : look.label,
      look.emoji === undefined ? existing.emoji : look.emoji,
      look.style === undefined ? existing.style : look.style,
      look.limitMode === undefined ? existing.limitMode : look.limitMode,
      (look.invokerOnly ?? existing.invokerOnly) ? 1 : 0,
      Date.now(),
      guildId,
      buttonKey(name),
    );

  return result.changes > 0;
}

export function claimButtonClick(
  guildId: string,
  messageId: string,
  userId: string,
  nameKey: string,
  limit: ButtonLimit,
): boolean {
  const conditions = ['message_id = ?'];
  const params: string[] = [messageId];
  if (limit.perUser) {
    conditions.push('user_id = ?');
    params.push(userId);
  }
  if (limit.perButton) {
    conditions.push('button_key = ?');
    params.push(nameKey);
  }

  const run = db().transaction((): boolean => {
    const taken = db()
      .prepare(
        `SELECT 1 FROM button_clicks WHERE ${conditions.join(' AND ')} LIMIT 1`,
      )
      .get(...params);
    if (taken) return false;

    db()
      .prepare(
        `INSERT OR IGNORE INTO button_clicks
          (guild_id, message_id, user_id, button_key, clicked_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(guildId, messageId, userId, nameKey, Date.now());

    return true;
  });

  return run();
}

export function releaseButtonClick(
  messageId: string,
  userId: string,
  nameKey: string,
): void {
  db()
    .prepare(
      `DELETE FROM button_clicks
       WHERE message_id = ? AND user_id = ? AND button_key = ?`,
    )
    .run(messageId, userId, nameKey);
}

export function clearMessageClicks(messageId: string): void {
  db().prepare('DELETE FROM button_clicks WHERE message_id = ?').run(messageId);
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
