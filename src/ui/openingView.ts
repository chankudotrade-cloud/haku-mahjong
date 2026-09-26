import {
  HAND_SIZES,
  DECISION_SECONDS,
  DISCARD_SECONDS,
  MAX_TURNS,
  clampDecisionSeconds,
  clampDiscardSeconds,
  clampMaxTurns,
  type GameSettings,
} from '../core/settings';
import { summarize, type Stats } from '../core/stats';
import { HAKU } from '../core/tiles';
import { h } from './dom';
import { tileEl } from './tile';

export interface OpeningHandlers {
  onStart(): void;
  onSettingsChange(s: GameSettings): void;
  onResetStats(): void;
}

function slider(
  label: string,
  value: number,
  range: { min: number; max: number },
  onChange: (v: number) => void,
): HTMLElement {
  const out = h('output', {}, `${value}秒`);
  const input = h('input', { type: 'range', min: range.min, max: range.max, step: 1, value });
  input.addEventListener('input', () => {
    out.textContent = `${input.value}秒`;
    onChange(Number(input.value));
  });
  return h('label', { class: 'setting' }, h('span', {}, label), input, out);
}

const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
const num = (v: number | null) => (v === null ? '—' : v.toFixed(1));

function statsEl(stats: Stats, handSize: number, onReset: () => void): HTMLElement {
  const s = summarize(stats);
  const rows: [string, string][] = [
    ['局数', `${s.rounds}`],
    ['アガリ率', pct(s.winRate)],
    ['平均アガリ巡目', num(s.avgWinTurn)],
    ['平均リーチ巡目', num(s.avgRiichiTurn)],
    ['リーチ漏れ', `${s.missedRiichi}回`],
    ['ノーテンリーチ', `${s.notenRiichi}回`],
    ['フリテンリーチ', `${s.furitenRiichi}回`],
    ['最大枚数でないリーチ', `${s.notBestRiichi}回`],
    ['見逃し', `${s.missedWin}回`],
    ['誤宣言', `${s.falseDeclaration}回`],
    ['最善打牌一致率', pct(s.bestRate)],
  ];
  return h(
    'details',
    { class: 'stats' },
    h('summary', {}, `成績（${handSize}枚）`),
    h('dl', {}, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
    h(
      'button',
      {
        class: 'btn-link',
        onclick: () => {
          if (confirm(`${handSize}枚の成績をリセットしますか？`)) onReset();
        },
      },
      '成績をリセット',
    ),
  );
}

export function renderOpeningView(settings: GameSettings, stats: Stats, hd: OpeningHandlers): HTMLElement {
  let s = { ...settings };
  const update = (patch: Partial<GameSettings>) => {
    s = { ...s, ...patch };
    hd.onSettingsChange(s);
  };
  const turns = h('input', { type: 'number', min: MAX_TURNS.min, max: MAX_TURNS.max, value: s.maxTurns });
  turns.addEventListener('change', () => {
    const v = clampMaxTurns(turns.value);
    turns.value = String(v);
    update({ maxTurns: v });
  });

  return h(
    'div',
    { class: 'screen opening' },
    h(
      'div',
      { class: 'opening-card' },
      h('div', { class: 'logo' }, tileEl(HAKU, { size: 'lg' })),
      h('h1', {}, '白オールマイティ', h('br'), h('small', {}, '2人麻雀・多面待ち練習')),
      h('p', { class: 'rules' }, '白は何にでもなれる。面子と雀頭でアガリ（13枚はチートイツも）。テンパイしたら必ずリーチ、待ちは自分で読む。'),
      h(
        'div',
        { class: 'setting size-select', role: 'radiogroup', 'aria-label': '手牌の枚数' },
        h('span', {}, '手牌の枚数'),
        h(
          'div',
          { class: 'segmented' },
          HAND_SIZES.map((n) =>
            h(
              'button',
              {
                type: 'button',
                role: 'radio',
                'aria-checked': String(n === s.handSize),
                class: n === s.handSize ? 'seg active' : 'seg',
                'data-hand-size': n,
                onclick: () => update({ handSize: n }),
              },
              `${n}枚`,
            ),
          ),
        ),
      ),
      slider('打牌秒数', s.discardSeconds, DISCARD_SECONDS, (v) => update({ discardSeconds: clampDiscardSeconds(v) })),
      slider('リーチ後の判断秒数', s.decisionSeconds, DECISION_SECONDS, (v) => update({ decisionSeconds: clampDecisionSeconds(v) })),
      h(
        'details',
        { class: 'advanced' },
        h('summary', {}, '詳細設定'),
        h('label', { class: 'setting' }, h('span', {}, '流局巡目'), turns),
      ),
      h('button', { class: 'btn btn-primary btn-start', onclick: () => hd.onStart() }, 'スタート'),
      statsEl(stats, s.handSize, hd.onResetStats),
      h(
        'p',
        { class: 'credit' },
        '牌画像：',
        h('a', { href: 'https://mj-king.net/sozai/', target: '_blank', rel: 'noopener' }, '麻雀王国 麻雀素材'),
      ),
    ),
  );
}
