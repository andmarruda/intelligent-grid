/**
 * Minimal ZIP writer (stored entries, no compression) — enough for XLSX packages without a dependency.
 */
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

export function crc32(bytes: Uint8Array): number {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xFF]! ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

export interface ZipEntry {
    name: string;
    data: string | Uint8Array;
}

export function zip(files: ZipEntry[]): Uint8Array<ArrayBuffer> {
    const encoder = new TextEncoder();
    const entries = files.map(file => {
        const name = encoder.encode(file.name);
        const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
        return { name, data, crc: crc32(data) };
    });

    const localSize = entries.reduce((acc, e) => acc + 30 + e.name.length + e.data.length, 0);
    const centralSize = entries.reduce((acc, e) => acc + 46 + e.name.length, 0);
    const out = new Uint8Array(localSize + centralSize + 22);
    const view = new DataView(out.buffer);
    // fixed DOS timestamp (1980-01-01): keeps the output deterministic
    const time = 0;
    const date = (0 << 9) | (1 << 5) | 1;

    let offset = 0;
    const offsets: number[] = [];
    for (const e of entries) {
        offsets.push(offset);
        view.setUint32(offset, 0x04034b50, true);
        view.setUint16(offset + 4, 20, true);
        view.setUint16(offset + 6, 0x0800, true); // UTF-8 names
        view.setUint16(offset + 8, 0, true);
        view.setUint16(offset + 10, time, true);
        view.setUint16(offset + 12, date, true);
        view.setUint32(offset + 14, e.crc, true);
        view.setUint32(offset + 18, e.data.length, true);
        view.setUint32(offset + 22, e.data.length, true);
        view.setUint16(offset + 26, e.name.length, true);
        view.setUint16(offset + 28, 0, true);
        out.set(e.name, offset + 30);
        out.set(e.data, offset + 30 + e.name.length);
        offset += 30 + e.name.length + e.data.length;
    }

    const centralStart = offset;
    entries.forEach((e, i) => {
        view.setUint32(offset, 0x02014b50, true);
        view.setUint16(offset + 4, 20, true);
        view.setUint16(offset + 6, 20, true);
        view.setUint16(offset + 8, 0x0800, true);
        view.setUint16(offset + 10, 0, true);
        view.setUint16(offset + 12, time, true);
        view.setUint16(offset + 14, date, true);
        view.setUint32(offset + 16, e.crc, true);
        view.setUint32(offset + 20, e.data.length, true);
        view.setUint32(offset + 24, e.data.length, true);
        view.setUint16(offset + 28, e.name.length, true);
        view.setUint32(offset + 42, offsets[i]!, true);
        out.set(e.name, offset + 46);
        offset += 46 + e.name.length;
    });

    view.setUint32(offset, 0x06054b50, true);
    view.setUint16(offset + 8, entries.length, true);
    view.setUint16(offset + 10, entries.length, true);
    view.setUint32(offset + 12, offset - centralStart, true);
    view.setUint32(offset + 16, centralStart, true);
    return out;
}
