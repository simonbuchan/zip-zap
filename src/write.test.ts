import { expect, test } from "vitest";
import { ZipWriter } from "./write.js";

// Just a snapshot test for now.
test("snapshot", async () => {
  const expectedHex = [
    "504b030414000008080000000000473eb6fb070000000500000005000000",
    "68656c6c6f0bcf2fca490100504b0102140014000008080000000000473e",
    "b6fb07000000050000000500000000000000000000000000000000006865",
    "6c6c6f504b05060000000001000100330000002a0000000000",
  ].join("");
  const expected = new Uint8Array(expectedHex.length / 2);
  for (let i = 0; i < expectedHex.length; i += 2) {
    expected[i / 2] = parseInt(expectedHex.slice(i, i + 2), 16);
  }

  const writer = new ZipWriter();
  writer.addString("hello", "World");
  const actualBlob = await writer.build();
  const actual = new Uint8Array(await actualBlob.arrayBuffer());

  expect(actual).toEqual(expected);
});
