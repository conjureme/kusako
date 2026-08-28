import { db } from '../../db.js';

export const MAX_MENU_ROLES = 25;
export const BUTTONS_PER_ROW = 5;

export const MENU_STYLES = ['dropdown', 'buttons'] as const;
export const MENU_MODES = ['multi', 'single'] as const;

export type MenuStyle = (typeof MENU_STYLES)[number];
export type MenuMode = (typeof MENU_MODES)[number];

export interface RoleMenuEntry {
  roleId: string;
  label: string | null;
  emoji: string | null;
}

export interface RoleMenu {
  guildId: string;
  name: string;
  nameKey: string;
  placeholder: string | null;
  style: MenuStyle;
  mode: MenuMode;
  color: string | null;
  roles: RoleMenuEntry[];
  createdAt: number;
  updatedAt: number;
}

export interface RoleMenuInput {
  placeholder?: string | null;
  style?: MenuStyle;
  mode?: MenuMode;
  color?: string | null;
  roles?: RoleMenuEntry[];
}

export interface RoleChange {
  add: string[];
  remove: string[];
}

interface Row {
  guild_id: string;
  name: string;
  name_key: string;
  placeholder: string | null;
  style: string;
  mode: string;
  color: string | null;
  roles: string;
  created_at: number;
  updated_at: number;
}

function parseEntries(raw: string): RoleMenuEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const entries: RoleMenuEntry[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.roleId !== 'string' || entry.roleId.length === 0) continue;

    entries.push({
      roleId: entry.roleId,
      label: typeof entry.label === 'string' ? entry.label : null,
      emoji: typeof entry.emoji === 'string' ? entry.emoji : null,
    });
  }
  return entries;
}

function toModel(row: Row): RoleMenu {
  return {
    guildId: row.guild_id,
    name: row.name,
    nameKey: row.name_key,
    placeholder: row.placeholder,
    style: isMenuStyle(row.style) ? row.style : 'dropdown',
    mode: isMenuMode(row.mode) ? row.mode : 'multi',
    color: row.color,
    roles: parseEntries(row.roles),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function isMenuStyle(value: string): value is MenuStyle {
  return (MENU_STYLES as readonly string[]).includes(value);
}

export function isMenuMode(value: string): value is MenuMode {
  return (MENU_MODES as readonly string[]).includes(value);
}

export function roleMenuKey(name: string): string {
  return name.trim().toLowerCase();
}

export function dedupeEntries(entries: RoleMenuEntry[]): RoleMenuEntry[] {
  const seen = new Set<string>();
  const out: RoleMenuEntry[] = [];

  for (const entry of entries) {
    if (seen.has(entry.roleId)) continue;
    seen.add(entry.roleId);
    out.push(entry);
    if (out.length >= MAX_MENU_ROLES) break;
  }

  return out;
}

export function menuRowCost(menu: RoleMenu): number {
  if (menu.roles.length === 0) return 0;
  if (menu.style === 'dropdown') return 1;

  return Math.ceil(menu.roles.length / BUTTONS_PER_ROW);
}

export function resolvePick(
  menu: RoleMenu,
  roleId: string,
  memberRoleIds: Iterable<string>,
): RoleChange {
  const held = new Set(memberRoleIds);
  const inMenu = menu.roles.some((entry) => entry.roleId === roleId);
  if (!inMenu) return { add: [], remove: [] };

  if (held.has(roleId)) return { add: [], remove: [roleId] };

  const remove =
    menu.mode === 'single'
      ? menu.roles
          .map((entry) => entry.roleId)
          .filter((id) => id !== roleId && held.has(id))
      : [];

  return { add: [roleId], remove };
}

export function getRoleMenu(guildId: string, name: string): RoleMenu | null {
  const row = db()
    .prepare('SELECT * FROM role_menus WHERE guild_id = ? AND name_key = ?')
    .get(guildId, roleMenuKey(name)) as Row | undefined;

  return row ? toModel(row) : null;
}

export function listRoleMenus(guildId: string): RoleMenu[] {
  const rows = db()
    .prepare('SELECT * FROM role_menus WHERE guild_id = ? ORDER BY name_key')
    .all(guildId) as Row[];

  return rows.map(toModel);
}

export function createRoleMenu(
  guildId: string,
  name: string,
  input: RoleMenuInput = {},
): boolean {
  const trimmed = name.trim();
  if (trimmed.length === 0) return false;

  const now = Date.now();
  const result = db()
    .prepare(
      `INSERT OR IGNORE INTO role_menus
        (guild_id, name, name_key, placeholder, style, mode, color, roles,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      guildId,
      trimmed,
      roleMenuKey(trimmed),
      input.placeholder ?? null,
      input.style ?? 'dropdown',
      input.mode ?? 'multi',
      input.color ?? null,
      JSON.stringify(dedupeEntries(input.roles ?? [])),
      now,
      now,
    );

  return result.changes > 0;
}

export function updateRoleMenu(
  guildId: string,
  name: string,
  patch: RoleMenuInput,
): boolean {
  const current = getRoleMenu(guildId, name);
  if (!current) return false;

  const result = db()
    .prepare(
      `UPDATE role_menus
       SET placeholder = ?, style = ?, mode = ?, color = ?, roles = ?,
           updated_at = ?
       WHERE guild_id = ? AND name_key = ?`,
    )
    .run(
      patch.placeholder === undefined ? current.placeholder : patch.placeholder,
      patch.style ?? current.style,
      patch.mode ?? current.mode,
      patch.color === undefined ? current.color : patch.color,
      JSON.stringify(dedupeEntries(patch.roles ?? current.roles)),
      Date.now(),
      guildId,
      current.nameKey,
    );

  return result.changes > 0;
}

export function deleteRoleMenu(guildId: string, name: string): boolean {
  const result = db()
    .prepare('DELETE FROM role_menus WHERE guild_id = ? AND name_key = ?')
    .run(guildId, roleMenuKey(name));

  return result.changes > 0;
}
