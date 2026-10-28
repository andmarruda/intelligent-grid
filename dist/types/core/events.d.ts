/**
 * Event emitter used by the grid. Handlers receive an event object:
 *   { type, detail, grid, defaultPrevented, preventDefault() }
 * Events whose name starts with "before" are cancelable, and handlers may change event.detail
 * (for example beforeCellChange can rewrite detail.value before it is stored).
 */
import type { GridEvent, GridEventHandler } from '../types.js';
import type { IntelligentGrid } from '../ui/grid.js';
export declare class Emitter {
    private owner;
    private handlers;
    constructor(owner: IntelligentGrid);
    on(type: string, handler: GridEventHandler): () => void;
    once(type: string, handler: GridEventHandler): () => void;
    off(type: string, handler?: GridEventHandler): void;
    /**
     * @return the event, check event.defaultPrevented for "before*" events
     */
    emit<T>(type: string, detail: T): GridEvent<T>;
}
//# sourceMappingURL=events.d.ts.map