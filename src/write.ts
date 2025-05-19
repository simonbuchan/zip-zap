import crc32 from "./crc32.js";

function toUtf8(str: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

export interface ZipEntryOptions {
  compressed?: boolean;
}

export interface BuildOptions {
  progress?: (bytesWritten: number, totalBytes: number) => void;
  entryProgress?: (
    index: number,
    bytesWritten: number,
    totalBytes: number,
  ) => void;
}

class ZipEntry {
  rawName: Uint8Array;
  flags = 0x0800; // UTF-8 encoding
  method = 8; // Deflate compression
  compressedSize = 0;
  uncompressedSize = 0;
  streamSizeGuess = 0;
  crc32 = 0;
  compressedStream: ReadableStream<Uint8Array>;
  progressCallback?: (bytesWritten: number, totalBytes: number) => void;

  constructor(
    name: string,
    stream: ReadableStream<Uint8Array>,
    streamSizeGuess: number = 0,
    options?: ZipEntryOptions,
  ) {
    this.streamSizeGuess = streamSizeGuess;

    const compressed = options?.compressed ?? true;

    this.rawName = toUtf8(name);
    this.method = compressed ? 8 : 0;
    const entry = this;
    this.compressedStream = stream.pipeThrough(
      new TransformStream<Uint8Array>({
        transform(chunk, controller) {
          entry.uncompressedSize += chunk.length;
          const totalBytes = Math.max(
            entry.streamSizeGuess,
            entry.uncompressedSize,
          );
          entry.progressCallback?.(entry.uncompressedSize, totalBytes);
          entry.crc32 = crc32(entry.crc32, chunk);
          controller.enqueue(chunk);
        },
      }),
    );
    if (compressed) {
      this.compressedStream = this.compressedStream.pipeThrough(
        new CompressionStream("deflate-raw"),
      );
    }
    this.compressedStream = this.compressedStream.pipeThrough(
      new TransformStream<Uint8Array>({
        transform(chunk, controller) {
          entry.compressedSize += chunk.length;
          controller.enqueue(chunk);
        },
      }),
    );
  }

  entrySize(): number {
    return 30 + this.rawName.length + this.compressedSize;
  }

  async entryParts(): Promise<BlobPart[]> {
    // stream data first so metadata is updated (via the TransformStreams)
    const data = await new Response(this.compressedStream).blob();

    const pathLength = this.rawName.length;
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true); // Local file header signature
    header.setUint16(4, 0x0014, true); // Version needed to extract
    header.setUint16(6, this.flags, true); // General purpose bit flag
    header.setUint16(8, this.method, true); // Compression method
    header.setUint16(10, 0x0000, true); // Last mod file time
    header.setUint16(12, 0x0000, true); // Last mod file date
    header.setUint32(14, this.crc32, true); // CRC-32
    header.setUint32(18, this.compressedSize, true); // Compressed size
    header.setUint32(22, this.uncompressedSize, true); // Uncompressed size
    header.setUint16(26, pathLength, true); // File name length
    header.setUint16(28, 0x0000, true); // Extra field length
    return [header, this.rawName, data];
  }

  directorySize(): number {
    return 46 + this.rawName.length;
  }

  directoryParts(entryHeaderOffset: number): BlobPart[] {
    const header = new DataView(new ArrayBuffer(46));
    header.setUint32(0, 0x02014b50, true); // Central directory file header signature
    header.setUint16(4, 0x0014, true); // Version made by
    header.setUint16(6, 0x0014, true); // Version needed to extract
    header.setUint16(8, this.flags, true); // General purpose bit flag
    header.setUint16(10, this.method, true); // Compression method
    header.setUint16(12, 0x0000, true); // Last mod file time
    header.setUint16(14, 0x0000, true); // Last mod file date
    header.setUint32(16, this.crc32, true); // CRC-32
    header.setUint32(20, this.compressedSize, true); // Compressed size
    header.setUint32(24, this.uncompressedSize, true); // Uncompressed size
    header.setUint16(28, this.rawName.length, true); // File name length
    header.setUint16(30, 0x0000, true); // Extra field length
    header.setUint16(32, 0x0000, true); // File comment length
    header.setUint16(34, 0x0000, true); // Disk number start
    header.setUint16(36, 0x0000, true); // Internal file attributes
    header.setUint32(38, 0x00000000, true); // External file attributes
    header.setUint32(42, entryHeaderOffset, true); // Relative offset of local file header
    return [header, this.rawName];
  }
}

export class ZipSource {
  static fromString(data: string): ZipSource {
    return ZipSource.fromBlob(new Blob([data], { type: "text/plain" }));
  }

  static fromBlob(blob: Blob): ZipSource {
    return new ZipSource(blob.stream(), blob.size);
  }

  static fromResponse(response: Response): ZipSource {
    if (!response.body) {
      throw new Error("Response body is missing");
    }
    let expectedSize: number | undefined;
    const contentLength = response.headers.get("Content-Length");
    if (contentLength) {
      const contentLengthInt = parseInt(contentLength);
      if (isNaN(contentLengthInt)) {
        throw new Error("Invalid Content-Length header");
      }
      if (contentLengthInt < 0) {
        throw new Error("Content-Length header is negative");
      }
      expectedSize = contentLengthInt;
    }
    return new ZipSource(response.body, expectedSize);
  }

  stream: ReadableStream<Uint8Array>;
  expectedSize: number | undefined;

  constructor(stream: ReadableStream<Uint8Array>, expectedSize?: number) {
    this.stream = stream;
    this.expectedSize = expectedSize;
  }
}

export class ZipWriter {
  entries: ZipEntry[] = [];

  addString(name: string, data: string, options?: ZipEntryOptions) {
    this.add(name, ZipSource.fromString(data), options);
  }

  addBlob(name: string, blob: Blob, options?: ZipEntryOptions) {
    this.add(name, ZipSource.fromBlob(blob), options);
  }

  addResponse(name: string, response: Response, options?: ZipEntryOptions) {
    this.add(name, ZipSource.fromResponse(response), options);
  }

  add(name: string, data: ZipSource, options?: ZipEntryOptions) {
    this.entries.push(
      new ZipEntry(name, data.stream, data.expectedSize, options),
    );
  }

  async build(options?: BuildOptions) {
    const entryProgress =
      options?.progress &&
      this.entries.map((entry) => ({
        bytesWritten: 0,
        totalBytes: entry.streamSizeGuess,
      }));

    const parts: BlobPart[] = [];
    for (const entryParts of await Promise.all(
      this.entries.map(async (entry, index) => {
        if (options?.progress || options?.entryProgress) {
          entry.progressCallback = (bytesWritten, totalBytes) => {
            options?.entryProgress?.(index, bytesWritten, totalBytes);
            Object.assign(entryProgress![index], { bytesWritten, totalBytes });
            const totalBytesWritten = entryProgress!.reduce(
              (sum, progress) => sum + progress.bytesWritten,
              0,
            );
            const totalBytesExpected = entryProgress!.reduce(
              (sum, progress) => sum + progress.totalBytes,
              0,
            );
            options?.progress?.(totalBytesWritten, totalBytesExpected);
          };
        }
        return await entry.entryParts();
      }),
    )) {
      parts.push(...entryParts);
    }

    let offset = 0;
    let directorySize = 0;
    for (const entry of this.entries) {
      parts.push(...entry.directoryParts(offset));
      offset += entry.entrySize();
      directorySize += entry.directorySize();
    }
    // "End of central directory record"
    const footer = new DataView(new ArrayBuffer(22));
    footer.setUint32(0, 0x06054b50, true); // End of central directory signature
    footer.setUint16(4, 0x0000, true); // Number of this disk
    footer.setUint16(6, 0x0000, true); // Number of the disk with the start of the central directory
    footer.setUint16(8, this.entries.length, true); // Total number of entries in the central directory on this disk
    footer.setUint16(10, this.entries.length, true); // Total number of entries in the central directory
    footer.setUint32(12, directorySize, true); // Size of the central directory
    footer.setUint32(16, offset, true); // Offset of start of central directory with respect to the starting disk number
    footer.setUint16(20, 0x0000, true); // .ZIP file comment length
    parts.push(footer);
    return new Blob(parts, { type: "application/zip" });
  }
}
