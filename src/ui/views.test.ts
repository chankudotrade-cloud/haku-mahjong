// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Game } from '../core/game';
import { waitKinds } from '../core/hand';
import { DEFAULT_SETTINGS } from '../core/settings';
import { HAKU, buildWallKinds, mulberry32, parseKinds as P, removeOne, type Kind } from '../core/tiles';
import { renderEndView } from './endView';
import { renderGameView, type GameHandlers } from './gameView';
import { tileImageName } from './tile';

const noop = () => {};
const handlers: GameHandlers = {
  onTileTap: noop,
  onReorder: noop,
  onRiichiToggle: noop,
  onRon: noop,
  onPass: noop,
  onTsumo: noop,
  onTsumogiri: noop,
  onQuit: noop,
};
const view = (g: Game) => renderGameView(g, { warning: '', timer: { remaining: 3, total: 5, label: '打牌' } }, handlers);

function wallFrom(front: Kind[]): Kind[] {
  let rest = buildWallKinds();
  for (const k of front) rest = removeOne(rest, k);
  return [...front, ...rest];
}
const game = (player6: string, first: string, maxTurns = 18) =>
  new Game({
    settings: { ...DEFAULT_SETTINGS, maxTurns },
    rng: mulberry32(3),
    makeWall: () => wallFrom([...P(player6), ...P('1s1s4s7s1p5p9m'), ...P(first)]),
  });

describe('牌画像', () => {
  it('全種類の牌が public/pai の画像に対応する', async () => {
    const { existsSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const pai = (name: string) => resolve(process.cwd(), 'public/pai', `${name}.gif`);
    const kinds = [...Array.from({ length: 29 }, (_, k) => k), HAKU];
    for (const k of kinds) {
      for (const sideways of [false, true]) {
        const name = tileImageName(k, sideways);
        expect(existsSync(pai(name)), name).toBe(true);
      }
    }
    expect(existsSync(pai('p_bk_1'))).toBe(true);
  });

  it('ファイル名の対応（萬筒索・發中白・横向き）', () => {
    expect(tileImageName(P('1m')[0])).toBe('p_ms1_1');
    expect(tileImageName(P('5p')[0])).toBe('p_ps5_1');
    expect(tileImageName(P('9s')[0], true)).toBe('p_ss9_3');
    expect(tileImageName(P('6z')[0])).toBe('p_ji_h_1');
    expect(tileImageName(P('7z')[0])).toBe('p_ji_c_1');
    expect(tileImageName(HAKU)).toBe('p_no_1');
  });
});

describe('捨て牌選択画面', () => {
  it('テンパイでもノーテンでもリーチボタンは常に表示される', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = new Game({ settings: DEFAULT_SETTINGS, rng: mulberry32(seed) });
      const el = view(g);
      const btn = el.querySelector('[data-action="riichi"]');
      expect(btn).not.toBeNull();
      expect(btn?.hasAttribute('disabled')).toBe(false);
    }
  });

  it('リーチ前はロン・ツモボタンを出さない', () => {
    const g = game('1m2m3m4m7p9p', '3s');
    const el = view(g);
    for (const a of ['ron', 'tsumo', 'pass', 'tsumogiri']) {
      expect(el.querySelector(`[data-action="${a}"]`)).toBeNull();
    }
  });

  it('リーチを押すと取消に変わる', () => {
    const g = game('1m2m3m4m7p9p', '3s');
    g.setRiichiMode(true);
    expect(view(g).querySelector('[data-action="riichi"]')?.textContent).toBe('リーチ取消');
  });

  it('最終巡でもボタン自体は表示される（押せない）', () => {
    const g = game('1m2m3m4m7p9p', '3s', 3);
    g.turn = 3;
    const btn = view(g).querySelector('[data-action="riichi"]');
    expect(btn).not.toBeNull();
    expect(btn?.hasAttribute('disabled')).toBe(true);
  });

  it('ツモ牌は右端に少し離して表示する', () => {
    const g = game('1m2m3m4m7p9p', '3s');
    const tiles = view(g).querySelectorAll('[data-hand-index]');
    expect(tiles).toHaveLength(8);
    expect(tiles[7].classList.contains('drawn-gap')).toBe(true);
    expect(tiles[6].classList.contains('drawn-gap')).toBe(false);
  });
});

describe('リーチ後のスルー', () => {
  const ronGame = () => {
    const g = game('1m2m3m4m5m9p', '3s');
    g.setRiichiMode(true);
    g.discard(g.hand[7].id);
    g.phase = 'ronDecision';
    g.ronTile = { id: 902, kind: P('5s')[0] };
    return g;
  };

  it('スルーボタンは無く、ロンボタンだけ', () => {
    const el = view(ronGame());
    expect(el.querySelector('[data-action="pass"]')).toBeNull();
    expect(el.querySelector('[data-action="ron"]')).not.toBeNull();
    expect([...el.querySelectorAll('button')].some((b) => b.textContent === 'スルー')).toBe(false);
  });

  it('緑の背景（河など）をタップするとスルー、ボタン・手牌・メニューは除く', () => {
    let passes = 0;
    let rons = 0;
    const el = renderGameView(ronGame(), { warning: '', timer: null }, { ...handlers, onPass: () => passes++, onRon: () => rons++ });
    (el as HTMLElement).click();
    expect(passes).toBe(1);
    (el.querySelector('.opp-river') as HTMLElement).click();
    expect(passes).toBe(2);
    (el.querySelector('[data-action="ron"]') as HTMLElement).click();
    expect(rons).toBe(1);
    (el.querySelector('[data-hand] .tile') as HTMLElement).click();
    (el.querySelector('.topbar button') as HTMLElement).click();
    expect(passes).toBe(2);
    // 手牌の枠の空いた部分（ツモ牌の置き場所あたり）はスルーになる
    (el.querySelector('[data-hand]') as HTMLElement).click();
    expect(passes).toBe(3);
  });

  it('「スルーは背景をタップ」の文字は出さない', () => {
    expect(view(ronGame()).textContent).not.toContain('スルーは背景をタップ');
  });

  it('ツモ・ロンボタンは同じ位置（手牌幅の右寄せ枠）に置く', () => {
    const el = view(ronGame());
    expect(el.querySelector('.actions-riichi [data-action="ron"]')).not.toBeNull();
    const g = ronGame();
    g.phase = 'playerDecision';
    g.pendingDraw = { id: 903, kind: P('5s')[0] };
    expect(view(g).querySelector('.actions-riichi [data-action="tsumo"]')).not.toBeNull();
  });

  it('ロン判断中以外は背景をタップしてもスルーにならない', () => {
    let passes = 0;
    const g = game('1m2m3m4m7p9p', '3s');
    const el = renderGameView(g, { warning: '', timer: null }, { ...handlers, onPass: () => passes++ });
    (el as HTMLElement).click();
    expect(passes).toBe(0);
  });
});

describe('レイアウトの固定', () => {
  it('河の高さは流局巡目から決まる段数で固定', () => {
    expect(view(game('1m2m3m4m7p9p', '3s')).getAttribute('style')).toContain('--river-rows:3');
    expect(view(game('1m2m3m4m7p9p', '3s', 30)).getAttribute('style')).toContain('--river-rows:5');
  });

  it('相手の捨て牌・警告の枠は常にある', () => {
    const el = view(game('1m2m3m4m7p9p', '3s'));
    expect(el.querySelector('.center-slot')).not.toBeNull();
  });
});

describe('リーチ後の画面', () => {
  it('判断ボタンを常設する', () => {
    const g = game('1m2m3m4m5m9p', '3s');
    g.setRiichiMode(true);
    g.discard(g.hand[7].id);
    expect(g.riichi).toBe(true);
    let el = view(g);
    expect(el.querySelector('[data-action="ron"]')).not.toBeNull();
    expect(el.querySelector('[data-action="pass"]')).toBeNull(); // スルーは背景タップ
    // 自分のツモ番：ツモボタンだけ。ツモ切りボタンは無く、ツモ牌のタップでツモ切り
    g.phase = 'playerDecision';
    g.pendingDraw = { id: 900, kind: P('5s')[0] };
    let tsumogiri = 0;
    el = renderGameView(g, { warning: '', timer: null }, { ...handlers, onTsumogiri: () => tsumogiri++ });
    expect(el.querySelector('[data-action="tsumo"]')).not.toBeNull();
    expect(el.querySelector('[data-action="tsumogiri"]')).toBeNull();
    expect(el.textContent).not.toContain('ツモ切り');
    expect(el.querySelector('[data-action="riichi"]')).toBeNull();
    (el.querySelector('[data-pending]') as HTMLElement).click();
    expect(tsumogiri).toBe(1);
  });

  it('白だけがドラッグ可能（movable）', () => {
    const g = game('1m2m3m4m7p9p', '3s');
    const movable = [...view(g).querySelectorAll('[data-hand-index]')].filter((x) => x.classList.contains('movable'));
    expect(movable).toHaveLength(1);
    expect(movable[0].classList.contains('haku')).toBe(true);
  });
});

describe('終了画面', () => {
  const endHandlers = { onReview: noop, onNext: noop, onTitle: noop };

  it('待ち一覧が待ち計算の結果と一致する（リーチ漏れ）', () => {
    const g = game('1m2m3m4m5m9p', '3s');
    g.discard(g.hand[7].id);
    expect(g.end?.reason).toBe('missedRiichi');
    const el = renderEndView(g, endHandlers);
    const shown = [...el.querySelectorAll('[data-wait-kind]')].map((x) => Number(x.getAttribute('data-wait-kind')));
    expect(shown).toEqual(waitKinds(P('12345m9p5z')));
    expect(el.querySelector('.end-title')?.textContent).toBe('テンパイしていました！');
    // 表示するのはテンパイ形とアガリ牌だけ（残り枚数・紙吹雪なし）
    const handKinds = [...el.querySelectorAll('.tenpai-block .tile-row [data-kind]')].map((x) => Number(x.getAttribute('data-kind')));
    expect(handKinds).toEqual(P('12345m9p5z'));
    expect(el.textContent).not.toContain('残り');
    expect(el.querySelector('.confetti')).toBeNull();
  });

  it('アガリ画面：リーチ時の形とアガリ牌だけ（紙吹雪なし）', () => {
    const g = game('1m2m3m4m5m9p', '3s');
    g.setRiichiMode(true);
    g.discard(g.hand[7].id);
    g.phase = 'ronDecision';
    g.ronTile = { id: 901, kind: P('9p')[0] };
    g.declareRon();
    expect(g.end?.reason).toBe('win');
    const el = renderEndView(g, endHandlers);
    expect(el.querySelector('.confetti')).toBeNull();
    expect(el.textContent).not.toContain('残り');
    expect(el.querySelectorAll('.tenpai-block')).toHaveLength(1);
    const shown = [...el.querySelectorAll('[data-wait-kind]')].map((x) => Number(x.getAttribute('data-wait-kind')));
    expect(shown).toEqual(waitKinds(P('12345m9p5z')));
    expect(el.querySelector('[data-wait-kind].highlight')?.getAttribute('data-wait-kind')).toBe(String(P('9p')[0]));
  });

  it('無限単騎は山の全種類の待ちを表示し、説明を添える', () => {
    const g = game('1m2m3m4m5m9p', '3s');
    g.hand = P('123m456p5z9s').map((kind, i) => ({ id: 500 + i, kind }));
    g.drawnId = 507;
    g.setRiichiMode(true);
    g.discard(507);
    const el = renderEndView(g, endHandlers);
    expect(el.querySelectorAll('[data-wait-kind]')).toHaveLength(27);
    expect(el.textContent).toContain('白単騎はすべての牌が待ちになるため必ずフリテンです');
    expect(el.querySelector('.end-title')?.textContent).toBe('フリテンリーチです…');
  });

  it('最大枚数でないリーチ：自分の形と理想の形を、アガリ牌と枚数つきで表示', () => {
    const g = game('1m2m3m4m5m9p', '3s');
    g.oppRiver = P('9p9p9p').map((kind, i) => ({ tile: { id: 800 + i, kind }, riichi: false, tsumogiri: false }));
    g.setRiichiMode(true);
    g.discard(g.hand[7].id); // 3索切り
    expect(g.end?.reason).toBe('notBestRiichi');
    const el = renderEndView(g, endHandlers);
    expect(el.querySelector('.end-title')?.textContent).toBe('最大枚数のリーチではありません…');
    const chosen = el.querySelector('.tenpai-block.chosen')!;
    const ideal = el.querySelectorAll('.tenpai-block.ideal');
    expect(ideal).toHaveLength(1);
    expect(chosen.textContent).toContain('3索切り');
    expect(ideal[0].textContent).toContain('9筒切り');
    const counts = [...chosen.querySelectorAll('[data-count]')].map((x) => Number(x.getAttribute('data-count')));
    expect(counts).toEqual(g.end!.waits.map((w) => w.remaining));
    const sum = counts.reduce((a, b) => a + b, 0);
    expect(chosen.textContent).toContain(`${sum}枚`);
  });

  it('ノーテンリーチ：リーチできた打牌を「XXを切ればリーチできました」と形つきで示す', () => {
    const g = game('1m2m3m4m5m9p', '3s');
    g.setRiichiMode(true);
    g.discard(g.hand.find((t) => t.kind === P('1m')[0])!.id);
    expect(g.end?.reason).toBe('notenRiichi');
    const el = renderEndView(g, endHandlers);
    expect(el.textContent).toContain('3索を切ればリーチできました');
    expect(el.textContent).toContain('9筒を切ればリーチできました');
  });

  it('ノーテンリーチでテンパイに取れる打牌が無い場合の表示', () => {
    const g = game('1m4m7m2p5p8p', '3s');
    g.setRiichiMode(true);
    g.discard(g.hand[7].id);
    expect(g.end?.reason).toBe('notenRiichi');
    const el = renderEndView(g, endHandlers);
    expect(el.textContent).toContain('この8枚からはテンパイに取れませんでした');
  });
});
