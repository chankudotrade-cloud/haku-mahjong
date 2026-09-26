import type { Game, TurnRecord } from '../core/game';
import type { WaitCount } from '../core/review';
import { kindName } from '../core/tiles';
import { h } from './dom';
import { endTitle } from './endView';
import { tileEl, tileRow, waitsSection } from './tile';

export interface ReviewHandlers {
  onBack(): void;
  onNext(): void;
}

function waitList(waits: readonly WaitCount[]) {
  const total = waits.reduce((s, w) => s + w.remaining, 0);
  return h(
    'span',
    { class: 'wait-inline' },
    waits.map((w) => h('span', { class: 'wait-chip' }, tileEl(w.kind, { size: 'sm' }), h('small', {}, `${w.remaining}`))),
    h('span', { class: 'waits-sum' }, `${waits.length}種${total}枚`),
  );
}

function recordEl(r: TurnRecord): HTMLElement {
  const badges = [
    r.riichi ? h('span', { class: 'tag tag-riichi' }, 'リーチ宣言') : null,
    r.auto ? h('span', { class: 'tag' }, '時間切れ') : null,
    r.kind === 'afterRiichi' ? h('span', { class: 'tag' }, 'ツモ切り') : null,
  ];
  let discardIdx = -1;
  const hand = r.kind === 'afterRiichi' ? [...r.hand, r.drawn] : r.hand;
  if (r.kind === 'afterRiichi') discardIdx = hand.length - 1;
  else discardIdx = hand.lastIndexOf(r.discard);
  const a = r.analysis;

  let after: HTMLElement | null = null;
  let compare: HTMLElement | null = null;
  if (a) {
    const c = a.chosen;
    after = h(
      'div',
      { class: 'rv-line' },
      h('span', { class: 'rv-label' }, '打牌後'),
      c.tenpai
        ? h('span', {}, c.infinite ? h('span', { class: 'tag' }, '無限単騎') : null, c.furiten ? h('span', { class: 'tag' }, 'フリテン') : null, waitList(c.waits))
        : h('span', { class: 'muted' }, 'ノーテン'),
    );
    if (a.bestTotal !== null) {
      compare = h(
        'div',
        { class: 'rv-line' },
        h('span', { class: 'rv-label' }, '最善'),
        h('span', {}, a.bestDiscards.map((k) => tileEl(k, { size: 'sm' })), ` 切り（${a.bestTotal}枚）`),
        a.isBest ? h('span', { class: 'mark good' }, '◯ 最善') : h('span', { class: 'mark bad' }, '✕'),
        a.missedTenpai ? h('span', { class: 'tag tag-warn' }, 'テンパイを逃した') : null,
      );
    } else {
      compare = h('div', { class: 'rv-line' }, h('span', { class: 'rv-label' }, '最善'), h('span', { class: 'muted' }, 'リーチできるテンパイに取れる打牌なし'));
    }
  }

  return h(
    'li',
    { class: `rv-turn${a?.missedTenpai ? ' warn' : ''}` },
    h('div', { class: 'rv-head' }, h('b', {}, `${r.turn}巡目`), badges, h('span', { class: 'rv-discard' }, '打', tileEl(r.discard, { size: 'sm' }))),
    tileRow(hand, { size: 'sm' }, (_, i) => i === discardIdx),
    after,
    compare,
  );
}

export function renderReviewView(g: Game, hd: ReviewHandlers): HTMLElement {
  const end = g.end!;
  const riichiRec = g.log.find((r) => r.riichi);
  const missedTenpaiTurns = g.log.filter((r) => r.analysis?.missedTenpai).map((r) => r.turn);
  const violation =
    end.reason === 'notenRiichi'
      ? 'ノーテンリーチ'
      : end.reason === 'furitenRiichi'
        ? end.infinite
          ? '無限単騎（フリテン扱い）'
          : 'フリテンリーチ'
        : end.reason === 'notBestRiichi'
          ? '最大枚数でないリーチ'
          : null;

  return h(
    'div',
    { class: 'screen review' },
    h(
      'div',
      { class: 'review-card' },
      h('h1', {}, '局後レビュー'),
      h(
        'div',
        { class: 'rv-summary' },
        h('div', {}, h('span', { class: 'rv-label' }, '結果'), endTitle(end)),
        violation ? h('div', {}, h('span', { class: 'rv-label' }, '違反'), violation) : null,
        end.reason === 'missedWin'
          ? h('div', {}, h('span', { class: 'rv-label' }, '見逃し'), tileEl(end.missedTile!, { size: 'sm', highlight: true }), ` ${kindName(end.missedTile!)}`)
          : null,
        riichiRec?.analysis
          ? h(
              'div',
              {},
              h('span', { class: 'rv-label' }, 'リーチ打牌'),
              riichiRec.analysis.isBest ? '待ち枚数最大の選択でした' : riichiRec.analysis.bestTotal !== null ? `最大ではありません（最大 ${riichiRec.analysis.bestTotal}枚：${riichiRec.analysis.bestDiscards.map(kindName).join('・')}切り）` : '比較対象なし',
            )
          : null,
        h(
          'div',
          {},
          h('span', { class: 'rv-label' }, 'テンパイを逃した巡'),
          missedTenpaiTurns.length ? missedTenpaiTurns.map((t) => `${t}巡目`).join('・') : 'なし',
        ),
      ),
      end.waits.length ? waitsSection(end.waits, { highlight: end.missedTile != null ? [end.missedTile] : end.furitenTiles }) : null,
      h('ol', { class: 'rv-turns' }, g.log.map(recordEl)),
      h(
        'div',
        { class: 'end-buttons' },
        h('button', { class: 'btn', onclick: () => hd.onBack() }, '結果に戻る'),
        h('button', { class: 'btn btn-primary', onclick: () => hd.onNext() }, '次の局へ'),
      ),
    ),
  );
}
