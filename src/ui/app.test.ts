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
    const stats = JSON.parse(localStorage.getItem('haku-mahjong:stats')!);
    expect(stats.rounds).toBe(1);
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
