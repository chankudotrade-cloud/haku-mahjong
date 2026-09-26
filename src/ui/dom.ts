type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | null | undefined>;

/** 小さな DOM 生成ヘルパー。on* は addEventListener、真偽値属性は true のときだけ付ける */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (key.startsWith('on') && typeof v === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), v);
    } else if (v === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el: HTMLElement, children: (Child | Child[])[]): void {
  for (const c of children) {
    if (Array.isArray(c)) append(el, c);
    else if (c == null || c === false) continue;
    else el.append(c instanceof Node ? c : String(c));
  }
}
