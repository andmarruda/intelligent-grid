/**
 * Backend for the server examples (npm run demo): 100 000 orders kept in a sorla-db collection on
 * the server, queried with the same find() JSON the grid sends (the "where" parameter).
 *
 *   GET  /api/orders?offset=0&limit=100&sort=[...]&where={...}&search=...   one page as JSON
 *   GET  /api/orders/stream                                                 every row over SSE, in blocks
 *   WS   /ws/orders                                                         pages ({type: 'load'}) and pushed changes
 */
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { WebSocketServer } from 'ws';
import { orders } from '../examples/data.js';

const require = createRequire(import.meta.url);
const Sorla = require('sorla-db') as new () => {
    useDb(name: string): void;
    db: Record<string, unknown> & { createCollection(name: string): void };
};

interface Collection {
    insertMany(rows: Record<string, unknown>[]): unknown[];
    updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): unknown;
    find(query: Record<string, unknown>): { sort(spec: Record<string, 1 | -1>): unknown; ids(): unknown[]; toArray(): Record<string, unknown>[]; skip(n: number): unknown; limit(n: number): unknown; length: number };
    findOne(query: Record<string, unknown>): Record<string, unknown> | null;
    count(): number;
}

const TOTAL = 100_000;
const BLOCK = 5_000;

const sorla = new Sorla();
sorla.useDb('demo');
sorla.db.createCollection('orders');
const collection = sorla.db.orders as Collection;
collection.insertMany(orders(TOTAL).map(row => ({ ...row, _id: row.id })));

interface PageParams {
    offset?: number;
    limit?: number;
    sort?: Array<{ field: string; dir: 'asc' | 'desc' }>;
    where?: Record<string, unknown>;
    search?: string;
}

/** One page of the orders, filtered and sorted by sorla-db like the grid would do it locally. */
function page({ offset = 0, limit = 100, sort = [], where = {}, search = '' }: PageParams): { rows: Record<string, unknown>[]; hasMore: boolean; total: number } {
    const needle = search.trim().toLowerCase();
    // the search box looks at the text columns
    const query = needle
        ? { $and: [where, { $or: ['product', 'city', 'status'].map(field => ({ [field]: { $regex: needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } })) }] }
        : where;
    const cursor = collection.find(query) as ReturnType<Collection['find']>;
    if (sort.length) cursor.sort(Object.fromEntries(sort.map(s => [s.field, s.dir === 'desc' ? -1 : 1])));
    const total = cursor.length;
    cursor.skip(offset);
    cursor.limit(limit);
    // toArray() copies only this page (sorla-db 1.6+)
    const rows = cursor.toArray().map(({ _id, ...row }) => row);
    return { rows, hasMore: offset + rows.length < total, total };
}

const json = (value: string | null, fallback: unknown) => {
    if (!value) return fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** @return true when the request was an API call */
export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname === '/api/orders') {
        // a little latency, so the loading state is visible
        await wait(250);
        const result = page({
            offset: Number(url.searchParams.get('offset') ?? 0),
            limit: Math.min(1000, Number(url.searchParams.get('limit') ?? 100)),
            sort: json(url.searchParams.get('sort'), []),
            where: json(url.searchParams.get('where'), {}),
            search: url.searchParams.get('search') ?? ''
        });
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
        return true;
    }

    if (url.pathname === '/api/orders/stream') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        // each block has its number as id: a reconnection continues after the last block received
        let block = Number(req.headers['last-event-id'] ?? 0);
        res.write(`retry: 2000\nevent: meta\ndata: ${JSON.stringify({ total: TOTAL })}\n\n`);
        const all = (collection.find({}) as ReturnType<Collection['find']>).toArray();
        while (!res.destroyed) {
            const start = block * BLOCK;
            if (start >= all.length) {
                res.end(`event: end\ndata: ${JSON.stringify({ total: all.length })}\n\n`);
                break;
            }
            const rows = all.slice(start, start + BLOCK).map(({ _id, ...row }) => row);
            block++;
            const ok = res.write(`id: ${block}\nevent: rows\ndata: ${JSON.stringify(rows)}\n\n`);
            // wait for "drain" when the browser reads slower than the server writes
            if (!ok) await new Promise(resolve => res.once('drain', resolve));
            // slow enough to watch the blocks arrive
            await wait(60);
        }
        return true;
    }

    return false;
}

/** WebSocket endpoint: replies to {type: 'load'} and pushes a changed order every few seconds. */
export function attachSockets(server: Server): void {
    const sockets = new WebSocketServer({ server, path: '/ws/orders' });
    sockets.on('connection', socket => {
        socket.on('message', raw => {
            let message: { type?: string; id?: number } & PageParams;
            try {
                message = JSON.parse(String(raw));
            } catch {
                return;
            }
            if (message.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
            else if (message.type === 'load') socket.send(JSON.stringify({ type: 'reply', id: message.id, ...page(message) }));
            else socket.send(JSON.stringify({ type: 'error', id: message.id, message: `Unknown request "${message.type}"` }));
        });
    });

    // another user changes an order: every client gets the new row
    setInterval(() => {
        if (!sockets.clients.size) return;
        const id = 1 + Math.floor(Math.random() * 200);
        const current = collection.findOne({ _id: id });
        if (!current) return;
        const qty = 1 + Math.floor(Math.random() * 20);
        const status = ['open', 'shipped', 'done'][Math.floor(Math.random() * 3)];
        collection.updateOne({ _id: id }, { $set: { qty, status } });
        const { _id, ...row } = collection.findOne({ _id: id })!;
        const message = JSON.stringify({ type: 'rows', rows: [row] });
        for (const client of sockets.clients) client.send(message);
    }, 3000).unref();
}
