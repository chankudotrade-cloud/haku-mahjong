/**
 * 1局分の進行（UI から独立した状態機械）。
 * 時間の管理は UI 側が行い、時間切れになったら timeout() を呼ぶ。
 */
import {
  analyzeTenpai,
  decompose,
  isAgari,
  waitDetails,
  waitKinds,
  type Decomposition,
  type RuleOptions,
  type WaitInfo,
} from './hand';
import { analyzeTurn, type TurnAnalysis } from './review';
import { RON_CHANCE, TSUMO_CHANCE, autoDiscardIndex, discardTimeLimit, type GameSettings } from './settings';
import { HAKU, buildWallKinds, removeOne, shuffle, sortTiles, type Kind, type Rng, type Tile } from './tiles';

export type Phase =
  | 'playerDiscard' // リーチ前：ツモ後の打牌選択（打牌タイマー）
  | 'playerDecision' // リーチ後：ツモ牌に対して ツモ / ツモ切り（判断タイマー）
  | 'ronDecision' // リーチ後：相手の捨て牌に対して ロン / スルー（判断タイマー）
  | 'opponentTurn' // 相手の手番（UI が少し待って advanceOpponent を呼ぶ）
  | 'ended';

export interface RiverTile {
  tile: Tile;
  /** リーチ宣言牌（横向き表示） */
  riichi: boolean;
  tsumogiri: boolean;
}

export type EndReason =
  | 'win'
  | 'missedRiichi'
  | 'notenRiichi'
  | 'furitenRiichi'
  | 'notBestRiichi'
  | 'missedWin'
  | 'falseDeclaration'
  | 'ryuukyoku';

export interface NotenOption {
  discard: Kind;
  waits: WaitInfo[];
  furiten: boolean;
  infinite: boolean;
}

export interface EndInfo {
  reason: EndReason;
  turn: number;
  riichiTurn: number | null;
  /** 該当時点の7枚 */
  hand7: Kind[];
  /** 紹介する待ち（リーチ時点の残り枚数） */
  waits: WaitInfo[];
  winTile?: Kind;
  winBy?: 'tsumo' | 'ron';
  winDecomps?: Decomposition[];
  missedTile?: Kind;
  missedBy?: 'tsumo' | 'ron';
  missedByTimeout?: boolean;
  declaredTile?: Kind;
  declaredBy?: 'tsumo' | 'ron';
  furitenTiles?: Kind[];
  infinite?: boolean;
  /** リーチ漏れ・ノーテンリーチで切った牌 */
  discard?: Kind;
  /** ノーテンリーチ：宣言時の8枚と、テンパイに取れた打牌 */
  hand8?: Kind[];
  notenOptions?: NotenOption[];
  /** 最大枚数でないリーチ：待ち枚数が最大になる打牌とその形 */
  bestOptions?: BestOption[];
}

export interface BestOption {
  discard: Kind;
  hand7: Kind[];
  waits: WaitInfo[];
}

export interface TurnRecord {
  turn: number;
  /** discard=リーチ前の打牌 / afterRiichi=リーチ後のツモ切り */
  kind: 'discard' | 'afterRiichi';
  /** 打牌前の手牌（表示順）。リーチ後は7枚 */
  hand: Kind[];
  drawn: Kind;
  discard: Kind;
  riichi: boolean;
  auto: boolean;
  analysis?: TurnAnalysis;
}

export type DiscardResult = 'ok' | 'haku' | 'invalid';

export interface GameOptions {
  settings: GameSettings;
  rng?: Rng;
  /** 山の並び（先頭から プレイヤー6枚・相手7枚・以降ツモ順）。テスト用に差し替え可能 */
  makeWall?: (rng: Rng) => Kind[];
}

const defaultWall = (rng: Rng) => shuffle(buildWallKinds(), rng);
const kindsOf = (tiles: readonly { kind: Kind }[]) => tiles.map((t) => t.kind);
const riverKinds = (river: readonly RiverTile[]) => river.map((r) => r.tile.kind);

export class Game {
  readonly settings: GameSettings;
  readonly rules: RuleOptions;
  private readonly rng: Rng;

  wall: Tile[] = [];
  /** プレイヤーの手牌（表示順）。リーチ前の打牌選択中はツモ牌を含む8枚 */
  hand: Tile[] = [];
  /** リーチ前のツモ牌の id（右端に少し離して表示する） */
  drawnId: number | null = null;
  /** リーチ後のツモ牌（手牌には入れない） */
  pendingDraw: Tile | null = null;
  /** リーチ後にロン判断中の相手の捨て牌 */
  ronTile: Tile | null = null;
  oppHand: Tile[] = [];
  playerRiver: RiverTile[] = [];
  oppRiver: RiverTile[] = [];
  /** プレイヤーの巡目（ツモった回数） */
  turn = 0;
  oppTurn = 0;
  riichi = false;
  riichiTurn: number | null = null;
  /** 「リーチ」ボタンが押され、宣言牌の選択待ち */
  riichiMode = false;
  riichiSnapshot: { hand7: Kind[]; waits: WaitInfo[] } | null = null;
  phase: Phase = 'playerDiscard';
  end: EndInfo | null = null;
  log: TurnRecord[] = [];
  dealCount = 0;

  constructor(opts: GameOptions) {
    this.settings = opts.settings;
    this.rules = { allowHakuFifth: opts.settings.allowHakuFifth };
    this.rng = opts.rng ?? Math.random;
    const makeWall = opts.makeWall ?? defaultWall;
    for (;;) {
      this.dealCount++;
      const tiles = makeWall(this.rng).map((kind, id) => ({ id, kind }));
      const haku: Tile = { id: tiles.length, kind: HAKU };
      const player6 = tiles.slice(0, 6);
      const first = tiles[13];
      // 配牌＋第1ツモがアガリ形なら配り直す（天和防止）。
      // 相手の配牌がテンパイでも配り直す（ツモ切りすれば必ずノーテンに戻れるようにするため）
      const opp7 = kindsOf(tiles.slice(6, 13));
      if (isAgari(kindsOf([...player6, haku, first]), this.rules) || waitKinds(opp7, this.rules).length > 0) {
        if (this.dealCount > 10000) throw new Error('配牌を作れません');
        continue;
      }
      // 自動理牌（白は最初は右端）。ツモ牌はその右に置く
      this.hand = [...sortTiles(player6), haku, first];
      this.drawnId = first.id;
      this.oppHand = tiles.slice(6, 13);
      this.wall = tiles.slice(14);
      this.turn = 1;
      break;
    }
  }

  get handKinds(): Kind[] {
    return kindsOf(this.hand);
  }

  get isLastTurn(): boolean {
    return this.turn >= this.settings.maxTurns;
  }

  /** この打牌でリーチできるか（最終巡はリーチ不可） */
  get canDeclareRiichi(): boolean {
    return this.phase === 'playerDiscard' && !this.riichi && !this.isLastTurn;
  }

  /** 現在の打牌の持ち時間（秒） */
  discardTimeLimit(): number {
    return discardTimeLimit(this.turn, this.settings.discardSeconds);
  }

  setRiichiMode(on: boolean): boolean {
    if (on && !this.canDeclareRiichi) return false;
    if (this.phase !== 'playerDiscard') return false;
    this.riichiMode = on;
    return true;
  }

  /**
   * 白の移動：from の白を取り出し、取り出した後の配列の to 番目に入れる。
   * 白以外の牌は自動理牌されるので動かせない。
   */
  reorder(from: number, to: number): void {
    if (this.phase === 'ended') return;
    const n = this.hand.length;
    if (from < 0 || from >= n || to < 0 || to >= n || from === to) return;
    if (this.hand[from].kind !== HAKU) return;
    const [t] = this.hand.splice(from, 1);
    this.hand.splice(to, 0, t);
  }

  /**
   * 自動理牌：白以外を並べ直し、白の位置は次のように保つ（ツモ牌は基準にしない）。
   *   右端にある白 → 右端のまま / 左端にある白 → 左端のまま / 途中にある白 → 左隣の牌のすぐ右
   */
  private resort(): void {
    const hakuIdx = this.hand.findIndex((t) => t.kind === HAKU);
    const others = sortTiles(this.hand.filter((t) => t.kind !== HAKU));
    if (hakuIdx >= 0) {
      const settled = (t: Tile) => t.kind !== HAKU && t.id !== this.drawnId;
      const left = this.hand.slice(0, hakuIdx).filter(settled);
      const rightCount = this.hand.slice(hakuIdx + 1).filter(settled).length;
      let pos: number;
      if (rightCount === 0) pos = others.length;
      else if (left.length === 0) pos = 0;
      else pos = others.indexOf(left[left.length - 1]) + 1;
      others.splice(pos, 0, this.hand[hakuIdx]);
    }
    this.hand = others;
  }

  private visibleWith(hand: readonly Kind[]): Kind[] {
    return [...hand, ...riverKinds(this.playerRiver), ...riverKinds(this.oppRiver)];
  }

  private finish(info: Omit<EndInfo, 'turn' | 'riichiTurn'>): void {
    this.end = { turn: this.turn, riichiTurn: this.riichiTurn, ...info };
    this.phase = 'ended';
    this.riichiMode = false;
  }

  discard(tileId: number, auto = false): DiscardResult {
    if (this.phase !== 'playerDiscard') return 'invalid';
    const idx = this.hand.findIndex((t) => t.id === tileId);
    if (idx < 0) return 'invalid';
    const tile = this.hand[idx];
    if (tile.kind === HAKU) return 'haku';

    const declaring = this.riichiMode && this.canDeclareRiichi;
    const hand8 = this.handKinds;
    const riverBefore = riverKinds(this.playerRiver);
    const drawnTile = this.hand.find((t) => t.id === this.drawnId);
    const analysis = analyzeTurn(hand8, tile.kind, riverBefore, riverKinds(this.oppRiver), this.rules);
    this.log.push({
      turn: this.turn,
      kind: 'discard',
      hand: hand8,
      drawn: drawnTile ? drawnTile.kind : tile.kind,
      discard: tile.kind,
      riichi: declaring,
      auto,
      analysis,
    });

    this.hand.splice(idx, 1);
    this.resort();
    this.playerRiver.push({ tile, riichi: declaring, tsumogiri: tile.id === this.drawnId });
    this.drawnId = null;
    this.riichiMode = false;

    const hand7 = this.handKinds;
    const visible = this.visibleWith(hand7);
    const status = analyzeTenpai(hand7, riverKinds(this.playerRiver), this.rules);

    if (declaring) {
      this.riichi = true;
      this.riichiTurn = this.turn;
      const waits = waitDetails(hand7, visible, this.rules);
      this.riichiSnapshot = { hand7, waits };
      // 宣言時の8枚＋両者の河（打牌後の7枚＋河 と同じ集合）
      const visible8 = [...hand8, ...riverBefore, ...riverKinds(this.oppRiver)];
      if (!status.tenpai) {
        const notenOptions = analysis.options
          .filter((o) => o.tenpai)
          .map((o) => ({
            discard: o.discard,
            waits: waitDetails(removeOne(hand8, o.discard), visible8, this.rules),
            furiten: o.furiten,
            infinite: o.infinite,
          }));
        this.finish({ reason: 'notenRiichi', hand7, waits: [], discard: tile.kind, hand8, notenOptions });
      } else if (status.infinite || status.furiten) {
        this.finish({
          reason: 'furitenRiichi',
          hand7,
          waits,
          furitenTiles: status.furitenTiles,
          infinite: status.infinite,
        });
      } else if (analysis.isBest === false) {
        // リーチできる打牌のうち、待ち枚数（見えていない枚数の合計）が最大でない
        const bestOptions = analysis.bestDiscards.map((d) => {
          const h7 = removeOne(hand8, d);
          return { discard: d, hand7: h7, waits: waitDetails(h7, visible8, this.rules) };
        });
        this.finish({ reason: 'notBestRiichi', hand7, waits, discard: tile.kind, hand8, bestOptions });
      } else {
        this.phase = 'opponentTurn';
      }
      return 'ok';
    }

    // リーチ義務：リーチできるテンパイなのにリーチしなかった
    if (!this.isLastTurn && status.riichiable) {
      this.finish({ reason: 'missedRiichi', hand7, waits: waitDetails(hand7, visible, this.rules), discard: tile.kind });
    } else {
      this.phase = 'opponentTurn';
    }
    return 'ok';
  }

  /** 時間切れ */
  timeout(): void {
    switch (this.phase) {
      case 'playerDiscard': {
        // リーチボタンを押していても、時間切れの自動打牌はリーチにしない
        this.riichiMode = false;
        const i = autoDiscardIndex(this.handKinds);
        this.discard(this.hand[i].id, true);
        break;
      }
      case 'ronDecision':
        this.pass(true);
        break;
      case 'playerDecision':
        this.tsumogiri(true);
        break;
      default:
        break;
    }
  }

  /** リーチ時の待ち牌 */
  private waitSet(): Set<Kind> {
    return new Set((this.riichiSnapshot?.waits ?? []).map((w) => w.kind));
  }

  /**
   * 山から1枚取る。リーチ後は win=true なら待ち牌、false なら待ち牌以外を山の中から選ぶ。
   * 該当する牌が山に無ければ山の先頭を取る。
   */
  private takeFromWall(win?: boolean): Tile | undefined {
    if (win === undefined) return this.wall.shift();
    const waits = this.waitSet();
    const i = this.wall.findIndex((t) => waits.has(t.kind) === win);
    if (i < 0) return this.wall.shift();
    return this.wall.splice(i, 1)[0];
  }

  /** 相手の手番（ツモって、テンパイにならない牌を切る） */
  advanceOpponent(): void {
    if (this.phase !== 'opponentTurn') return;
    this.oppTurn++;
    // リーチ後は RON_CHANCE の確率で待ち牌をツモらせてツモ切りさせる。それ以外は待ち牌を捨てさせない
    const giveWin = this.riichi ? this.rng() < RON_CHANCE : undefined;
    const drawn = this.takeFromWall(giveWin);
    if (!drawn) {
      this.finishRyuukyoku();
      return;
    }
    this.oppHand.push(drawn);
    const waits = this.waitSet();
    // テンパイにならないことを優先したうえで、待ち牌を切る／切らない を選ぶ
    const idx = chooseOpponentDiscard(
      kindsOf(this.oppHand),
      this.rng,
      this.rules,
      this.riichi ? (giveWin ? { prefer: waits } : { avoid: waits }) : {},
    );
    const [d] = this.oppHand.splice(idx, 1);
    this.oppRiver.push({ tile: d, riichi: false, tsumogiri: d.id === drawn.id });
    if (this.riichi) {
      this.ronTile = d;
      this.phase = 'ronDecision';
    } else {
      this.afterOpponent();
    }
  }

  private afterOpponent(): void {
    this.ronTile = null;
    if (this.turn >= this.settings.maxTurns && this.oppTurn >= this.settings.maxTurns) {
      this.finishRyuukyoku();
      return;
    }
    // リーチ後は TSUMO_CHANCE の確率で待ち牌、それ以外は待ち牌以外をツモる
    const t = this.takeFromWall(this.riichi ? this.rng() < TSUMO_CHANCE : undefined);
    if (!t) {
      this.finishRyuukyoku();
      return;
    }
    this.turn++;
    if (this.riichi) {
      this.pendingDraw = t;
      this.phase = 'playerDecision';
    } else {
      this.hand.push(t);
      this.drawnId = t.id;
      this.phase = 'playerDiscard';
    }
  }

  private finishRyuukyoku(): void {
    this.finish({ reason: 'ryuukyoku', hand7: this.handKinds, waits: this.riichiSnapshot?.waits ?? [] });
  }

  private canWinWith(k: Kind): boolean {
    return isAgari([...this.handKinds, k], this.rules);
  }

  private finishWin(k: Kind, by: 'tsumo' | 'ron'): void {
    this.finish({
      reason: 'win',
      hand7: this.handKinds,
      waits: this.riichiSnapshot?.waits ?? [],
      winTile: k,
      winBy: by,
      winDecomps: decompose([...this.handKinds, k], this.rules),
    });
  }

  private finishMissed(k: Kind, by: 'tsumo' | 'ron', byTimeout: boolean): void {
    this.finish({
      reason: 'missedWin',
      hand7: this.handKinds,
      waits: this.riichiSnapshot?.waits ?? [],
      missedTile: k,
      missedBy: by,
      missedByTimeout: byTimeout,
    });
  }

  private finishFalse(k: Kind, by: 'tsumo' | 'ron'): void {
    this.finish({
      reason: 'falseDeclaration',
      hand7: this.handKinds,
      waits: this.riichiSnapshot?.waits ?? [],
      declaredTile: k,
      declaredBy: by,
    });
  }

  /** ロン宣言。リーチ前・判断中でないときは受け付けない（false を返す） */
  declareRon(): boolean {
    if (!this.riichi || this.phase !== 'ronDecision' || !this.ronTile) return false;
    const k = this.ronTile.kind;
    if (this.canWinWith(k)) this.finishWin(k, 'ron');
    else this.finishFalse(k, 'ron');
    return true;
  }

  /** スルー（タイムアウトも同じ扱い）。アガれる牌なら見逃しで終了 */
  pass(byTimeout = false): boolean {
    if (this.phase !== 'ronDecision' || !this.ronTile) return false;
    const k = this.ronTile.kind;
    if (this.canWinWith(k)) this.finishMissed(k, 'ron', byTimeout);
    else this.afterOpponent();
    return true;
  }

  /** ツモ宣言。リーチ前・判断中でないときは受け付けない（false を返す） */
  declareTsumo(): boolean {
    if (!this.riichi || this.phase !== 'playerDecision' || !this.pendingDraw) return false;
    const k = this.pendingDraw.kind;
    if (this.canWinWith(k)) this.finishWin(k, 'tsumo');
    else this.finishFalse(k, 'tsumo');
    return true;
  }

  /** ツモ切り（タイムアウトも同じ扱い）。アガれる牌なら見逃しで終了 */
  tsumogiri(byTimeout = false): boolean {
    if (this.phase !== 'playerDecision' || !this.pendingDraw) return false;
    const t = this.pendingDraw;
    if (this.canWinWith(t.kind)) {
      this.finishMissed(t.kind, 'tsumo', byTimeout);
      return true;
    }
    this.log.push({
      turn: this.turn,
      kind: 'afterRiichi',
      hand: this.handKinds,
      drawn: t.kind,
      discard: t.kind,
      riichi: false,
      auto: byTimeout,
    });
    this.pendingDraw = null;
    this.playerRiver.push({ tile: t, riichi: false, tsumogiri: true });
    this.phase = 'opponentTurn';
    return true;
  }
}

/**
 * 相手の打牌：切った後の7枚がテンパイにならない牌を選ぶ（候補が複数ならランダム）。
 * prefer を渡すとその牌（プレイヤーの待ち牌）を優先して切り、avoid を渡すとできるだけ切らない。
 * どちらも「テンパイにならない」ことより優先はしない。
 */
export function chooseOpponentDiscard(
  hand8: readonly Kind[],
  rng: Rng,
  rules: RuleOptions,
  opts: { prefer?: ReadonlySet<Kind>; avoid?: ReadonlySet<Kind> } = {},
): number {
  const candidates: number[] = [];
  hand8.forEach((_, i) => {
    const rest = [...hand8.slice(0, i), ...hand8.slice(i + 1)];
    if (waitKinds(rest, rules).length === 0) candidates.push(i);
  });
  let pool = candidates.length ? candidates : hand8.map((_, i) => i);
  const { prefer, avoid } = opts;
  const narrowed = prefer ? pool.filter((i) => prefer.has(hand8[i])) : avoid ? pool.filter((i) => !avoid.has(hand8[i])) : pool;
  if (narrowed.length) pool = narrowed;
  return pool[Math.floor(rng() * pool.length)];
}
