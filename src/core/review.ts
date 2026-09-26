/** 局後レビュー用の打牌分析（純粋関数） */
import { analyzeTenpai, remainingCount, type RuleOptions } from './hand';
import { HAKU, removeOne, type Kind } from './tiles';

export interface WaitCount {
  kind: Kind;
  remaining: number;
}

export interface DiscardOption {
  discard: Kind;
  waits: WaitCount[];
  /** 待ちの残り枚数の合計 */
  total: number;
  tenpai: boolean;
  furiten: boolean;
  infinite: boolean;
  riichiable: boolean;
}

export interface TurnAnalysis {
  options: DiscardOption[];
  chosen: DiscardOption;
  /** リーチできるテンパイに取れる打牌のうち、待ち枚数の最大値（無ければ null） */
  bestTotal: number | null;
  bestDiscards: Kind[];
  /** 最善打牌だったか（比較対象が無い巡は null） */
  isBest: boolean | null;
  /** リーチできるテンパイに取れたのに、そうでない牌を切った */
  missedTenpai: boolean;
}

/**
 * 8枚から1枚切るときの全候補を評価する。
 * 残り枚数は「その時点の手牌8枚＋両者の河」を見えている牌として数える。
 */
export function analyzeTurn(
  hand8: readonly Kind[],
  discard: Kind,
  riverBefore: readonly Kind[],
  oppRiver: readonly Kind[],
  rules: RuleOptions,
): TurnAnalysis {
  const visible = [...hand8, ...riverBefore, ...oppRiver];
  const kinds = [...new Set(hand8.filter((k) => k !== HAKU))].sort((a, b) => a - b);
  const options = kinds.map((d): DiscardOption => {
    const st = analyzeTenpai(removeOne(hand8, d), [...riverBefore, d], rules);
    const waits = st.waits.map((kind) => ({ kind, remaining: remainingCount(kind, visible) }));
    return {
      discard: d,
      waits,
      total: waits.reduce((s, w) => s + w.remaining, 0),
      tenpai: st.tenpai,
      furiten: st.furiten,
      infinite: st.infinite,
      riichiable: st.riichiable,
    };
  });
  const chosen = options.find((o) => o.discard === discard);
  if (!chosen) throw new Error('discard is not in hand');
  const riichiable = options.filter((o) => o.riichiable);
  const bestTotal = riichiable.length ? Math.max(...riichiable.map((o) => o.total)) : null;
  const bestDiscards = riichiable.filter((o) => o.total === bestTotal).map((o) => o.discard);
  return {
    options,
    chosen,
    bestTotal,
    bestDiscards,
    isBest: bestTotal === null ? null : chosen.riichiable && chosen.total === bestTotal,
    missedTenpai: bestTotal !== null && !chosen.riichiable,
  };
}
