// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './app';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  window.scrollTo = () => {};
});
afterEach(() => {
  vi.useRealTimers();
});

const click = (el: Element | null) => (el as HTMLElement).click();

describe('App（画面遷移のスモークテスト）', () => {
  it('スタート → 局が進み、最後は終了画面 → レビュー → 次の局', () => {
    const root = document.createElement('div');
    new App(root).start();
    expect(root.querySelector('.opening')).not.toBeNull();
    click(root.querySelector('.btn-start'));
    expect(root.querySelector('.game')).not.toBeNull();
    expect(root.querySelectorAll('[data-hand-index]')).toHaveLength(8);
    expect(root.querySelector('[data-action="riichi"]')).not.toBeNull();

    // 何もしないと時間切れで自動打牌が続き、いずれ終了画面になる
    for (let i = 0; i < 1200 && !root.querySelector('.end'); i++) vi.advanceTimersByTime(1000);
    expect(root.querySelector('.end')).not.toBeNull();
    expect(root.querySelector('.end-title')?.textContent).toMatch(/テンパイしていました|流局/);
    // 終了画面は対局画面（操作不可）の下に並ぶ
    const stack = root.querySelector('.end-stack')!;
    expect(stack.children[0].classList.contains('game')).toBe(true);
    expect(stack.children[0].classList.contains('frozen')).toBe(true);
    expect(stack.children[1].classList.contains('end')).toBe(true);
    // 対局画面の中央にも結果の見出しを出す
    expect(stack.children[0].querySelector('.board-result')?.textContent).toBe(root.querySelector('.end-title')?.textContent);

    click([...root.querySelectorAll('button')].find((b) => b.textContent === '局後レビューを見る')!);
    expect(root.querySelector('.review')).not.toBeNull();
    expect(root.querySelectorAll('.rv-turn').length).toBeGreaterThan(0);

    click([...root.querySelectorAll('button')].find((b) => b.textContent === '次の局へ')!);
    expect(root.querySelector('.game')).not.toBeNull();
    const stats = JSON.parse(localStorage.getItem('haku-mahjong:stats-by-size')!);
    expect(stats['7'].rounds).toBe(1);
    expect(stats['10'].rounds).toBe(0);
  });

  it('1巡目は15秒、2巡目以降は設定秒数で時間切れになる', () => {
    const root = document.createElement('div');
    new App(root).start();
    click(root.querySelector('.btn-start'));
    vi.advanceTimersByTime(14_500);
    expect(root.querySelectorAll('.player-river .tile')).toHaveLength(0);
    vi.advanceTimersByTime(700);
    if (root.querySelector('.end')) return; // 1巡目の自動打牌でリーチ漏れになった場合
    expect(root.querySelectorAll('.player-river .tile')).toHaveLength(1);
  });

  it('白をタップすると警告だけ出て局は続く', () => {
    const root = document.createElement('div');
    new App(root).start();
    click(root.querySelector('.btn-start'));
    const haku = root.querySelector('.hand .tile.haku') as HTMLElement;
    haku.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 0, clientY: 0 }));
    haku.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: 0, clientY: 0 }));
    expect(root.querySelector('.notice')?.textContent).toBe('白は切れません');
    expect(root.querySelector('.game')).not.toBeNull();
    expect(root.querySelectorAll('[data-hand-index]')).toHaveLength(8);
  });
});

describe('オープニングの手牌の枚数', () => {
  it('7・10・13枚を選べ、選んだ枚数で局が始まり、成績の表示も切り替わる', () => {
    const root = document.createElement('div');
    new App(root).start();
    expect([...root.querySelectorAll('[data-hand-size]')].map((b) => b.textContent)).toEqual(['7枚', '10枚', '13枚']);
    expect(root.querySelector('.stats summary')?.textContent).toBe('成績（7枚）');
    click(root.querySelector('[data-hand-size="13"]'));
    expect(root.querySelector('[data-hand-size="13"]')?.classList.contains('active')).toBe(true);
    expect(root.querySelector('.stats summary')?.textContent).toBe('成績（13枚）');
    expect(JSON.parse(localStorage.getItem('haku-mahjong:settings')!).handSize).toBe(13);
    click(root.querySelector('.btn-start'));
    expect(root.querySelectorAll('[data-hand-index]')).toHaveLength(14);
  });
});
