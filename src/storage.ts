import { normalizeSettings, type GameSettings } from './core/settings';
import { normalizeStatsBySize, type StatsBySize } from './core/stats';

const SETTINGS_KEY = 'haku-mahjong:settings';
/** 枚数で分ける前の成績（7枚のものとして引き継ぐ） */
const LEGACY_STATS_KEY = 'haku-mahjong:stats';
const STATS_KEY = 'haku-mahjong:stats-by-size';

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
export const loadStats = (): StatsBySize => normalizeStatsBySize(read(STATS_KEY), read(LEGACY_STATS_KEY));
export const saveStats = (s: StatsBySize) => write(STATS_KEY, s);
