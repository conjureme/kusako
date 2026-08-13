import type { SlashCommand } from '../client.js';

import { ping } from './ping.js';
import { autoresponders } from './autoresponders.js';
import { balance } from './balance.js';
import { modifybalance } from './modifybalance.js';
import { settings } from './settings.js';
import { items } from './items.js';
import { inventory } from './inventory.js';
import { modifyinventory } from './modifyinventory.js';
import { embeds } from './embeds.js';
import { events } from './events.js';
import { shop } from './shop.js';
import { pat } from './pat.js';
import { levels } from './levels.js';
import { level } from './level.js';
import { modifylevel } from './modifylevel.js';
import { send } from './send.js';
import { buttonresponders } from './buttonresponders.js';
import { give } from './give.js';
import { modifyrolebalance } from './modifyrolebalance.js';
import { schedule } from './schedule.js';

export const commands: SlashCommand[] = [
  ping,
  autoresponders,
  balance,
  modifybalance,
  settings,
  items,
  inventory,
  modifyinventory,
  embeds,
  events,
  shop,
  pat,
  levels,
  level,
  modifylevel,
  send,
  buttonresponders,
  give,
  modifyrolebalance,
  schedule,
];
