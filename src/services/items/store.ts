import { db } from '../../db.js';

export interface Item {
  guildId: string;
  name: string;
  nameKey: string;
  description: string | null;
  emoji: string | null;
  useReply: string | null;
  giftable: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface InventoryEntry {
  item: Item;
  quantity: number;
}

export interface InventoryResult {
  ok: boolean;
  quantity: number;
}

interface ItemRow {
  guild_id: string;
  name: string;
  name_key: string;
  description: string | null;
  emoji: string | null;
  use_reply: string | null;
  giftable: number;
  created_at: number;
  updated_at: number;
}

function toItem(row: ItemRow): Item {
  return {
    guildId: row.guild_id,
    name: row.name,
    nameKey: row.name_key,
    description: row.description,
    emoji: row.emoji,
    useReply: row.use_reply,
    giftable: row.giftable === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function key(name: string): string {
  return name.trim().toLowerCase();
}

export function getItem(guildId: string, name: string): Item | null {
  const row = db()
    .prepare('SELECT * FROM items WHERE guild_id = ? AND name_key = ?')
    .get(guildId, key(name)) as ItemRow | undefined;

  return row ? toItem(row) : null;
}

export function listItems(guildId: string): Item[] {
  const rows = db()
    .prepare('SELECT * FROM items WHERE guild_id = ? ORDER BY created_at')
    .all(guildId) as ItemRow[];

  return rows.map(toItem);
}

export function createItem(
  guildId: string,
  name: string,
  description: string | null,
  emoji: string | null,
  useReply: string | null,
  giftable: boolean,
): boolean {
  const trimmed = name.trim();
  if (trimmed.length === 0) return false;

  const now = Date.now();
  const result = db()
    .prepare(
      `INSERT OR IGNORE INTO items
        (guild_id, name, name_key, description, emoji, use_reply, giftable, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      guildId,
      trimmed,
      key(name),
      description,
      emoji,
      useReply,
      giftable ? 1 : 0,
      now,
      now,
    );

  return result.changes > 0;
}

export function editItem(
  guildId: string,
  name: string,
  fields: {
    description?: string;
    emoji?: string;
    useReply?: string | null;
    giftable?: boolean;
  },
): boolean {
  const existing = getItem(guildId, name);
  if (!existing) return false;

  db()
    .prepare(
      `UPDATE items SET description = ?, emoji = ?, use_reply = ?, giftable = ?, updated_at = ?
       WHERE guild_id = ? AND name_key = ?`,
    )
    .run(
      fields.description ?? existing.description,
      fields.emoji ?? existing.emoji,
      fields.useReply === undefined ? existing.useReply : fields.useReply,
      (fields.giftable ?? existing.giftable) ? 1 : 0,
      Date.now(),
      guildId,
      existing.nameKey,
    );

  return true;
}

export function deleteItem(guildId: string, name: string): boolean {
  const result = db()
    .prepare('DELETE FROM items WHERE guild_id = ? AND name_key = ?')
    .run(guildId, key(name));

  return result.changes > 0;
}

export function getCirculation(guildId: string, name: string): number {
  const row = db()
    .prepare(
      `SELECT COALESCE(SUM(quantity), 0) AS total FROM inventories
       WHERE guild_id = ? AND item_key = ?`,
    )
    .get(guildId, key(name)) as { total: number };

  return row.total;
}

export function getQuantity(
  guildId: string,
  userId: string,
  itemName: string,
): number {
  const row = db()
    .prepare(
      `SELECT quantity FROM inventories
       WHERE guild_id = ? AND user_id = ? AND item_key = ?`,
    )
    .get(guildId, userId, key(itemName)) as { quantity: number } | undefined;

  return row ? row.quantity : 0;
}

export function getInventory(
  guildId: string,
  userId: string,
): InventoryEntry[] {
  const rows = db()
    .prepare(
      `SELECT i.*, inv.quantity AS inv_quantity FROM inventories inv
       JOIN items i ON i.guild_id = inv.guild_id AND i.name_key = inv.item_key
       WHERE inv.guild_id = ? AND inv.user_id = ?
       ORDER BY i.name_key`,
    )
    .all(guildId, userId) as Array<ItemRow & { inv_quantity: number }>;

  return rows.map((row) => ({ item: toItem(row), quantity: row.inv_quantity }));
}

export function modifyInventory(
  guildId: string,
  userId: string,
  itemName: string,
  delta: number,
): InventoryResult {
  const amount = Math.trunc(delta);
  if (!Number.isSafeInteger(amount)) {
    return { ok: false, quantity: getQuantity(guildId, userId, itemName) };
  }

  const run = db().transaction((): InventoryResult => {
    const item = getItem(guildId, itemName);
    if (!item) return { ok: false, quantity: 0 };

    const current = getQuantity(guildId, userId, itemName);
    const next = current + amount;
    if (next < 0) return { ok: false, quantity: current };

    if (next === 0) {
      db()
        .prepare(
          `DELETE FROM inventories
           WHERE guild_id = ? AND user_id = ? AND item_key = ?`,
        )
        .run(guildId, userId, item.nameKey);
    } else {
      db()
        .prepare(
          `INSERT INTO inventories
            (guild_id, user_id, item_key, quantity, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (guild_id, user_id, item_key)
           DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at`,
        )
        .run(guildId, userId, item.nameKey, next, Date.now());
    }

    return { ok: true, quantity: next };
  });

  return run();
}

export function transferItem(
  guildId: string,
  fromUserId: string,
  toUserId: string,
  itemName: string,
  quantity: number,
): InventoryResult {
  const amount = Math.trunc(quantity);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return { ok: false, quantity: getQuantity(guildId, fromUserId, itemName) };
  }

  const run = db().transaction((): InventoryResult => {
    const taken = modifyInventory(guildId, fromUserId, itemName, -amount);
    if (!taken.ok) return taken;

    const given = modifyInventory(guildId, toUserId, itemName, amount);
    if (!given.ok) throw new Error('item transfer failed');

    return taken;
  });

  return run();
}

export function setInventory(
  guildId: string,
  userId: string,
  itemName: string,
  value: number,
): InventoryResult {
  const target = Math.trunc(value);
  if (!Number.isSafeInteger(target) || target < 0) {
    return { ok: false, quantity: getQuantity(guildId, userId, itemName) };
  }

  const run = db().transaction(
    (): InventoryResult =>
      modifyInventory(
        guildId,
        userId,
        itemName,
        target - getQuantity(guildId, userId, itemName),
      ),
  );

  return run();
}
