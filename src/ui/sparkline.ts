/**
 * Sparklines: a small line, bar or win/loss chart of a list of numbers, drawn as inline SVG in a cell.
 */
import type { SparklineOptions } from '../types.ts';

const SVG = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>): SVGElementTagNameMap[K] {
    const element = document.createElementNS(SVG, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
    return element;
}

/** Numbers of a value: an array, or text such as "1, 2, 3". Other entries are skipped. */
export function sparklineValues(value: unknown): number[] {
    const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,;\s]+/) : [];
    return list.map(Number).filter(Number.isFinite);
}

export function sparkline(values: number[], { type = 'line', color, negativeColor, width = 100, height = 22, min, max }: SparklineOptions = {}): SVGSVGElement {
    const chart = svg('svg', { class: `ig-sparkline ig-sparkline-${type}`, width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': values.join(', ') });
    if (!values.length) return chart;
    const pad = 2;
    const inner = height - pad * 2;
    const stroke = color ?? 'currentColor';

    if (type === 'line') {
        const low = min ?? Math.min(...values);
        const high = max ?? Math.max(...values);
        const span = high - low || 1;
        const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
        const points = values.map((v, i) => [pad + i * step, pad + inner - ((v - low) / span) * inner] as const);
        chart.append(svg('polyline', { points: points.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '), fill: 'none', stroke, 'stroke-width': 1.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
        const last = points.at(-1)!;
        chart.append(svg('circle', { cx: last[0].toFixed(1), cy: last[1].toFixed(1), r: 2, fill: stroke }));
        return chart;
    }

    // bars and win/loss share a zero line; win/loss bars all have the same height
    const winLoss = type === 'winloss';
    const low = winLoss ? -1 : Math.min(0, min ?? Math.min(...values));
    const high = winLoss ? 1 : Math.max(0, max ?? Math.max(...values));
    const span = high - low || 1;
    const zero = pad + inner - ((0 - low) / span) * inner;
    const slot = (width - pad * 2) / values.length;
    values.forEach((raw, i) => {
        const v = winLoss ? Math.sign(raw) : raw;
        if (winLoss && v === 0) return;
        const y = pad + inner - ((v - low) / span) * inner;
        chart.append(svg('rect', {
            x: (pad + i * slot + slot * 0.15).toFixed(1),
            y: Math.min(y, zero).toFixed(1),
            width: Math.max(1, slot * 0.7).toFixed(1),
            height: Math.max(1, Math.abs(zero - y)).toFixed(1),
            fill: v < 0 ? negativeColor ?? 'var(--ig-negative)' : stroke
        }));
    });
    return chart;
}
