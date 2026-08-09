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
