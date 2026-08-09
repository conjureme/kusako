import { db } from '../../db.js';

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface EmbedData {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  timestamp?: string;
  author?: { name: string; icon_url?: string; url?: string };
  footer?: { text: string; icon_url?: string };
  image?: { url: string };
  thumbnail?: { url: string };
  fields?: EmbedField[];
}

export interface EmbedRecord {
  guildId: string;
  name: string;
  nameKey: string;
  data: EmbedData;
  createdAt: number;
  updatedAt: number;
}

export type EmbedValidation =
  | { ok: true; data: EmbedData }
  | { ok: false; errors: string[] };

export const URLISH = /^(https?|attachment):\/\//;

export const EMBED_LIMITS = {
  title: 256,
  description: 4096,
  authorName: 256,
  footerText: 2048,
  fieldName: 256,
  fieldValue: 1024,
  fields: 25,
  url: 2048,
  total: 6000,
} as const;

interface Row {
  guild_id: string;
  name: string;
  name_key: string;
  json: string;
  created_at: number;
  updated_at: number;
}

function toRecord(row: Row): EmbedRecord {
  let data: EmbedData = {};
  try {
    data = JSON.parse(row.json) as EmbedData;
  } catch {
    data = {};
  }

  return {
    guildId: row.guild_id,
    name: row.name,
    nameKey: row.name_key,
    data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function key(name: string): string {
  return name.trim().toLowerCase();
}

export function getEmbed(guildId: string, name: string): EmbedRecord | null {
  const row = db()
    .prepare('SELECT * FROM embeds WHERE guild_id = ? AND name_key = ?')
    .get(guildId, key(name)) as Row | undefined;

  return row ? toRecord(row) : null;
}

export function listEmbeds(guildId: string): EmbedRecord[] {
  const rows = db()
    .prepare('SELECT * FROM embeds WHERE guild_id = ? ORDER BY name_key')
    .all(guildId) as Row[];

  return rows.map(toRecord);
}

export function createEmbed(
  guildId: string,
  name: string,
  data: EmbedData,
): boolean {
  const trimmed = name.trim();
  if (trimmed.length === 0) return false;

  const now = Date.now();
  const result = db()
    .prepare(
      `INSERT OR IGNORE INTO embeds
        (guild_id, name, name_key, json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(guildId, trimmed, key(trimmed), JSON.stringify(data), now, now);

  return result.changes > 0;
}

export function updateEmbed(
  guildId: string,
  name: string,
  data: EmbedData,
): boolean {
  const result = db()
    .prepare(
      `UPDATE embeds SET json = ?, updated_at = ?
       WHERE guild_id = ? AND name_key = ?`,
    )
    .run(JSON.stringify(data), Date.now(), guildId, key(name));

  return result.changes > 0;
}

export function upsertEmbed(
  guildId: string,
  name: string,
  data: EmbedData,
): 'created' | 'updated' {
  if (updateEmbed(guildId, name, data)) return 'updated';
  createEmbed(guildId, name, data);
  return 'created';
}

export function deleteEmbed(guildId: string, name: string): boolean {
  const result = db()
    .prepare('DELETE FROM embeds WHERE guild_id = ? AND name_key = ?')
    .run(guildId, key(name));

  return result.changes > 0;
}

export function isRenderable(data: EmbedData): boolean {
  return Boolean(
    data.title ||
    data.description ||
    data.author ||
    data.footer ||
    data.image ||
    data.thumbnail ||
    (data.fields && data.fields.length > 0),
  );
}

export function parseColor(raw: string): number | null {
  const hex = raw.trim().replace(/^#/, '').replace(/^0x/i, '');
  if (!/^[0-9a-f]{1,6}$/i.test(hex)) return null;
  return parseInt(hex, 16);
}

function readString(
  value: unknown,
  label: string,
  max: number,
  errors: string[],
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    errors.push(`${label} must be text`);
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > max) {
    errors.push(`${label} is over ${max} characters`);
    return undefined;
  }
  return trimmed;
}

export function validateEmbedData(input: unknown): EmbedValidation {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['the embed must be a json object'] };
  }

  const raw = input as Record<string, unknown>;
  const errors: string[] = [];
  const data: EmbedData = {};

  const title = readString(raw.title, 'title', EMBED_LIMITS.title, errors);
  if (title) data.title = title;

  const description = readString(
    raw.description,
    'description',
    EMBED_LIMITS.description,
    errors,
  );
  if (description) data.description = description;

  const url = readString(raw.url, 'url', EMBED_LIMITS.url, errors);
  if (url) data.url = url;

  if (raw.color !== undefined && raw.color !== null) {
    const color =
      typeof raw.color === 'number'
        ? raw.color
        : typeof raw.color === 'string'
          ? parseColor(raw.color)
          : null;

    if (
      color === null ||
      !Number.isInteger(color) ||
      color < 0 ||
      color > 0xffffff
    ) {
      errors.push('color must be a hex like #faf0e7 or a number 0-16777215');
    } else {
      data.color = color;
    }
  }

  if (raw.timestamp !== undefined && raw.timestamp !== null) {
    const parsed =
      typeof raw.timestamp === 'string' ? Date.parse(raw.timestamp) : NaN;
    if (Number.isNaN(parsed)) {
      errors.push('timestamp must be an iso date string');
    } else {
      data.timestamp = new Date(parsed).toISOString();
    }
  }

  if (raw.author !== undefined && raw.author !== null) {
    if (typeof raw.author !== 'object' || Array.isArray(raw.author)) {
      errors.push('author must be an object with a name');
    } else {
      const author = raw.author as Record<string, unknown>;
      const name = readString(
        author.name,
        'author name',
        EMBED_LIMITS.authorName,
        errors,
      );
      if (name) {
        data.author = { name };
        const icon = readString(
          author.icon_url,
          'author icon url',
          EMBED_LIMITS.url,
          errors,
        );
        if (icon) data.author.icon_url = icon;
        const link = readString(
          author.url,
          'author url',
          EMBED_LIMITS.url,
          errors,
        );
        if (link) data.author.url = link;
      } else if (author.name === undefined || author.name === null) {
        errors.push('author needs a name');
      }
    }
  }

  if (raw.footer !== undefined && raw.footer !== null) {
    if (typeof raw.footer !== 'object' || Array.isArray(raw.footer)) {
      errors.push('footer must be an object with text');
    } else {
      const footer = raw.footer as Record<string, unknown>;
      const text = readString(
        footer.text,
        'footer text',
        EMBED_LIMITS.footerText,
        errors,
      );
      if (text) {
        data.footer = { text };
        const icon = readString(
          footer.icon_url,
          'footer icon url',
          EMBED_LIMITS.url,
          errors,
        );
        if (icon) data.footer.icon_url = icon;
      } else if (footer.text === undefined || footer.text === null) {
        errors.push('footer needs text');
      }
    }
  }

  for (const kind of ['image', 'thumbnail'] as const) {
    const value = raw[kind];
    if (value === undefined || value === null) continue;

    const urlValue =
      typeof value === 'string'
        ? value
        : typeof value === 'object' && !Array.isArray(value)
          ? (value as Record<string, unknown>).url
          : undefined;

    const parsed = readString(
      urlValue,
      `${kind} url`,
      EMBED_LIMITS.url,
      errors,
    );
    if (parsed) data[kind] = { url: parsed };
  }

  if (raw.fields !== undefined && raw.fields !== null) {
    if (!Array.isArray(raw.fields)) {
      errors.push('fields must be an array');
    } else if (raw.fields.length > EMBED_LIMITS.fields) {
      errors.push(`max ${EMBED_LIMITS.fields} fields per embed`);
    } else {
      const fields: EmbedField[] = [];
      for (const [index, entry] of raw.fields.entries()) {
        if (
          typeof entry !== 'object' ||
          entry === null ||
          Array.isArray(entry)
        ) {
          errors.push(`field ${index + 1} must be an object`);
          continue;
        }
        const field = entry as Record<string, unknown>;
        const name = readString(
          field.name,
          `field ${index + 1} name`,
          EMBED_LIMITS.fieldName,
          errors,
        );
        const value = readString(
          field.value,
          `field ${index + 1} value`,
          EMBED_LIMITS.fieldValue,
          errors,
        );
        if (!name || !value) {
          errors.push(`field ${index + 1} needs both a name and a value`);
          continue;
        }
        fields.push({ name, value, inline: field.inline === true });
      }
      if (fields.length > 0) data.fields = fields;
    }
  }

  const total =
    (data.title?.length ?? 0) +
    (data.description?.length ?? 0) +
    (data.author?.name.length ?? 0) +
    (data.footer?.text.length ?? 0) +
    (data.fields ?? []).reduce(
      (sum, field) => sum + field.name.length + field.value.length,
      0,
    );
  if (total > EMBED_LIMITS.total) {
    errors.push(
      `the embed text adds up to ${total.toLocaleString('en-US')} characters, discord caps it at ${EMBED_LIMITS.total.toLocaleString('en-US')}`,
    );
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, data };
}

export function parseEmbedJson(raw: string): EmbedValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ["that isn't valid json !"] };
  }

  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    const wrapper = parsed as Record<string, unknown>;
    if (Array.isArray(wrapper.embeds) && wrapper.embeds.length > 0) {
      parsed = wrapper.embeds[0];
    } else if (wrapper.embed !== undefined) {
      parsed = wrapper.embed;
    }
  }

  return validateEmbedData(parsed);
}
