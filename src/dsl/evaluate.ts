import type { APIEmbed } from 'discord.js';

import { db } from '../db.js';
import {
  getEmbed,
  isRenderable,
  parseColor,
  EMBED_LIMITS,
  URLISH,
  type EmbedData,
} from '../services/embeds/store.js';
import { colors } from '../utils/style.js';
import type { Node, PlaceholderNode } from './ast.js';
import { parse } from './parser.js';
import {
  PendingEffects,
  type RenderContext,
  type EvalMeta,
} from './context.js';
import { generators } from './generators.js';
import { placeholders } from './placeholders.js';
import {
  guards,
  resolveChannelArg,
  resolveRoleArg,
  resolveMemberArg,
  userIdOf,
  GUARD_TARGETS,
  type FailureData,
  type GuardSubject,
} from './guards.js';
import { effects, pendingOf, EffectError } from './effects.js';
import { getCooldownRemaining, setCooldown } from '../services/cooldowns.js';
import {
  interpolateArgs,
  parseAmount,
  clampDuration,
  formatDuration,
} from './args.js';

export const MAX_ROWS = 5;
export const BUTTONS_PER_ROW = 5;
export const MAX_BUTTONS = MAX_ROWS * BUTTONS_PER_ROW;
export const MAX_DROPDOWN_OPTIONS = 25;

export function rowsUsed(buttons: number, dropdowns: number): number {
  return Math.ceil(buttons / BUTTONS_PER_ROW) + dropdowns;
}

export interface Segment {
  content: string;
  delaySeconds: number;
  embeds: APIEmbed[];
}

export interface MessageActions {
  reactions: string[];
  replyReactions: string[];
  deleteTrigger: boolean;
  dm: boolean;
  sendToChannelId: string | null;
  roleActions: Array<{
    add: boolean;
    roleId: string;
    userId: string;
    forSeconds?: number;
  }>;
  nickActions: Array<{ userId: string; nick: string }>;
  deleteReplyAfter: number | null;
  ephemeral: boolean;
  buttons: Array<
    | { kind: 'responder'; name: string }
    | { kind: 'link'; label: string; url: string }
  >;
  dropdowns: Array<{ placeholder: string; options: string[] }>;
}

export type EvalResult =
  | { ok: true; segments: Segment[]; actions: MessageActions }
  | { ok: false; message: string; silent: boolean };

async function renderInline(
  template: string,
  ctx: RenderContext,
  captures: Map<string, string>,
): Promise<string> {
  let out = '';
  for (const node of parse(template)) {
    if (node.kind === 'text') {
      out += node.value;
      continue;
    }
    if (node.kind === 'capture-ref') {
      out += captures.get(node.name) ?? node.raw;
      continue;
    }

    const placeholder = placeholders.get(node.name);
    if (!placeholder) {
      out += node.raw;
      continue;
    }
    try {
      out += await placeholder.resolve(
        ctx,
        interpolateArgs(node.args, captures),
      );
    } catch {
      out += node.raw;
    }
  }
  return out;
}

async function renderEmbed(
  data: EmbedData,
  ctx: RenderContext,
  captures: Map<string, string>,
): Promise<APIEmbed> {
  const render = async (value: string | undefined, max: number) => {
    if (value === undefined) return undefined;
    const rendered = (await renderInline(value, ctx, captures))
      .trim()
      .slice(0, max);
    return rendered.length > 0 ? rendered : undefined;
  };
  const renderUrl = async (value: string | undefined) => {
    const rendered = await render(value, EMBED_LIMITS.url);
    return rendered !== undefined && URLISH.test(rendered)
      ? rendered
      : undefined;
  };

  const out: APIEmbed = {};

  const title = await render(data.title, EMBED_LIMITS.title);
  if (title) out.title = title;
  const description = await render(data.description, EMBED_LIMITS.description);
  if (description) out.description = description;
  const url = await renderUrl(data.url);
  if (url) out.url = url;
  if (data.color !== undefined) out.color = data.color;
  if (data.timestamp) out.timestamp = data.timestamp;

  if (data.author) {
    const name = await render(data.author.name, EMBED_LIMITS.authorName);
    if (name) {
      out.author = { name };
      const icon = await renderUrl(data.author.icon_url);
      if (icon) out.author.icon_url = icon;
      const link = await renderUrl(data.author.url);
      if (link) out.author.url = link;
    }
  }

  if (data.footer) {
    const text = await render(data.footer.text, EMBED_LIMITS.footerText);
    if (text) {
      out.footer = { text };
      const icon = await renderUrl(data.footer.icon_url);
      if (icon) out.footer.icon_url = icon;
    }
  }

  const image = await renderUrl(data.image?.url);
  if (image) out.image = { url: image };
  const thumbnail = await renderUrl(data.thumbnail?.url);
  if (thumbnail) out.thumbnail = { url: thumbnail };

  if (data.fields && data.fields.length > 0) {
    const fields = [];
    for (const field of data.fields.slice(0, EMBED_LIMITS.fields)) {
      const name = await render(field.name, EMBED_LIMITS.fieldName);
      const value = await render(field.value, EMBED_LIMITS.fieldValue);
      if (name && value) {
        fields.push({ name, value, inline: field.inline === true });
      }
    }
    if (fields.length > 0) out.fields = fields;
  }

  return out;
}

export async function evaluate(
  nodes: Node[],
  ctx: RenderContext,
  scope: string,
): Promise<EvalResult> {
  const meta: EvalMeta = {
    guildId: ctx.guild.id,
    userId: ctx.member?.id ?? '',
    scope,
  };

  const pending = new PendingEffects();
  ctx.pending = pending;

  const captures = new Map<string, string>();
  const captureIndices = new Map<string, number>();
  const words = ctx.messageArgs ?? [];
  words.forEach((word, i) => {
    captures.set(`$${i + 1}`, word);
    captures.set(`$${i + 1}+`, words.slice(i).join(' '));
  });
  const segments: Segment[] = [];
  const queuedEffects: Array<{ name: string; args: string[] }> = [];
  let current = '';
  let currentDelay = 0;
  let cooldownSeconds: number | null = null;
  const actions: MessageActions = {
    reactions: [],
    replyReactions: [],
    deleteTrigger: false,
    dm: false,
    sendToChannelId: null,
    roleActions: [],
    nickActions: [],
    deleteReplyAfter: null,
    ephemeral: nodes.some(
      (node) => node.kind === 'placeholder' && node.name === 'ephemeral',
    ),
    buttons: [],
    dropdowns: [],
  };

  const silent = nodes.some(
    (node) => node.kind === 'placeholder' && node.name === 'silent',
  );

  const errorNode = nodes.find(
    (node) => node.kind === 'placeholder' && node.name === 'error',
  );
  const errorTemplate =
    errorNode?.kind === 'placeholder' ? (errorNode.args[0] ?? '') : '';

  const fail = async (
    message: string,
    data?: FailureData,
  ): Promise<{ ok: false; message: string; silent: boolean }> => {
    if (errorTemplate.trim().length > 0) {
      if (data) {
        for (const [key, value] of Object.entries(data)) {
          captures.set(key, value);
        }
      }
      const custom = (await renderInline(errorTemplate, ctx, captures)).trim();
      if (custom.length > 0) return { ok: false, message: custom, silent };
    }
    return { ok: false, message, silent };
  };

  let currentEmbeds: APIEmbed[] = [];
  let wrapCurrent = false;
  let wrapColor: number | null = null;

  const closeSegment = (nextDelay: number) => {
    let content = current.trim();
    const embeds = currentEmbeds;

    if (wrapCurrent && content.length > 0) {
      embeds.unshift({
        description: content.slice(0, EMBED_LIMITS.description),
        color: wrapColor ?? colors.cream,
      });
      content = '';
    }

    segments.push({ content, delaySeconds: currentDelay, embeds });
    current = '';
    currentDelay = nextDelay;
    currentEmbeds = [];
    wrapCurrent = false;
    wrapColor = null;
  };

  const prebound = new Set<PlaceholderNode>();
  for (const node of nodes) {
    if (node.kind !== 'placeholder' || !node.captureName) continue;
    if (generators.has(node.name)) continue;

    const placeholder = placeholders.get(node.name);
    if (!placeholder || placeholder.ledger) continue;

    try {
      const args = interpolateArgs(node.args, captures);
      captures.set(node.captureName, await placeholder.resolve(ctx, args));
      prebound.add(node);
    } catch {
      // leave it for the main loop,, which renders the tag raw
    }
  }

  for (const node of nodes) {
    if (node.kind === 'text') {
      current += node.value;
      continue;
    }

    if (node.kind === 'capture-ref') {
      current += captures.get(node.name) ?? node.raw;
      continue;
    }

    const args = interpolateArgs(node.args, captures);

    const generate = generators.get(node.name);
    if (generate) {
      try {
        const result = await generate(ctx, args, captureIndices);
        const name = node.captureName ?? node.name;
        captures.set(name, result.value);
        if (result.index !== undefined) captureIndices.set(name, result.index);
      } catch {
        current += node.raw;
      }
      continue;
    }

    if (node.name === 'split') {
      closeSegment(0);
      continue;
    }

    if (node.name === 'delay') {
      closeSegment(clampDuration(parseAmount(args[0] ?? '')));
      continue;
    }

    if (node.name === 'cooldown') {
      const seconds = clampDuration(parseAmount(args[0] ?? ''));
      if (seconds <= 0) continue;

      const remaining = getCooldownRemaining(
        meta.guildId,
        meta.scope,
        meta.userId,
      );
      if (remaining > 0) {
        // (as-prebind):: origin; this returns before later binds run
        return fail(`slow down !! try again in ${formatDuration(remaining)}`, {
          'cooldown.remaining': formatDuration(remaining),
          'cooldown.total': formatDuration(seconds),
        });
      }

      cooldownSeconds = seconds;
      continue;
    }

    if (node.name === 'embed') {
      const name = (args[0] ?? '').trim();

      if (name.length === 0) {
        wrapCurrent = true;
        continue;
      }

      if (name.startsWith('#')) {
        const color = parseColor(name);
        if (color === null) {
          current += node.raw;
          continue;
        }
        wrapCurrent = true;
        wrapColor = color;
        continue;
      }

      const record = getEmbed(meta.guildId, name);
      if (!record || !isRenderable(record.data)) {
        current += node.raw;
        continue;
      }

      const rendered = await renderEmbed(record.data, ctx, captures);
      if (Object.keys(rendered).length === 0) {
        current += node.raw;
        continue;
      }

      currentEmbeds.push(rendered);
      continue;
    }

    if (node.name === 'react') {
      const emoji = (args[0] ?? '').trim();
      if (emoji.length > 0) actions.reactions.push(emoji);
      continue;
    }

    if (node.name === 'reactreply') {
      const emoji = (args[0] ?? '').trim();
      if (emoji.length > 0) actions.replyReactions.push(emoji);
      continue;
    }

    if (node.name === 'deletetrigger') {
      actions.deleteTrigger = true;
      continue;
    }

    if (node.name === 'dm') {
      actions.dm = true;
      continue;
    }

    if (node.name === 'silent') {
      continue;
    }

    if (node.name === 'ephemeral') {
      continue;
    }

    if (node.name === 'error') {
      continue;
    }

    if (node.name === 'send') {
      const channel = resolveChannelArg(ctx, args[0] ?? '');
      if (channel && channel.isTextBased()) {
        actions.sendToChannelId = channel.id;
      }
      continue;
    }

    if (
      node.name === 'giverole' ||
      node.name === 'takerole' ||
      node.name === 'temprole'
    ) {
      const temp = node.name === 'temprole';
      const role = resolveRoleArg(ctx, args[0] ?? '');
      // temprole's duration sits in arg 1, so its target shifts to arg 2
      const targetRaw = (args[temp ? 2 : 1] ?? '').trim();
      const targetId =
        targetRaw.length > 0 ? userIdOf(targetRaw) : (ctx.member?.id ?? null);
      const forSeconds = temp ? clampDuration(parseAmount(args[1] ?? '')) : 0;
      if (!role || !targetId || (temp && forSeconds <= 0)) {
        current += node.raw;
        continue;
      }
      if (targetId !== ctx.member?.id) {
        const member = await resolveMemberArg(ctx, targetId);
        if (!member) {
          return fail(`<@${targetId}> isn't in this server !`, {
            'target.user': `<@${targetId}>`,
            'target.id': targetId,
          });
        }
      }
      actions.roleActions.push({
        add: node.name !== 'takerole',
        roleId: role.id,
        userId: targetId,
        ...(temp ? { forSeconds } : {}),
      });
      continue;
    }

    if (node.name === 'togglerole') {
      const role = resolveRoleArg(ctx, args[0] ?? '');
      if (!role || !ctx.member) {
        current += node.raw;
        continue;
      }

      // reading the CURRENT roles here means two {togglerole} tags on the same
      // role in one template both see the pre-commit state and cancel out,
      // which is the same "one pass, commit at the end" rule the effects follow
      const had = ctx.member.roles.cache.has(role.id);
      actions.roleActions.push({
        add: !had,
        roleId: role.id,
        userId: ctx.member.id,
      });

      const name = node.captureName ?? node.name;
      captures.set(name, had ? 'removed' : 'added');
      captureIndices.set(name, had ? 1 : 0);
      continue;
    }

    if (node.name === 'setnick') {
      const nick = (args[0] ?? '').trim();
      const targetRaw = (args[1] ?? '').trim();
      const targetId =
        targetRaw.length > 0 ? userIdOf(targetRaw) : (ctx.member?.id ?? null);
      if (nick.length === 0 || !targetId) {
        current += node.raw;
        continue;
      }
      actions.nickActions.push({ userId: targetId, nick });
      continue;
    }

    if (node.name === 'delete_reply') {
      const seconds = clampDuration(parseAmount(args[0] ?? ''));
      if (seconds <= 0) {
        current += node.raw;
        continue;
      }
      actions.deleteReplyAfter = seconds;
      continue;
    }

    if (node.name === 'button') {
      const name = (args[0] ?? '').trim();
      if (name.length === 0 || actions.buttons.length >= MAX_BUTTONS) {
        current += node.raw;
        continue;
      }
      actions.buttons.push({ kind: 'responder', name });
      continue;
    }

    if (node.name === 'dropdown') {
      const options = args
        .slice(1)
        .map((option) => option.trim())
        .filter((option) => option.length > 0)
        .slice(0, MAX_DROPDOWN_OPTIONS);

      if (
        options.length === 0 ||
        rowsUsed(actions.buttons.length, actions.dropdowns.length) >= MAX_ROWS
      ) {
        current += node.raw;
        continue;
      }

      actions.dropdowns.push({
        placeholder: (args[0] ?? '').trim().slice(0, 150),
        options,
      });
      continue;
    }

    if (node.name === 'linkbutton') {
      const label = (args[0] ?? '').trim();
      const url = (args[1] ?? '').trim();
      if (
        label.length === 0 ||
        !URLISH.test(url) ||
        actions.buttons.length >= MAX_BUTTONS
      ) {
        current += node.raw;
        continue;
      }
      actions.buttons.push({ kind: 'link', label, url });
      continue;
    }

    const guard = guards.get(node.name);
    if (guard) {
      const targetIndex = GUARD_TARGETS.get(node.name);
      const targetRaw =
        targetIndex === undefined ? '' : (args[targetIndex] ?? '').trim();

      let subject: GuardSubject;
      if (targetRaw.length > 0) {
        const targetId = userIdOf(targetRaw);
        if (!targetId) {
          return fail(`this autoresponder has a broken {${node.name}} tag !`);
        }
        const member = await resolveMemberArg(ctx, targetId);
        if (!member) {
          return fail(`<@${targetId}> isn't in this server !`, {
            'target.user': `<@${targetId}>`,
            'target.id': targetId,
          });
        }
        subject = { member, isSelf: member.id === ctx.member?.id };
      } else {
        if (!ctx.member) {
          return fail(`this autoresponder has a broken {${node.name}} tag !`);
        }
        subject = { member: ctx.member, isSelf: true };
      }

      const result = await guard(meta, args, ctx, subject);
      if (!result.ok) {
        return fail(result.message, result.data);
      }
      continue;
    }

    if (effects.has(node.name)) {
      queuedEffects.push({ name: node.name, args });
      const delta = pendingOf(node.name, meta, args);
      if (delta && delta.userId !== meta.userId) {
        const member = await resolveMemberArg(ctx, delta.userId);
        if (!member) {
          return fail(`<@${delta.userId}> isn't in this server !`, {
            'target.user': `<@${delta.userId}>`,
            'target.id': delta.userId,
          });
        }
      }
      if (delta?.kind === 'balance') {
        pending.addBalance(delta.userId, delta.delta);
      } else if (delta?.kind === 'item') {
        pending.addItem(delta.userId, delta.itemKey, delta.delta);
      }
      continue;
    }

    const placeholder = placeholders.get(node.name);
    if (!placeholder) {
      current += node.raw;
      continue;
    }
    if (prebound.has(node)) continue;

    try {
      const value = await placeholder.resolve(ctx, args);
      if (node.captureName) {
        captures.set(node.captureName, value);
      } else {
        current += value;
      }
    } catch {
      current += node.raw;
    }
  }

  closeSegment(0);

  if (queuedEffects.length > 0 || cooldownSeconds !== null) {
    try {
      db().transaction(() => {
        for (const queued of queuedEffects) {
          effects.get(queued.name)!(meta, queued.args);
        }
        if (cooldownSeconds !== null) {
          setCooldown(meta.guildId, meta.scope, meta.userId, cooldownSeconds);
        }
      })();
    } catch (err) {
      if (err instanceof EffectError) {
        return fail(err.message, err.data);
      }
      throw err;
    }
  }

  return { ok: true, segments, actions };
}
