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
    const stats = JSON.parse(localStorage.getItem('haku-mahjong:stats-by-mode')!);
    expect(stats['7-3'].rounds).toBe(1);
    expect(stats['10-3'].rounds).toBe(0);
    expect(stats['7-1'].rounds).toBe(0);
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
    expect(root.querySelector('.stats h2')?.textContent).toBe('成績（7枚・3色）');
    click(root.querySelector('[data-hand-size="13"]'));
    expect(root.querySelector('[data-hand-size="13"]')?.classList.contains('active')).toBe(true);
    expect(root.querySelector('.stats h2')?.textContent).toBe('成績（13枚・3色）');
    expect(JSON.parse(localStorage.getItem('haku-mahjong:settings')!).handSize).toBe(13);
    click(root.querySelector('.btn-start'));
    expect(root.querySelectorAll('[data-hand-index]')).toHaveLength(14);
  });
});

describe('オープニングのタイトルとルール', () => {
  it('タイトル・説明・ルールを表示する', () => {
    const root = document.createElement('div');
    new App(root).start();
    expect(root.querySelector('.opening h1')?.textContent).toBe('1人用 白マイティ麻雀');
    expect(root.querySelector('.tagline')?.textContent).toBe('1シャンテンに強くなるための練習ゲームです。');
    expect([...root.querySelectorAll('.rules li')].map((li) => li.textContent)).toEqual([
      '白はオールマイティです。',
      '7枚・10枚はチートイツなし',
      'テンパイしたら必ずリーチしてください',
      '一番多い待ちを選んでください',
      'フリテンリーチは禁止です',
      '役はありません',
      'カンはできません',
      '鳴きはできません',
    ]);
  });
});

describe('成績クリア', () => {
  const stats = () => JSON.parse(localStorage.getItem('haku-mahjong:stats-by-mode') ?? '{}');
  const seed = () =>
    localStorage.setItem(
      'haku-mahjong:stats-by-mode',
      JSON.stringify({ '7-3': { rounds: 3, wins: 1 }, '10-3': { rounds: 2 }, '13-3': { rounds: 5 }, '10-1': { rounds: 6 } }),
    );

  it('成績は常に表示され、クリアボタンがある', () => {
    seed();
    const root = document.createElement('div');
    new App(root).start();
    expect(root.querySelector('details.stats')).toBeNull();
    expect(root.querySelector('.stats dl')?.textContent).toContain('局数3');
    expect(root.querySelector('[data-action="clear-stats"]')?.textContent).toBe('成績クリア（7枚・3色）');
  });

  it('確認でOKすると、選んでいる枚数の成績だけを消す', () => {
    seed();
    const root = document.createElement('div');
    new App(root).start();
    click(root.querySelector('[data-hand-size="10"]'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    click(root.querySelector('[data-action="clear-stats"]'));
    expect(stats()['10-3'].rounds).toBe(0);
    expect(stats()['7-3'].rounds).toBe(3);
    expect(stats()['13-3'].rounds).toBe(5);
    expect(stats()['10-1'].rounds).toBe(6);
    expect(root.querySelector('.stats dl')?.textContent).toContain('局数0');
  });

  it('確認でキャンセルすると消さない', () => {
    seed();
    const root = document.createElement('div');
    new App(root).start();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    click(root.querySelector('[data-action="clear-stats"]'));
    expect(root.querySelector('.stats dl')?.textContent).toContain('局数3');
  });
});

describe('牌の数の選択', () => {
  it('手牌の枚数の下に 1色・2色・3色 があり、初期値は3色。選ぶと保存され、成績の表示も切り替わる', () => {
    const root = document.createElement('div');
    new App(root).start();
    const labels = [...root.querySelectorAll('.opening .size-select > span')].map((x) => x.textContent);
    expect(labels).toEqual(['手牌の枚数', '牌の数']);
    expect([...root.querySelectorAll('[data-suits]')].map((b) => b.textContent)).toEqual(['1色', '2色', '3色']);
    expect(root.querySelector('[data-suits="3"]')?.classList.contains('active')).toBe(true);
    click(root.querySelector('[data-suits="1"]'));
    expect(JSON.parse(localStorage.getItem('haku-mahjong:settings')!).suits).toBe(1);
    expect(root.querySelector('.stats h2')?.textContent).toBe('成績（7枚・1色）');
    click(root.querySelector('.btn-start'));
    // 1色は筒子のみ（相手の手牌の表示は無い）
    const kinds = [...root.querySelectorAll('[data-hand] [data-kind]')].map((x) => Number(x.getAttribute('data-kind')));
    expect(kinds.filter((k) => k !== 29).every((k) => k >= 9 && k <= 17)).toBe(true);
    expect(root.querySelector('.opp-hand')).toBeNull();
  });
});

describe('ツモ牌の表示タイミング', () => {
  it('相手が捨ててから0.3秒後に自分のツモ牌が出る（それまでは打牌もリーチもできない）', async () => {
    const { mulberry32 } = await import('../core/tiles');
    vi.spyOn(Math, 'random').mockImplementation(mulberry32(11));
    const root = document.createElement('div');
    new App(root).start();
    click(root.querySelector('.btn-start'));
    // 左端の白以外の牌を切る
    const first = [...root.querySelectorAll<HTMLElement>('[data-hand-index]')].find((t) => !t.classList.contains('haku'))!;
    first.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 0, clientY: 0 }));
    first.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: 0, clientY: 0 }));
    expect(root.querySelector('.end')).toBeNull();
    expect(root.querySelectorAll('[data-hand-index]')).toHaveLength(7);

    vi.advanceTimersByTime(500); // 相手が捨てる
    expect(root.querySelectorAll('.opp-river .tile')).toHaveLength(1);
    expect(root.querySelectorAll('[data-hand-index]')).toHaveLength(7); // まだツモ牌は出ない
    expect(root.querySelector('[data-action="riichi"]')).toBeNull();
    expect(root.querySelector('.timer.idle')).not.toBeNull();

    vi.advanceTimersByTime(250);
    expect(root.querySelectorAll('[data-hand-index]')).toHaveLength(7);

    vi.advanceTimersByTime(60); // 0.3秒たった
    expect(root.querySelectorAll('[data-hand-index]')).toHaveLength(8);
    expect(root.querySelector('[data-hand-index="7"]')?.classList.contains('drawn-gap')).toBe(true);
    expect(root.querySelector('[data-action="riichi"]')).not.toBeNull();
    expect(root.querySelector('.timer.idle')).toBeNull(); // 打牌タイマーはここから
  });
});
