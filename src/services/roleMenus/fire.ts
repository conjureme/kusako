import {
  MessageFlags,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type StringSelectMenuInteraction,
} from 'discord.js';

import { getRoleMenu, parseRoleMenuId, resolvePick } from './store.js';
import { logger } from '../../logger.js';

type MenuInteraction = ButtonInteraction | StringSelectMenuInteraction;

const GONE = "that menu isn't around anymore !";
const NOTHING = 'nothing to change there !';

export function applicableRoles(guild: Guild, roleIds: string[]): string[] {
  return roleIds.filter((id) => {
    const role = guild.roles.cache.get(id);
    return role !== undefined && !role.managed && role.editable;
  });
}

export function receiptFor(added: string[], removed: string[]): string {
  const list = (ids: string[]) => ids.map((id) => `<@&${id}>`).join(', ');

  if (added.length > 0 && removed.length > 0) {
    return `you're ${list(added)} now !`;
  }
  if (added.length > 0) return `gave you ${list(added)} !`;
  if (removed.length > 0) return `took ${list(removed)} away !`;

  return NOTHING;
}

async function nudge(
  interaction: MenuInteraction,
  content: string,
): Promise<void> {
  await interaction
    .followUp({ content, flags: MessageFlags.Ephemeral })
    .catch(() => null);
}

export async function fireRoleMenu(
  interaction: MenuInteraction,
): Promise<void> {
  const parsed = parseRoleMenuId(interaction.customId);
  if (parsed === null || !interaction.inCachedGuild()) return;

  const picked = interaction.isStringSelectMenu()
    ? interaction.values[0]
    : undefined;
  const roleId = parsed.roleId ?? picked;
  if (roleId === undefined) return;

  await interaction.deferUpdate();

  const menu = getRoleMenu(interaction.guildId, parsed.nameKey);
  if (!menu) {
    await nudge(interaction, GONE);
    return;
  }

  const member: GuildMember = interaction.member;
  const change = resolvePick(menu, roleId, member.roles.cache.keys());

  const add = applicableRoles(interaction.guild, change.add);
  const remove = applicableRoles(interaction.guild, change.remove);
  const blocked =
    change.add.length - add.length + (change.remove.length - remove.length);

  try {
    if (add.length > 0) {
      await member.roles.add(add, `role menu ${menu.name}`);
    }
    if (remove.length > 0) {
      await member.roles.remove(remove, `role menu ${menu.name}`);
    }
  } catch (err) {
    logger.error(
      { err, guild: interaction.guildId, menu: menu.nameKey, roleId },
      'role menu change failed',
    );
    await nudge(
      interaction,
      "i couldn't change that one... admin needs to check my permissions !",
    );
    return;
  }

  const receipt = receiptFor(add, remove);
  const note =
    blocked > 0
      ? `\n-# ✧ ${blocked} role${blocked === 1 ? '' : 's'} here sit${blocked === 1 ? 's' : ''} above me, so i left ${blocked === 1 ? 'it' : 'them'} alone`
      : '';

  await nudge(interaction, `${receipt}${note}`);
}
