import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import Database from 'better-sqlite3';

import { env } from './env.js';
import { logger } from './logger.js';

const DB_PATH = resolve(process.cwd(), env.dbPath);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS autoresponders (
  guild_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  trigger_key TEXT NOT NULL,
  response TEXT NOT NULL,
  match_mode TEXT NOT NULL DEFAULT 'exact',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, trigger_key)
);

CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, key)
);

CREATE TABLE IF NOT EXISTS balances (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  balance INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_guild_user
  ON transactions (guild_id, user_id);

CREATE TABLE IF NOT EXISTS items (
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  description TEXT,
  emoji TEXT,
  use_reply TEXT,
  giftable INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, name_key)
);

CREATE TABLE IF NOT EXISTS inventories (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id, item_key),
  FOREIGN KEY (guild_id, item_key)
    REFERENCES items (guild_id, name_key)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ar_cooldowns (
  guild_id TEXT NOT NULL,
  trigger_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, trigger_key, user_id),
  FOREIGN KEY (guild_id, trigger_key)
    REFERENCES autoresponders (guild_id, trigger_key)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  kind TEXT NOT NULL,
  channel_id TEXT,
  run_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shop_listings (
  guild_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  price INTEGER NOT NULL,
  stock INTEGER,
  required_role_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, item_key),
  FOREIGN KEY (guild_id, item_key)
    REFERENCES items (guild_id, name_key)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS levels (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  xp INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS game_cooldowns (
  guild_id TEXT NOT NULL,
  game TEXT NOT NULL,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, game, user_id)
);

CREATE TABLE IF NOT EXISTS global_balances (
  user_id TEXT NOT NULL,
  currency TEXT NOT NULL,
  balance INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, currency)
);

CREATE TABLE IF NOT EXISTS global_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  currency TEXT NOT NULL,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_global_transactions_user
  ON global_transactions (user_id, currency);

CREATE TABLE IF NOT EXISTS embeds (
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, name_key)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_run_at
  ON scheduled_tasks (run_at);
`;

let instance: Database.Database | null = null;

function migrate(database: Database.Database): void {
  const hasColumn = (table: string, column: string): boolean => {
    const columns = database
      .prepare(`PRAGMA table_info(${table})`)
      .all() as Array<{ name: string }>;
    return columns.some((c) => c.name === column);
  };
  const hasTable = (table: string): boolean =>
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table) !== undefined;

  if (hasTable('scheduled_messages')) {
    const embedsCol = hasColumn('scheduled_messages', 'embeds_json')
      ? 'embeds_json'
      : 'NULL';
    database.exec(
      `INSERT INTO scheduled_tasks (guild_id, kind, channel_id, run_at, created_at, payload)
       SELECT NULL, 'send', channel_id, send_at, created_at,
         json_object('content', content, 'embeds', ${embedsCol})
       FROM scheduled_messages`,
    );
    database.exec('DROP TABLE scheduled_messages');
  }

  if (!hasColumn('items', 'use_reply')) {
    database.exec('ALTER TABLE items ADD COLUMN use_reply TEXT');
  }
  if (!hasColumn('items', 'giftable')) {
    database.exec(
      'ALTER TABLE items ADD COLUMN giftable INTEGER NOT NULL DEFAULT 1',
    );
  }
}

export function db(): Database.Database {
  if (instance) return instance;

  mkdirSync(dirname(DB_PATH), { recursive: true });
  instance = new Database(DB_PATH);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  instance.exec(SCHEMA);
  migrate(instance);

  logger.debug({ path: DB_PATH }, 'sqlite opened');
  return instance;
}

export function closeDb(): void {
  if (!instance) return;
  instance.close();
  instance = null;
}
