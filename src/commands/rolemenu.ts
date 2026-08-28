import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  inlineCode,
  codeBlock,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';

import type { SlashCommand } from '../client.js';
import {
  createRoleMenu,
  updateRoleMenu,
  deleteRoleMenu,
  getRoleMenu,
  listRoleMenus,
  menuRowCost,
  isMenuStyle,
  isMenuMode,
  roleMenuKey,
  MENU_STYLES,
  MENU_MODES,
  MAX_MENU_NAME,
  MAX_MENU_ROLES,
  type RoleMenu,
  type RoleMenuInput,
} from '../services/roleMenus/store.js';
import {
  awaitRoleLines,
  serializeRoleLines,
  PENDING_MS,
} from '../services/roleMenus/input.js';
import { STYLE_IDS } from '../services/buttons/registry.js';
import { commandMention } from '../utils/commandMentions.js';
import { serverEmbed, NO_DMS } from '../utils/style.js';

const PLACEHOLDER_MAX = 150;

const STYLE_CHOICES = MENU_STYLES.map((id) => ({ name: id, value: id }));
const MODE_CHOICES = [
  { name: 'multi ━ pick as many as you like', value: 'multi' },
  { name: 'single ━ picking one drops the others', value: 'single' },
];
const COLOR_CHOICES = STYLE_IDS.map((id) => ({ name: id, value: id }));

function settingOptions(
  sub: SlashCommandSubcommandBuilder,
): SlashCommandSubcommandBuilder {
  return sub
    .addStringOption((o) =>
      o
        .setName('style')
        .setDescription('a dropdown, or a button per role')
        .addChoices(...STYLE_CHOICES)
        .setRequired(false),
    )
    .addStringOption((o) =>
      o
        .setName('mode')
        .setDescription('can people hold several of these at once?')
        .addChoices(...MODE_CHOICES)
        .setRequired(false),
    )
    .addStringOption((o) =>
      o
        .setName('placeholder')
        .setDescription('the grey text on a dropdown, ignored by buttons')
        .setMaxLength(PLACEHOLDER_MAX)
        .setRequired(false),
    )
    .addStringOption((o) =>
      o
        .setName('color')
        .setDescription('button color, ignored by dropdowns')
        .addChoices(...COLOR_CHOICES)
        .setRequired(false),
    );
}

function readSettings(interaction: ChatInputCommandInteraction): RoleMenuInput {
  const patch: RoleMenuInput = {};

  const style = interaction.options.getString('style');
  if (style !== null && isMenuStyle(style)) patch.style = style;

  const mode = interaction.options.getString('mode');
  if (mode !== null && isMenuMode(mode)) patch.mode = mode;

  const placeholder = interaction.options.getString('placeholder');
  if (placeholder !== null) patch.placeholder = placeholder.trim() || null;

  const color = interaction.options.getString('color');
  if (color !== null) patch.color = color;

  return patch;
}

function pasteHint(guild: Guild, menu: RoleMenu): string {
  const current = serializeRoleLines(guild, menu.roles);
  const lines = [
    `paste your roles here as one message, one per line ! you've got ${Math.round(PENDING_MS / 60_000)} minutes, or say ${inlineCode('cancel')}`,
    codeBlock('@role | label | emoji'),
    `label and emoji are optional,, up to **${MAX_MENU_ROLES}** roles`,
    `-# ✧ role mentions can ping, so do this somewhere quiet !`,
  ];

  if (current.length > 0) {
    lines.splice(
      1,
      0,
      "here's what it has now, copy and adjust it:",
      codeBlock(current.slice(0, 1500)),
    );
  }

  return lines.join('\n');
}

function menuEmbed(guild: Guild, header: string, menu: RoleMenu) {
  const missing: string[] = [];
  const blocks = menu.roles.map((entry) => {
    const role = guild.roles.cache.get(entry.roleId);
    if (!role) {
      missing.push(entry.roleId);
      return `ᯓ➤ ~~${entry.roleId}~~\n-# ✧ this role is gone`;
    }

    const bits = [entry.label ?? role.name, entry.emoji ?? null].filter(
      (bit) => bit !== null,
    );
    return `ᯓ➤ ${role.toString()}\n-# ✧ shows as ${bits.join(' ')}`;
  });

  const meta = [
    menu.style,
    menu.mode === 'single' ? 'one at a time' : 'as many as you like',
    menu.style === 'buttons' ? (menu.color ?? 'gray') : null,
  ].filter((bit) => bit !== null);

  const lines = [
    `꒰ ${menu.name} ꒱ *${menu.roles.length} role${menu.roles.length === 1 ? '' : 's'} ⊹ ${meta.join(' ━ ')}*`,
    '',
    blocks.length > 0 ? blocks.join('\n\n') : 'no roles yet !',
    '',
  ];

  if (menu.placeholder) lines.push(`-# ✧ says "${menu.placeholder}"`);
  if (missing.length > 0) {
    lines.push(
      `-# ✧ **${missing.length}** of these no longer exist and are skipped when it renders`,
    );
  }
  lines.push(
    `-# ✧ takes up **${menuRowCost(menu)}** of the 5 component rows`,
    `⁀જ➣ drop it anywhere with ${inlineCode(`{rolemenu:${menu.name}}`)}`,
  );

  return serverEmbed(guild).setTitle(header).setDescription(lines.join('\n'));
}

function noMenuEmbed(guild: Guild, name: string) {
  return serverEmbed(guild).setDescription(
    `## there's no ${inlineCode(name)} role menu !\nmake one with ${commandMention('/rolemenu add')}, or check ${commandMention('/rolemenu list')}`,
  );
}

async function respondWithMenuNames(
  interaction: AutocompleteInteraction,
): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused().toLowerCase();
  const choices = listRoleMenus(interaction.guildId)
    .filter((menu) => menu.nameKey.includes(focused))
    .slice(0, 25)
    .map((menu) => ({
      name: `${menu.name} · ${menu.roles.length} roles · ${menu.style}`,
      value: menu.name,
    }));

  await interaction.respond(choices);
}

async function runAdd(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
): Promise<void> {
  const name = interaction.options.getString('name', true).trim();

  if (name.length === 0 || name.length > MAX_MENU_NAME) {
    await interaction.reply({
      content: `that name needs to be 1 to ${MAX_MENU_NAME} characters !`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!createRoleMenu(guild.id, name, readSettings(interaction))) {
    await interaction.reply({
      content: `there's already a ${inlineCode(roleMenuKey(name))} role menu ! change it with ${commandMention('/rolemenu roles')}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const menu = getRoleMenu(guild.id, name);
  if (!menu) return;

  awaitRoleLines(
    guild.id,
    interaction.channelId,
    interaction.user.id,
    menu.nameKey,
  );

  await interaction.reply({
    embeds: [menuEmbed(guild, `✦ made the ${menu.name} menu !`, menu)],
    content: pasteHint(guild, menu),
  });
}

async function runEdit(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
): Promise<void> {
  const name = interaction.options.getString('name', true);
  if (!getRoleMenu(guild.id, name)) {
    await interaction.reply({ embeds: [noMenuEmbed(guild, name)] });
    return;
  }

  updateRoleMenu(guild.id, name, readSettings(interaction));
  const menu = getRoleMenu(guild.id, name);
  if (!menu) return;

  await interaction.reply({
    embeds: [menuEmbed(guild, `✦ updated ${menu.name} !`, menu)],
  });
}

async function runRoles(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
): Promise<void> {
  const name = interaction.options.getString('name', true);
  const menu = getRoleMenu(guild.id, name);
  if (!menu) {
    await interaction.reply({ embeds: [noMenuEmbed(guild, name)] });
    return;
  }

  awaitRoleLines(
    guild.id,
    interaction.channelId,
    interaction.user.id,
    menu.nameKey,
  );

  await interaction.reply({ content: pasteHint(guild, menu) });
}

async function runShow(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
): Promise<void> {
  const name = interaction.options.getString('name', true);
  const menu = getRoleMenu(guild.id, name);

  if (!menu) {
    await interaction.reply({ embeds: [noMenuEmbed(guild, name)] });
    return;
  }

  await interaction.reply({ embeds: [menuEmbed(guild, menu.name, menu)] });
}

async function runList(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
): Promise<void> {
  const all = listRoleMenus(guild.id);

  if (all.length === 0) {
    await interaction.reply({
      embeds: [
        serverEmbed(guild)
          .setTitle('✦ role menus (0)')
          .setDescription(
            `none yet ! make one with ${commandMention('/rolemenu add')}`,
          ),
      ],
    });
    return;
  }

  const blocks = all.map((menu) => {
    const bits = [
      `${menu.roles.length} role${menu.roles.length === 1 ? '' : 's'}`,
      menu.style,
      menu.mode === 'single' ? 'one at a time' : null,
    ].filter((bit) => bit !== null);

    return `ᯓ➤ **${menu.name}**\n-# ✧ ${bits.join(' ━ ')}`;
  });

  await interaction.reply({
    embeds: [
      serverEmbed(guild).setDescription(
        [
          `꒰ role menus ꒱ *${all.length} of them !*`,
          '',
          blocks.join('\n\n'),
          '',
          `⁀જ➣ drop one anywhere with ${inlineCode('{rolemenu:name}')}`,
        ].join('\n'),
      ),
    ],
  });
}

async function runRemove(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
): Promise<void> {
  const name = interaction.options.getString('name', true);
  const menu = getRoleMenu(guild.id, name);

  if (!menu) {
    await interaction.reply({ embeds: [noMenuEmbed(guild, name)] });
    return;
  }

  deleteRoleMenu(guild.id, name);
  const lines = serializeRoleLines(guild, menu.roles);

  await interaction.reply({
    embeds: [
      serverEmbed(guild).setDescription(
        [
          `## removed the ${inlineCode(menu.name)} menu !`,
          lines.length > 0 ? codeBlock(lines.slice(0, 1500)) : '',
          `-# messages carrying it just show nothing now,, put it back with ${commandMention('/rolemenu add')}`,
        ]
          .filter((line) => line.length > 0)
          .join('\n'),
      ),
    ],
  });
}

export const rolemenu: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('rolemenu')
    .setDescription('menus people click to pick their own roles')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      settingOptions(
        sub
          .setName('add')
          .setDescription('make a role menu, then paste its roles')
          .addStringOption((o) =>
            o
              .setName('name')
              .setDescription('what to call it')
              .setMaxLength(MAX_MENU_NAME)
              .setRequired(true),
          ),
      ),
    )
    .addSubcommand((sub) =>
      settingOptions(
        sub
          .setName('edit')
          .setDescription('change how a menu looks, only what you pass')
          .addStringOption((o) =>
            o
              .setName('name')
              .setDescription('which one')
              .setAutocomplete(true)
              .setRequired(true),
          ),
      ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('roles')
        .setDescription('replace the roles in a menu by pasting a new list')
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('which one')
            .setAutocomplete(true)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription('one menu up close')
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('which one')
            .setAutocomplete(true)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('every role menu you have'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('delete a role menu')
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('which one')
            .setAutocomplete(true)
            .setRequired(true),
        ),
    ) as SlashCommandBuilder,

  async autocomplete(interaction) {
    await respondWithMenuNames(interaction);
  },

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: NO_DMS,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { guild } = interaction;
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') await runAdd(interaction, guild);
    else if (sub === 'edit') await runEdit(interaction, guild);
    else if (sub === 'roles') await runRoles(interaction, guild);
    else if (sub === 'show') await runShow(interaction, guild);
    else if (sub === 'list') await runList(interaction, guild);
    else if (sub === 'remove') await runRemove(interaction, guild);
  },
};
