import type { EndInfo, Game } from '../core/game';
import type { WaitInfo } from '../core/hand';
import { kindName, removeOne, type Kind } from '../core/tiles';
import { h } from './dom';
import { tileEl, tileRow } from './tile';

export interface EndHandlers {
  onReview(): void;
  onNext(): void;
  onTitle(): void;
}

const byLabel = (by?: 'tsumo' | 'ron') => (by === 'tsumo' ? 'ツモ' : 'ロン');

export function endTitle(end: EndInfo): string {
  switch (end.reason) {
    case 'win':
      return 'アガリ！';
    case 'missedRiichi':
      return 'テンパイしていました！';
    case 'notenRiichi':
      return 'テンパイしていませんでした…';
    case 'missedWin':
      return `${kindName(end.missedTile!)}でアガれました…`;
    case 'furitenRiichi':
      return 'フリテンリーチです…';
    case 'notBestRiichi':
      return '最大枚数のリーチではありません…';
    case 'falseDeclaration':
      return 'その牌ではアガれません…';
    case 'ryuukyoku':
      return '流局';
  }
}

export function endMood(end: EndInfo): 'happy' | 'sad' | 'neutral' {
  if (end.reason === 'win') return 'happy';
  if (end.reason === 'ryuukyoku') return 'neutral';
  return 'sad';
}

interface TenpaiBlockOptions {
  highlight?: readonly Kind[];
  /** アガリ牌ごとの枚数（見えていない枚数）と合計を出す */
  counts?: boolean;
  className?: string;
}

/** テンパイ形（7枚）とアガリ牌の一覧 */
function tenpaiBlock(label: string, hand7: readonly Kind[], waits: readonly WaitInfo[], opts: TenpaiBlockOptions = {}) {
  const hl = new Set(opts.highlight ?? []);
  const total = waits.reduce((s, w) => s + w.remaining, 0);
  return h(
    'section',
    { class: `tenpai-block${opts.className ? ` ${opts.className}` : ''}` },
    h('div', { class: 'label' }, label),
    tileRow(hand7, { size: 'md' }),
    h('div', { class: 'label' }, opts.counts ? `アガリ牌（${waits.length}種 ${total}枚）` : `アガリ牌（${waits.length}種）`),
    h(
      'div',
      { class: 'wait-tiles' },
      waits.map((w) => {
        const el = tileEl(w.kind, { size: 'md', highlight: hl.has(w.kind) });
        el.dataset.waitKind = String(w.kind);
        if (!opts.counts) return el;
        return h('span', { class: 'wait-count' }, el, h('small', { 'data-count': w.remaining }, `${w.remaining}枚`));
      }),
    ),
  );
}

/** 見出しの下の一行説明 */
function note(end: EndInfo): string | null {
  switch (end.reason) {
    case 'win':
      return `${kindName(end.winTile!)}で${byLabel(end.winBy)}`;
    case 'missedWin':
      return end.missedByTimeout ? '時間切れで見逃し' : end.missedBy === 'tsumo' ? 'ツモ切りで見逃し' : 'スルーで見逃し';
    case 'falseDeclaration':
      return `${kindName(end.declaredTile!)}で${byLabel(end.declaredBy)}宣言`;
    case 'furitenRiichi':
      return end.infinite
        ? '白単騎はすべての牌が待ちになるため必ずフリテンです'
        : `河の${(end.furitenTiles ?? []).map(kindName).join('・')}が待ちに含まれています`;
    case 'missedRiichi':
      return `${kindName(end.discard!)}を切った形はリーチできるテンパイでした`;
    case 'notBestRiichi':
      return `${kindName(end.discard!)}切りのリーチより待ち枚数の多い打牌がありました`;
    default:
      return null;
  }
}

function body(end: EndInfo): (HTMLElement | null)[] {
  switch (end.reason) {
    case 'win':
      return [tenpaiBlock('リーチ時の形', end.hand7, end.waits, { highlight: [end.winTile!] })];
    case 'missedWin':
      return [tenpaiBlock('リーチ時の形', end.hand7, end.waits, { highlight: [end.missedTile!] })];
    case 'furitenRiichi':
      return [tenpaiBlock('リーチ時の形', end.hand7, end.waits, { highlight: end.furitenTiles })];
    case 'falseDeclaration':
      return [tenpaiBlock('リーチ時の形', end.hand7, end.waits)];
    case 'missedRiichi':
      return [tenpaiBlock('テンパイの形', end.hand7, end.waits)];
    case 'notBestRiichi':
      return [
        tenpaiBlock(`あなたのリーチ（${kindName(end.discard!)}切り）`, end.hand7, end.waits, { counts: true, className: 'chosen' }),
        ...(end.bestOptions ?? []).map((o) =>
          tenpaiBlock(`理想のリーチ（${kindName(o.discard)}切り）`, o.hand7, o.waits, { counts: true, className: 'ideal' }),
        ),
      ];
    case 'notenRiichi': {
      const opts = end.notenOptions ?? [];
      if (!opts.length) return [h('p', { class: 'lead' }, 'この8枚からはテンパイに取れませんでした')];
      return opts.map((o) =>
        tenpaiBlock(
          o.infinite
            ? `${kindName(o.discard)}を切ればテンパイ（無限単騎のためリーチ不可）`
            : o.furiten
              ? `${kindName(o.discard)}を切ればテンパイ（フリテンのためリーチ不可）`
              : `${kindName(o.discard)}を切ればリーチできました`,
          removeOne(end.hand8!, o.discard),
          o.waits,
        ),
      );
    }
    case 'ryuukyoku':
      return end.riichiTurn !== null ? [tenpaiBlock('リーチ時の形', end.hand7, end.waits)] : [];
  }
}

export function renderEndView(g: Game, hd: EndHandlers): HTMLElement {
  const end = g.end!;
  const mood = endMood(end);
  const n = note(end);
  return h(
    'div',
    { class: `screen end end-${mood}` },
    h(
      'div',
      { class: 'end-card' },
      h('div', { class: 'end-face' }, mood === 'happy' ? '🎉' : mood === 'sad' ? '😢' : '🀄'),
      h('h1', { class: 'end-title' }, endTitle(end)),
      n ? h('p', { class: 'lead' }, n) : null,
      body(end),
      h(
        'div',
        { class: 'end-buttons' },
        h('button', { class: 'btn', onclick: () => hd.onReview() }, '局後レビューを見る'),
        h('button', { class: 'btn btn-primary', onclick: () => hd.onNext() }, '次の局へ'),
        h('button', { class: 'btn-link', onclick: () => hd.onTitle() }, 'タイトルへ'),
      ),
    ),
  );
}
