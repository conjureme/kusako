import type { Client } from 'discord.js';

import {
  advanceSchedule,
  computeNextRun,
  dueSchedules,
  markScheduleMissed,
  removeSchedule,
  GRACE_MS,
  type ScheduledTemplate,
} from './store.js';
import { getGuildTimezone } from '../timezone.js';
import { scheduleScope } from '../cooldowns.js';
import { parse } from '../../dsl/parser.js';
import { evaluate } from '../../dsl/evaluate.js';
import { deliver } from '../../dsl/deliver.js';
import { logger } from '../../logger.js';

const SWEEP_MS = 15_000;
const SWEEP_BATCH = 10;

let sweeping: NodeJS.Timeout | null = null;

export async function fireSchedule(
  client: Client,
  schedule: ScheduledTemplate,
): Promise<void> {
  const channel = await client.channels
    .fetch(schedule.channelId)
    .catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    logger.warn(
      { guildId: schedule.guildId, id: schedule.id },
      'scheduled post has no reachable channel',
    );
    return;
  }

  const result = await evaluate(
    parse(schedule.response),
    { guild: channel.guild, channel },
    scheduleScope(schedule.id),
  );

  if (!result.ok) {
    logger.warn(
      { guildId: schedule.guildId, id: schedule.id, reason: result.message },
      'scheduled post was blocked',
    );
    return;
  }

  await deliver(result.segments, result.actions, { channel });
}

async function sweep(client: Client): Promise<void> {
  const now = Date.now();
  const due = dueSchedules(now, SWEEP_BATCH);
  const backlogged = due.length >= SWEEP_BATCH;

  for (const schedule of due) {
    const zone = getGuildTimezone(schedule.guildId);
    const next = computeNextRun(schedule, now, zone);
    const lateBy = now - schedule.nextRun;

    if (lateBy > GRACE_MS) {
      if (next === null) {
        markScheduleMissed(schedule.guildId, schedule.id);
      } else {
        advanceSchedule(schedule.guildId, schedule.id, next);
      }

      logger.warn(
        {
          guildId: schedule.guildId,
          id: schedule.id,
          lateBy,
          cause: backlogged ? 'backlog' : 'offline',
          oneTime: next === null,
        },
        'scheduled post skipped, too late to fire',
      );
      continue;
    }

    if (next === null) {
      removeSchedule(schedule.guildId, schedule.id);
    } else {
      advanceSchedule(schedule.guildId, schedule.id, next);
    }

    try {
      await fireSchedule(client, schedule);
    } catch (err) {
      logger.error(
        { err, guildId: schedule.guildId, id: schedule.id },
        'scheduled post failed',
      );
    }
  }
}

export function startScheduleSweep(client: Client): void {
  if (sweeping) return;

  sweeping = setInterval(() => {
    void sweep(client);
  }, SWEEP_MS);
}

export function stopScheduleSweep(): void {
  if (!sweeping) return;
  clearInterval(sweeping);
  sweeping = null;
}
