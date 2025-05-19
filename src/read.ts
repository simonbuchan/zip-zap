const utf8Decoder = new TextDecoder();

function fromUtf8(data: Uint8Array): string {
  return utf8Decoder.decode(data);
}

class ZipData {
  blob: Blob;

  constructor(blob: Blob) {
    this.blob = blob;
  }

  get size() {
    return this.blob.size;
  }

  slice(offset: number, size: number): Blob {
    return this.blob.slice(offset, offset + size);
  }

  async bytes(offset: number, size: number): Promise<Uint8Array> {
    const buffer = await this.slice(offset, size).arrayBuffer();
    return new Uint8Array(buffer);
  }

  async view(offset: number, size: number): Promise<DataView> {
    const buffer = await this.slice(offset, size).arrayBuffer();
    return new DataView(buffer);
  }
}

export class ZipReader {
  data: ZipData;

  constructor(data: Blob) {
    this.data = new ZipData(data);
  }

  async* entries() {
    const dir = await ZipDirectory.read(this.data);
    for (const dirEntry of dir.entries()) {
      yield await ZipEntry.fromDirectoryEntry(this.data, dirEntry);
    }
  }
}

// aka "End of central directory record"
// file comment not supported
class ZipFooter {
  static SIGNATURE = 0x06054b50; // PK\x05\x06
  static SIZE = 22;

  static async read(data: ZipData) {
    const view = await data.view(data.size - ZipFooter.SIZE, ZipFooter.SIZE);
    return new ZipFooter(view);
  }

  diskNumber: number;
  diskStart: number;
  diskEntries: number;
  totalEntries: number;
  directorySize: number;
  directoryOffset: number;
  commentLength: number;

  constructor(view: DataView) {
    if (view.getUint32(0, true) !== ZipFooter.SIGNATURE) {
      throw new Error("Invalid ZIP footer signature");
    }
    this.diskNumber = view.getUint16(4, true);
    this.diskStart = view.getUint16(6, true);
    this.diskEntries = view.getUint16(8, true);
    this.totalEntries = view.getUint16(10, true);
    this.directorySize = view.getUint32(12, true);
    this.directoryOffset = view.getUint32(16, true);
    this.commentLength = view.getUint16(20, true);
  }
}

class ZipDirectory {
  static async read(data: ZipData) {
    const footer = await ZipFooter.read(data);
    const dirView = await data.view(footer.directoryOffset, footer.directorySize);
    return new ZipDirectory(footer, dirView);
  }

  footer: ZipFooter;
  data: DataView;

  constructor(footer: ZipFooter, data: DataView) {
    this.footer = footer;
    this.data = data;
  }

  * entries(): Iterable<ZipDirectoryEntry> {
    for (let dataOffset = 0; dataOffset < this.data.byteLength;) {
      const entry = new ZipDirectoryEntry(this.data, dataOffset);
      dataOffset += entry.directoryEntrySize();
      yield entry;
    }
  }
}

// aka "Central directory file header"
export class ZipDirectoryEntry {
  static SIGNATURE = 0x02014b50; // PK\x01\x02
  static SIZE = 46; // size of the header

  versionCreated: number;
  versionNeeded: number;
  flags: number;
  compressionMethod: number;
  dosTime: number;
  dosDate: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  diskNumberStart: number;
  internalFileAttributes: number;
  externalFileAttributes: number;
  relativeOffset: number;
  rawName: Uint8Array;
  rawExtraField: Uint8Array;
  rawComment: Uint8Array;

  constructor(data: DataView, offset: number) {
    if (data.getUint32(offset, true) !== ZipDirectoryEntry.SIGNATURE) {
      throw new Error(`Invalid ZIP directory entry signature at ${offset}`);
    }
    this.versionCreated = data.getUint16(offset + 4, true);
    this.versionNeeded = data.getUint16(offset + 6, true);
    this.flags = data.getUint16(offset + 8, true);
    this.compressionMethod = data.getUint16(offset + 10, true);
    this.dosTime = data.getUint16(offset + 12, true);
    this.dosDate = data.getUint16(offset + 14, true);
    this.crc32 = data.getUint32(offset + 16, true);
    this.compressedSize = data.getUint32(offset + 20, true);
    this.uncompressedSize = data.getUint32(offset + 24, true);
    const fileNameLength = data.getUint16(offset + 28, true);
    const extraFieldLength = data.getUint16(offset + 30, true);
    const fileCommentLength = data.getUint16(offset + 32, true);
    this.diskNumberStart = data.getUint16(offset + 34, true);
    this.internalFileAttributes = data.getUint16(offset + 36, true);
    this.externalFileAttributes = data.getUint32(offset + 38, true);
    this.relativeOffset = data.getUint32(offset + 42, true);
    let sliceStart = data.byteOffset + offset + ZipDirectoryEntry.SIZE;
    this.rawName = new Uint8Array(data.buffer, sliceStart, fileNameLength);
    sliceStart += fileNameLength;
    this.rawExtraField = new Uint8Array(data.buffer, sliceStart, extraFieldLength);
    sliceStart += extraFieldLength;
    this.rawComment = new Uint8Array(data.buffer, sliceStart, fileCommentLength);
  }

  isDirectory() {
    return this.rawName[this.rawName.length - 1] === 0x2f && this.uncompressedSize === 0;
  }

  name() {
    return fromUtf8(this.rawName);
  }

  comment() {
    return fromUtf8(this.rawComment);
  }

  directoryEntrySize() {
    return ZipDirectoryEntry.SIZE + this.rawName.length + this.rawExtraField.length + this.rawComment.length;
  }
}

export class ZipLocalHeader {
  static SIGNATURE = 0x04034b50; // PK\x03\x04

  static SIZE = 30; // size of the header

  static fromData(data: DataView, offset: number): ZipLocalHeader {
    if (data.getUint32(offset, true) !== ZipLocalHeader.SIGNATURE) {
      throw new Error(`Invalid ZIP local header signature at ${offset}`);
    }
    const header = new ZipLocalHeader();
    header.versionNeeded = data.getUint16(offset + 4, true);
    header.flags = data.getUint16(offset + 6, true);
    header.method = data.getUint16(offset + 8, true);
    header.dosTime = data.getUint16(offset + 10, true);
    header.dosDate = data.getUint16(offset + 12, true);
    header.crc32 = data.getUint32(offset + 14, true);
    header.compressedSize = data.getUint32(offset + 18, true);
    header.uncompressedSize = data.getUint32(offset + 22, true);
    header.fileNameLength = data.getUint16(offset + 26, true);
    header.extraFieldLength = data.getUint16(offset + 28, true);
    return header;
  }

  static fromDirectoryEntry(entry: ZipDirectoryEntry): ZipLocalHeader {
    const header = new ZipLocalHeader();
    header.versionNeeded = entry.versionNeeded;
    header.flags = entry.flags;
    header.method = entry.compressionMethod;
    header.dosTime = entry.dosTime;
    header.dosDate = entry.dosDate;
    header.crc32 = entry.crc32;
    header.compressedSize = entry.compressedSize;
    header.uncompressedSize = entry.uncompressedSize;
    header.fileNameLength = entry.rawName.length;
    header.extraFieldLength = entry.rawExtraField.length;
    return header;
  }

  versionNeeded: number = 0;
  flags: number = 0;
  method: number = 0;
  dosTime: number = 0;
  dosDate: number = 0;
  crc32: number = 0;
  compressedSize: number = 0;
  uncompressedSize: number = 0;
  fileNameLength: number = 0;
  extraFieldLength: number = 0;

  size(): number {
    return ZipLocalHeader.SIZE + this.fileNameLength + this.extraFieldLength;
  }
}

export class ZipEntry {
  static async fromDirectoryEntry(
    data: ZipData,
    entry: ZipDirectoryEntry,
  ): Promise<ZipEntry> {
    const header = ZipLocalHeader.fromDirectoryEntry(entry);
    const compressedDataOffset = entry.relativeOffset + ZipLocalHeader.SIZE + entry.rawName.length + entry.rawExtraField.length;
    const compressedData = data.slice(compressedDataOffset, entry.compressedSize);
    return new ZipEntry(header, entry.rawName, entry.rawExtraField, compressedData);
  }

  static async fromHeader(
    data: ZipData,
    relativeOffset: number,
    header: ZipLocalHeader,
  ): Promise<ZipEntry> {
    const compressedDataOffset = relativeOffset + header.size();
    const compressedData = data.slice(compressedDataOffset, header.compressedSize);
    const [rawPath, extraField] = await Promise.all([
      data.bytes(relativeOffset, header.fileNameLength),
      data.bytes(relativeOffset + header.fileNameLength, header.extraFieldLength),
    ]);
    return new ZipEntry(header, rawPath, extraField, compressedData);
  }

  header: ZipLocalHeader;
  rawName: Uint8Array;
  rawExtraField: Uint8Array;
  compressedData: Blob;

  constructor(
    header: ZipLocalHeader,
    rawName: Uint8Array,
    rawExtraField: Uint8Array,
    compressedData: Blob,
  ) {
    this.header = header;
    this.rawName = rawName;
    this.rawExtraField = rawExtraField;
    this.compressedData = compressedData;
  }

  name(): string {
    return fromUtf8(this.rawName);
  }

  compressedStream(): ReadableStream<Uint8Array> {
    return this.compressedData.stream();
  }

  uncompressedStream(): ReadableStream<Uint8Array> {
    if (this.header.method === 0) {
      return this.compressedData.stream();
    }
    return this.compressedData.stream().pipeThrough(new DecompressionStream("deflate-raw"));
  }
}
