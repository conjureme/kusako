import { getGuildSetting, setGuildSetting } from './settings.js';
import { getCooldownRemaining, setCooldown, gameScope } from './cooldowns.js';

export function getGameCooldownRemaining(
  guildId: string,
  game: string,
  userId: string,
): number {
  return getCooldownRemaining(guildId, gameScope(game), userId);
}

export function setGameCooldown(
  guildId: string,
  game: string,
  userId: string,
  seconds: number,
): void {
  setCooldown(guildId, gameScope(game), userId, seconds);
}

export function isGameEnabled(guildId: string, game: string): boolean {
  return getGuildSetting(guildId, `${game}.enabled`) !== '0';
}

export function setGameEnabled(
  guildId: string,
  game: string,
  enabled: boolean,
): void {
  setGuildSetting(guildId, `${game}.enabled`, enabled ? '1' : '0');
}

export interface PatSettings {
  minReward: number;
  maxReward: number;
  cooldownSeconds: number;
}

const DEFAULT_PAT: PatSettings = {
  minReward: 30,
  maxReward: 60,
  cooldownSeconds: 3600,
};

function settingInt(guildId: string, key: string): number | null {
  const raw = getGuildSetting(guildId, key);
  if (raw === null) return null;

  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function getPatSettings(guildId: string): PatSettings {
  return {
    minReward: settingInt(guildId, 'pat.min') ?? DEFAULT_PAT.minReward,
    maxReward: settingInt(guildId, 'pat.max') ?? DEFAULT_PAT.maxReward,
    cooldownSeconds:
      settingInt(guildId, 'pat.cooldown') ?? DEFAULT_PAT.cooldownSeconds,
  };
}

export function setPatSettings(
  guildId: string,
  settings: Partial<PatSettings>,
): void {
  if (settings.minReward !== undefined) {
    setGuildSetting(guildId, 'pat.min', String(settings.minReward));
  }
  if (settings.maxReward !== undefined) {
    setGuildSetting(guildId, 'pat.max', String(settings.maxReward));
  }
  if (settings.cooldownSeconds !== undefined) {
    setGuildSetting(guildId, 'pat.cooldown', String(settings.cooldownSeconds));
  }
}
