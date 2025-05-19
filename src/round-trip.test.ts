import { expect, test } from "vitest";

import { ZipReader } from "./read.js";
import { ZipWriter } from "./write.js";

test("write and read", async () => {
  const original = [
    { name: "file1.txt", data: "Hello, world!" },
    { name: "file2.txt", data: "Goodbye, world!" },
  ];

  const writer = new ZipWriter();
  for (const { name, data } of original) {
    writer.addString(name, data);
  }
  const zipBlob = await writer.build();

  await hexDump(zipBlob);

  const reader = new ZipReader(zipBlob);

  const actual = [];
  for await (const entry of reader.entries()) {
    const data = await new Response(entry.uncompressedStream()).text();
    actual.push({ name: entry.name(), data });
  }

  expect(actual).toEqual(original);
});

async function hexDump(blob: Blob) {
  const buffer = new Uint8Array(await new Response(blob).arrayBuffer());
  const size = buffer.byteLength;
  for (let i = 0; i < size; i += 16) {
    const chunk = buffer.slice(i, i + 16);
    const hex = Array.from(chunk)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(" ")
      .padEnd(16 * 3 - 1, " ");
    const ascii = Array.from(chunk)
      .map((byte) =>
        byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ".",
      )
      .join("");
    console.log(`${i.toString(16).padStart(4, "0")}: ${hex}  ${ascii}`);
  }
}
