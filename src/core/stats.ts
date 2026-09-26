import type { EndInfo, TurnRecord } from './game';
import { HAND_SIZES, type HandSize } from './settings';

export interface Stats {
  rounds: number;
  wins: number;
  winTurnSum: number;
  riichiCount: number;
  riichiTurnSum: number;
  missedRiichi: number;
  notenRiichi: number;
  furitenRiichi: number;
  /** 最大枚数でないリーチ */
  notBestRiichi: number;
  missedWin: number;
  falseDeclaration: number;
  ryuukyoku: number;
  /** 最善打牌と一致した巡数 / 比較対象があった巡数 */
  bestMatch: number;
  bestEligible: number;
}

export const EMPTY_STATS: Stats = {
  rounds: 0,
  wins: 0,
  winTurnSum: 0,
  riichiCount: 0,
  riichiTurnSum: 0,
  missedRiichi: 0,
  notenRiichi: 0,
  furitenRiichi: 0,
  notBestRiichi: 0,
  missedWin: 0,
  falseDeclaration: 0,
  ryuukyoku: 0,
  bestMatch: 0,
  bestEligible: 0,
};

export function normalizeStats(raw: unknown): Stats {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...EMPTY_STATS };
  for (const key of Object.keys(EMPTY_STATS) as (keyof Stats)[]) {
    const v = o[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[key] = v;
  }
  return out;
}

export function recordRound(s: Stats, end: EndInfo, log: readonly TurnRecord[]): Stats {
  const next = { ...s, rounds: s.rounds + 1 };
  if (end.reason === 'win') {
    next.wins++;
    next.winTurnSum += end.turn;
  }
  if (end.riichiTurn !== null) {
    next.riichiCount++;
    next.riichiTurnSum += end.riichiTurn;
  }
  if (end.reason === 'missedRiichi') next.missedRiichi++;
  if (end.reason === 'notenRiichi') next.notenRiichi++;
  if (end.reason === 'furitenRiichi') next.furitenRiichi++;
  if (end.reason === 'notBestRiichi') next.notBestRiichi++;
  if (end.reason === 'missedWin') next.missedWin++;
  if (end.reason === 'falseDeclaration') next.falseDeclaration++;
  if (end.reason === 'ryuukyoku') next.ryuukyoku++;
  for (const r of log) {
    if (r.analysis?.isBest == null) continue;
    next.bestEligible++;
    if (r.analysis.isBest) next.bestMatch++;
  }
  return next;
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export function summarize(s: Stats) {
  return {
    rounds: s.rounds,
    winRate: ratio(s.wins, s.rounds),
    avgWinTurn: ratio(s.winTurnSum, s.wins),
    avgRiichiTurn: ratio(s.riichiTurnSum, s.riichiCount),
    missedRiichi: s.missedRiichi,
    notenRiichi: s.notenRiichi,
    furitenRiichi: s.furitenRiichi,
    notBestRiichi: s.notBestRiichi,
    missedWin: s.missedWin,
    falseDeclaration: s.falseDeclaration,
    bestRate: ratio(s.bestMatch, s.bestEligible),
  };
}

/** 手牌の枚数ごとの成績 */
export type StatsBySize = Record<HandSize, Stats>;

/**
 * 枚数ごとの成績を復元する。
 * legacy は枚数で分ける前の成績（すべて7枚のもの）で、7枚の成績が無いときだけ引き継ぐ。
 */
export function normalizeStatsBySize(raw: unknown, legacy?: unknown): StatsBySize {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = {} as StatsBySize;
  for (const n of HAND_SIZES) out[n] = normalizeStats(o[String(n)]);
  if (o['7'] == null && legacy != null) out[7] = normalizeStats(legacy);
  return out;
}
