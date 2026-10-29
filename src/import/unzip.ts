/**
 * Minimal zip reader for .xlsx files: reads the central directory and inflates entries with the
 * browser's DecompressionStream('deflate-raw'), so no inflate code is bundled.
 */

export interface ZipEntry {
    name: string;
    method: number;
    compressedSize: number;
    offset: number;
}

const decoder = new TextDecoder();

/** Entries of a zip file, by name. */
export function listZip(bytes: Uint8Array): Map<string, ZipEntry> {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // the end of central directory record is in the last 64 kB (after an optional comment)
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_558); i--) {
        if (view.getUint32(i, true) === 0x06054b50) {
            end = i;
            break;
        }
    }
    if (end === -1) throw new Error('Not a zip file');
    const count = view.getUint16(end + 10, true);
    let position = view.getUint32(end + 16, true);
    const entries = new Map<string, ZipEntry>();
    for (let n = 0; n < count; n++) {
        if (view.getUint32(position, true) !== 0x02014b50) throw new Error('Broken zip directory');
        const method = view.getUint16(position + 10, true);
        const compressedSize = view.getUint32(position + 20, true);
        const nameLength = view.getUint16(position + 28, true);
        const extraLength = view.getUint16(position + 30, true);
        const commentLength = view.getUint16(position + 32, true);
        const offset = view.getUint32(position + 42, true);
        const name = decoder.decode(bytes.subarray(position + 46, position + 46 + nameLength));
        entries.set(name, { name, method, compressedSize, offset });
        position += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
}

/** Text content of an entry. */
export async function readZipText(bytes: Uint8Array, entry: ZipEntry): Promise<string> {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(entry.offset, true) !== 0x04034b50) throw new Error(`Broken zip entry ${entry.name}`);
    const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
    const data = bytes.subarray(start, start + entry.compressedSize);
    if (entry.method === 0) return decoder.decode(data);
    if (entry.method !== 8) throw new Error(`Unsupported zip compression ${entry.method}`);
    if (typeof DecompressionStream === 'undefined') throw new Error('Reading .xlsx needs DecompressionStream (a current browser or Node 18+)');
    const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(controller) {
            // slice() copies into a plain ArrayBuffer, which the stream needs
            controller.enqueue(data.slice());
            controller.close();
        }
    });
    return new Response(source.pipeThrough(new DecompressionStream('deflate-raw'))).text();
}
