import {
  HAND_SIZES,
  SUIT_COUNTS,
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

export const TITLE = '1人用 白マイティ麻雀';

/** オープニングに出すルール */
const RULES = [
  '白はオールマイティです。',
  '7枚・10枚はチートイツなし',
  'テンパイしたら必ずリーチしてください',
  '一番多い待ちを選んでください',
  'フリテンリーチは禁止です',
  '役はありません',
];

export interface OpeningHandlers {
  onStart(): void;
  onSettingsChange(s: GameSettings): void;
  onResetStats(): void;
}

/** 牌の色数の説明 */
const SUIT_LABELS: Record<number, string> = { 1: '1色', 2: '2色', 3: '3色' };

/** 横並びの選択ボタン（ラジオ） */
function segmented<T extends number>(
  label: string,
  values: readonly T[],
  current: T,
  text: (v: T) => string,
  dataAttr: string,
  onPick: (v: T) => void,
): HTMLElement {
  return h(
    'div',
    { class: 'setting size-select', role: 'radiogroup', 'aria-label': label },
    h('span', {}, label),
    h(
      'div',
      { class: 'segmented' },
      values.map((v) =>
        h(
          'button',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': String(v === current),
            class: v === current ? 'seg active' : 'seg',
            [dataAttr]: v,
            onclick: () => onPick(v),
          },
          text(v),
        ),
      ),
    ),
  );
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

function statsEl(stats: Stats, mode: string, onReset: () => void): HTMLElement {
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
  // 成績は折りたたまずに常に表示する
  return h(
    'section',
    { class: 'stats' },
    h('h2', {}, `成績（${mode}）`),
    h('dl', {}, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn-clear',
        'data-action': 'clear-stats',
        onclick: () => {
          if (confirm(`${mode}の成績をクリアしますか？（元に戻せません）`)) onReset();
        },
      },
      `成績クリア（${mode}）`,
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
      h('h1', {}, TITLE),
      h('p', { class: 'tagline' }, '1シャンテンに強くなるための練習ゲームです。'),
      h(
        'ul',
        { class: 'rules' },
        RULES.map((r) => h('li', {}, r)),
      ),
      segmented('手牌の枚数', HAND_SIZES, s.handSize, (n) => `${n}枚`, 'data-hand-size', (n) => update({ handSize: n })),
      segmented('牌の数', SUIT_COUNTS, s.suits, (n) => SUIT_LABELS[n], 'data-suits', (n) => update({ suits: n })),
      h('p', { class: 'setting-note' }, '3色＝萬子・筒子・索子 / 2色＝筒子・索子 / 1色＝筒子のみ'),
      slider('打牌秒数', s.discardSeconds, DISCARD_SECONDS, (v) => update({ discardSeconds: clampDiscardSeconds(v) })),
      slider('リーチ後の判断秒数', s.decisionSeconds, DECISION_SECONDS, (v) => update({ decisionSeconds: clampDecisionSeconds(v) })),
      h(
        'details',
        { class: 'advanced' },
        h('summary', {}, '詳細設定'),
        h('label', { class: 'setting' }, h('span', {}, '流局巡目'), turns),
      ),
      h('button', { class: 'btn btn-primary btn-start', onclick: () => hd.onStart() }, 'スタート'),
      statsEl(stats, `${s.handSize}枚・${SUIT_LABELS[s.suits]}`, hd.onResetStats),
      h(
        'p',
        { class: 'credit' },
        '牌画像：',
        h('a', { href: 'https://mj-king.net/sozai/', target: '_blank', rel: 'noopener' }, '麻雀王国 麻雀素材'),
      ),
    ),
  );
}
