export declare function crc32(bytes: Uint8Array): number;
export interface ZipEntry {
    name: string;
    data: string | Uint8Array;
}
export declare function zip(files: ZipEntry[]): Uint8Array<ArrayBuffer>;
//# sourceMappingURL=zip.d.ts.map