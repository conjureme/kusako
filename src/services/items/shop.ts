import { db } from '../../db.js';
import { getItem, modifyInventory, type Item } from './store.js';
import { getBalance, modifyBalance } from '../economy/guild.js';

export interface Listing {
  guildId: string;
  itemKey: string;
  price: number;
  stock: number | null;
  requiredRoleId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ShopEntry {
  item: Item;
  listing: Listing;
}

export type PurchaseResult =
  | { ok: true; item: Item; price: number; remainingStock: number | null }
  | { ok: false; reason: 'no-listing' | 'sold-out' }
  | { ok: false; reason: 'poor'; price: number; balance: number };

interface ListingRow {
  guild_id: string;
  item_key: string;
  price: number;
  stock: number | null;
  required_role_id: string | null;
  created_at: number;
  updated_at: number;
}

function toListing(row: ListingRow): Listing {
  return {
    guildId: row.guild_id,
    itemKey: row.item_key,
    price: row.price,
    stock: row.stock,
    requiredRoleId: row.required_role_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function key(name: string): string {
  return name.trim().toLowerCase();
}

export function getListing(guildId: string, itemName: string): Listing | null {
  const row = db()
    .prepare('SELECT * FROM shop_listings WHERE guild_id = ? AND item_key = ?')
    .get(guildId, key(itemName)) as ListingRow | undefined;

  return row ? toListing(row) : null;
}

export function listShop(guildId: string): ShopEntry[] {
  const rows = db()
    .prepare(
      `SELECT l.*, i.name AS i_name, i.description AS i_description,
              i.emoji AS i_emoji, i.use_reply AS i_use_reply,
              i.giftable AS i_giftable, i.created_at AS i_created_at,
              i.updated_at AS i_updated_at
       FROM shop_listings l
       JOIN items i ON i.guild_id = l.guild_id AND i.name_key = l.item_key
       WHERE l.guild_id = ?
       ORDER BY l.item_key`,
    )
    .all(guildId) as Array<
    ListingRow & {
      i_name: string;
      i_description: string | null;
      i_emoji: string | null;
      i_use_reply: string | null;
      i_giftable: number;
      i_created_at: number;
      i_updated_at: number;
    }
  >;

  return rows.map((row) => ({
    listing: toListing(row),
    item: {
      guildId: row.guild_id,
      name: row.i_name,
      nameKey: row.item_key,
      description: row.i_description,
      emoji: row.i_emoji,
      useReply: row.i_use_reply,
      giftable: row.i_giftable === 1,
      createdAt: row.i_created_at,
      updatedAt: row.i_updated_at,
    },
  }));
}

export function setListing(
  guildId: string,
  itemName: string,
  price: number,
  stock: number | null,
  requiredRoleId: string | null,
): boolean {
  if (!getItem(guildId, itemName)) return false;

  const now = Date.now();
  db()
    .prepare(
      `INSERT INTO shop_listings
        (guild_id, item_key, price, stock, required_role_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (guild_id, item_key)
       DO UPDATE SET price = excluded.price, stock = excluded.stock,
         required_role_id = excluded.required_role_id, updated_at = excluded.updated_at`,
    )
    .run(guildId, key(itemName), price, stock, requiredRoleId, now, now);

  return true;
}

export function removeListing(guildId: string, itemName: string): boolean {
  const result = db()
    .prepare('DELETE FROM shop_listings WHERE guild_id = ? AND item_key = ?')
    .run(guildId, key(itemName));

  return result.changes > 0;
}

export function purchase(
  guildId: string,
  userId: string,
  itemName: string,
): PurchaseResult {
  const run = db().transaction((): PurchaseResult => {
    const listing = getListing(guildId, itemName);
    const item = getItem(guildId, itemName);
    if (!listing || !item) return { ok: false, reason: 'no-listing' };

    if (listing.stock !== null && listing.stock <= 0) {
      return { ok: false, reason: 'sold-out' };
    }

    const paid = modifyBalance(
      guildId,
      userId,
      -listing.price,
      `shop ${item.nameKey}`,
    );
    if (!paid.ok) {
      return {
        ok: false,
        reason: 'poor',
        price: listing.price,
        balance: getBalance(guildId, userId),
      };
    }

    const given = modifyInventory(guildId, userId, itemName, 1);
    if (!given.ok) throw new Error('shop purchase failed');

    let remainingStock: number | null = null;
    if (listing.stock !== null) {
      remainingStock = listing.stock - 1;
      db()
        .prepare(
          `UPDATE shop_listings SET stock = ?, updated_at = ?
           WHERE guild_id = ? AND item_key = ?`,
        )
        .run(remainingStock, Date.now(), guildId, listing.itemKey);
    }

    return { ok: true, item, price: listing.price, remainingStock };
  });

  return run();
}
