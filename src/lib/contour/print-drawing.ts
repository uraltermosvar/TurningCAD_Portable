/**
 * Clean contour sketch for print (no dimension callouts).
 */
import type { SolvedContour, SolvedElement, XMode } from "./types.ts";

export type DimScope = "all" | "region";

export interface DrawingOptions {
  scope: DimScope;
  selectedId: string | null;
  name?: string;
  width?: number;
  height?: number;
  xMode?: XMode;
}

function collectElements(solved: SolvedContour, scope: DimScope, selectedId: string | null): SolvedElement[] {
  const els = solved.elements.filter((e) => e.kind !== "start" && e.segments?.length);
  if (scope === "all" || !selectedId) return els;
  const one = els.find((e) => e.id === selectedId);
  return one ? [one] : els;
}

export function contourDrawingSvg(solved: SolvedContour, opts: DrawingOptions): string {
  const w = opts.width ?? 900;
  const h = opts.height ?? 520;
  const pad = 40;
  const els = collectElements(solved, opts.scope, opts.selectedId);
  const focusSegs = els.flatMap((e) => e.segments);

  let zMin = solved.start.z;
  let zMax = solved.start.z;
  let xMax = Math.abs(solved.start.x);
  for (const s of solved.segments) {
    zMin = Math.min(zMin, s.start.z, s.end.z);
    zMax = Math.max(zMax, s.start.z, s.end.z);
    xMax = Math.max(xMax, Math.abs(s.start.x), Math.abs(s.end.x));
    if (s.type === "arc") {
      xMax = Math.max(xMax, Math.abs(s.center.x) + s.r);
      zMin = Math.min(zMin, s.center.z - s.r);
      zMax = Math.max(zMax, s.center.z + s.r);
    }
  }
  zMin -= 4;
  zMax += 4;
  xMax = Math.max(xMax + 4, 5);
  const zw = Math.max(zMax - zMin, 1);
  const scale = Math.min((w - 2 * pad) / zw, (h - 2 * pad - 30) / (xMax * 1.3));
  const ox = pad - zMin * scale;
  const oy = h - pad - 16;

  const px = (z: number, x: number) => ({
    x: ox + z * scale,
    y: oy - x * scale,
  });

  const parts: string[] = [];
  const title = (opts.name || "Контур").replace(/[<>&]/g, "");
  parts.push(
    `<text x="16" y="24" fill="#111" font-size="14" font-family="Segoe UI, Arial, sans-serif" font-weight="600">${title}</text>`,
  );

  const o0 = px(0, 0);
  parts.push(`<line x1="0" y1="${o0.y}" x2="${w}" y2="${o0.y}" stroke="#9aa8b5" stroke-width="0.8"/>`);
  parts.push(`<line x1="${o0.x}" y1="0" x2="${o0.x}" y2="${h}" stroke="#c4a090" stroke-width="0.8"/>`);
  parts.push(`<text x="${w - 28}" y="${o0.y - 6}" fill="#555" font-size="11" font-family="monospace">+Z</text>`);
  parts.push(`<text x="${o0.x + 6}" y="18" fill="#555" font-size="11" font-family="monospace">+X</text>`);

  if (opts.scope === "region") {
    for (const s of solved.segments) {
      parts.push(pathSeg(s, px, "#d5dae0", 1.2));
    }
  }

  const drawSegs = focusSegs.length ? focusSegs : solved.segments;
  for (const s of drawSegs) {
    const col = s.type === "arc" ? "#c06090" : "#2a6fbf";
    parts.push(pathSeg(s, px, col, 2.6));
  }

  const ps = px(solved.start.z, solved.start.x);
  parts.push(`<circle cx="${ps.x}" cy="${ps.y}" r="3.5" fill="#1a7f37"/>`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  ${parts.join("\n  ")}
</svg>`;
}

function pathSeg(
  s: {
    type: string;
    start: { z: number; x: number };
    end: { z: number; x: number };
    center?: { z: number; x: number };
    r?: number;
    sweep?: number;
  },
  px: (z: number, x: number) => { x: number; y: number },
  stroke: string,
  width: number,
): string {
  if (s.type === "line") {
    const a = px(s.start.z, s.start.x);
    const b = px(s.end.z, s.end.x);
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"/>`;
  }
  const n = Math.max(20, Math.ceil(Math.abs(s.sweep ?? 0) / (Math.PI / 36)));
  const a0 = Math.atan2(s.start.x - s.center!.x, s.start.z - s.center!.z);
  const d: string[] = [];
  for (let i = 0; i <= n; i++) {
    const ang = a0 + ((s.sweep ?? 0) * i) / n;
    const zz = s.center!.z + s.r! * Math.cos(ang);
    const xx = s.center!.x + s.r! * Math.sin(ang);
    const p = px(zz, xx);
    d.push(i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`);
  }
  return `<path d="${d.join(" ")}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"/>`;
}

export function printContourDrawing(
  solved: SolvedContour,
  opts: DrawingOptions & { gcodeText?: string },
): void {
  const svg = contourDrawingSvg(solved, opts);
  const title = (opts.name || "Контур").replace(/[<>&"]/g, "");
  const gcodeBlock = opts.gcodeText
    ? `<h2 style="font-size:12px;margin:16px 0 6px">G-код</h2><pre style="font:10px/1.4 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-all">${opts.gcodeText
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</pre>`
    : "";
  const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"/><title>${title}</title>
<style>
  @page { margin: 10mm; size: A4 landscape; }
  body { margin: 0; padding: 8px; font-family: Segoe UI, Arial, sans-serif; }
  .frame { border: 1px solid #ccc; }
</style></head><body>
<div class="frame">${svg.replace(/<\?xml[^>]*>/, "")}</div>
${gcodeBlock}
</body></html>`;

  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(iframe);
  const win = iframe.contentWindow;
  const doc = win?.document ?? iframe.contentDocument;
  if (!win || !doc) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const cleanup = () => {
    try {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    } catch {
      /* */
    }
  };
  win.onafterprint = cleanup;
  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch {
      cleanup();
    }
    setTimeout(cleanup, 60_000);
  }, 300);
}
