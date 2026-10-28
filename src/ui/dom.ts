/**
 * Tiny element factory. Text always goes through textContent, never innerHTML.
 *   h('button', {class: 'x', onclick: fn, title: 'Hi'}, 'Label')
 */
export type Attributes = Record<string, unknown>;
export type Child = Node | string | number | null | undefined | false | Child[];

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attributes | null = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs ?? {})) {
        if (value === undefined || value === null || value === false) continue;
        if (key === 'class') element.className = String(value);
        else if (key === 'text') element.textContent = String(value);
        else if (key === 'style' && typeof value === 'object') Object.assign(element.style, value);
        else if (key === 'dataset' && typeof value === 'object') Object.assign(element.dataset, value);
        else if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2), value as EventListener);
        else if (key in element && typeof value !== 'string') (element as unknown as Record<string, unknown>)[key] = value;
        else element.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of (children as unknown[]).flat(Infinity) as Array<Node | string | number | null | undefined | false>) {
        if (child === null || child === undefined || child === false) continue;
        element.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return element;
}

export function clear(element: Element): void {
    while (element.firstChild) element.firstChild.remove();
}
