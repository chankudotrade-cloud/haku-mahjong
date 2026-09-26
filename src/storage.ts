import { normalizeSettings, type GameSettings } from './core/settings';
import { normalizeStats, type Stats } from './core/stats';

const SETTINGS_KEY = 'haku-mahjong:settings';
const STATS_KEY = 'haku-mahjong:stats';

function read(key: string): unknown {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できない環境（プライベートモード等）では何もしない
  }
}

export const loadSettings = (): GameSettings => normalizeSettings(read(SETTINGS_KEY));
export const saveSettings = (s: GameSettings) => write(SETTINGS_KEY, s);
export const loadStats = (): Stats => normalizeStats(read(STATS_KEY));
export const saveStats = (s: Stats) => write(STATS_KEY, s);
