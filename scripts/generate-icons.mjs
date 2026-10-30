import sharp from "sharp";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const source = await readFile(
  new URL("../public/brand/de1na-icon.svg", import.meta.url),
  "utf8",
);
const out = new URL("../public/icons/", import.meta.url);
await mkdir(out, { recursive: true });
for (const size of [16, 32, 192, 512])
  await writeFile(
    new URL(`icon-${size}.png`, out),
    await sharp(Buffer.from(source)).resize(size, size).png().toBuffer(),
  );
const square = source.replace('rx="110"', 'rx="0"');
for (const [name, size] of [
  ["apple-touch-icon", 180],
  ["maskable-512", 512],
])
  await writeFile(
    new URL(`${name}.png`, out),
    await sharp(Buffer.from(square)).resize(size, size).png().toBuffer(),
  );
const png = await sharp(Buffer.from(source)).resize(32, 32).png().toBuffer();
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header[6] = 32;
header[7] = 32;
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);
await writeFile(
  new URL("../public/favicon.ico", import.meta.url),
  Buffer.concat([header, png]),
);
