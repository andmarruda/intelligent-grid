/**
 * Tiny element factory. Text always goes through textContent, never innerHTML.
 *   h('button', {class: 'x', onclick: fn, title: 'Hi'}, 'Label')
 */
export type Attributes = Record<string, unknown>;
export type Child = Node | string | number | null | undefined | false | Child[];
export declare function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attributes | null, ...children: Child[]): HTMLElementTagNameMap[K];
export declare function clear(element: Element): void;
//# sourceMappingURL=dom.d.ts.map