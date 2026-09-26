import { describe, expect, it } from 'vitest';
import { analyzeTenpai, decompose, isAgari, isInfiniteTanki, remainingCount, waitDetails, waitKinds } from './hand';
import { CHUN, HATSU, HAKU, WALL_KINDS, parseKinds as P } from './tiles';

const NO_FIFTH = { allowHakuFifth: false };

describe('アガリ判定（白なし）', () => {
  it('2面子1雀頭はアガリ', () => {
    expect(isAgari(P('123m456p99s'))).toBe(true);
    expect(isAgari(P('111m66z777z'))).toBe(true); // 字牌の刻子
    expect(isAgari(P('111m66z77z'))).toBe(false); // 7枚はアガリではない
  });

  it('4トイツ形はアガリではない', () => {
    expect(isAgari(P('11m22p33s66z'))).toBe(false);
    expect(isAgari(P('1122m3344p'))).toBe(false);
    expect(isAgari(P('11m22m55m99m'))).toBe(false);
  });

  it('4トイツでも2面子1雀頭と読めればアガリ（112233萬+44筒）', () => {
    expect(isAgari(P('112233m44p'))).toBe(true);
    const d = decompose(P('112233m44p'));
    expect(d.some((x) => x.melds.every((m) => m.type === 'shuntsu'))).toBe(true);
  });

  it('字牌で順子は作れない', () => {
    expect(isAgari(P('67z5z123m99p'))).toBe(false); // 發中白を順子にしない
    expect(isAgari(P('89s6z123m99p'))).toBe(false); // 8索9索發を順子にしない
    expect(isAgari(P('9m1p2p123s99s'))).toBe(false); // スートをまたがない
  });
});

describe('白を含むアガリ判定', () => {
  it('白が雀頭の片割れになる', () => {
    const d = decompose(P('123m456m9p5z'));
    expect(d.length).toBeGreaterThan(0);
    expect(d.some((x) => x.hakuAs === P('9p')[0] && x.pair.tiles.some((t) => t.haku))).toBe(true);
  });

  it('白が順子の中張・端・辺になる', () => {
    expect(decompose(P('13m5z456p99s')).map((d) => d.hakuAs)).toContain(P('2m')[0]);
    expect(decompose(P('12m5z456p99s')).map((d) => d.hakuAs)).toContain(P('3m')[0]);
    expect(decompose(P('89m5z456p99s')).map((d) => d.hakuAs)).toContain(P('7m')[0]);
  });

  it('白が字牌（發・中）になる', () => {
    expect(decompose(P('66z5z123m99p')).map((d) => d.hakuAs)).toContain(HATSU);
    expect(decompose(P('7z5z123m456s')).map((d) => d.hakuAs)).toContain(CHUN);
  });

  it('白を含む8枚は白を必ずどこかに使う', () => {
    for (const d of decompose(P('123m45m99p5z'))) expect(d.hakuAs).not.toBeNull();
    expect(isAgari(P('123m46m99p5z'))).toBe(true); // 白=5萬
    expect(isAgari(P('123m47m99p5z'))).toBe(false);
  });

  it('白は同じ牌の5枚目として扱える（設定でオフにできる）', () => {
    // 1萬4枚＋白：白を1萬として使うしかない
    const hand = P('1111m5z234p');
    expect(isAgari(hand)).toBe(true);
    expect(isAgari(hand, NO_FIFTH)).toBe(false);
    // 5枚目扱いをしなくてもアガれる形は、オフでもアガリ
    expect(isAgari(P('1111m23m9p5z'), NO_FIFTH)).toBe(true);
  });

  it('白を2枚以上含む手はエラー', () => {
    expect(() => decompose([HAKU, HAKU, ...P('123m456m')])).toThrow();
  });
});

describe('7枚形の待ち計算', () => {
  it('白なしの多面待ち（2345678萬 → 258萬）', () => {
    expect(waitKinds(P('2345678m'))).toEqual(P('258m'));
  });

  it('白を含む多面待ち（23456萬9筒白 → 147萬9筒）', () => {
    expect(waitKinds(P('23456m9p5z'))).toEqual(P('147m9p'));
  });

  it('字牌は山に無いので待ちにならない（發123萬45筒白 → 36筒のみ）', () => {
    expect(waitKinds(P('6z123m45p5z'))).toEqual(P('36p'));
  });

  it('待ち計算は全29種について1枚足したアガリ判定と一致する（網羅性）', () => {
    const hands = ['23456m9p5z', '1112345m', '1233345p', '11m123p66z5z', '2468m57p5z', '13579m5z9s'];
    for (const h of hands) {
      const hand7 = P(h);
      const brute: number[] = [];
      for (let x = 0; x < WALL_KINDS; x++) {
        if (hand7.filter((k) => k === x).length < 4 && isAgari([...hand7, x])) brute.push(x);
      }
      expect(waitKinds(hand7)).toEqual(brute);
    }
  });

  it('1112345萬 → 2356萬（複合形の多面待ち）', () => {
    expect(waitKinds(P('1112345m'))).toEqual(P('2356m'));
  });

  it('手の内に4枚ある牌は待ちにしない', () => {
    expect(waitKinds(P('1111m23m5z'))).not.toContain(P('1m')[0]);
  });

  it('待ち詳細の残り枚数は見えている牌を除いた枚数', () => {
    const hand7 = P('23456m9p5z');
    const visible = [...hand7, ...P('9p9p7m')];
    const w = waitDetails(hand7, visible);
    expect(w.map((x) => x.kind)).toEqual(P('147m9p'));
    expect(w.find((x) => x.kind === P('9p')[0])!.remaining).toBe(1);
    expect(w.find((x) => x.kind === P('7m')[0])!.remaining).toBe(3);
    expect(w.every((x) => x.decomps.length > 0)).toBe(true);
    expect(remainingCount(P('1m')[0], visible)).toBe(4);
  });
});

describe('無限単騎・フリテン', () => {
  it('2面子＋白は無限単騎で、山の全種類（数牌27種）が待ちになる', () => {
    const hand7 = P('123m456p5z');
    expect(isInfiniteTanki(hand7)).toBe(true);
    expect(waitKinds(hand7)).toHaveLength(WALL_KINDS);
    const st = analyzeTenpai(hand7, []);
    expect(st.infinite).toBe(true);
    expect(st.riichiable).toBe(false);
  });

  it('無限単騎でない白入りテンパイ', () => {
    expect(isInfiniteTanki(P('23456m9p5z'))).toBe(false);
    expect(analyzeTenpai(P('23456m9p5z'), P('1s')).riichiable).toBe(true);
  });

  it('待ち牌が河にあればフリテン', () => {
    const st = analyzeTenpai(P('23456m9p5z'), P('1s7m'));
    expect(st.furiten).toBe(true);
    expect(st.furitenTiles).toEqual(P('7m'));
    expect(st.riichiable).toBe(false);
  });

  it('ノーテン', () => {
    const st = analyzeTenpai(P('2345m9p1s5z'), []);
    expect(st.tenpai).toBe(false);
    expect(st.riichiable).toBe(false);
  });
});

describe('10枚・13枚（アガリ11枚・14枚）', () => {
  const CHIITOI = { allowHakuFifth: true, chiitoi: true };

  it('11枚は3面子＋雀頭、14枚は4面子＋雀頭', () => {
    expect(isAgari(P('123m456p789s11m'))).toBe(true);
    expect(isAgari(P('123m456p78s11m5z'))).toBe(true); // 白＝9索
    expect(isAgari(P('123m456p789s111s22m'))).toBe(true);
    expect(isAgari(P('123m456p789s111s2m5z'))).toBe(true); // 白＝2萬（雀頭）
    expect(isAgari(P('123m456p789s13s'))).toBe(false);
  });

  it('10枚形では対子5組＋1枚はアガリではない', () => {
    expect(isAgari(P('11m33m55p77p99s1s'))).toBe(false);
  });

  it('チートイツ：種類の違う対子7組はアガリ（ルールありのときだけ）', () => {
    const h = P('1133m5577p2299s44s');
    expect(isAgari(h, CHIITOI)).toBe(true);
    expect(isAgari(h)).toBe(false);
    const d = decompose(h, CHIITOI).find((x) => x.chiitoi)!;
    expect([d.pair, ...d.melds]).toHaveLength(7);
    expect(d.hakuAs).toBeNull();
  });

  it('チートイツ：白は1枚の牌と組んで対子になる', () => {
    const d = decompose(P('1133m5577p2299s4s5z'), CHIITOI).find((x) => x.chiitoi);
    expect(d?.hakuAs).toBe(P('4s')[0]);
  });

  it('チートイツ：同じ牌4枚は2組の対子にしない', () => {
    expect(decompose(P('1111m33p55p77s99s22p'), CHIITOI).some((d) => d.chiitoi)).toBe(false);
  });

  it('チートイツは14枚のときだけ（8枚の4トイツは対象外）', () => {
    expect(isAgari(P('11m22p33s99m'), CHIITOI)).toBe(false);
  });

  it('13枚の待ち：チートイツの単騎待ち', () => {
    expect(waitKinds(P('1133m5577p2299s4s'), CHIITOI)).toEqual(P('4s'));
    expect(waitKinds(P('1133m5577p2299s4s'))).toEqual([]);
  });

  it('13枚の待ち：多面待ちも網羅する（1枚足したアガリ判定と一致）', () => {
    for (const hs of ['123m456p2345678s', '1112345678999m', '123m456p78s1122s5z', '1133m5577p229s4s5z']) {
      const hand = P(hs);
      expect(hand).toHaveLength(13);
      const brute: number[] = [];
      for (let x = 0; x < WALL_KINDS; x++) {
        if (hand.filter((k) => k === x).length < 4 && isAgari([...hand, x], CHIITOI)) brute.push(x);
      }
      expect(waitKinds(hand, CHIITOI)).toEqual(brute);
    }
    expect(waitKinds(P('1112345678999m'))).toEqual(P('123456789m')); // 九蓮宝燈形は9面待ち
  });

  it('無限単騎：4面子＋白、チートイツの対子6組＋白', () => {
    expect(isInfiniteTanki(P('123m456m789p123s5z'))).toBe(true);
    expect(waitKinds(P('123m456m789p123s5z'))).toHaveLength(WALL_KINDS);
    expect(isInfiniteTanki(P('1133m5577p2299s5z'), CHIITOI)).toBe(true);
    expect(isInfiniteTanki(P('1133m5577p2299s5z'))).toBe(false);
    expect(analyzeTenpai(P('1133m5577p2299s5z'), [], CHIITOI).riichiable).toBe(false);
  });
});
