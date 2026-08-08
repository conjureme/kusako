import { db } from './db.js';

export function getGuildSetting(guildId: string, key: string): string | null {
  const row = db()
    .prepare('SELECT value FROM guild_settings WHERE guild_id = ? AND key = ?')
    .get(guildId, key) as { value: string } | undefined;

  return row ? row.value : null;
}

export function setGuildSetting(
  guildId: string,
  key: string,
  value: string,
): void {
  db()
    .prepare(
      `INSERT INTO guild_settings (guild_id, key, value, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (guild_id, key)
       DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(guildId, key, value, Date.now());
}
