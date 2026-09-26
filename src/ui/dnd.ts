/**
 * 手牌のドラッグ＆ドロップ（マウス・タッチ共通の Pointer Events）。
 * 少し動かすとドラッグ、動かさずに離すとタップ（＝打牌）。
 */
export interface HandDnDOptions {
  onTap(index: number): void;
  onReorder(from: number, to: number): void;
  canDrag(index: number): boolean;
}

const DRAG_THRESHOLD = 8;

export function attachHandDnD(container: HTMLElement, opts: HandDnDOptions): void {
  container.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-hand-index]');
    if (!el || !container.contains(el)) return;
    e.preventDefault();
    const from = Number(el.dataset.handIndex);
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    let to = from;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // jsdom 等では未対応
    }

    const tiles = () => [...container.querySelectorAll<HTMLElement>('[data-hand-index]')];
    const clearMarks = () => {
      for (const t of tiles()) t.classList.remove('drop-before', 'drop-after');
    };

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragging) {
        if (!opts.canDrag(from) || Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        dragging = true;
        el.classList.add('dragging');
      }
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      // 挿入位置：ポインタより右にある最初の牌の前
      const others = tiles().filter((t) => t !== el);
      let ins = tiles().length;
      for (const t of others) {
        const r = t.getBoundingClientRect();
        if (ev.clientX < r.left + r.width / 2) {
          ins = Number(t.dataset.handIndex);
          break;
        }
      }
      to = ins > from ? ins - 1 : ins;
      clearMarks();
      const target = others.find((t) => Number(t.dataset.handIndex) === ins);
      if (target) target.classList.add('drop-before');
      else others.at(-1)?.classList.add('drop-after');
    };

    const finish = (ev: PointerEvent, cancelled: boolean) => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      clearMarks();
      el.classList.remove('dragging');
      el.style.transform = '';
      if (cancelled) return;
      if (dragging) {
        if (to !== from) opts.onReorder(from, to);
      } else if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) {
        opts.onTap(from);
      }
    };
    const onUp = (ev: PointerEvent) => finish(ev, false);
    const onCancel = (ev: PointerEvent) => finish(ev, true);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
  });
}
