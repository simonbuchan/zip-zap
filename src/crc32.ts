// referenced from @zip.js:
// https://github.com/gildas-lormeau/zip.js/blob/master/lib/core/streams/codecs/crc32.js

const table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let t = i;
  for (let j = 0; j < 8; j++) {
    if (t & 1) {
      t = (t >>> 1) ^ 0xedb88320;
    } else {
      t = t >>> 1;
    }
  }
  table[i] = t;
}

export default function crc32(crc: number, data: Uint8Array): number {
  let x = ~crc;
  for (let i = 0; i < data.length; i++) {
    x = (x >>> 8) ^ table[(x ^ data[i]) & 0xff];
  }
  return ~x;
}
