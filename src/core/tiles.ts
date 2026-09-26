/**
 * 牌の種類（Kind）は整数で表す。
 *   0-8   萬子 1-9
 *   9-17  筒子 1-9
 *   18-26 索子 1-9
 *   27    發
 *   28    中
 *   29    白（オールマイティ。山には入れない）
 * 数値の昇順がそのまま理牌の順（萬→筒→索→發→中→白）になる。
 */
export type Kind = number;

export const HATSU: Kind = 27;
export const CHUN: Kind = 28;
export const HAKU: Kind = 29;
/** 牌の種類数（白を除く）。アガリ形の分解で使う */
export const NUM_KINDS = 29;
/** 山に入る牌の種類数（数牌27種のみ。字牌はツモらないルール） */
export const WALL_KINDS = 27;

export interface Tile {
  id: number;
  kind: Kind;
}

export type Rng = () => number;

export const isNumberKind = (k: Kind): boolean => k >= 0 && k < 27;
export const suitOf = (k: Kind): number => Math.floor(k / 9);
export const rankOf = (k: Kind): number => (k % 9) + 1;

const SUIT_NAMES = ['萬', '筒', '索'];
const SUIT_LETTERS = ['m', 'p', 's'];

export function kindName(k: Kind): string {
  if (k === HAKU) return '白';
  if (k === HATSU) return '發';
  if (k === CHUN) return '中';
  return `${rankOf(k)}${SUIT_NAMES[suitOf(k)]}`;
}

/** 数牌のスート名（萬/筒/索）。字牌は空文字 */
export function suitName(k: Kind): string {
  return isNumberKind(k) ? SUIT_NAMES[suitOf(k)] : '';
}

/**
 * "123m45p9s66z5z" 形式の文字列を Kind 配列にする（テスト・デバッグ用）。
 * 字牌は 5z=白, 6z=發, 7z=中。
 */
export function parseKinds(s: string): Kind[] {
  const out: Kind[] = [];
  let digits: number[] = [];
  for (const ch of s.replace(/\s+/g, '')) {
    if (ch >= '0' && ch <= '9') {
      digits.push(Number(ch));
      continue;
    }
    const suit = SUIT_LETTERS.indexOf(ch);
    for (const d of digits) {
      if (suit >= 0) {
        if (d < 1 || d > 9) throw new Error(`bad tile ${d}${ch}`);
        out.push(suit * 9 + d - 1);
      } else if (ch === 'z') {
        if (d === 5) out.push(HAKU);
        else if (d === 6) out.push(HATSU);
        else if (d === 7) out.push(CHUN);
        else throw new Error(`bad honor ${d}z`);
      } else {
        throw new Error(`bad suit ${ch}`);
      }
    }
    digits = [];
  }
  if (digits.length) throw new Error('trailing digits');
  return out;
}

export function countKinds(kinds: readonly Kind[]): number[] {
  const c = new Array<number>(HAKU + 1).fill(0);
  for (const k of kinds) c[k]++;
  return c;
}

export function sortTiles(tiles: readonly Tile[]): Tile[] {
  return [...tiles].sort((a, b) => a.kind - b.kind || a.id - b.id);
}

/** 配列から指定の牌を1枚だけ取り除いたコピー */
export function removeOne(kinds: readonly Kind[], k: Kind): Kind[] {
  const i = kinds.indexOf(k);
  if (i < 0) throw new Error(`${kindName(k)} is not in hand`);
  return [...kinds.slice(0, i), ...kinds.slice(i + 1)];
}

/** 山の中身（数牌108枚。發・中・白は入れない） */
export function buildWallKinds(): Kind[] {
  const out: Kind[] = [];
  for (let k = 0; k < WALL_KINDS; k++) for (let n = 0; n < 4; n++) out.push(k);
  return out;
}

export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function mulberry32(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
