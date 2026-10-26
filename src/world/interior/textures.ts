import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { mulberry32 } from '../../core/math';
import { LIGHTHOUSE } from '../layout';
import { PATH_POLYLINE, coastRadius } from '../terrain';

/** Procedural canvas textures for the interior. */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available in this browser.');
  return [c, ctx];
}

function finish(c: HTMLCanvasElement, repeat = false): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Plaid wool blanket. */
export function createPlaidTexture(): CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = '#7e3a35';
  ctx.fillRect(0, 0, 128, 128);
  const bands: Array<[number, number, string]> = [[10, 22, 'rgba(228,210,170,0.8)'], [52, 10, 'rgba(34,58,74,0.85)'], [86, 22, 'rgba(228,210,170,0.8)'], [112, 8, 'rgba(34,58,74,0.85)']];
  for (const [p, w, col] of bands) {
    ctx.fillStyle = col;
    ctx.fillRect(p, 0, w, 128);
    ctx.fillRect(0, p, 128, w);
  }
  const rng = mulberry32(5);
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
    ctx.fillRect(rng() * 128, rng() * 128, 1, 2);
  }
  return finish(c, true);
}

/** Round braided rug in faded reds, teal and cream. */
export function createRugTexture(): CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const rings: Array<[number, string]> = [[128, '#5b2b28'], [118, '#d6c7a2'], [110, '#7a3a33'], [88, '#2f5f62'], [70, '#d6c7a2'], [62, '#8a4a3a'], [40, '#2f5f62'], [24, '#d6c7a2'], [14, '#7a3a33']];
  for (const [r, col] of rings) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(128, 128, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const rng = mulberry32(9);
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(rng() * 256, rng() * 256, 2, 1);
  }
  return finish(c);
}

/** Warm interior plaster (near-white; tinted by material colour). */
export function createLimewashTexture(): CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const rng = mulberry32(61);
  ctx.fillStyle = '#e9e1cf';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 120; i++) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    const dark = rng() > 0.5;
    g.addColorStop(0, dark ? 'rgba(120,100,70,0.045)' : 'rgba(255,255,245,0.07)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(rng() * 256, rng() * 256);
    ctx.scale(20 + rng() * 60, 14 + rng() * 40);
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  return finish(c, true);
}

/** A sea chart of this very island, drawn from the same coastline the game world uses. */
export function createChartTexture(w = 512, h = 360): CanvasTexture {
  const [c, ctx] = canvas(w, h);
  const rng = mulberry32(77);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#dccaa0');
  g.addColorStop(1, '#cdb689');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(120,90,50,${0.02 + rng() * 0.05})`;
    ctx.beginPath();
    ctx.arc(rng() * w, rng() * h, 10 + rng() * 40, 0, Math.PI * 2);
    ctx.fill();
  }
  const cx = w * 0.52;
  const cy = h * 0.52;
  const s = (h * 0.36) / 62;
  // Soundings: faint wave hatching around the island.
  ctx.strokeStyle = 'rgba(70,95,110,0.35)';
  ctx.lineWidth = 1;
  for (const k of [1.35, 1.7, 2.1]) {
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      const r = coastRadius(a) * k * s;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  // The island.
  ctx.beginPath();
  for (let i = 0; i <= 180; i++) {
    const a = (i / 180) * Math.PI * 2;
    const r = coastRadius(a) * s;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = '#c8b47c';
  ctx.fill();
  ctx.strokeStyle = '#4a3a22';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Footpath and the light.
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = '#6a3a2a';
  ctx.beginPath();
  PATH_POLYLINE.forEach(([x, z], i) => (i === 0 ? ctx.moveTo(cx + x * s, cy + z * s) : ctx.lineTo(cx + x * s, cy + z * s)));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#a4413a';
  ctx.beginPath();
  ctx.arc(cx + LIGHTHOUSE.x * s, cy + LIGHTHOUSE.z * s, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3a2a18';
  ctx.font = 'italic 15px Georgia, serif';
  ctx.fillText('Lumen Light', cx + LIGHTHOUSE.x * s + 9, cy + LIGHTHOUSE.z * s + 4);
  ctx.font = 'italic 22px Georgia, serif';
  ctx.fillText('The Last Rock', 22, 36);
  // Compass rose.
  ctx.save();
  ctx.translate(w - 56, 62);
  ctx.strokeStyle = '#3a2a18';
  ctx.fillStyle = '#3a2a18';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.lineTo(7, 0);
  ctx.lineTo(0, 34);
  ctx.lineTo(-7, 0);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-26, 0);
  ctx.lineTo(26, 0);
  ctx.stroke();
  ctx.font = '14px Georgia, serif';
  ctx.fillText('N', -5, -40);
  ctx.restore();
  // A pencilled note.
  ctx.fillStyle = 'rgba(70,40,30,0.8)';
  ctx.font = 'italic 14px Georgia, serif';
  ctx.fillText('light dims here at dusk?', w * 0.06, h * 0.9);
  ctx.strokeStyle = 'rgba(70,40,30,0.7)';
  ctx.beginPath();
  ctx.moveTo(w * 0.34, h * 0.88);
  ctx.quadraticCurveTo(w * 0.42, h * 0.72, cx + LIGHTHOUSE.x * s - 8, cy + LIGHTHOUSE.z * s + 8);
  ctx.stroke();
  return finish(c);
}

/** Ruled logbook page with a few lines of handwriting. */
export function createLogbookTexture(): CanvasTexture {
  const [c, ctx] = canvas(256, 192);
  ctx.fillStyle = '#e6dcc0';
  ctx.fillRect(0, 0, 256, 192);
  ctx.strokeStyle = 'rgba(80,100,130,0.35)';
  for (let y = 24; y < 192; y += 16) {
    ctx.beginPath();
    ctx.moveTo(10, y);
    ctx.lineTo(246, y);
    ctx.stroke();
  }
  const rng = mulberry32(3);
  ctx.strokeStyle = 'rgba(40,30,25,0.75)';
  for (let row = 0; row < 8; row++) {
    ctx.beginPath();
    let x = 14;
    ctx.moveTo(x, 20 + row * 16);
    while (x < 150 + rng() * 80) {
      x += 3 + rng() * 5;
      ctx.lineTo(x, 20 + row * 16 + (rng() - 0.5) * 5);
    }
    ctx.stroke();
  }
  return finish(c);
}
