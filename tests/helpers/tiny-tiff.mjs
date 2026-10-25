// A real baseline TIFF, uncompressed RGB, made byte by byte so a test needs no
// image library. `rgb` gives each pixel's colour.
export function tinyTiff(width, height, rgb = () => [255, 0, 0]) {
  const entries = 12;
  const ifdEnd = 8 + 2 + entries * 12 + 4;
  const bits = ifdEnd;
  const xres = bits + 6;
  const yres = xres + 8;
  const pixels = yres + 8;
  const size = width * height * 3;
  const b = Buffer.alloc(pixels + size);
  b.write('II', 0, 'latin1');
  b.writeUInt16LE(42, 2);
  b.writeUInt32LE(8, 4);
  b.writeUInt16LE(entries, 8);
  let at = 10;
  const entry = (tag, type, count, value) => {
    b.writeUInt16LE(tag, at);
    b.writeUInt16LE(type, at + 2);
    b.writeUInt32LE(count, at + 4);
    if (type === 3 && count === 1) b.writeUInt16LE(value, at + 8);
    else b.writeUInt32LE(value, at + 8);
    at += 12;
  };
  const SHORT = 3, LONG = 4, RATIONAL = 5;
  entry(256, LONG, 1, width);
  entry(257, LONG, 1, height);
  entry(258, SHORT, 3, bits);
  entry(259, SHORT, 1, 1);
  entry(262, SHORT, 1, 2);
  entry(273, LONG, 1, pixels);
  entry(277, SHORT, 1, 3);
  entry(278, LONG, 1, height);
  entry(279, LONG, 1, size);
  entry(282, RATIONAL, 1, xres);
  entry(283, RATIONAL, 1, yres);
  entry(296, SHORT, 1, 2);
  b.writeUInt32LE(0, at);
  for (let i = 0; i < 3; i += 1) b.writeUInt16LE(8, bits + i * 2);
  for (const r of [xres, yres]) { b.writeUInt32LE(72, r); b.writeUInt32LE(1, r + 4); }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, bl] = rgb(x, y);
      const o = pixels + (y * width + x) * 3;
      b[o] = r; b[o + 1] = g; b[o + 2] = bl;
    }
  }
  return b;
}
