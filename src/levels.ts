import { db } from './db.js';
import { getGuildSetting, setGuildSetting } from './settings.js';

export const XP_MIN = 1;
export const XP_MAX = 10;
export const XP_COOLDOWN_SECONDS = 60;
export const MAX_LEVEL = 1000;

export function totalXpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

export function levelFromXp(xp: number): number {
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + 0.08 * xp)) / 2));
  while (totalXpForLevel(level + 1) <= xp) level += 1;
  while (level > 1 && totalXpForLevel(level) > xp) level -= 1;
  return Math.min(level, MAX_LEVEL);
}

export function isLevelingEnabled(guildId: string): boolean {
  return getGuildSetting(guildId, 'levels.enabled') === '1';
}

export function setLevelingEnabled(guildId: string, enabled: boolean): void {
  setGuildSetting(guildId, 'levels.enabled', enabled ? '1' : '0');
}

export function getXp(guildId: string, userId: string): number {
  const row = db()
    .prepare('SELECT xp FROM member_xp WHERE guild_id = ? AND user_id = ?')
    .get(guildId, userId) as { xp: number } | undefined;

  return row ? row.xp : 0;
}

export interface XpResult {
  ok: boolean;
  xp: number;
}

export function modifyXp(
  guildId: string,
  userId: string,
  delta: number,
): XpResult {
  const amount = Math.trunc(delta);
  if (!Number.isSafeInteger(amount)) {
    return { ok: false, xp: getXp(guildId, userId) };
  }

  const run = db().transaction((): XpResult => {
    const current = getXp(guildId, userId);
    const next = current + amount;
    if (next < 0 || !Number.isSafeInteger(next)) {
      return { ok: false, xp: current };
    }

    db()
      .prepare(
        `INSERT INTO member_xp (guild_id, user_id, xp, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (guild_id, user_id)
         DO UPDATE SET xp = excluded.xp, updated_at = excluded.updated_at`,
      )
      .run(guildId, userId, next, Date.now());

    return { ok: true, xp: next };
  });

  return run();
}

export function setXp(
  guildId: string,
  userId: string,
  value: number,
): XpResult {
  const target = Math.trunc(value);
  if (!Number.isSafeInteger(target) || target < 0) {
    return { ok: false, xp: getXp(guildId, userId) };
  }

  const run = db().transaction(
    (): XpResult => modifyXp(guildId, userId, target - getXp(guildId, userId)),
  );

  return run();
}

export interface LevelReply {
  level: number;
  response: string;
  createdAt: number;
  updatedAt: number;
}

interface LevelRow {
  level: number;
  response: string;
  created_at: number;
  updated_at: number;
}

function toLevelReply(row: LevelRow): LevelReply {
  return {
    level: row.level,
    response: row.response,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getLevelReply(
  guildId: string,
  level: number,
): LevelReply | null {
  const row = db()
    .prepare('SELECT * FROM level_replies WHERE guild_id = ? AND level = ?')
    .get(guildId, level) as LevelRow | undefined;

  return row ? toLevelReply(row) : null;
}

export function setLevelReply(
  guildId: string,
  level: number,
  response: string,
): void {
  const now = Date.now();
  db()
    .prepare(
      `INSERT INTO level_replies (guild_id, level, response, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (guild_id, level)
       DO UPDATE SET response = excluded.response, updated_at = excluded.updated_at`,
    )
    .run(guildId, level, response, now, now);
}

export function removeLevelReply(guildId: string, level: number): boolean {
  const result = db()
    .prepare('DELETE FROM level_replies WHERE guild_id = ? AND level = ?')
    .run(guildId, level);

  return result.changes > 0;
}

export function listLevelReplies(guildId: string): LevelReply[] {
  const rows = db()
    .prepare('SELECT * FROM level_replies WHERE guild_id = ? ORDER BY level')
    .all(guildId) as LevelRow[];

  return rows.map(toLevelReply);
}

export function countLevelRepliesBetween(
  guildId: string,
  fromLevel: number,
  toLevel: number,
): number {
  const row = db()
    .prepare(
      `SELECT COUNT(*) AS n FROM level_replies
       WHERE guild_id = ? AND level > ? AND level <= ?`,
    )
    .get(guildId, fromLevel, toLevel) as { n: number };

  return row.n;
}
