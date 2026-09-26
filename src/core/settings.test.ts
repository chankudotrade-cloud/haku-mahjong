import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  autoDiscardIndex,
  clampDecisionSeconds,
  clampDiscardSeconds,
  discardTimeLimit,
  firstTurnSeconds,
  normalizeSettings,
} from './settings';
import { parseKinds as P } from './tiles';

describe('打牌秒数', () => {
  it('初期値は15秒', () => {
    expect(DEFAULT_SETTINGS.discardSeconds).toBe(15);
    expect(clampDiscardSeconds(undefined)).toBe(15);
    expect(clampDiscardSeconds('abc')).toBe(15);
  });
  it('5〜60秒に制限される', () => {
    expect(clampDiscardSeconds(1)).toBe(5);
    expect(clampDiscardSeconds(61)).toBe(60);
    expect(clampDiscardSeconds(60)).toBe(60);
    expect(clampDiscardSeconds(12)).toBe(12);
    expect(clampDiscardSeconds('7')).toBe(7);
  });
  it('1巡目は15秒（設定が15秒超ならその値）', () => {
    expect(firstTurnSeconds(5)).toBe(15);
    expect(firstTurnSeconds(15)).toBe(15);
    expect(firstTurnSeconds(18)).toBe(18);
    expect(discardTimeLimit(1, 5)).toBe(15);
    expect(discardTimeLimit(2, 5)).toBe(5);
    expect(discardTimeLimit(1, 20)).toBe(20);
  });
});

describe('判断秒数', () => {
  it('初期値は3秒', () => {
    expect(DEFAULT_SETTINGS.decisionSeconds).toBe(3);
    expect(clampDecisionSeconds(null)).toBe(3);
  });
  it('1〜10秒に制限される', () => {
    expect(clampDecisionSeconds(0)).toBe(1);
    expect(clampDecisionSeconds(11)).toBe(10);
    expect(clampDecisionSeconds(4)).toBe(4);
  });
});

describe('設定の復元', () => {
  it('壊れた値は範囲内に直す', () => {
    expect(normalizeSettings({ discardSeconds: 99, decisionSeconds: -3, maxTurns: 'x', allowHakuFifth: 'no' })).toEqual({
      discardSeconds: 60,
      decisionSeconds: 1,
      maxTurns: 18,
      allowHakuFifth: true,
    });
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
  it('白の5枚目扱いは常に可（保存値が不可でも可に戻す）', () => {
    expect(normalizeSettings({ allowHakuFifth: false }).allowHakuFifth).toBe(true);
  });
});

describe('時間切れの打牌位置', () => {
  it('右端の牌', () => {
    expect(autoDiscardIndex(P('123m456p5z9s'))).toBe(7);
  });
  it('右端が白なら右から2番目', () => {
    expect(autoDiscardIndex(P('123m456p9s5z'))).toBe(6);
  });
});
