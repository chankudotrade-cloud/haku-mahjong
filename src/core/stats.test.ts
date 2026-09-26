import { describe, expect, it } from 'vitest';
import { ALL_MODE_KEYS, EMPTY_STATS, normalizeStatsByMode } from './stats';

describe('枚数×色数ごとの成績', () => {
  it('9通り（7・10・13枚 × 1・2・3色）', () => {
    expect(ALL_MODE_KEYS).toEqual(['7-1', '7-2', '7-3', '10-1', '10-2', '10-3', '13-1', '13-2', '13-3']);
  });

  it('枚数で分ける前の成績は 7枚・3色 の分として引き継ぐ', () => {
    const s = normalizeStatsByMode(null, null, { ...EMPTY_STATS, rounds: 5, wins: 2 });
    expect(s['7-3'].rounds).toBe(5);
    expect(s['7-3'].wins).toBe(2);
    expect(s['7-1']).toEqual(EMPTY_STATS);
    expect(s['13-3']).toEqual(EMPTY_STATS);
  });

  it('枚数ごとの成績は、その枚数の3色の分として引き継ぐ', () => {
    const s = normalizeStatsByMode(null, { '10': { ...EMPTY_STATS, rounds: 4 }, '13': { ...EMPTY_STATS, rounds: 2 } });
    expect(s['10-3'].rounds).toBe(4);
    expect(s['13-3'].rounds).toBe(2);
    expect(s['10-2'].rounds).toBe(0);
  });

  it('新しい形式に値があれば古い成績は使わない', () => {
    const s = normalizeStatsByMode({ '7-3': { ...EMPTY_STATS, rounds: 1 } }, { '7': { rounds: 50 } }, { rounds: 99 });
    expect(s['7-3'].rounds).toBe(1);
  });
});
