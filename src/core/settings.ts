import { HAKU, type Kind } from './tiles';

export const DISCARD_SECONDS = { min: 5, max: 60, default: 15 } as const;
export const DECISION_SECONDS = { min: 1, max: 10, default: 3 } as const;
export const MAX_TURNS = { min: 3, max: 30, default: 18 } as const;
/** 配牌直後の1巡目の持ち時間 */
export const FIRST_TURN_SECONDS = 15;
/** リーチ後、相手の捨て牌が自分の待ち牌になる確率 */
export const RON_CHANCE = 0.25;
/** リーチ後、自分のツモが待ち牌になる確率 */
export const TSUMO_CHANCE = 0.25;

/** 選べる手牌の枚数（白を含む配牌の枚数） */
export const HAND_SIZES = [7, 10, 13] as const;
export type HandSize = (typeof HAND_SIZES)[number];

/** 選べる牌の色数。3色=萬筒索 / 2色=筒索（萬子抜き） / 1色=筒子のみ */
export const SUIT_COUNTS = [1, 2, 3] as const;
export type SuitCount = (typeof SUIT_COUNTS)[number];

/** 色数ごとに山へ入る牌の種類（萬子0-8・筒子9-17・索子18-26） */
export function wallKindsOf(suits: SuitCount): Kind[] {
  const from = suits === 3 ? 0 : 9;
  const to = suits === 1 ? 18 : 27;
  return Array.from({ length: to - from }, (_, i) => from + i);
}

export interface GameSettings {
  /** 手牌の枚数（7・10・13）。13枚のときはチートイツもアガリ */
  handSize: HandSize;
  /** 牌の色数（1・2・3） */
  suits: SuitCount;
  /** リーチ前の打牌秒数 */
  discardSeconds: number;
  /** リーチ後の判断秒数 */
  decisionSeconds: number;
  /** 各自この巡数で流局 */
  maxTurns: number;
  /** 白を同じ牌の5枚目として扱えるか */
  allowHakuFifth: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  handSize: 7,
  suits: 3,
  discardSeconds: DISCARD_SECONDS.default,
  decisionSeconds: DECISION_SECONDS.default,
  maxTurns: MAX_TURNS.default,
  allowHakuFifth: true,
};

export function clampInt(v: unknown, min: number, max: number, def: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export const clampDiscardSeconds = (v: unknown) =>
  clampInt(v, DISCARD_SECONDS.min, DISCARD_SECONDS.max, DISCARD_SECONDS.default);
export const clampDecisionSeconds = (v: unknown) =>
  clampInt(v, DECISION_SECONDS.min, DECISION_SECONDS.max, DECISION_SECONDS.default);
export const clampMaxTurns = (v: unknown) => clampInt(v, MAX_TURNS.min, MAX_TURNS.max, MAX_TURNS.default);

export function normalizeSettings(raw: unknown): GameSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    handSize: normalizeHandSize(o.handSize),
    suits: (SUIT_COUNTS as readonly unknown[]).includes(o.suits) ? (o.suits as SuitCount) : DEFAULT_SETTINGS.suits,
    discardSeconds: clampDiscardSeconds(o.discardSeconds),
    decisionSeconds: clampDecisionSeconds(o.decisionSeconds),
    maxTurns: clampMaxTurns(o.maxTurns),
    // 画面からは変更できない（常に可）。以前保存された値は使わない
    allowHakuFifth: DEFAULT_SETTINGS.allowHakuFifth,
  };
}

export function normalizeHandSize(v: unknown): HandSize {
  return (HAND_SIZES as readonly unknown[]).includes(v) ? (v as HandSize) : DEFAULT_SETTINGS.handSize;
}

/** 設定からアガリ判定のルールを作る（チートイツは13枚のときだけ。待ちは山にある種類だけ） */
export function rulesOf(s: GameSettings): { allowHakuFifth: boolean; chiitoi: boolean; drawable: Kind[] } {
  return { allowHakuFifth: s.allowHakuFifth, chiitoi: s.handSize === 13, drawable: wallKindsOf(s.suits) };
}

/** 成績を分ける単位（手牌の枚数×色数） */
export const modeKey = (s: Pick<GameSettings, 'handSize' | 'suits'>) => `${s.handSize}-${s.suits}`;

/** 1巡目は15秒（設定値が15秒より長ければ設定値） */
export function firstTurnSeconds(discardSeconds: number): number {
  return Math.max(FIRST_TURN_SECONDS, discardSeconds);
}

export function discardTimeLimit(turn: number, discardSeconds: number): number {
  return turn === 1 ? firstTurnSeconds(discardSeconds) : discardSeconds;
}

/** 時間切れで切る牌の位置：右端。右端が白なら右から2番目 */
export function autoDiscardIndex(hand: readonly Kind[]): number {
  const last = hand.length - 1;
  return hand[last] === HAKU ? last - 1 : last;
}
