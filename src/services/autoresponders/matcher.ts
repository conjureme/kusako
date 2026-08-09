import type { MatchMode } from './store.js';

export function matchesTrigger(
  content: string,
  trigger: string,
  mode: MatchMode,
): boolean {
  const trig = trigger.toLowerCase().trim();
  if (trig.length === 0) return false;

  const msg = content.toLowerCase();

  if (mode === 'exact') {
    return msg.trim() === trig;
  }

  if (mode === 'includes') {
    return msg.includes(trig);
  }

  if (mode === 'startswith') {
    const trimmed = msg.trimStart();
    if (!trimmed.startsWith(trig)) return false;
    const after = trimmed[trig.length];
    return after === undefined || /\s/.test(after);
  }

  const trimmed = msg.trimEnd();
  if (!trimmed.endsWith(trig)) return false;
  const before = trimmed[trimmed.length - trig.length - 1];
  return before === undefined || /\s/.test(before);
}

export function extractArgs(
  content: string,
  trigger: string,
  mode: MatchMode,
): string[] {
  const trig = trigger.toLowerCase().trim();
  if (mode === 'exact' || trig.length === 0) return [];

  let remainder: string;
  if (mode === 'startswith') {
    remainder = content.trimStart().slice(trig.length);
  } else if (mode === 'endswith') {
    const trimmed = content.trimEnd();
    remainder = trimmed.slice(0, trimmed.length - trig.length);
  } else {
    const at = content.toLowerCase().indexOf(trig);
    remainder =
      at === -1
        ? content
        : `${content.slice(0, at)} ${content.slice(at + trig.length)}`;
  }

  return remainder.split(/\s+/).filter((word) => word.length > 0);
}
