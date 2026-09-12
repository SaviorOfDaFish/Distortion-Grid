import { deflateSync } from "node:zlib";

function crc32(buf) {
  let c = 0xffffffff;

  for (const byte of buf) {
    c ^= byte;

    for (let k = 0; k < 8; k += 1) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }

  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);

  return Buffer.concat([len, typeBuf, data, crc]);
}

function makeImage(width, height) {
  const pixels = Buffer.alloc(width * height * 4);

  function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;

    const i = (y * width + x) * 4;
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = a;
  }

  function rect(x, y, w, h, color) {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        setPixel(xx, yy, ...color);
      }
    }
  }

  function border(x, y, w, h, thickness, color) {
    rect(x, y, w, thickness, color);
    rect(x, y + h - thickness, w, thickness, color);
    rect(x, y, thickness, h, color);
    rect(x + w - thickness, y, thickness, h, color);
  }

  function glowRect(x, y, w, h, color) {
    for (let spread = 10; spread >= 1; spread -= 1) {
      const alpha = Math.max(8, Math.floor(54 * (1 - spread / 11)));
      border(
        x - spread,
        y - spread,
        w + spread * 2,
        h + spread * 2,
        1,
        [color[0], color[1], color[2], alpha]
      );
    }
  }

  return { pixels, setPixel, rect, border, glowRect };
}

function palette(difficulty) {
  switch (difficulty) {
    case "Stable":
      return { accent: [64, 199, 255, 255], accent2: [115, 255, 231, 255] };
    case "Fractured":
      return { accent: [255, 145, 67, 255], accent2: [183, 90, 255, 255] };
    case "Cataclysm":
      return { accent: [255, 54, 104, 255], accent2: [255, 70, 208, 255] };
    default:
      return { accent: [143, 86, 255, 255], accent2: [74, 224, 255, 255] };
  }
}

function seededRandom(seed) {
  let x = (Number(seed) || 1) >>> 0;

  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

export function createCoveredGridTeaser({
  gridSize = 5,
  difficulty = "Unstable",
  gridNumber = 1,
} = {}) {
  const width = 640;
  const height = 360;
  const { pixels, setPixel, rect, border, glowRect } = makeImage(width, height);
  const p = palette(difficulty);
  const random = seededRandom(gridNumber * 971 + gridSize * 37);

  // Space/cosmic backdrop.
  rect(0, 0, width, height, [9, 7, 19, 255]);

  for (let i = 0; i < 95; i += 1) {
    const x = Math.floor(random() * width);
    const y = Math.floor(random() * height);
    const bright = 70 + Math.floor(random() * 130);
    setPixel(x, y, bright, bright, 210 + Math.floor(random() * 45), 210);
  }

  // Soft colored nebula stripes.
  for (let y = 0; y < height; y += 1) {
    const mix = y / height;
    const r = Math.floor(15 + p.accent[0] * 0.035 * (1 - mix));
    const g = Math.floor(8 + p.accent[1] * 0.025 * mix);
    const b = Math.floor(24 + p.accent2[2] * 0.045);
    for (let x = 0; x < width; x += 1) {
      if ((x + y) % 7 === 0) setPixel(x, y, r, g, b, 255);
    }
  }

  const n = Math.max(4, Math.min(7, Math.floor(Number(gridSize) || 5)));
  const gap = 6;
  const maxBoard = 292;
  const tile = Math.floor((maxBoard - gap * (n - 1)) / n);
  const boardW = tile * n + gap * (n - 1);
  const boardH = boardW;
  const boardX = Math.floor((width - boardW) / 2);
  const boardY = Math.floor((height - boardH) / 2);

  glowRect(boardX - 8, boardY - 8, boardW + 16, boardH + 16, p.accent);
  border(boardX - 9, boardY - 9, boardW + 18, boardH + 18, 2, p.accent);

  // Every tile is deliberately covered. No conduit orientation, core, crystal,
  // goal, or route information is rendered into this teaser.
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      const x = boardX + c * (tile + gap);
      const y = boardY + r * (tile + gap);

      rect(x, y, tile, tile, [27, 20, 43, 255]);
      border(x, y, tile, tile, 2, [
        Math.floor((p.accent[0] + p.accent2[0]) / 2),
        Math.floor((p.accent[1] + p.accent2[1]) / 2),
        Math.floor((p.accent[2] + p.accent2[2]) / 2),
        255,
      ]);

      // Decorative covered-tile center. Same mark on every tile.
      const inset = Math.max(4, Math.floor(tile * 0.28));
      rect(
        x + inset,
        y + inset,
        Math.max(3, tile - inset * 2),
        Math.max(3, tile - inset * 2),
        [53, 40, 77, 255]
      );
    }
  }

  // PNG scanlines: filter byte + RGBA data.
  const raw = Buffer.alloc(height * (1 + width * 4));

  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 4);
    raw[row] = 0;
    pixels.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
