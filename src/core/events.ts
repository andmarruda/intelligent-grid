/**
 * Event emitter used by the grid. Handlers receive an event object:
 *   { type, detail, grid, defaultPrevented, preventDefault() }
 * Events whose name starts with "before" are cancelable, and handlers may change event.detail
 * (for example beforeCellChange can rewrite detail.value before it is stored).
 */
import type { GridEvent, GridEventHandler } from '../types.ts';
import type { IntelligentGrid } from '../ui/grid.ts';

export class Emitter {
    private owner: IntelligentGrid;
    private handlers = new Map<string, Set<GridEventHandler>>();

    constructor(owner: IntelligentGrid) {
        this.owner = owner;
    }

    on(type: string, handler: GridEventHandler): () => void {
        let set = this.handlers.get(type);
        if (!set) {
            set = new Set();
            this.handlers.set(type, set);
        }
        set.add(handler);
        return () => this.off(type, handler);
    }

    once(type: string, handler: GridEventHandler): () => void {
        const off = this.on(type, event => {
            off();
            handler(event);
        });
        return off;
    }

    off(type: string, handler?: GridEventHandler): void {
        if (!handler) this.handlers.delete(type);
        else this.handlers.get(type)?.delete(handler);
    }

    /**
     * @return the event, check event.defaultPrevented for "before*" events
     */
    emit<T>(type: string, detail: T): GridEvent<T> {
        const event: GridEvent<T> = {
            type,
            detail,
            grid: this.owner,
            defaultPrevented: false,
            preventDefault() {
                this.defaultPrevented = true;
            }
        };
        for (const handler of [...(this.handlers.get(type) ?? []), ...(this.handlers.get('*') ?? [])]) {
            try {
                handler(event);
            } catch (e) {
                console.error(`[intelligent-grid] "${type}" handler failed`, e);
            }
        }
        return event;
    }
}
