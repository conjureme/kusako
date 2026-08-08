import { listAutoresponders } from './autoresponder/store.js';
import { getEventReply } from './events/store.js';
import { EVENTS } from './events/registry.js';
import { listLevelReplies } from './levels.js';
import { listButtonResponders } from './buttonResponders.js';
import { listItems } from './items.js';

export interface StoredTemplate {
  label: string;
  response: string;
}

export function listAllTemplates(guildId: string): StoredTemplate[] {
  const out: StoredTemplate[] = [];

  for (const responder of listAutoresponders(guildId)) {
    out.push({ label: responder.trigger, response: responder.response });
  }

  for (const event of EVENTS) {
    const reply = getEventReply(guildId, event.id);
    if (reply?.response) {
      out.push({ label: `event:${event.id}`, response: reply.response });
    }
  }

  for (const reply of listLevelReplies(guildId)) {
    out.push({ label: `level ${reply.level}`, response: reply.response });
  }

  for (const button of listButtonResponders(guildId)) {
    out.push({
      label: `${button.name} (button)`,
      response: button.response,
    });
  }

  for (const item of listItems(guildId)) {
    if (item.useReply) {
      out.push({ label: `${item.name} (item)`, response: item.useReply });
    }
  }

  return out;
}
