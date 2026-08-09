import { db } from '../db.js';

export function getBotSetting(key: string): string | null {
  const row = db()
    .prepare('SELECT value FROM bot_settings WHERE key = ?')
    .get(key) as { value: string } | undefined;

  return row ? row.value : null;
}

export function setBotSetting(key: string, value: string): void {
  db()
    .prepare(
      `INSERT INTO bot_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (key)
       DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, value, Date.now());
}

export function clearBotSetting(key: string): void {
  db().prepare('DELETE FROM bot_settings WHERE key = ?').run(key);
}
