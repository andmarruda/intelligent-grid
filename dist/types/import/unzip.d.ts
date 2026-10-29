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
/** Entries of a zip file, by name. */
export declare function listZip(bytes: Uint8Array): Map<string, ZipEntry>;
/** Text content of an entry. */
export declare function readZipText(bytes: Uint8Array, entry: ZipEntry): Promise<string>;
//# sourceMappingURL=unzip.d.ts.map