import { CanvasTexture, ClampToEdgeWrapping, RepeatWrapping, SRGBColorSpace } from 'three';
import { mulberry32 } from '../core/math';

/** Procedural canvas textures. Nothing is downloaded, so there are no assets that can go missing. */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available in this browser.');
  return [c, ctx];
}

function finish(c: HTMLCanvasElement, repeat: boolean, srgb = true): CanvasTexture {
  const tex = new CanvasTexture(c);
  tex.wrapS = tex.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  if (srgb) tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Periodic value noise so generated maps tile seamlessly. */
function tileNoise(period: number, seed: number): (x: number, y: number) => number {
  const rng = mulberry32(seed);
  const grid = new Float32Array(period * period);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  const at = (x: number, y: number) => grid[(((y % period) + period) % period) * period + (((x % period) + period) % period)]!;
  return (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * u;
    const bot = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * u;
    return top + (bot - top) * v;
  };
}

function tileFbm(size: number, baseFreq: number, octaves: number, seed: number): (x: number, y: number) => number {
  const layers = Array.from({ length: octaves }, (_, i) => tileNoise(baseFreq * 2 ** i, seed + i * 31));
  return (x, y) => {
    let s = 0;
    let a = 0.5;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      const f = 2 ** i;
      s += a * layers[i]!((x / size) * baseFreq * f, (y / size) * baseFreq * f);
      norm += a;
      a *= 0.5;
    }
    return s / norm;
  };
}

/** Coursed blue-grey masonry with mortar lines. */
export function createStoneTexture(): CanvasTexture {
  const [c, ctx] = canvas(512, 512);
  const rng = mulberry32(1887);
  ctx.fillStyle = '#2b3236';
  ctx.fillRect(0, 0, 512, 512);
  const rows = 8;
  const rowH = 512 / rows;
  for (let r = 0; r < rows; r++) {
    const widths: number[] = [];
    let total = 0;
    while (total < 512 - 90) {
      const w = 80 + rng() * 90;
      widths.push(w);
      total += w;
    }
    widths.push(512 - total);
    let x = -rng() * 100;
    for (const w of widths) {
      const hue = 205 + rng() * 14;
      const sat = 10 + rng() * 11;
      const light = 44 + rng() * 15;
      for (const dx of [-512, 0, 512]) {
        ctx.fillStyle = `hsl(${hue} ${sat}% ${light}%)`;
        ctx.fillRect(x + dx + 2, r * rowH + 2, w - 4, rowH - 4);
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(x + dx + 2, r * rowH + 2, w - 4, 3);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(x + dx + 2, r * rowH + rowH - 6, w - 4, 4);
      }
      x += w;
    }
  }
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = rng() > 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(rng() * 512, rng() * 512, 1 + rng() * 3, 1 + rng() * 2);
  }
  for (let i = 0; i < 26; i++) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(70,92,52,0.28)');
    g.addColorStop(1, 'rgba(70,92,52,0)');
    ctx.save();
    ctx.translate(rng() * 512, rng() * 512);
    ctx.scale(20 + rng() * 40, 10 + rng() * 24);
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  return finish(c, true);
}

/** Near-white painted plaster with rain streaks; vertex colours supply the actual paint. */
export function createPlasterTexture(): CanvasTexture {
  const size = 256;
  const [c, ctx] = canvas(size, 512);
  const img = ctx.createImageData(size, 512);
  const n = tileFbm(256, 4, 4, 77);
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < size; x++) {
      const v = 0.86 + 0.14 * n(x, y % 256) + (Math.random() - 0.5) * 0.03;
      const o = (y * size + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.min(255, v * 255);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const rng = mulberry32(404);
  for (let i = 0; i < 46; i++) {
    const x = rng() * size;
    const y = rng() * 300;
    const len = 90 + rng() * 260;
    const w = 2 + rng() * 6;
    const g = ctx.createLinearGradient(0, y, 0, y + len);
    const a = 0.05 + rng() * 0.1;
    g.addColorStop(0, 'rgba(40,40,30,0)');
    g.addColorStop(0.2, `rgba(40,40,30,${a})`);
    g.addColorStop(1, 'rgba(40,40,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, len);
    ctx.fillRect(x - size, y, w, len);
  }
  return finish(c, true);
}

/** Weathered vertical planks. */
export function createWoodTexture(base = '#6f6050'): CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const rng = mulberry32(31);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  const planks = 8;
  const w = 256 / planks;
  for (let p = 0; p < planks; p++) {
    const shade = (rng() - 0.5) * 34;
    ctx.fillStyle = `rgba(${shade > 0 ? '255,240,215' : '0,0,0'},${Math.abs(shade) / 160})`;
    ctx.fillRect(p * w, 0, w, 256);
    for (let g = 0; g < 26; g++) {
      ctx.strokeStyle = `rgba(20,14,8,${0.04 + rng() * 0.12})`;
      ctx.lineWidth = 0.6 + rng() * 1.2;
      const x = p * w + 2 + rng() * (w - 4);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + (rng() - 0.5) * 5, 85, x + (rng() - 0.5) * 5, 170, x + (rng() - 0.5) * 3, 256);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(10,8,5,0.55)';
    ctx.fillRect(p * w, 0, 2, 256);
  }
  return finish(c, true);
}

/** Greyscale mottling multiplied over the terrain's vertex colours. */
export function createGroundDetailTexture(): CanvasTexture {
  const size = 256;
  const [c, ctx] = canvas(size, size);
  const img = ctx.createImageData(size, size);
  const broad = tileFbm(size, 4, 4, 5);
  const fine = tileFbm(size, 32, 2, 9);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = 0.72 + 0.2 * broad(x, y) + 0.08 * fine(x, y);
      const o = (y * size + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v * 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(c, true);
}

/** Soft radial falloff, used for window and lamp glow. */
export function createGlowTexture(): CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return finish(c, false, false);
}

/** A clump of grass blades on a transparent background, for alpha-tested crossed cards. */
export function createGrassTexture(): CanvasTexture {
  const w = 128;
  const h = 128;
  const [c, ctx] = canvas(w, h);
  const rng = mulberry32(2024);
  const blades = 17;
  for (let i = 0; i < blades; i++) {
    const bx = 14 + rng() * (w - 28);
    const height = 56 + rng() * 68;
    const bend = (rng() - 0.5) * 44;
    const width = 3.4 + rng() * 3.2;
    const g = ctx.createLinearGradient(0, h, 0, h - height);
    const hue = 82 + rng() * 22;
    g.addColorStop(0, `hsl(${hue + 8} 48% ${14 + rng() * 5}%)`);
    g.addColorStop(0.55, `hsl(${hue} 50% ${30 + rng() * 8}%)`);
    g.addColorStop(1, `hsl(${hue - 10} 52% ${52 + rng() * 10}%)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(bx - width, h);
    ctx.quadraticCurveTo(bx - width * 0.5 + bend * 0.4, h - height * 0.55, bx + bend, h - height);
    ctx.quadraticCurveTo(bx + width * 0.5 + bend * 0.4, h - height * 0.55, bx + width, h);
    ctx.closePath();
    ctx.fill();
  }
  return finish(c, false);
}
