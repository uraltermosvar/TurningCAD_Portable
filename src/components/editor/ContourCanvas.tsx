import { useEffect, useRef } from "react";
import { contourPoints, pointAtLength } from "@/lib/contour/solver.ts";
import { fromRadius } from "@/lib/contour/math.ts";
import { useContourStore } from "@/store/contour-store";

const Z_COL = "#8ab0d0";
const X_COL = "#d4a090";
const PHOS = "#e8c547";
const PHOS_HOT = "#ffe566";
const STEEL = "#c4b49a";
const STOCK = "#5a4a3a";
const CHUCK = "#c9a86c";
/** Element stroke colours (match HTML portable contour) */
const COL_LINE = "#ffd000";
const COL_CHAMFER = "#00dfff"; // фаска — голубой
const COL_ARC = "#ff7dff"; // радиусы / дуги — розовый
const COL_DIM = "#e87070"; // размерные точки — мягкий красный
const COL_DIM_ACT = "#ffe566";

/** Midpoint (vertex) of an arc segment along its sweep — third dim point. */
function arcVertexOf(seg: {
  type: string;
  start: { z: number; x: number };
  end: { z: number; x: number };
  center?: { z: number; x: number };
  r?: number;
  sweep?: number;
}): { z: number; x: number } | null {
  if (seg.type !== "arc" || !seg.center || !(seg.r && seg.r > 0)) return null;
  const a0 = Math.atan2(seg.start.x - seg.center.x, seg.start.z - seg.center.z);
  const am = a0 + (seg.sweep || 0) * 0.5;
  return {
    z: seg.center.z + seg.r * Math.cos(am),
    x: seg.center.x + seg.r * Math.sin(am),
  };
}

export function ContourCanvas() {
  const flipZ = useContourStore((s) => s.flipZ);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const view = useRef({
    scale: 40,
    autoScale: true as boolean,
    ox: 0,
    oy: 0,
    dragging: false,
    lx: 0,
    ly: 0,
    lastW: 0,
    lastH: 0,
    anim: 0,
    geoKey: "",
    forceFit: true,
  });
  const solved = useContourStore((s) => s.solved);
  const doc = useContourStore((s) => s.doc);
  const selectedId = useContourStore((s) => s.selectedId);
  const arcPointIdx = useContourStore((s) => s.arcPointIdx);
  const setArcPointIdx = useContourStore((s) => s.setArcPointIdx);
  const showMirror = useContourStore((s) => s.showMirror);
  const contourSide = useContourStore((s) => s.contourSide);
  const showGrid = useContourStore((s) => s.showGrid);
  const showArrows = useContourStore((s) => s.showArrows);
  const showDims = useContourStore((s) => s.showDims);
  const showStock = useContourStore((s) => s.showStock);
  const showTool = useContourStore((s) => s.showTool);
  const animating = useContourStore((s) => s.animating);
  const select = useContourStore((s) => s.select);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let running = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const fit = (w: number, h: number) => {
      const pad = 44;
      const stockR = Math.max(0, doc.stock.diameter / 2);
      const z0 = doc.stock.zFace;
      const z1 = z0 - (doc.stock.length || 0);
      let zMin = solved.start.z;
      let zMax = solved.start.z;
      let xMax = Math.max(solved.start.x, 1);
      let xMin = 0;
      if (solved.segments.length > 0) {
        zMin = Math.min(zMin, solved.bbox.zMin);
        zMax = Math.max(zMax, solved.bbox.zMax);
        xMax = Math.max(xMax, solved.bbox.xMax);
        xMin = Math.min(xMin, solved.bbox.xMin);
      }
      if (showStock && stockR > 0.05) {
        zMin = Math.min(zMin, z1, z0);
        zMax = Math.max(zMax, z1, z0);
        xMax = Math.max(xMax, stockR);
      }
      const padW = Math.max(3, (zMax - zMin) * 0.1 + 3);
      const padH = Math.max(3, (xMax - xMin) * 0.1 + 3);
      zMin -= padW;
      zMax += padW;
      xMax += padH;
      xMin = showMirror ? -xMax : Math.min(0, xMin) - padH;
      // When contour is below (side=-1), include negative X in fit box
      if ((contourSide || 1) < 0 && !showMirror) {
        xMin = Math.min(xMin, -xMax);
      }
      const worldW = Math.max(6, zMax - zMin);
      const worldH = Math.max(6, xMax - xMin);
      let scale = Math.min((w - pad * 2) / worldW, (h - pad * 2) / worldH);
      // умный старт: мало сегментов — крупнее (контроль ввода)
      const nSeg = solved.segments?.length ?? 0;
      if (nSeg <= 2) scale = Math.min(scale * 1.35, (h - pad * 2) / Math.max(worldH * 0.55, 8));
      else if (nSeg <= 6) scale = Math.min(scale * 1.1, 120);
      view.current.scale = Math.max(0.4, Math.min(200, scale));
      view.current.ox = pad - zMin * view.current.scale + (w - pad * 2 - worldW * view.current.scale) / 2;
      // y = oy - x * side * scale  →  centre world X at mid-screen
      const sideFit = contourSide || 1;
      const xMid = (xMin + xMax) / 2;
      // slight vertical bias: leave extra margin on the outer (+X) side
      // so callouts / labels stay inside when contour is at bottom
      const bias = sideFit < 0 ? -h * 0.04 : h * 0.04;
      view.current.oy = h / 2 + bias + xMid * sideFit * view.current.scale;
    };

    const side = contourSide || 1;
    const toS = (z: number, x: number) => ({
      x: view.current.ox + z * view.current.scale,
      // side: 1 = контур сверху (+X вверх), −1 = снизу (контур под осью Z)
      y: view.current.oy - x * side * view.current.scale,
    });

    const draw = () => {
      if (!running) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w < 8 || h < 8) {
        raf = requestAnimationFrame(draw);
        return;
      }
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const geoKey = [
        solved.start.z.toFixed(4),
        solved.start.x.toFixed(4),
        solved.end.z.toFixed(4),
        solved.end.x.toFixed(4),
        solved.length.toFixed(4),
        solved.bbox.zMin.toFixed(3),
        solved.bbox.zMax.toFixed(3),
        solved.bbox.xMax.toFixed(3),
        doc.stock.diameter,
        doc.stock.length,
        showStock ? 1 : 0,
        showMirror ? 1 : 0,
        contourSide || 1,
        solved.elements.length,
      ].join("|");
      const sizeChanged = Math.abs(view.current.lastW - w) > 1 || Math.abs(view.current.lastH - h) > 1;
      const geoChanged = geoKey !== view.current.geoKey;
      if (view.current.forceFit || sizeChanged || geoChanged) {
        fit(w, h);
        view.current.forceFit = false;
        view.current.geoKey = geoKey;
        view.current.lastW = w;
        view.current.lastH = h;
      }

      const scale = view.current.scale;
      ctx.fillStyle = "#1a120c";
      ctx.fillRect(0, 0, w, h);

      if (showGrid) {
        const step = niceStep(48 / scale);
        ctx.strokeStyle = "rgba(232,197,71,0.07)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        const zA = Math.floor(-view.current.ox / scale / step) * step;
        const zB = Math.ceil((w - view.current.ox) / scale / step) * step;
        for (let z = zA; z <= zB; z += step) {
          const x = view.current.ox + z * scale;
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
        }
        const xA = Math.floor((view.current.oy - h) / scale / step) * step;
        const xB = Math.ceil(view.current.oy / scale / step) * step;
        for (let xv = xA; xv <= xB; xv += step) {
          const y = view.current.oy - xv * scale;
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
        }
        ctx.stroke();
      }

      const o = toS(0, 0);
      ctx.strokeStyle = Z_COL;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, o.y);
      ctx.lineTo(w, o.y);
      ctx.stroke();
      ctx.strokeStyle = X_COL;
      ctx.beginPath();
      ctx.moveTo(o.x, 0);
      ctx.lineTo(o.x, h);
      ctx.stroke();
      ctx.fillStyle = Z_COL;
      ctx.font = "11px 'IBM Plex Sans', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("+Z", Math.max(8, w - 28), o.y - 6);
      // +X shows turret / positive-radius side: top when side>0, bottom when side<0
      ctx.fillStyle = X_COL;
      ctx.textAlign = "left";
      if (side > 0) {
        ctx.fillText("+X", o.x + 6, 16);
        // small arrow toward +X (up)
        ctx.beginPath();
        ctx.moveTo(o.x, 22);
        ctx.lineTo(o.x - 4, 30);
        ctx.lineTo(o.x + 4, 30);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillText("+X", o.x + 6, h - 10);
        // small arrow toward +X (down)
        ctx.beginPath();
        ctx.moveTo(o.x, h - 22);
        ctx.lineTo(o.x - 4, h - 30);
        ctx.lineTo(o.x + 4, h - 30);
        ctx.closePath();
        ctx.fill();
      }

      const stockR = doc.stock.diameter / 2;
      const zFace = doc.stock.zFace;
      const zChuck = zFace - doc.stock.length;
      if (showStock && stockR > 0.05) {
        const a = toS(zChuck, stockR);
        const b = toS(zFace, -stockR);
        ctx.fillStyle = "rgba(90,74,58,0.28)";
        ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        ctx.strokeStyle = STOCK;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
        ctx.setLineDash([]);

        // Chuck jaws clamped to stock diameter
        const jawW = Math.max(14, 12 * scale);
        const jawReach = stockR * 0.5;
        const jawOuter = stockR + Math.max(3, 4 / Math.max(scale, 0.01));
        const topOuter = toS(zChuck, jawOuter);
        const topInner = toS(zChuck, Math.max(0, stockR - jawReach));
        const botOuter = toS(zChuck, -jawOuter);
        const botInner = toS(zChuck, -Math.max(0, stockR - jawReach));
        const drawJaw = (y0: number, y1: number) => {
          const top = Math.min(y0, y1);
          const hh = Math.max(2, Math.abs(y1 - y0));
          const grd = ctx.createLinearGradient(a.x - jawW, 0, a.x, 0);
          grd.addColorStop(0, "#2a2018");
          grd.addColorStop(0.45, CHUCK);
          grd.addColorStop(1, "#9a7850");
          ctx.fillStyle = grd;
          ctx.fillRect(a.x - jawW, top, jawW, hh);
          ctx.strokeStyle = PHOS;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(a.x - jawW, top, jawW, hh);
          ctx.strokeStyle = "rgba(20,14,10,0.5)";
          ctx.lineWidth = 1;
          for (let i = 1; i < 4; i++) {
            const yy = top + (hh * i) / 4;
            ctx.beginPath();
            ctx.moveTo(a.x - jawW + 2, yy);
            ctx.lineTo(a.x - 2, yy);
            ctx.stroke();
          }
        };
        drawJaw(topOuter.y, topInner.y);
        drawJaw(botInner.y, botOuter.y);
        ctx.fillStyle = "rgba(40,30,22,0.95)";
        const bodyTop = Math.min(topOuter.y, botOuter.y) - 6;
        const bodyH = Math.abs(botOuter.y - topOuter.y) + 12;
        ctx.fillRect(a.x - jawW - 8, bodyTop, 8, bodyH);
        ctx.strokeStyle = CHUCK;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(a.x - jawW - 8, bodyTop, 8, bodyH);
        ctx.fillStyle = PHOS_HOT;
        ctx.font = "11px 'IBM Plex Mono', monospace";
        ctx.textAlign = "right";
        ctx.fillText(`Ø${doc.stock.diameter}`, a.x - jawW - 12, (topOuter.y + botOuter.y) / 2 + 4);
      }

      const pts = contourPoints(solved, 0.35);
      if (pts.length > 1 && showMirror) {
        ctx.beginPath();
        const p0 = toS(pts[0].z, pts[0].x);
        ctx.moveTo(p0.x, p0.y);
        for (const p of pts) {
          const s = toS(p.z, p.x);
          ctx.lineTo(s.x, s.y);
        }
        for (let i = pts.length - 1; i >= 0; i--) {
          const s = toS(pts[i].z, -pts[i].x);
          ctx.lineTo(s.x, s.y);
        }
        ctx.closePath();
        ctx.fillStyle = "rgba(232,197,71,0.1)";
        ctx.fill();
      }

      /** Косая линия (есть ΔZ и ΔX) — как фаска, голубая */
      const isSlantedLine = (seg: { type: string; start: { z: number; x: number }; end: { z: number; x: number } }) => {
        if (seg.type !== "line") return false;
        const dz = Math.abs(seg.end.z - seg.start.z);
        const dx = Math.abs(seg.end.x - seg.start.x);
        return dz > 1e-6 && dx > 1e-6;
      };

      const colorForKind = (kind: string, active: boolean, slanted = false): string => {
        if (kind === "chamfer" || slanted) {
          return active ? "#7aefff" : COL_CHAMFER;
        }
        if (active) {
          if (kind === "arc" || kind === "rounding") return "#ffb0ff";
          return PHOS_HOT;
        }
        if (kind === "arc" || kind === "rounding") return COL_ARC;
        if (kind === "line") return COL_LINE;
        return PHOS;
      };

      const strokeSeg = (
        seg: {
          type: string;
          start: { z: number; x: number };
          end: { z: number; x: number };
          center?: { z: number; x: number };
          r?: number;
          sweep?: number;
        },
        color: string,
        width: number,
        sign: 1 | -1,
      ) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        if (seg.type === "line") {
          const a = toS(seg.start.z, seg.start.x * sign);
          const b = toS(seg.end.z, seg.end.x * sign);
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        } else if (seg.center && seg.r != null && seg.r > 0 && seg.sweep != null) {
          const swAbs = Math.abs(seg.sweep);
          const n = Math.max(24, Math.min(120, Math.ceil(swAbs / (Math.PI / 48)) || 24));
          const a0 = Math.atan2(seg.start.x - seg.center.x, seg.start.z - seg.center.z);
          for (let i = 0; i <= n; i++) {
            let p: { x: number; y: number };
            if (i === 0) {
              p = toS(seg.start.z, seg.start.x * sign);
            } else if (i === n) {
              p = toS(seg.end.z, seg.end.x * sign);
            } else {
              const ang = a0 + (seg.sweep * i) / n;
              p = toS(
                seg.center.z + seg.r * Math.cos(ang),
                (seg.center.x + seg.r * Math.sin(ang)) * sign,
              );
            }
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          }
        }
        ctx.stroke();
      };

      // Per-element: фаска/косая — голубые, дуги/R — розовые, ось-aligned линии — жёлтые
      for (const el of solved.elements) {
        if (el.kind === "start" || !el.segments?.length) continue;
        const isAct = el.id === selectedId;
        for (const seg of el.segments) {
          const slanted = el.kind === "chamfer" || isSlantedLine(seg);
          const col = colorForKind(el.kind, isAct, slanted);
          const ww = isAct ? 3.2 : slanted ? 2.8 : 2.2;
          strokeSeg(seg, col, ww, 1);
          if (showMirror) {
            const mcol = slanted || el.kind === "chamfer"
              ? "rgba(0,223,255,0.35)"
              : el.kind === "arc" || el.kind === "rounding"
                ? "rgba(255,125,255,0.35)"
                : "rgba(232,197,71,0.3)";
            strokeSeg(seg, mcol, 1.6, -1);
          }
        }
      }

      if (selectedId) {
        const sel = solved.elements.find((e) => e.id === selectedId);
        if (sel) {
          // Selected path already drawn brighter above; keep block for dim points

          // Dim points: for arc/rounding — start, vertex (mid), end (3 pts); else end (or start)
          const isArcLike =
            (sel.kind === "arc" || sel.kind === "rounding") &&
            sel.segments[0]?.type === "arc";
          let active = { z: sel.end.z, x: sel.end.x };
          if (sel.kind === "start") {
            active = { z: sel.start.z, x: sel.start.x };
          } else if (isArcLike) {
            const seg0 = sel.segments[0];
            const mid = arcVertexOf(seg0);
            const pts3 = [seg0.start, mid || seg0.end, seg0.end];
            const idx = Math.max(0, Math.min(2, arcPointIdx | 0));
            active = pts3[idx] || seg0.end;
          }

          // All three dim dots for arc/rounding (and endpoints for others)
          const DOT_R = 2.8;
          const drawDot = (pt: { z: number; x: number }, isAct: boolean) => {
            const p = toS(pt.z, pt.x);
            ctx.fillStyle = isAct ? COL_DIM_ACT : COL_DIM;
            ctx.beginPath();
            ctx.arc(p.x, p.y, isAct ? DOT_R + 0.5 : DOT_R, 0, Math.PI * 2);
            ctx.fill();
          };
          if (isArcLike) {
            const seg0 = sel.segments[0];
            const mid = arcVertexOf(seg0);
            const idx = Math.max(0, Math.min(2, arcPointIdx | 0));
            drawDot(seg0.start, idx === 0);
            if (mid) drawDot(mid, idx === 1);
            drawDot(seg0.end, idx === 2);
          } else if (sel.kind !== "start") {
            drawDot(sel.end, true);
          }

          const e = toS(active.z, active.x);
          const tBlink = reduced ? 1 : 0.5 + 0.5 * Math.sin(performance.now() / 133.333);
          ctx.save();
          ctx.globalAlpha = tBlink;
          ctx.fillStyle = PHOS_HOT;
          ctx.shadowColor = PHOS_HOT;
          ctx.shadowBlur = 16;
          ctx.beginPath();
          ctx.arc(e.x, e.y, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
          ctx.strokeStyle = "#fff8c8";
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.arc(e.x, e.y, 10, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(e.x - 14, e.y);
          ctx.lineTo(e.x + 14, e.y);
          ctx.moveTo(e.x, e.y - 14);
          ctx.lineTo(e.x, e.y + 14);
          ctx.stroke();
          ctx.restore();

          // Выноска: одна строка, полка слева; для середины дуги — те же G2/G3 X Z R I K
          
      // Direction arrows (pilot): mid-segment tangent ticks
      if (showArrows) {
        for (const seg of solved.segments) {
          let mz: number, mx: number, tz: number, tx: number;
          if (seg.type === "line") {
            mz = (seg.start.z + seg.end.z) / 2;
            mx = (seg.start.x + seg.end.x) / 2;
            tz = seg.end.z - seg.start.z;
            tx = seg.end.x - seg.start.x;
          } else {
            const a0 = Math.atan2(seg.start.x - seg.center.x, seg.start.z - seg.center.z);
            const amid = a0 + seg.sweep * 0.5;
            mz = seg.center.z + seg.r * Math.cos(amid);
            mx = seg.center.x + seg.r * Math.sin(amid);
            // tangent
            tz = seg.cw ? Math.sin(amid) : -Math.sin(amid);
            tx = seg.cw ? -Math.cos(amid) : Math.cos(amid);
          }
          const L = Math.hypot(tz, tx) || 1;
          tz /= L;
          tx /= L;
          const p = toS(mz, mx);
          const sc = view.current.scale;
          const ah = 7;
          // screen direction: dz -> +x screen, dx -> -y screen (with side)
          const sideA = contourSide || 1;
          const sx = tz * sc;
          const sy = -tx * sideA * sc;
          const sL = Math.hypot(sx, sy) || 1;
          const ux = sx / sL;
          const uy = sy / sL;
          const tipX = p.x + ux * 10;
          const tipY = p.y + uy * 10;
          ctx.strokeStyle = "rgba(120, 220, 180, 0.85)";
          ctx.fillStyle = "rgba(120, 220, 180, 0.85)";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(p.x - ux * 6, p.y - uy * 6);
          ctx.lineTo(tipX, tipY);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(tipX - ux * ah + uy * 4, tipY - uy * ah - ux * 4);
          ctx.lineTo(tipX - ux * ah - uy * 4, tipY - uy * ah + ux * 4);
          ctx.closePath();
          ctx.fill();
        }
      }

if (showDims) {
            const X = fromRadius(active.x, doc.xMode).toFixed(3);
            const Z = active.z.toFixed(3);
            let oneLine = "";
            if (sel.kind === "chamfer") {
              const b = (doc.elements.find((el) => el.id === sel.id) as { b?: number } | undefined)?.b;
              oneLine = `X${X} Z${Z} C${b != null ? b : "—"}`;
            } else if (sel.kind === "rounding" || sel.kind === "arc") {
              const gR = sel.cw ? "G2" : "G3";
              const RR = sel.radius ?? (sel.segments[0]?.type === "arc" ? sel.segments[0].r : 0) ?? 0;
              oneLine = `${gR} X${X} Z${Z} R${RR.toFixed(3)}`;
              const c = sel.center || (sel.segments[0]?.type === "arc" ? sel.segments[0].center : undefined);
              if (c) {
                oneLine += ` I${fromRadius(c.x, doc.xMode).toFixed(3)} K${c.z.toFixed(3)}`;
              }
              if (isArcLike && (arcPointIdx | 0) === 1) {
                oneLine += " · вершина";
              }
            } else if (sel.kind === "start") {
              oneLine = `X${X} Z${Z}`;
            } else if (sel.kind === "line") {
              const angA = sel.angleDeg;
              const isHorizontal =
                angA != null && (Math.abs(angA) < 0.01 || Math.abs(Math.abs(angA) - 180) < 0.01);
              const isVertical = angA != null && Math.abs(Math.abs(angA) - 90) < 0.01;
              const isSlanted = angA != null && !isHorizontal && !isVertical;
              if (isSlanted) {
                oneLine = `X${X} Z${Z} A${angA!.toFixed(2)} L${(sel.length || 0).toFixed(3)}`;
              } else {
                oneLine = `X${X} Z${Z}`;
              }
            } else {
              oneLine = `X${X} Z${Z}`;
            }
            let refX = 0;
            if (Number.isFinite(solved.start.x)) refX = Math.max(refX, solved.start.x);
            if (showStock && doc.stock.diameter > 0.05) {
              refX = Math.max(refX, doc.stock.diameter / 2);
            }
            drawDimCallout(ctx, e.x, e.y, [oneLine], w, h, {
              scale: view.current.scale,
              refX,
              toS,
              side,
            });
          }
        }
      }

      // Dim dots on non-selected arc/rounding (start / vertex / end) — soft red
      {
        const drawn = new Set<string>();
        const mark = (pt: { z: number; x: number }) => {
          const key = `${pt.z.toFixed(4)},${pt.x.toFixed(4)}`;
          if (drawn.has(key)) return;
          drawn.add(key);
          const p = toS(pt.z, pt.x);
          ctx.fillStyle = COL_DIM;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        };
        for (const el of solved.elements) {
          if (el.id === selectedId) continue;
          if (el.kind === "start") continue;
          const seg = el.segments?.[0];
          if ((el.kind === "arc" || el.kind === "rounding") && seg?.type === "arc") {
            mark(seg.start);
            const mid = arcVertexOf(seg);
            if (mid) mark(mid);
            mark(seg.end);
          } else {
            mark(el.end);
          }
        }
      }

// Start point: always visible as a small marker (even when selected —
      // the pulse sits on top of it)
      {
        const pS = toS(solved.start.z, solved.start.x);
        const startSelected = solved.elements[0]?.id === selectedId;
        ctx.save();
        ctx.fillStyle = startSelected ? PHOS_HOT : PHOS;
        ctx.strokeStyle = startSelected ? "#fff8c8" : "rgba(255,248,200,0.55)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(pS.x, pS.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // inner core for readability
        ctx.fillStyle = startSelected ? "#1a120c" : "rgba(26,18,12,0.85)";
        ctx.beginPath();
        ctx.arc(pS.x, pS.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if ((showTool || animating) && solved.length > 0) {
        if (animating && !reduced) view.current.anim += 0.35;
        const at = pointAtLength(solved, view.current.anim % solved.length);
        if (at) {
          const p = toS(at.p.z, at.p.x);
          const ang = Math.atan2(-at.tangent.x, at.tangent.z);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(ang);
          ctx.fillStyle = STEEL;
          ctx.beginPath();
          ctx.moveTo(10, 0);
          ctx.lineTo(-6, 7);
          ctx.lineTo(-6, -7);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }

      ctx.fillStyle = "rgba(26,18,12,0.88)";
      ctx.fillRect(8, 8, 200, 44);
      ctx.strokeStyle = "rgba(61,48,40,0.95)";
      ctx.strokeRect(8, 8, 200, 44);
      ctx.fillStyle = STEEL;
      ctx.font = "10px 'IBM Plex Sans', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("ПЛОСКОСТЬ  G18  ZX", 16, 24);
      ctx.fillStyle = PHOS;
      ctx.font = "12px 'IBM Plex Mono', monospace";
      ctx.fillText(`L ${solved.length.toFixed(3)} мм`, 16, 42);

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const wz = (mx - view.current.ox) / view.current.scale;
      const wx = ((view.current.oy - my) / view.current.scale) * side;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      view.current.scale = Math.min(240, Math.max(0.5, view.current.scale * factor));
      view.current.ox = mx - wz * view.current.scale;
      view.current.oy = my + wx * side * view.current.scale;
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      view.current.dragging = true;
      view.current.lx = e.clientX;
      view.current.ly = e.clientY;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!view.current.dragging) return;
      view.current.ox += e.clientX - view.current.lx;
      view.current.oy += e.clientY - view.current.ly;
      view.current.lx = e.clientX;
      view.current.ly = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      const distMove = Math.hypot(e.clientX - view.current.lx, e.clientY - view.current.ly);
      const wasDrag = view.current.dragging && distMove > 5;
      view.current.dragging = false;
      if (wasDrag) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const wz = (mx - view.current.ox) / view.current.scale;
      const wx = ((view.current.oy - my) / view.current.scale) * side;
      let best: { id: string; sub: number; d: number } | null = null;
      const consider = (id: string, sub: number, z: number, x: number) => {
        const d = Math.hypot(z - wz, x - wx);
        if (!best || d < best.d) best = { id, sub, d };
      };
      for (const el of solved.elements) {
        const seg = el.segments?.[0];
        if ((el.kind === "arc" || el.kind === "rounding") && seg?.type === "arc") {
          consider(el.id, 0, seg.start.z, seg.start.x);
          const mid = arcVertexOf(seg);
          if (mid) consider(el.id, 1, mid.z, mid.x);
          consider(el.id, 2, seg.end.z, seg.end.x);
        } else {
          consider(el.id, 2, el.end.z, el.end.x);
          consider(el.id, 0, el.start.z, el.start.x);
        }
      }
      if (best && best.d * view.current.scale < 40) select(best.id, best.sub);
    };
    const onDbl = () => {
      view.current.forceFit = true;
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("dblclick", onDbl);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("dblclick", onDbl);
    };
  }, [solved, doc, selectedId, arcPointIdx, showMirror, contourSide, showGrid, showDims, showStock, showTool, showArrows, animating, select, setArcPointIdx]);

  useEffect(() => {
    const onFit = () => {
      view.current.forceFit = true;
    };
    window.addEventListener("icp-fit-view", onFit);
    return () => window.removeEventListener("icp-fit-view", onFit);
  }, []);

  return (
    <div ref={wrapRef} className="relative h-full min-h-[200px] w-full overflow-hidden bg-background">
      <button type="button" className="icp-zflip-btn" data-icp-zflip
        title="Перенос заготовки по Z (и без контура)" onClick={() => flipZ?.()}>
        ← →<span className="sub">Z±</span>
      </button>

      <canvas ref={canvasRef} className="block size-full touch-none" />
      <button
        type="button"
        title="Центр / вписать деталь"
        onClick={() => window.dispatchEvent(new Event("icp-fit-view"))}
        className="absolute top-2 right-2 z-10 flex h-9 items-center gap-1.5 rounded-md border border-primary/40 bg-card/95 px-2.5 font-mono text-[11px] font-semibold text-phosphor shadow-md backdrop-blur-sm hover:bg-accent"
      >
        <span className="text-base leading-none">⊕</span>
        Центр
      </button>
      <div className="pointer-events-none absolute right-2 bottom-2 font-mono text-[10px] text-muted-foreground">
        автомасштаб · ⊕ Центр · колесо · клик по точке
      </div>
    </div>
  );
}


/** Drawing-style dimension leader — HTML portable behaviour:
 *  Shelf to the left; Y = outer side of stock/start ± 10 mm.
 *  When side < 0 the shelf is mirrored below the contour, but text always
 *  sits ABOVE the shelf (upright) so it never falls off the bottom edge.
 */
function drawDimCallout(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  lines: string[],
  canvasW: number,
  canvasH: number,
  opts: {
    scale: number;
    refX: number;
    side: number;
    toS: (z: number, x: number) => { x: number; y: number };
  },
) {
  if (!lines.length) return;
  const font = "bold 14px 'IBM Plex Mono', 'Consolas', monospace";
  ctx.font = font;
  let maxW = 0;
  for (const t of lines) maxW = Math.max(maxW, ctx.measureText(t).width);
  const padX = 8;
  const lineH = 17;
  const shelfW = Math.max(maxW + padX * 2, 100);

  const textBlockH = lines.length * lineH + 6;
  const mm10 = 10 * (opts.scale || 1);
  const side = opts.side || 1;
  // outer edge of stock/start (toS already applies side)
  const topY = opts.toS(0, opts.refX).y;
  // side>0: shelf further above contour; side<0: further below (mirrored)
  let kinkY = side > 0 ? topY - mm10 : topY + mm10;
  // Keep shelf + text (always drawn above the shelf) inside the canvas
  if (kinkY < textBlockH + 10) kinkY = textBlockH + 10;
  if (kinkY > canvasH - 12) kinkY = canvasH - 12;

  // If the active point is near the bottom and shelf would sit on top of it
  // awkwardly, still prefer a visible shelf above the text baseline.
  // (HTML: text always baseline-bottom on the shelf.)

  const dirX = -1;
  const lead = Math.max(36, Math.abs(py - kinkY) * 0.35);
  let kinkX = px + dirX * lead;
  if (kinkX - shelfW < 8) kinkX = shelfW + 8;
  const shelfEndX = kinkX + dirX * shelfW;

  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 1.6;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(kinkX, kinkY);
  ctx.lineTo(shelfEndX, kinkY);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px, py, 2.2, 0, Math.PI * 2);
  ctx.fill();

  // Text always ABOVE the shelf, upright (never mirrored / never under the shelf)
  ctx.font = font;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  const tx = kinkX - padX;
  for (let j = 0; j < lines.length; j++) {
    const ty = kinkY - 4 - (lines.length - 1 - j) * lineH;
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "#000000";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.strokeText(lines[j], tx, ty);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(lines[j], tx, ty);
  }
  ctx.restore();
}

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-6))));
  const n = raw / p;
  if (n < 1.5) return p;
  if (n < 3.5) return 2 * p;
  if (n < 7.5) return 5 * p;
  return 10 * p;
}
