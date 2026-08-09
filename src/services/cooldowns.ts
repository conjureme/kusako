import { db } from '../db.js';

export function autoresponderScope(triggerKey: string): string {
  return `ar:${triggerKey}`;
}

export function eventScope(kind: string): string {
  return `event:${kind}`;
}

export function levelScope(level: number): string {
  return `level:${level}`;
}

export function buttonScope(nameKey: string): string {
  return `button:${nameKey}`;
}

export function gameScope(game: string): string {
  return `game:${game}`;
}

export function getCooldownRemaining(
  guildId: string,
  scope: string,
  userId: string,
): number {
  const row = db()
    .prepare(
      `SELECT expires_at FROM cooldowns
       WHERE guild_id = ? AND scope = ? AND user_id = ?`,
    )
    .get(guildId, scope, userId) as { expires_at: number } | undefined;

  if (!row) return 0;

  const remainingMs = row.expires_at - Date.now();
  if (remainingMs <= 0) {
    db()
      .prepare(
        `DELETE FROM cooldowns
         WHERE guild_id = ? AND scope = ? AND user_id = ?`,
      )
      .run(guildId, scope, userId);
    return 0;
  }

  return Math.ceil(remainingMs / 1000);
}

export function setCooldown(
  guildId: string,
  scope: string,
  userId: string,
  seconds: number,
): void {
  db()
    .prepare(
      `INSERT INTO cooldowns (guild_id, scope, user_id, expires_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (guild_id, scope, user_id)
       DO UPDATE SET expires_at = excluded.expires_at`,
    )
    .run(guildId, scope, userId, Date.now() + seconds * 1000);
}

export function clearCooldowns(guildId: string, scope: string): void {
  db()
    .prepare('DELETE FROM cooldowns WHERE guild_id = ? AND scope = ?')
    .run(guildId, scope);
}
