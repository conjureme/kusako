import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type EmbedBuilder,
} from 'discord.js';

import { EMBED_LIMITS } from '../services/embeds/store.js';

export interface Page {
  description: string;
  index: number;
  total: number;
}

export function paginate(
  blocks: string[],
  header: string | null,
  hint: string | null,
  page: number,
  separator = '\n\n',
): Page {
  const frame = [header, hint].filter((part) => part !== null);
  const budget = EMBED_LIMITS.description - frame.join('\n\n').length;

  const pages: string[][] = [];
  let current: string[] = [];
  let used = 0;

  for (const block of blocks) {
    const cost = block.length + separator.length;
    if (current.length > 0 && used + cost > budget) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(block);
    used += cost;
  }
  if (current.length > 0) pages.push(current);
  if (pages.length === 0) pages.push([]);

  const total = pages.length;
  const requested = Number.isFinite(page) ? Math.trunc(page) : 0;
  const index = Math.min(Math.max(requested, 0), total - 1);
  const body = pages[index]!.join(separator);
  const description = [header, body || null, hint]
    .filter((part) => part !== null)
    .join('\n\n');

  return { description, index, total };
}

export function pageRow(
  listKey: string,
  page: Page,
): ActionRowBuilder<ButtonBuilder> | null {
  if (page.total <= 1) return null;

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`page:${listKey}:${page.index - 1}`)
      .setLabel('←')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page.index === 0),
    new ButtonBuilder()
      .setCustomId(`page:${listKey}:${page.index + 1}`)
      .setLabel('→')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page.index === page.total - 1),
  );
}

export function pageFooter(page: Page, suffix?: string): string {
  const base = `page ${page.index + 1} of ${page.total}`;
  return suffix ? `${base} ━━━ ${suffix}` : base;
}

export function applyPage(
  embed: EmbedBuilder,
  listKey: string,
  page: Page,
  footerSuffix?: string,
) {
  embed.setDescription(page.description).setFooter({
    text: pageFooter(page, footerSuffix),
  });

  const row = pageRow(listKey, page);
  return row ? [row] : [];
}
