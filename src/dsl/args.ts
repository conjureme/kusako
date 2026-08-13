export const YEAR_SECONDS = 31_536_000;

export const DYNAMIC_ARG = /^\[(\$\d+\+?|\w+)\]$/;

export function interpolateArgs(
  args: string[],
  captures: Map<string, string>,
): string[] {
  return args.map((arg) =>
    arg.replace(
      /\[(\$\d+\+?|\w+)\]/g,
      (raw, name: string) => captures.get(name.toLowerCase()) ?? raw,
    ),
  );
}

export function parseAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;

  const n = Number(trimmed);
  return Number.isSafeInteger(n) ? n : null;
}

const DURATION_UNITS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86_400,
  w: 604_800,
};

export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, '');
  if (text.length === 0) return null;

  if (/^\d+$/.test(text)) {
    const bare = Number(text);
    return bare > 0 && bare < 1_000_000_000 ? bare : null;
  }

  const parts = [...text.matchAll(/(\d+)([smhdw])/g)];
  if (parts.length === 0) return null;

  const consumed = parts.reduce((sum, part) => sum + part[0].length, 0);
  if (consumed !== text.length) return null;

  let total = 0;
  for (const part of parts) {
    total += Number(part[1]) * (DURATION_UNITS[part[2] ?? ''] ?? 0);
  }

  return total > 0 ? total : null;
}

export function clampDuration(seconds: number | null): number {
  if (seconds === null) return 0;
  return Math.min(Math.max(seconds, 0), YEAR_SECONDS);
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (sec > 0 || parts.length === 0) parts.push(`${sec}s`);

  return parts.join(' ');
}
