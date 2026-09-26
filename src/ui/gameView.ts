import type { Game, RiverTile } from '../core/game';
import { HAKU } from '../core/tiles';
import { h } from './dom';
import { attachHandDnD } from './dnd';
import { endMood, endTitle } from './endView';
import { tileEl } from './tile';

export interface GameViewState {
  warning: string;
  timer: { remaining: number; total: number; label: string } | null;
}

export interface GameHandlers {
  onTileTap(index: number): void;
  onReorder(from: number, to: number): void;
  onRiichiToggle(): void;
  onRon(): void;
  onPass(): void;
  onTsumo(): void;
  onTsumogiri(): void;
  onQuit(): void;
}

/** 河の1段の枚数 */
export const RIVER_COLUMNS = 6;

function riverEl(river: readonly RiverTile[], cls: string, lastHighlight = false): HTMLElement {
  return h(
    'div',
    { class: `river ${cls}` },
    river.map((r, i) =>
      tileEl(r.tile.kind, {
        size: 'sm',
        sideways: r.riichi,
        highlight: lastHighlight && i === river.length - 1,
      }),
    ),
  );
}

export function timerEl(timer: GameViewState['timer']): HTMLElement {
  const ratio = timer ? Math.max(0, timer.remaining / timer.total) : 0;
  const secs = timer ? Math.max(0, Math.ceil(timer.remaining)) : 0;
  return h(
    'div',
    { class: timer ? 'timer' : 'timer idle', 'data-timer': '' },
    h('span', { class: 'timer-label' }, timer?.label ?? ''),
    h('span', { class: 'timer-track' }, h('span', { class: 'timer-fill', style: `width:${(ratio * 100).toFixed(1)}%` })),
    h('span', { class: `timer-secs${timer && timer.remaining <= 2 ? ' urgent' : ''}` }, timer ? `${secs}` : ''),
  );
}

/** タイマー表示だけを書き換える（毎フレーム全体を描き直さない） */
export function updateTimerEl(root: HTMLElement, timer: GameViewState['timer']): void {
  const old = root.querySelector('[data-timer]');
  if (old) old.replaceWith(timerEl(timer));
}

function actionBar(g: Game, hd: GameHandlers): HTMLElement {
  if (g.riichi) {
    // リーチ後は判断ボタンを常設する
    const ronPhase = g.phase === 'ronDecision';
    const tsumoPhase = g.phase === 'playerDecision';
    // ツモ／ロンボタンはツモ牌の置き場所の上に固定する。
    // ツモ切りはツモ牌のタップ、スルーは緑の背景のタップ
    if (tsumoPhase) {
      return h(
        'div',
        { class: 'actions actions-riichi' },
        h('button', { class: 'btn btn-win', 'data-action': 'tsumo', onclick: () => hd.onTsumo() }, 'ツモ'),
      );
    }
    return h(
      'div',
      { class: 'actions actions-riichi' },
      h('button', { class: 'btn btn-win', 'data-action': 'ron', disabled: !ronPhase, onclick: () => hd.onRon() }, 'ロン'),
    );
  }
  if (g.phase === 'ended') return h('div', { class: 'actions' }, h('span', { class: 'hint' }, '▼ 結果の詳しい内容は下へ'));
  if (g.phase === 'playerDiscard') {
    // 捨て牌を選ぶ画面には常に「リーチ」ボタンを出す（テンパイかどうかに関係なく）
    return h(
      'div',
      { class: 'actions' },
      h(
        'button',
        {
          class: g.riichiMode ? 'btn btn-riichi active' : 'btn btn-riichi',
          'data-action': 'riichi',
          disabled: !g.canDeclareRiichi,
          title: g.canDeclareRiichi ? '' : '最終巡はリーチできません',
          onclick: () => hd.onRiichiToggle(),
        },
        g.riichiMode ? 'リーチ取消' : 'リーチ',
      ),
      h('span', { class: 'hint' }, g.riichiMode ? '宣言牌を選んでください' : '切る牌をタップ・白はドラッグで移動'),
    );
  }
  return h('div', { class: 'actions' }, h('span', { class: 'hint' }, '相手の番…'));
}

function handEl(g: Game, hd: GameHandlers): HTMLElement {
  const selectable = g.phase === 'playerDiscard';
  const n = g.hand.length;
  const tiles = g.hand.map((t, i) => {
    const el = tileEl(t.kind, {
      size: 'lg',
      className: [
        t.kind === HAKU ? 'movable' : '',
        selectable ? 'selectable' : '',
        selectable && g.riichiMode ? 'riichi-select' : '',
        t.id === g.drawnId && i === n - 1 ? 'drawn-gap' : '',
      ].join(' '),
    });
    el.dataset.handIndex = String(i);
    return el;
  });
  const container = h('div', { class: 'hand', 'data-hand': '' }, tiles);
  if (g.pendingDraw) {
    // リーチ後のツモ牌：タップでツモ切り
    const pending = tileEl(g.pendingDraw.kind, { size: 'lg', className: 'drawn-gap pending selectable' });
    pending.dataset.pending = '';
    if (g.phase === 'playerDecision') pending.addEventListener('click', () => hd.onTsumogiri());
    container.append(pending);
  }
  attachHandDnD(container, {
    onTap: (i) => {
      if (g.phase === 'playerDiscard') hd.onTileTap(i);
    },
    onReorder: (from, to) => hd.onReorder(from, to),
    // 自動理牌なので、動かせるのは白だけ
    canDrag: (i) => g.phase !== 'ended' && g.hand[i]?.kind === HAKU,
  });
  return container;
}

/** 背景タップでスルーにしない領域（ボタン・自分の手牌の牌・上部メニュー）。手牌の枠の空いた部分はスルーになる */
const PASS_EXCLUDED = 'button, [data-hand] .tile, .topbar';

export function renderGameView(g: Game, st: GameViewState, hd: GameHandlers): HTMLElement {
  const ronTile = g.phase === 'ronDecision' && g.ronTile ? g.ronTile : null;
  // 河は最初から最大段数分の高さをとり、捨て牌が増えても手牌が動かないようにする
  const riverRows = Math.ceil(g.settings.maxTurns / RIVER_COLUMNS);
  const root = h(
    'div',
    {
      class: `screen game${g.phase === 'ended' ? ' frozen' : ''}`,
      // --slots：手牌＋ツモ牌の枚数（牌の大きさと手牌の幅を決める）
      style: `--river-rows:${riverRows};--slots:${g.settings.handSize + 1}`,
    },
    h(
      'div',
      { class: 'topbar' },
      h('span', {}, `${g.turn}巡目 / ${g.settings.maxTurns}`),
      h('span', {}, `山 ${g.wall.length}`),
      h('button', { class: 'btn-link', onclick: () => hd.onQuit() }, 'タイトルへ'),
    ),
    h(
      'div',
      { class: 'opp-area' },
      h('div', { class: 'opp-hand' }, g.oppHand.map((t) => tileEl(t.kind, { size: 'sm', back: true }))),
      riverEl(g.oppRiver, 'opp-river', !!ronTile),
    ),
    h(
      'div',
      { class: 'center' },
      timerEl(st.timer),
      // 相手の捨て牌と警告は同じ枠に出す（出ていなくても高さは確保する）
      h(
        'div',
        { class: 'center-slot' },
        g.end
          ? h('div', { class: `board-result board-result-${endMood(g.end)}` }, endTitle(g.end))
          : ronTile
            ? h('div', { class: 'ron-target' }, '相手の捨て牌', tileEl(ronTile.kind, { size: 'md', highlight: true }))
            : h('div', { class: `notice${st.warning ? ' show' : ''}` }, st.warning),
      ),
    ),
    riverEl(g.playerRiver, 'player-river'),
    actionBar(g, hd),
    handEl(g, hd),
  );
  root.addEventListener('click', (e) => {
    if (g.phase !== 'ronDecision') return;
    if ((e.target as HTMLElement).closest(PASS_EXCLUDED)) return;
    hd.onPass();
  });
  return root;
}
