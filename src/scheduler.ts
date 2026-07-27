import type { APIEmbed, Client } from 'discord.js';

import { db } from './db.js';
import { logger } from './logger.js';

interface SendPayload {
  content: string;
  embeds: APIEmbed[] | null;
}
interface DeletePayload {
  messageId: string;
}
interface RemoveRolePayload {
  userId: string;
  roleId: string;
}

type TaskKind = 'send' | 'delete' | 'removerole';

interface PayloadOf {
  send: SendPayload;
  delete: DeletePayload;
  removerole: RemoveRolePayload;
}

interface Task<K extends TaskKind = TaskKind> {
  guildId: string | null;
  channelId: string | null;
  kind: K;
  payload: PayloadOf[K];
  delaySeconds: number;
}

interface TaskRow {
  id: number;
  guild_id: string | null;
  channel_id: string | null;
  kind: string;
  payload: string;
}

const SWEEP_MS = 2000;
const SWEEP_BATCH = 10;

let sweeping: NodeJS.Timeout | null = null;

const handlers: {
  [K in TaskKind]: (
    client: Client,
    row: TaskRow,
    payload: PayloadOf[K],
  ) => Promise<void>;
} = {
  send: async (client, row, payload) => {
    const embeds = payload.embeds ?? [];
    if (payload.content.length === 0 && embeds.length === 0) return;
    if (!row.channel_id) return;

    const channel = await client.channels.fetch(row.channel_id);
    if (channel?.isSendable()) {
      await channel.send({
        content: payload.content.length > 0 ? payload.content : undefined,
        embeds,
        allowedMentions: { parse: ['users', 'roles'] },
      });
    }
  },
  delete: async (client, row, payload) => {
    if (!row.channel_id) return;

    const channel = await client.channels.fetch(row.channel_id);
    if (channel?.isTextBased()) {
      await channel.messages.delete(payload.messageId);
    }
  },
  removerole: async (client, row, payload) => {
    if (!row.guild_id) return;

    const guild = await client.guilds.fetch(row.guild_id);
    await guild.members.removeRole({
      user: payload.userId,
      role: payload.roleId,
    });
  },
};

function schedule<K extends TaskKind>(task: Task<K>): void {
  const now = Date.now();
  db()
    .prepare(
      `INSERT INTO scheduled_tasks (guild_id, kind, channel_id, run_at, created_at, payload)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      task.guildId,
      task.kind,
      task.channelId,
      now + task.delaySeconds * 1000,
      now,
      JSON.stringify(task.payload),
    );
}

export function scheduleMessage(
  channelId: string,
  content: string,
  delaySeconds: number,
  embeds: APIEmbed[] = [],
  guildId: string | null = null,
): void {
  schedule({
    guildId,
    channelId,
    kind: 'send',
    payload: { content, embeds: embeds.length > 0 ? embeds : null },
    delaySeconds,
  });
}

export function scheduleDeletion(
  channelId: string,
  messageId: string,
  delaySeconds: number,
  guildId: string | null = null,
): void {
  schedule({
    guildId,
    channelId,
    kind: 'delete',
    payload: { messageId },
    delaySeconds,
  });
}

export function scheduleRoleRemoval(
  guildId: string,
  userId: string,
  roleId: string,
  delaySeconds: number,
): void {
  // a re-grant refreshes the clock instead of stacking a second removal, so
  // {temprole:muted|1h} fired twice keeps the role for an hour from the LAST
  // grant. json_extract beats a LIKE since payload key order isn't guaranteed
  db()
    .prepare(
      `DELETE FROM scheduled_tasks
       WHERE kind = 'removerole' AND guild_id = ?
         AND json_extract(payload, '$.userId') = ?
         AND json_extract(payload, '$.roleId') = ?`,
    )
    .run(guildId, userId, roleId);

  schedule({
    guildId,
    channelId: null,
    kind: 'removerole',
    payload: { userId, roleId },
    delaySeconds,
  });
}

export function startScheduler(client: Client): void {
  if (sweeping) return;

  const pending = db()
    .prepare('SELECT COUNT(*) AS n FROM scheduled_tasks')
    .get() as { n: number };
  if (pending.n > 0) {
    logger.info(`scheduler: ${pending.n} pending task(s) survived restart`);
  }

  sweeping = setInterval(() => {
    void sweep(client);
  }, SWEEP_MS);
}

export function stopScheduler(): void {
  if (!sweeping) return;
  clearInterval(sweeping);
  sweeping = null;
}

async function sweep(client: Client): Promise<void> {
  const due = db()
    .prepare(
      'SELECT id, guild_id, channel_id, kind, payload FROM scheduled_tasks WHERE run_at <= ? ORDER BY run_at LIMIT ?',
    )
    .all(Date.now(), SWEEP_BATCH) as TaskRow[];

  for (const row of due) {
    db().prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(row.id);

    const handler = handlers[row.kind as TaskKind];
    if (!handler) {
      logger.warn({ kind: row.kind }, 'unknown scheduled task kind');
      continue;
    }

    try {
      await handler(client, row, JSON.parse(row.payload));
    } catch (err) {
      logger.error({ err, kind: row.kind }, 'scheduled task failed');
    }
  }
}
