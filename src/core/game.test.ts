import { describe, expect, it, vi } from 'vitest';
import { Game } from './game';
import { waitKinds } from './hand';
import { DEFAULT_SETTINGS, type GameSettings } from './settings';
import { HAKU, buildWallKinds, mulberry32, parseKinds as P, removeOne, type Kind, type Tile } from './tiles';

/** 先頭に指定の牌を置き、残りは山の残りで埋めた並び */
function wallFrom(front: Kind[]): Kind[] {
  let rest = buildWallKinds();
  for (const k of front) rest = removeOne(rest, k);
  return [...front, ...rest];
}

/** プレイヤーの配牌・第1ツモ・以降のツモ順（相手→自分→…）を指定して局を作る */
function makeGame(player6: string, first: string, opts: Partial<GameSettings> = {}, draws = ''): Game {
  return new Game({
    settings: { ...DEFAULT_SETTINGS, ...opts },
    rng: mulberry32(1),
    makeWall: () => wallFrom([...P(player6), ...P(first), ...P(draws)]),
  });
}

let nextId = 10000;
/** 手牌・河を直接差し替える（テスト用） */
function setHand(g: Game, kinds: string, drawnLast = true, river = '') {
  g.hand = P(kinds).map((kind) => ({ id: nextId++, kind }));
  g.drawnId = drawnLast ? g.hand[g.hand.length - 1].id : null;
  g.playerRiver = P(river).map((kind) => ({ tile: { id: nextId++, kind }, riichi: false, tsumogiri: false }));
}
const tileOf = (g: Game, kind: Kind): Tile => g.hand.find((t) => t.kind === kind)!;

describe('配牌', () => {
  it('プレイヤーは6枚＋白（白は必ず1枚）。相手は手牌を持たない', () => {
    const g = new Game({ settings: DEFAULT_SETTINGS, rng: mulberry32(42) });
    expect(g.hand).toHaveLength(8);
    expect(g.handKinds.filter((k) => k === HAKU)).toHaveLength(1);
    expect(g.wall.some((t) => t.kind === HAKU)).toBe(false);
    expect(g.wall.length + 7).toBe(108);
    expect(g.wall.some((t) => t.kind >= 27)).toBe(false); // 字牌は山に無い
    expect(g.turn).toBe(1);
    expect(g.phase).toBe('playerDiscard');
  });

  it('配牌時のみ自動理牌され、白は右端、ツモ牌はその右', () => {
    const g = makeGame('9s1m7s5p2m1p', '3s');
    expect(g.handKinds).toEqual([...P('12m15p79s'), HAKU, ...P('3s')]);
    expect(g.drawnId).toBe(g.hand[7].id);
  });

  it('配牌＋第1ツモがアガリ形なら配り直す', () => {
    const agari = wallFrom([...P('123m456m'), ...P('9p')]);
    const normal = wallFrom([...P('123m45m9p'), ...P('3s')]);
    const makeWall = vi.fn().mockReturnValueOnce(agari).mockReturnValueOnce(normal);
    const g = new Game({ settings: DEFAULT_SETTINGS, rng: mulberry32(1), makeWall });
    expect(makeWall).toHaveBeenCalledTimes(2);
    expect(g.dealCount).toBe(2);
    expect(g.handKinds).toEqual([...P('12345m9p'), HAKU, ...P('3s')]);
  });
});

describe('理牌', () => {
  it('打牌のたびに自動理牌し、ツモ牌は打牌まで右端に置く', () => {
    const g = makeGame('1m2m3m4m7p9p', '3s', {}, '5s1p'); // 相手が5索、自分が1筒をツモる
    g.discard(tileOf(g, P('7p')[0]).id); // 1234萬9筒白3索 → ノーテン
    expect(g.phase).toBe('opponentTurn');
    expect(g.handKinds).toEqual([...P('1234m9p3s'), HAKU]); // ツモ牌の3索が理牌される
    g.advanceOpponent();
    expect(g.handKinds).toEqual([...P('1234m9p3s'), HAKU, ...P('1p')]); // ツモ牌は右端
    expect(g.drawnId).toBe(g.hand[7].id);
  });

  it('白以外の牌は動かせない', () => {
    const g = makeGame('1m2m3m4m7p9p', '3s');
    const before = g.handKinds;
    g.reorder(0, 5);
    g.reorder(7, 0);
    expect(g.handKinds).toEqual(before);
  });

  it('白を左端に置けば、理牌後も左端', () => {
    const g = makeGame('1m2m3m4m7p9p', '3s');
    g.reorder(6, 0);
    g.discard(tileOf(g, P('7p')[0]).id);
    expect(g.handKinds).toEqual([HAKU, ...P('1234m9p3s')]);
  });

  it('白は自由に動かせ、打牌・ツモの後も左隣の牌の右に置かれる', () => {
    const g = makeGame('1m2m3m4m7p9p', '3s', {}, '5s1p');
    g.reorder(6, 2); // 白を 2萬 と 3萬 の間へ
    expect(g.handKinds).toEqual([...P('12m'), HAKU, ...P('34m7p9p3s')]);
    g.discard(tileOf(g, P('7p')[0]).id);
    expect(g.handKinds).toEqual([...P('12m'), HAKU, ...P('34m9p3s')]);
    g.advanceOpponent();
    expect(g.handKinds).toEqual([...P('12m'), HAKU, ...P('34m9p3s1p')]);
    // 左端の牌を切ると、白の左の牌が1枚減る
    g.discard(tileOf(g, P('1m')[0]).id);
    expect(g.handKinds).toEqual([...P('2m'), HAKU, ...P('34m19p3s')]);
  });

  it('白をツモ牌の右に置ける', () => {
    const g = makeGame('1m2m3m4m7p9p', '3s');
    g.reorder(6, 7);
    expect(g.handKinds).toEqual([...P('1234m7p9p3s'), HAKU]);
  });
});

describe('白は切れない', () => {
  it('白を選ぶと haku を返し、局は続く', () => {
    const g = makeGame('1m2m3m4m5m9p', '3s');
    expect(g.discard(tileOf(g, HAKU).id)).toBe('haku');
    expect(g.phase).toBe('playerDiscard');
    expect(g.hand).toHaveLength(8);
    expect(g.end).toBeNull();
  });
});

describe('打牌の時間切れ', () => {
  it('右端の牌（ツモ牌）を切る', () => {
    const g = makeGame('1m2m3m4m7p9p', '3s');
    g.timeout();
    expect(g.playerRiver.map((r) => r.tile.kind)).toEqual(P('3s'));
    expect(g.log[0].auto).toBe(true);
  });

  it('右端が白なら右から2番目を切る', () => {
    const g = makeGame('1m2m3m4m7p9p', '3s');
    g.reorder(6, 7); // 白を右端へ
    expect(g.handKinds[7]).toBe(HAKU);
    g.timeout();
    expect(g.playerRiver.map((r) => r.tile.kind)).toEqual(P('3s'));
    expect(g.handKinds).toContain(HAKU);
  });

  it('時間切れの打牌でもリーチできるテンパイならリーチ漏れで終了', () => {
    const g = makeGame('1m2m3m4m5m9p', '3s');
    g.timeout(); // 3索を切る → 12345萬9筒白 はテンパイ
    expect(g.end?.reason).toBe('missedRiichi');
  });
});

describe('リーチ前のアガリ宣言', () => {
  it('リーチ前はツモ・ロンを宣言できない', () => {
    const g = makeGame('1m2m3m4m5m9p', '3s');
    expect(g.declareTsumo()).toBe(false);
    expect(g.declareRon()).toBe(false);
    expect(g.phase).toBe('playerDiscard');
    g.discard(tileOf(g, P('1m')[0]).id);
    g.advanceOpponent();
    expect(g.declareRon()).toBe(false);
    expect(g.end).toBeNull();
  });
});

describe('リーチ義務（リーチ漏れ）', () => {
  it('リーチできるテンパイでリーチせずに打牌すると局終了', () => {
    const g = makeGame('1m2m3m4m5m9p', '3s');
    g.discard(tileOf(g, P('3s')[0]).id);
    expect(g.phase).toBe('ended');
    expect(g.end?.reason).toBe('missedRiichi');
    expect(g.end?.waits.map((w) => w.kind)).toEqual(waitKinds(g.handKinds));
  });

  it('ノーテンなら続行', () => {
    const g = makeGame('1m2m3m4m5m9p', '3s');
    g.discard(tileOf(g, P('1m')[0]).id);
    expect(g.phase).toBe('opponentTurn');
  });

  it('フリテンのテンパイなら続行', () => {
    const g = makeGame('1m2m3m4m5m9p', '3s');
    setHand(g, '23456m9p5z1s', true, '7m');
    g.discard(tileOf(g, P('1s')[0]).id);
    expect(g.phase).toBe('opponentTurn');
    expect(g.end).toBeNull();
  });

  it('無限単騎のテンパイなら続行', () => {
    const g = makeGame('1m2m3m4m5m9p', '3s');
    setHand(g, '123m456p5z9s');
    g.discard(tileOf(g, P('9s')[0]).id);
    expect(g.phase).toBe('opponentTurn');
  });

  it('最終巡はリーチできず、リーチ義務もない', () => {
    const g = makeGame('1m2m3m4m5m9p', '3s', { maxTurns: 3 });
    g.turn = 3;
    expect(g.canDeclareRiichi).toBe(false);
    expect(g.setRiichiMode(true)).toBe(false);
    g.discard(tileOf(g, P('3s')[0]).id);
    expect(g.phase).toBe('opponentTurn');
  });
});

describe('禁止リーチ', () => {
  it('ノーテンリーチは宣言直後に局終了し、テンパイに取れた打牌を示す', () => {
    const g = makeGame('1m2m3m4m5m9p', '3s');
    expect(g.setRiichiMode(true)).toBe(true);
    g.discard(tileOf(g, P('1m')[0]).id);
    expect(g.end?.reason).toBe('notenRiichi');
    expect(g.end?.hand8).toEqual([...P('12345m9p'), HAKU, ...P('3s')]);
    const opts = g.end!.notenOptions!;
    expect(opts.map((o) => o.discard)).toEqual(expect.arrayContaining(P('9p3s')));
    for (const o of opts) {
      expect(o.waits.map((w) => w.kind)).toEqual(waitKinds(removeOne(g.end!.hand8!, o.discard)));
    }
  });

  it('宣言牌を含む河に待ちがあればフリテンリーチ', () => {
    const g = makeGame('1m2m3m4m5m9p', '3s');
    setHand(g, '23456m9p5z1s', true, '7m');
    g.setRiichiMode(true);
    g.discard(tileOf(g, P('1s')[0]).id);
    expect(g.end?.reason).toBe('furitenRiichi');
    expect(g.end?.furitenTiles).toEqual(P('7m'));
    expect(g.end?.infinite).toBe(false);
  });

  it('無限単騎リーチはフリテンリーチとして局終了', () => {
    const g = makeGame('1m2m3m4m5m9p', '3s');
    setHand(g, '123m456p5z9s');
    g.setRiichiMode(true);
    g.discard(tileOf(g, P('9s')[0]).id);
    expect(g.end?.reason).toBe('furitenRiichi');
    expect(g.end?.infinite).toBe(true);
    expect(g.end?.furitenTiles).toEqual(P('9s'));
  });

  it('正しいリーチは続行し、宣言牌は横向き（riichi フラグ）', () => {
    const g = makeGame('1m2m3m4m5m9p', '3s');
    g.setRiichiMode(true);
    g.discard(tileOf(g, P('3s')[0]).id);
    expect(g.phase).toBe('opponentTurn');
    expect(g.riichi).toBe(true);
    expect(g.riichiTurn).toBe(1);
    expect(g.playerRiver[0].riichi).toBe(true);
    expect(g.riichiSnapshot?.waits.map((w) => w.kind)).toEqual(waitKinds(P('12345m9p5z')));
  });

  describe('最大枚数でないリーチ', () => {
    /** 12345萬9筒白3索。相手の河に9筒が3枚あり、9筒待ちは残り0枚 */
    const setup = () => {
      const g = makeGame('1m2m3m4m5m9p', '3s');
      g.oppRiver = P('9p9p9p').map((kind) => ({ tile: { id: nextId++, kind }, riichi: false, tsumogiri: false }));
      return g;
    };
    const total = (ws: { remaining: number }[]) => ws.reduce((s, w) => s + w.remaining, 0);

    it('待ち枚数が最大でない打牌でリーチすると局終了し、理想の打牌を示す', () => {
      const g = setup();
      g.setRiichiMode(true);
      g.discard(tileOf(g, P('3s')[0]).id); // 9筒を含む待ち
      expect(g.end?.reason).toBe('notBestRiichi');
      expect(g.end?.discard).toBe(P('3s')[0]);
      const best = g.end!.bestOptions!;
      expect(best.map((o) => o.discard)).toEqual(P('9p'));
      expect(best[0].hand7).toEqual(removeOne(g.end!.hand8!, P('9p')[0]));
      expect(best[0].waits.map((w) => w.kind)).toEqual(waitKinds(best[0].hand7));
      expect(total(best[0].waits)).toBeGreaterThan(total(g.end!.waits));
      expect(g.end!.waits.find((w) => w.kind === P('9p')[0])?.remaining).toBe(0);
    });

    it('最大枚数の打牌でリーチすれば続行', () => {
      const g = setup();
      g.setRiichiMode(true);
      g.discard(tileOf(g, P('9p')[0]).id);
      expect(g.phase).toBe('opponentTurn');
      expect(g.riichi).toBe(true);
    });

    it('同じ最大枚数の打牌が複数あればどれでも続行', () => {
      // 河に何も無ければ 3索切り と 9筒切り は同じ枚数
      const g = makeGame('1m2m3m4m5m9p', '3s');
      g.setRiichiMode(true);
      g.discard(tileOf(g, P('3s')[0]).id);
      expect(g.log[0].analysis?.bestDiscards).toEqual(expect.arrayContaining(P('9p3s')));
      expect(g.phase).toBe('opponentTurn');
    });
  });

  it('リーチを押した後に取り消せる', () => {
    const g = makeGame('1m2m3m4m5m9p', '3s');
    g.setRiichiMode(true);
    g.setRiichiMode(false);
    g.discard(tileOf(g, P('1m')[0]).id);
    expect(g.riichi).toBe(false);
    expect(g.phase).toBe('opponentTurn');
  });
});

/** 23456萬9筒白 でリーチした状態（待ち 1・4・7萬・9筒） */
function riichiGame(): Game {
  const g = makeGame('1m2m3m4m5m9p', '3s');
  setHand(g, '23456m9p5z1s');
  g.setRiichiMode(true);
  g.discard(tileOf(g, P('1s')[0]).id);
  expect(g.phase).toBe('opponentTurn');
  return g;
}
const force = (g: Game, phase: 'ronDecision' | 'playerDecision', kind: Kind) => {
  g.phase = phase;
  if (phase === 'ronDecision') g.ronTile = { id: nextId++, kind };
  else g.pendingDraw = { id: nextId++, kind };
};

describe('リーチ後の判断', () => {
  it('相手の捨て牌が出るたびにロン判断になる', () => {
    const g = riichiGame();
    g.advanceOpponent();
    expect(g.phase).toBe('ronDecision');
    expect(g.ronTile).not.toBeNull();
  });

  it('アガれない牌でタイムアウト → スルー扱いで次のツモへ', () => {
    const g = riichiGame();
    force(g, 'ronDecision', P('5s')[0]);
    g.timeout();
    expect(g.phase).toBe('playerDecision');
    expect(g.pendingDraw).not.toBeNull();
  });

  it('アガれない牌でタイムアウト（自分のツモ） → ツモ切り扱い', () => {
    const g = riichiGame();
    force(g, 'playerDecision', P('5s')[0]);
    g.timeout();
    expect(g.phase).toBe('opponentTurn');
    expect(g.playerRiver.at(-1)?.tile.kind).toBe(P('5s')[0]);
    expect(g.playerRiver.at(-1)?.tsumogiri).toBe(true);
  });

  it('アガれる牌でスルー・タイムアウトすると見逃しで終了', () => {
    const g1 = riichiGame();
    force(g1, 'ronDecision', P('7m')[0]);
    g1.pass();
    expect(g1.end?.reason).toBe('missedWin');
    expect(g1.end?.missedTile).toBe(P('7m')[0]);

    const g2 = riichiGame();
    force(g2, 'ronDecision', P('9p')[0]);
    g2.timeout();
    expect(g2.end?.reason).toBe('missedWin');
    expect(g2.end?.missedByTimeout).toBe(true);
  });

  it('アガれる牌でツモ切り・タイムアウトすると見逃しで終了', () => {
    const g1 = riichiGame();
    force(g1, 'playerDecision', P('1m')[0]);
    g1.tsumogiri();
    expect(g1.end?.reason).toBe('missedWin');

    const g2 = riichiGame();
    force(g2, 'playerDecision', P('4m')[0]);
    g2.timeout();
    expect(g2.end?.reason).toBe('missedWin');
    expect(g2.end?.missedBy).toBe('tsumo');
  });

  it('アガれる牌でロン・ツモ → アガリ', () => {
    const g1 = riichiGame();
    force(g1, 'ronDecision', P('7m')[0]);
    g1.declareRon();
    expect(g1.end?.reason).toBe('win');
    expect(g1.end?.winBy).toBe('ron');
    expect(g1.end?.winDecomps?.length).toBeGreaterThan(0);

    const g2 = riichiGame();
    force(g2, 'playerDecision', P('9p')[0]);
    g2.declareTsumo();
    expect(g2.end?.reason).toBe('win');
    expect(g2.end?.winBy).toBe('tsumo');
  });

  it('アガれない牌でロン・ツモ → 誤宣言で終了', () => {
    const g1 = riichiGame();
    force(g1, 'ronDecision', P('5s')[0]);
    g1.declareRon();
    expect(g1.end?.reason).toBe('falseDeclaration');
    expect(g1.end?.declaredTile).toBe(P('5s')[0]);

    const g2 = riichiGame();
    force(g2, 'playerDecision', P('3m')[0]);
    g2.declareTsumo();
    expect(g2.end?.reason).toBe('falseDeclaration');
  });

  it('終了時の待ち一覧はリーチ時の待ち計算と一致する', () => {
    const g = riichiGame();
    force(g, 'ronDecision', P('5s')[0]);
    g.declareRon();
    expect(g.end?.waits.map((w) => w.kind)).toEqual(P('147m9p'));
  });
});

describe('リーチ後のアガリ牌の確率（ロン25%・ツモ25%）', () => {
  /** 23456萬9筒白 でリーチした局（待ち 1・4・7萬・9筒）。種ごとに山の並びと乱数が変わる */
  const riichiWithSeed = (seed: number): Game => {
    const g = new Game({ settings: DEFAULT_SETTINGS, rng: mulberry32(seed) });
    setHand(g, '23456m9p5z1s');
    g.setRiichiMode(true);
    g.discard(tileOf(g, P('1s')[0]).id);
    expect(g.phase).toBe('opponentTurn');
    return g;
  };
  const WAITS = new Set(P('147m9p'));

  it('相手の捨て牌が待ち牌になるのは約25%', () => {
    const N = 2000;
    let hits = 0;
    for (let seed = 1; seed <= N; seed++) {
      const g = riichiWithSeed(seed);
      g.advanceOpponent();
      expect(g.phase).toBe('ronDecision');
      if (WAITS.has(g.ronTile!.kind)) hits++;
      // 相手は山から引いた牌をそのまま捨てる
      expect(g.oppRiver.at(-1)?.tsumogiri).toBe(true);
    }
    expect(hits / N).toBeGreaterThan(0.22);
    expect(hits / N).toBeLessThan(0.28);
  });

  it('自分のツモが待ち牌になるのは約25%', () => {
    const N = 2000;
    let hits = 0;
    let trials = 0;
    for (let seed = 1; seed <= N; seed++) {
      const g = riichiWithSeed(seed);
      g.advanceOpponent();
      g.ronTile = { id: nextId++, kind: P('5s')[0] }; // ロン判断はアガれない牌に差し替えて次のツモへ
      g.pass();
      expect(g.phase).toBe('playerDecision');
      trials++;
      if (WAITS.has(g.pendingDraw!.kind)) hits++;
    }
    expect(hits / trials).toBeGreaterThan(0.22);
    expect(hits / trials).toBeLessThan(0.28);
  });

  it('リーチ前の相手の捨て牌は山の並びどおり（先頭をツモる）', () => {
    const g = makeGame('1m2m3m4m7p9p', '3s', {}, '5s1p');
    g.discard(tileOf(g, P('7p')[0]).id);
    g.advanceOpponent();
    expect(g.handKinds.at(-1)).toBe(P('1p')[0]); // 相手が5索、自分が1筒（並びどおり）
  });

  it('待ち牌が山に無ければアガリ牌は出ない', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const g = riichiWithSeed(seed);
      g.wall = g.wall.filter((t) => !WAITS.has(t.kind));
      g.advanceOpponent();
      expect(WAITS.has(g.ronTile!.kind)).toBe(false);
    }
  });
});

describe('流局', () => {
  it('各自 maxTurns 巡で流局', () => {
    const g = makeGame('1m2m3m4m7p9p', '3s', { maxTurns: 3 });
    let guard = 0;
    while (g.phase !== 'ended' && guard++ < 50) {
      if (g.phase === 'playerDiscard') {
        // ノーテンを保つため、手の中で最も孤立した牌…ではなく単純に右端（時間切れ）で進める
        g.timeout();
      } else if (g.phase === 'opponentTurn') {
        g.advanceOpponent();
      }
    }
    // 時間切れでリーチ漏れになる可能性があるので、終了理由は流局かリーチ漏れ
    expect(['ryuukyoku', 'missedRiichi']).toContain(g.end?.reason);
    if (g.end?.reason === 'ryuukyoku') {
      expect(g.turn).toBe(3);
      expect(g.oppTurn).toBe(3);
    }
  });
});

describe('相手の打牌', () => {
  it('相手は手牌を持たず、山の先頭をそのまま捨てる（リーチ前）', () => {
    const g = makeGame('1m2m3m4m7p9p', '3s', {}, '5s1p8s');
    g.discard(tileOf(g, P('7p')[0]).id);
    g.advanceOpponent();
    expect(g.oppRiver.map((r) => r.tile.kind)).toEqual(P('5s'));
    expect(g.oppRiver[0].tsumogiri).toBe(true);
  });
});

describe('牌の数（1色・2色・3色）', () => {
  const kindsIn = (g: Game) => new Set([...g.wall.map((t) => t.kind), ...g.handKinds.filter((k) => k !== HAKU)]);

  it('3色は萬筒索108枚、2色は筒索72枚（萬子抜き）、1色は筒子36枚', () => {
    for (const [suits, total, min, max] of [
      [3, 108, 0, 26],
      [2, 72, 9, 26],
      [1, 36, 9, 17],
    ] as const) {
      for (const n of [7, 10, 13] as const) {
        const g = new Game({ settings: { ...DEFAULT_SETTINGS, handSize: n, suits }, rng: mulberry32(n + suits) });
        expect(g.wall.length + n).toBe(total);
        for (const k of kindsIn(g)) {
          expect(k).toBeGreaterThanOrEqual(min);
          expect(k).toBeLessThanOrEqual(max);
        }
      }
    }
  });

  it('待ちは山にある種類だけ（1色は筒子9種、無限単騎も9種）', () => {
    const g = new Game({ settings: { ...DEFAULT_SETTINGS, suits: 1 }, rng: mulberry32(3) });
    expect(g.rules.drawable).toEqual(Array.from({ length: 9 }, (_, i) => 9 + i));
    expect(waitKinds(P('123p456p5z'), g.rules)).toHaveLength(9);
    expect(waitKinds(P('123p456p5z'))).toHaveLength(27);
  });

  it('山が足りなければ流局巡目を短くする（1色13枚は各自12巡、7枚は15巡）', () => {
    const g13 = new Game({ settings: { ...DEFAULT_SETTINGS, handSize: 13, suits: 1 }, rng: mulberry32(1) });
    expect(g13.wall.length).toBe(23);
    expect(g13.maxTurns).toBe(12);
    const g7 = new Game({ settings: { ...DEFAULT_SETTINGS, handSize: 7, suits: 1 }, rng: mulberry32(1) });
    expect(g7.maxTurns).toBe(15);
    const g3 = new Game({ settings: { ...DEFAULT_SETTINGS, handSize: 13, suits: 3 }, rng: mulberry32(1) });
    expect(g3.maxTurns).toBe(18);
  });

  it('1色13枚でも時間切れだけで流局まで進み、山を使い切る前に止まる', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = new Game({ settings: { ...DEFAULT_SETTINGS, handSize: 13, suits: 1 }, rng: mulberry32(seed) });
      let guard = 0;
      while (g.phase !== 'ended' && guard++ < 200) {
        if (g.phase === 'opponentTurn') g.advanceOpponent();
        else g.timeout();
      }
      expect(g.phase).toBe('ended');
      expect(g.turn).toBeLessThanOrEqual(g.maxTurns);
    }
  });

  it('最終巡（短くした巡数）はリーチできない', () => {
    const g = new Game({ settings: { ...DEFAULT_SETTINGS, handSize: 13, suits: 1 }, rng: mulberry32(1) });
    g.turn = g.maxTurns;
    expect(g.canDeclareRiichi).toBe(false);
  });
});

describe('手牌の枚数（7・10・13）', () => {
  for (const n of [10, 13] as const) {
    it(`${n}枚：配牌・山の枚数`, () => {
      const g = new Game({ settings: { ...DEFAULT_SETTINGS, handSize: n }, rng: mulberry32(5) });
      expect(g.hand).toHaveLength(n + 1);
      expect(g.handKinds.filter((k) => k === HAKU)).toHaveLength(1);
      expect(g.wall.length).toBe(108 - n);
    });

    it(`${n}枚：時間切れだけで局を最後まで進められる`, () => {
      for (let seed = 1; seed <= 5; seed++) {
        const g = new Game({ settings: { ...DEFAULT_SETTINGS, handSize: n }, rng: mulberry32(seed) });
        let guard = 0;
        while (g.phase !== 'ended' && guard++ < 200) {
          if (g.phase === 'opponentTurn') g.advanceOpponent();
          else g.timeout();
        }
        expect(g.phase).toBe('ended');
        expect(g.hand.length).toBe(n);
      }
    });
  }

  it('13枚はチートイツありのルールで判定する', () => {
    expect(new Game({ settings: { ...DEFAULT_SETTINGS, handSize: 13 }, rng: mulberry32(1) }).rules.chiitoi).toBe(true);
    expect(new Game({ settings: { ...DEFAULT_SETTINGS, handSize: 10 }, rng: mulberry32(1) }).rules.chiitoi).toBe(false);
  });
});
