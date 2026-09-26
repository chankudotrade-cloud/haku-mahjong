import { Game } from '../core/game';
import { modeKey, type GameSettings } from '../core/settings';
import { EMPTY_STATS, recordRound, type StatsByMode } from '../core/stats';
import { loadSettings, loadStats, saveSettings, saveStats } from '../storage';
import { renderEndView } from './endView';
import { renderGameView, updateTimerEl, type GameViewState } from './gameView';
import { renderOpeningView } from './openingView';
import { renderReviewView } from './reviewView';

/** こちらが捨ててから相手が捨てるまでのウェイト（ms） */
const OPPONENT_DELAY = 500;
/** 相手が捨ててから（リーチ後はスルーしてから）自分のツモ牌を見せるまでのウェイト（ms） */
const DRAW_DELAY = 300;
const WARNING_MS = 1400;

export class App {
  private settings: GameSettings = loadSettings();
  private stats: StatsByMode = loadStats();
  private game: Game | null = null;
  private warning = '';
  private timer: { deadline: number; total: number; label: string } | null = null;
  private tickId: number | null = null;
  private oppId: number | null = null;
  private drawId: number | null = null;
  /** ツモ牌をまだ見せていない（相手が捨てた直後の DRAW_DELAY の間） */
  private concealDraw = false;
  private warnId: number | null = null;

  constructor(private readonly root: HTMLElement) {}

  start(): void {
    this.showOpening();
  }

  private clearTimers(): void {
    if (this.tickId !== null) clearInterval(this.tickId);
    if (this.oppId !== null) clearTimeout(this.oppId);
    if (this.drawId !== null) clearTimeout(this.drawId);
    this.tickId = null;
    this.oppId = null;
    this.drawId = null;
    this.timer = null;
    this.concealDraw = false;
  }

  private mount(el: HTMLElement): void {
    this.root.replaceChildren(el);
  }

  private showOpening(): void {
    this.clearTimers();
    this.game = null;
    this.mount(
      renderOpeningView(this.settings, this.stats[modeKey(this.settings)], {
        onStart: () => this.startGame(),
        onSettingsChange: (s) => {
          const modeChanged = modeKey(s) !== modeKey(this.settings);
          this.settings = s;
          saveSettings(s);
          // 成績は枚数×色数ごとなので、変えたら表示し直す
          if (modeChanged) this.showOpening();
        },
        onResetStats: () => {
          this.stats = { ...this.stats, [modeKey(this.settings)]: { ...EMPTY_STATS } };
          saveStats(this.stats);
          this.showOpening();
        },
      }),
    );
  }

  private startGame(): void {
    this.clearTimers();
    this.game = new Game({ settings: this.settings });
    this.warning = '';
    window.scrollTo(0, 0);
    this.enterPhase();
  }

  /**
   * 局面が変わるたびに呼ぶ：タイマーの張り直しと描画。
   * afterOpponent：相手が捨てた直後（リーチ後はスルー直後）なら、ツモ牌を DRAW_DELAY 遅らせて見せる
   */
  private enterPhase(afterOpponent = false): void {
    this.clearTimers();
    const g = this.game!;
    if (g.phase === 'ended') {
      const key = modeKey(g.settings);
      this.stats = { ...this.stats, [key]: recordRound(this.stats[key], g.end!, g.log) };
      saveStats(this.stats);
      this.showEnd();
      return;
    }
    if (g.phase === 'opponentTurn') {
      this.renderGame();
      this.oppId = window.setTimeout(() => {
        g.advanceOpponent();
        this.enterPhase(true);
      }, OPPONENT_DELAY);
      return;
    }
    const drawn = g.phase === 'playerDiscard' || g.phase === 'playerDecision';
    if (afterOpponent && drawn) {
      // ツモ牌を隠して描画し、少し待ってから見せる（打牌タイマーはツモ牌を見せてから）
      this.concealDraw = true;
      this.renderGame();
      this.drawId = window.setTimeout(() => this.enterPhase(), DRAW_DELAY);
      return;
    }
    const isDiscard = g.phase === 'playerDiscard';
    const secs = isDiscard ? g.discardTimeLimit() : g.settings.decisionSeconds;
    this.timer = { deadline: Date.now() + secs * 1000, total: secs, label: isDiscard ? '打牌' : '判断' };
    this.renderGame();
    this.tickId = window.setInterval(() => this.tick(), 100);
  }

  private timerState(): GameViewState['timer'] {
    if (!this.timer) return null;
    return { remaining: (this.timer.deadline - Date.now()) / 1000, total: this.timer.total, label: this.timer.label };
  }

  private tick(): void {
    const t = this.timerState();
    if (!t) return;
    if (t.remaining <= 0) {
      this.clearTimers();
      const wasRon = this.game!.phase === 'ronDecision';
      this.game!.timeout();
      this.enterPhase(wasRon);
      return;
    }
    updateTimerEl(this.root, t);
  }

  private setWarning(msg: string): void {
    this.warning = msg;
    if (this.warnId !== null) clearTimeout(this.warnId);
    this.warnId = window.setTimeout(() => {
      this.warning = '';
      const n = this.root.querySelector('.notice');
      if (n) {
        n.textContent = '';
        n.classList.remove('show');
      }
    }, WARNING_MS);
  }

  private renderGame(): void {
    const g = this.game!;
    this.mount(
      renderGameView(
        g,
        { warning: this.warning, timer: this.timerState(), concealDraw: this.concealDraw },
        {
          onTileTap: (i) => {
            if (this.concealDraw) return;
            const tile = g.hand[i];
            if (!tile) return;
            const res = g.discard(tile.id);
            if (res === 'haku') {
              // 警告のみ。局は続き、タイマーも止めない
              this.setWarning('白は切れません');
              this.renderGame();
            } else if (res === 'ok') {
              this.warning = '';
              this.enterPhase();
            }
          },
          onReorder: (from, to) => {
            g.reorder(from, to);
            this.renderGame();
          },
          onRiichiToggle: () => {
            if (this.concealDraw) return;
            g.setRiichiMode(!g.riichiMode);
            this.renderGame();
          },
          onRon: () => g.declareRon() && this.enterPhase(),
          onPass: () => g.pass() && this.enterPhase(true),
          onTsumo: () => !this.concealDraw && g.declareTsumo() && this.enterPhase(),
          onTsumogiri: () => !this.concealDraw && g.tsumogiri() && this.enterPhase(),
          onQuit: () => {
            if (confirm('この局を中断してタイトルに戻りますか？（成績には記録しません）')) this.showOpening();
          },
        },
      ),
    );
  }

  /** 終了画面：最終局面の対局画面（操作不可）を残し、その下に続けて表示する */
  private showEnd(): void {
    this.clearTimers();
    const noop = () => {};
    const board = renderGameView(
      this.game!,
      { warning: '', timer: null },
      {
        onTileTap: noop,
        onReorder: noop,
        onRiichiToggle: noop,
        onRon: noop,
        onPass: noop,
        onTsumo: noop,
        onTsumogiri: noop,
        onQuit: noop,
      },
    );
    const end = renderEndView(this.game!, {
      onReview: () => this.showReview(),
      onNext: () => this.startGame(),
      onTitle: () => this.showOpening(),
    });
    const wrap = document.createElement('div');
    wrap.className = 'end-stack';
    wrap.append(board, end);
    this.mount(wrap);
    // 対局画面が見える位置（先頭）に置く。結果の詳細は下へスクロールして見る
    window.scrollTo(0, 0);
  }

  private showReview(): void {
    window.scrollTo(0, 0);
    this.mount(
      renderReviewView(this.game!, {
        onBack: () => this.showEnd(),
        onNext: () => this.startGame(),
      }),
    );
  }
}
