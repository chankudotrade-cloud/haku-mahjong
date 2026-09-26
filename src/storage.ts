import { normalizeSettings, type GameSettings } from './core/settings';
import { normalizeStatsByMode, type StatsByMode } from './core/stats';

const SETTINGS_KEY = 'haku-mahjong:settings';
/** 以前の形式の成績（3色のものとして引き継ぐ）：枚数で分ける前（7枚） / 枚数ごと */
const LEGACY_STATS_KEY = 'haku-mahjong:stats';
const SIZE_STATS_KEY = 'haku-mahjong:stats-by-size';
const STATS_KEY = 'haku-mahjong:stats-by-mode';

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
export const loadStats = (): StatsByMode =>
  normalizeStatsByMode(read(STATS_KEY), read(SIZE_STATS_KEY), read(LEGACY_STATS_KEY));
export const saveStats = (s: StatsByMode) => write(STATS_KEY, s);
