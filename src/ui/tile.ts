import type { Decomposition, Group, WaitInfo } from '../core/hand';
import { CHUN, HAKU, HATSU, isNumberKind, kindName, rankOf, suitOf, type Kind } from '../core/tiles';
import { h } from './dom';

export interface TileOptions {
  size?: 'sm' | 'md' | 'lg';
  sideways?: boolean;
  highlight?: boolean;
  /** 白が何として使われたか（キャプション表示） */
  hakuAs?: Kind | null;
  back?: boolean;
  className?: string;
}

const SUIT_CLASS = ['suit-m', 'suit-p', 'suit-s'];

function kindClass(k: Kind): string {
  if (k === HAKU) return 'haku';
  if (k === HATSU) return 'hatsu';
  if (k === CHUN) return 'chun';
  return SUIT_CLASS[suitOf(k)];
}

/**
 * 牌画像のファイル名（public/pai/）。
 * 牌画像は「麻雀王国」の麻雀素材（https://mj-king.net/sozai/）を使用。
 * 末尾 _1 = 縦向き、_3 = 横向き。
 */
export function tileImageName(kind: Kind, sideways = false): string {
  const v = sideways ? 3 : 1;
  if (kind === HAKU) return `p_no_${v}`;
  if (kind === HATSU) return `p_ji_h_${v}`;
  if (kind === CHUN) return `p_ji_c_${v}`;
  if (!isNumberKind(kind)) throw new Error(`unknown kind ${kind}`);
  return `p_${'mps'[suitOf(kind)]}s${rankOf(kind)}_${v}`;
}

const imageUrl = (name: string) => `${import.meta.env.BASE_URL}pai/${name}.gif`;

/** 牌1枚（画像） */
export function tileEl(kind: Kind, opts: TileOptions = {}): HTMLElement {
  const classes = ['tile', `tile-${opts.size ?? 'md'}`];
  if (opts.back) classes.push('back');
  else classes.push(kindClass(kind));
  if (opts.sideways) classes.push('sideways');
  if (opts.highlight) classes.push('highlight');
  if (opts.className) classes.push(opts.className);

  const name = opts.back ? 'p_bk_1' : tileImageName(kind, opts.sideways);
  const alt = opts.back ? '' : kindName(kind);
  const el = h(
    'span',
    { class: classes.join(' '), title: alt, 'data-kind': opts.back ? null : kind },
    h('img', { src: imageUrl(name), alt, draggable: 'false' }),
  );
  if (opts.hakuAs == null) return el;
  return h('span', { class: 'tile-wrap' }, el, h('span', { class: 'tile-cap' }, `=${kindName(opts.hakuAs)}`));
}

export function tileRow(kinds: readonly Kind[], opts: TileOptions = {}, highlight?: (k: Kind, i: number) => boolean) {
  return h(
    'span',
    { class: 'tile-row' },
    kinds.map((k, i) => tileEl(k, { ...opts, highlight: highlight ? highlight(k, i) : opts.highlight })),
  );
}

function groupEl(g: Group, size: TileOptions['size']): HTMLElement {
  return h(
    'span',
    { class: `group group-${g.type}` },
    g.tiles.map((t) => (t.haku ? tileEl(HAKU, { size, hakuAs: t.kind }) : tileEl(t.kind, { size }))),
  );
}

/** アガリ形の分解（面子2つ＋雀頭。白は「=○○」で何として使ったかを示す） */
export function decompEl(d: Decomposition, size: TileOptions['size'] = 'sm'): HTMLElement {
  return h(
    'span',
    { class: 'decomp' },
    d.melds.map((m) => groupEl(m, size)),
    groupEl(d.pair, size),
    d.hakuAs != null ? h('span', { class: 'decomp-note' }, `白＝${kindName(d.hakuAs)}`) : null,
  );
}

export interface WaitsOptions {
  highlight?: Kind[];
  title?: string;
}

/** 待ちの紹介：待ち牌・各牌のアガリ形・白の役割・残り枚数 */
export function waitsSection(waits: readonly WaitInfo[], opts: WaitsOptions = {}): HTMLElement {
  const total = waits.reduce((s, w) => s + w.remaining, 0);
  const hl = new Set(opts.highlight ?? []);
  return h(
    'section',
    { class: 'waits' },
    h(
      'h3',
      {},
      opts.title ?? '待ち',
      h('span', { class: 'waits-sum' }, waits.length ? `${waits.length}種 ${total}枚` : 'なし'),
    ),
    h('div', { class: 'waits-kinds' }, waits.map((w) => tileEl(w.kind, { size: 'sm', highlight: hl.has(w.kind) }))),
    h(
      'ul',
      { class: 'waits-list' },
      waits.map((w) =>
        h(
          'li',
          { class: hl.has(w.kind) ? 'wait-row highlight-row' : 'wait-row', 'data-wait-kind': w.kind },
          h('div', { class: 'wait-head' }, tileEl(w.kind, { size: 'md', highlight: hl.has(w.kind) }), h('span', { class: 'wait-remain' }, `残り${w.remaining}枚`)),
          h('div', { class: 'wait-decomps' }, w.decomps.map((d) => decompEl(d))),
        ),
      ),
    ),
  );
}
