import { describe, expect, it } from 'vitest';
import { EMPTY_STATS, normalizeStatsBySize } from './stats';

describe('枚数ごとの成績', () => {
  it('枚数で分ける前の成績は7枚の分として引き継ぐ', () => {
    const s = normalizeStatsBySize(null, { ...EMPTY_STATS, rounds: 5, wins: 2 });
    expect(s[7].rounds).toBe(5);
    expect(s[7].wins).toBe(2);
    expect(s[10]).toEqual(EMPTY_STATS);
    expect(s[13]).toEqual(EMPTY_STATS);
  });

  it('7枚の成績が保存済みなら古い成績は使わない', () => {
    const s = normalizeStatsBySize({ '7': { ...EMPTY_STATS, rounds: 1 } }, { ...EMPTY_STATS, rounds: 99 });
    expect(s[7].rounds).toBe(1);
  });
});
