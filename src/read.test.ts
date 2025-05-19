import { test, expect } from "vitest";

import { ZipLocalHeader } from "./read.js";

function hex(...strings: string[]): Uint8Array {
  return new Uint8Array(
    strings.flatMap((str) => str.split(" ")).map((byte) => parseInt(byte, 16)),
  );
}

test("hex", () => {
  expect(
    hex(
      "50 4b 03 04", // signature
      "14 00", // version needed to extract
      "00 00", // general purpose bit flag
      "08 00", // compression method
    ),
  ).toEqual(
    new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00,
    ]),
  );
});

const localEntryBytes = hex(
  "50 4b 03 04", // signature
  "14 00", // version needed to extract
  "00 00", // general purpose bit flag
  "08 00", // compression method
  "1c 7d", // last mod file time
  "4b 35", // last mod file date
  "a6 e1 90 7d", // crc-32
  "45 00 00 00", // compressed size
  "4a 00 00 00", // uncompressed size
  "05 00", // file name length
  "15 00", // extra field length
  // file name
  "66 69 6c 65 31",
  // extra: extended timestamp
  "55 54 09 00 03 c7 48 2d 45 c7 48 2d 45",
  // extra: unix
  "55 78 04 00 f5 01 f5 01",
);

test("ZipLocalHeader.fromData", () => {
  const header = ZipLocalHeader.fromData(
    new DataView(localEntryBytes.buffer),
    4,
  );
  expect(header.versionNeeded).toEqual(0x14);
  expect(header.method).toEqual(8);
  expect(header.dosTime).toEqual(0x7d1c);
  expect(header.dosDate).toEqual(0x354b);
  expect(header.crc32).toEqual(0x7d90e1a6);
  expect(header.compressedSize).toEqual(0x45);
  expect(header.uncompressedSize).toEqual(0x4a);
  expect(header.fileNameLength).toEqual(5);
  expect(header.extraFieldLength).toEqual(21);
});
