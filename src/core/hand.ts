/**
 * アガリ判定・待ち計算（純粋関数）。
 * アガリ形は 8枚 = 2面子 + 1雀頭。白は任意の1枚として扱う。
 */
import { HAKU, NUM_KINDS, WALL_KINDS, countKinds, isNumberKind, rankOf, type Kind } from './tiles';

export interface RuleOptions {
  /** 白を「同じ牌の5枚目」として扱えるか */
  allowHakuFifth: boolean;
}

export const DEFAULT_RULES: RuleOptions = { allowHakuFifth: true };

export interface GroupTile {
  kind: Kind;
  /** true なら白がこの牌として使われている */
  haku: boolean;
}

export interface Group {
  type: 'pair' | 'shuntsu' | 'koutsu';
  tiles: GroupTile[];
}

export interface Decomposition {
  pair: Group;
  melds: Group[];
  /** 白が何として使われたか（白を含まない形なら null） */
  hakuAs: Kind | null;
}

export interface WaitInfo {
  kind: Kind;
  /** 見えていない枚数 */
  remaining: number;
  /** その牌でアガった場合のアガリ形 */
  decomps: Decomposition[];
}

export interface TenpaiStatus {
  waits: Kind[];
  tenpai: boolean;
  /** 無限単騎（2面子＋白） */
  infinite: boolean;
  furiten: boolean;
  /** フリテンの原因になった河の牌（待ちに含まれる河の牌） */
  furitenTiles: Kind[];
  /** リーチできるテンパイ（ノーテン・フリテン・無限単騎のいずれでもない） */
  riichiable: boolean;
}

const R = (kind: Kind): GroupTile => ({ kind, haku: false });
const H = (kind: Kind): GroupTile => ({ kind, haku: true });

type CanBe = (k: Kind) => boolean;

/**
 * counts の実牌をすべて面子に分解する（白は hakuLeft 枚まで使える）。
 * 見つかった分解ごとに sink を呼ぶ。
 */
function searchMelds(
  counts: number[],
  hakuLeft: number,
  canBe: CanBe,
  acc: Group[],
  sink: (melds: Group[]) => void,
): void {
  const i = counts.findIndex((c) => c > 0);
  if (i === -1) {
    if (hakuLeft === 0) sink(acc);
    return;
  }
  const tryGroup = (type: Group['type'], tiles: GroupTile[]) => {
    for (const t of tiles) if (!t.haku) counts[t.kind]--;
    const used = tiles.filter((t) => t.haku).length;
    acc.push({ type, tiles });
    searchMelds(counts, hakuLeft - used, canBe, acc, sink);
    acc.pop();
    for (const t of tiles) if (!t.haku) counts[t.kind]++;
  };

  // i は残っている実牌のうち最小の種類。i を含む面子をすべて試す
  if (counts[i] >= 3) tryGroup('koutsu', [R(i), R(i), R(i)]);
  if (hakuLeft > 0 && counts[i] >= 2 && canBe(i)) tryGroup('koutsu', [R(i), R(i), H(i)]);
  if (!isNumberKind(i)) return; // 字牌は順子にならない
  const r = rankOf(i);
  if (r <= 7) {
    if (counts[i + 1] > 0 && counts[i + 2] > 0) tryGroup('shuntsu', [R(i), R(i + 1), R(i + 2)]);
    if (hakuLeft > 0 && counts[i + 2] > 0 && canBe(i + 1)) tryGroup('shuntsu', [R(i), H(i + 1), R(i + 2)]);
    if (hakuLeft > 0 && counts[i + 1] > 0 && canBe(i + 2)) tryGroup('shuntsu', [R(i), R(i + 1), H(i + 2)]);
  }
  // i より小さい実牌は残っていないので、下側を白で補う形は i-1 だけ
  if (r >= 2 && r <= 8 && hakuLeft > 0 && counts[i + 1] > 0 && canBe(i - 1)) {
    tryGroup('shuntsu', [H(i - 1), R(i), R(i + 1)]);
  }
}

const groupKey = (g: Group) => g.tiles.map((t) => `${t.kind}${t.haku ? '*' : ''}`).join(',');

function findHakuAs(pair: Group, melds: Group[]): Kind | null {
  for (const g of [pair, ...melds]) for (const t of g.tiles) if (t.haku) return t.kind;
  return null;
}

/** 8枚のアガリ形の分解をすべて返す（アガリでなければ空配列） */
export function decompose(kinds: readonly Kind[], rules: RuleOptions = DEFAULT_RULES): Decomposition[] {
  if (kinds.length !== 8) return [];
  const counts = countKinds(kinds);
  const haku = counts[HAKU];
  if (haku > 1) throw new Error('白は1枚まで');
  counts[HAKU] = 0;
  const original = counts.slice();
  const canBe: CanBe = (k) => rules.allowHakuFifth || original[k] < 4;

  const out = new Map<string, Decomposition>();
  const add = (pair: Group, melds: Group[]) => {
    const ms = melds.map((m) => ({ type: m.type, tiles: [...m.tiles] }));
    const key = `${groupKey(pair)}|${ms.map(groupKey).sort().join('|')}`;
    if (!out.has(key)) out.set(key, { pair, melds: ms, hakuAs: findHakuAs(pair, ms) });
  };

  for (let p = 0; p < NUM_KINDS; p++) {
    if (counts[p] >= 2) {
      counts[p] -= 2;
      const pair: Group = { type: 'pair', tiles: [R(p), R(p)] };
      searchMelds(counts, haku, canBe, [], (ms) => add(pair, ms));
      counts[p] += 2;
    }
    if (haku === 1 && counts[p] >= 1 && canBe(p)) {
      counts[p] -= 1;
      const pair: Group = { type: 'pair', tiles: [R(p), H(p)] };
      searchMelds(counts, 0, canBe, [], (ms) => add(pair, ms));
      counts[p] += 1;
    }
  }
  return [...out.values()];
}

export function isAgari(kinds: readonly Kind[], rules: RuleOptions = DEFAULT_RULES): boolean {
  return decompose(kinds, rules).length > 0;
}

/** 7枚の待ち牌（山に入る数牌だけが待ちになる。手の内に4枚ある牌も待ちにしない） */
export function waitKinds(hand7: readonly Kind[], rules: RuleOptions = DEFAULT_RULES): Kind[] {
  if (hand7.length !== 7) return [];
  const c = countKinds(hand7);
  const out: Kind[] = [];
  for (let x = 0; x < WALL_KINDS; x++) {
    if (c[x] >= 4) continue;
    if (isAgari([...hand7, x], rules)) out.push(x);
  }
  return out;
}

/** 無限単騎（白単騎）：白を除いた6枚が2面子になっている形 */
export function isInfiniteTanki(hand7: readonly Kind[]): boolean {
  if (hand7.length !== 7 || !hand7.includes(HAKU)) return false;
  const counts = countKinds(hand7);
  counts[HAKU] = 0;
  let found = false;
  searchMelds(counts, 0, () => false, [], () => {
    found = true;
  });
  return found;
}

export function analyzeTenpai(
  hand7: readonly Kind[],
  river: readonly Kind[],
  rules: RuleOptions = DEFAULT_RULES,
): TenpaiStatus {
  const waits = waitKinds(hand7, rules);
  const tenpai = waits.length > 0;
  const infinite = tenpai && isInfiniteTanki(hand7);
  const furitenTiles = waits.filter((w) => river.includes(w));
  const furiten = furitenTiles.length > 0;
  return { waits, tenpai, infinite, furiten, furitenTiles, riichiable: tenpai && !furiten && !infinite };
}

export function remainingCount(kind: Kind, visible: readonly Kind[]): number {
  return Math.max(0, 4 - visible.filter((k) => k === kind).length);
}

/** 待ち牌ごとの残り枚数とアガリ形 */
export function waitDetails(
  hand7: readonly Kind[],
  visible: readonly Kind[],
  rules: RuleOptions = DEFAULT_RULES,
): WaitInfo[] {
  return waitKinds(hand7, rules).map((kind) => ({
    kind,
    remaining: remainingCount(kind, visible),
    decomps: decompose([...hand7, kind], rules),
  }));
}
