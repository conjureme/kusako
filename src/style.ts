import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  AttachmentBuilder,
  EmbedBuilder,
  type Guild,
  type User,
} from 'discord.js';

export const colors = {
  cream: 0xfaf0e7,
} as const;

export const BLANK = '\u200b';

export const NO_DMS = "my commands don't work in DMs !";

export const SPACER_IMAGE = 'attachment://spacer.png';

const spacerPng = readFileSync(
  fileURLToPath(new URL('../assets/spacer.png', import.meta.url)),
);

export function spacerFile(): AttachmentBuilder {
  return new AttachmentBuilder(spacerPng, { name: 'spacer.png' });
}

export function serverEmbed(guild: Guild): EmbedBuilder {
  return new EmbedBuilder().setColor(colors.cream).setAuthor({
    name: guild.name,
    iconURL: guild.iconURL({ size: 256 }) ?? undefined,
  });
}

export function userEmbed(user: User): EmbedBuilder {
  return new EmbedBuilder().setColor(colors.cream).setAuthor({
    name: user.username,
    iconURL: user.displayAvatarURL(),
  });
}

export function failureEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(colors.cream).setDescription(message);
}
