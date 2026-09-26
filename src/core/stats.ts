import type { EndInfo, TurnRecord } from './game';
import { HAND_SIZES, SUIT_COUNTS, modeKey } from './settings';

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

/** 手牌の枚数×色数ごとの成績（キーは modeKey：例 "13-2"） */
export type StatsByMode = Record<string, Stats>;

export const ALL_MODE_KEYS = HAND_SIZES.flatMap((handSize) => SUIT_COUNTS.map((suits) => modeKey({ handSize, suits })));

/**
 * 枚数×色数ごとの成績を復元する。以前の形式は3色の分として引き継ぐ（新しい形式に値があればそちらを使う）。
 *   bySize：枚数ごとの成績 {"7": Stats, ...}
 *   legacy：枚数で分ける前の成績（7枚）
 */
export function normalizeStatsByMode(raw: unknown, bySize?: unknown, legacy?: unknown): StatsByMode {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const sizes = (bySize && typeof bySize === 'object' ? bySize : {}) as Record<string, unknown>;
  const out: StatsByMode = {};
  for (const key of ALL_MODE_KEYS) out[key] = normalizeStats(o[key]);
  for (const n of HAND_SIZES) {
    const key = modeKey({ handSize: n, suits: 3 });
    if (o[key] != null) continue;
    const old = sizes[String(n)] ?? (n === 7 ? legacy : undefined);
    if (old != null) out[key] = normalizeStats(old);
  }
  return out;
}
