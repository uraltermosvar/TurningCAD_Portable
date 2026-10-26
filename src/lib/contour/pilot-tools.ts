/**
 * Pilot tooling: machine limits, self-intersection hints,
 * SVG export, templates, Z-mirror of document elements.
 */
import { dist, fromRadius, toRadius } from "./math.ts";
import type {
  ContourDoc,
  ContourElement,
  SolvedContour,
  XMode,
} from "./types.ts";
import { newId } from "./math.ts";

export type PostProfileId = "iso-fanuc" | "iso-siemens" | "haas";

export interface MachineLimits {
  xMin: number; // diameter or radius depending on mode display — stored as diameter Ø
  xMax: number;
  zMin: number;
  zMax: number;
}

export const DEFAULT_LIMITS: MachineLimits = {
  xMin: 0,
  xMax: 400,
  zMin: -600,
  zMax: 50,
};

export interface LimitHit {
  level: "warn" | "error";
  message: string;
}

export function checkMachineLimits(
  solved: SolvedContour,
  limits: MachineLimits,
  mode: XMode,
): LimitHit[] {
  const hits: LimitHit[] = [];
  const pts = [solved.start, ...solved.segments.map((s) => s.end)];
  for (const p of pts) {
    if (!p || !Number.isFinite(p.z) || !Number.isFinite(p.x)) continue;
    const X = fromRadius(p.x, mode); // display X (Ø if diameter)
    if (X > limits.xMax + 1e-6)
      hits.push({ level: "error", message: `X=${X.toFixed(3)} > лимит Xmax=${limits.xMax}` });
    if (X < limits.xMin - 1e-6)
      hits.push({ level: "error", message: `X=${X.toFixed(3)} < лимит Xmin=${limits.xMin}` });
    if (p.z > limits.zMax + 1e-6)
      hits.push({ level: "error", message: `Z=${p.z.toFixed(3)} > лимит Zmax=${limits.zMax}` });
    if (p.z < limits.zMin - 1e-6)
      hits.push({ level: "error", message: `Z=${p.z.toFixed(3)} < лимит Zmin=${limits.zMin}` });
  }
  // dedupe
  const seen = new Set<string>();
  return hits.filter((h) => {
    if (seen.has(h.message)) return false;
    seen.add(h.message);
    return true;
  });
}

/** Polyline approximation of any segment (line or arc). */
function segPolyline(seg: SolvedContour["segments"][number], nArc = 16): { z: number; x: number }[] {
  if (seg.type === "line") return [seg.start, seg.end];
  const pts: { z: number; x: number }[] = [];
  const a0 = Math.atan2(seg.start.x - seg.center.x, seg.start.z - seg.center.z);
  const n = Math.max(8, Math.ceil((Math.abs(seg.sweep) / Math.PI) * nArc));
  for (let i = 0; i <= n; i++) {
    const a = a0 + (seg.sweep * i) / n;
    pts.push({
      z: seg.center.z + seg.r * Math.cos(a),
      x: seg.center.x + seg.r * Math.sin(a),
    });
  }
  return pts;
}

/** Self-intersection: all segment pairs via polyline (lines + arcs). */
export function findSelfIntersections(solved: SolvedContour): LimitHit[] {
  const hits: LimitHit[] = [];
  function orient(a: { z: number; x: number }, b: { z: number; x: number }, c: { z: number; x: number }) {
    return (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
  }
  function onSeg(a: { z: number; x: number }, b: { z: number; x: number }, c: { z: number; x: number }) {
    return (
      Math.min(a.z, b.z) - 1e-6 <= c.z &&
      c.z <= Math.max(a.z, b.z) + 1e-6 &&
      Math.min(a.x, b.x) - 1e-6 <= c.x &&
      c.x <= Math.max(a.x, b.x) + 1e-6
    );
  }
  function crosses(
    a: { z: number; x: number },
    b: { z: number; x: number },
    c: { z: number; x: number },
    d: { z: number; x: number },
  ) {
    const o1 = orient(a, b, c);
    const o2 = orient(a, b, d);
    const o3 = orient(c, d, a);
    const o4 = orient(c, d, b);
    if (o1 * o2 < 0 && o3 * o4 < 0) return true;
    if (Math.abs(o1) < 1e-9 && onSeg(a, b, c)) return true;
    if (Math.abs(o2) < 1e-9 && onSeg(a, b, d)) return true;
    if (Math.abs(o3) < 1e-9 && onSeg(c, d, a)) return true;
    if (Math.abs(o4) < 1e-9 && onSeg(c, d, b)) return true;
    return false;
  }
  const polys = solved.segments.map((s) => segPolyline(s));
  for (let i = 0; i < polys.length; i++) {
    for (let j = i + 2; j < polys.length; j++) {
      const A = polys[i]!;
      const B = polys[j]!;
      let hit = false;
      for (let ia = 0; ia < A.length - 1 && !hit; ia++) {
        for (let ib = 0; ib < B.length - 1 && !hit; ib++) {
          if (crosses(A[ia]!, A[ia + 1]!, B[ib]!, B[ib + 1]!)) hit = true;
        }
      }
      if (hit) {
        hits.push({
          level: "warn",
          message: `Возможное самопересечение сегм. #${i + 1} и #${j + 1}`,
        });
      }
    }
  }
  return hits;
}



/** Sharp corner angle check (degrees between consecutive tangents). */
export function findSharpCorners(solved: SolvedContour, minDeg = 12): LimitHit[] {
  const hits: LimitHit[] = [];
  const segs = solved.segments;
  for (let i = 0; i < segs.length - 1; i++) {
    const a = segs[i]!;
    const b = segs[i + 1]!;
    const t1 =
      a.type === "line"
        ? { z: a.end.z - a.start.z, x: a.end.x - a.start.x }
        : a.cw
          ? { z: Math.sin(Math.atan2(a.end.x - a.center.x, a.end.z - a.center.z)), x: -Math.cos(Math.atan2(a.end.x - a.center.x, a.end.z - a.center.z)) }
          : { z: -Math.sin(Math.atan2(a.end.x - a.center.x, a.end.z - a.center.z)), x: Math.cos(Math.atan2(a.end.x - a.center.x, a.end.z - a.center.z)) };
    const t2 =
      b.type === "line"
        ? { z: b.end.z - b.start.z, x: b.end.x - b.start.x }
        : b.cw
          ? { z: Math.sin(Math.atan2(b.start.x - b.center.x, b.start.z - b.center.z)), x: -Math.cos(Math.atan2(b.start.x - b.center.x, b.start.z - b.center.z)) }
          : { z: -Math.sin(Math.atan2(b.start.x - b.center.x, b.start.z - b.center.z)), x: Math.cos(Math.atan2(b.start.x - b.center.x, b.start.z - b.center.z)) };
    const l1 = Math.hypot(t1.z, t1.x);
    const l2 = Math.hypot(t2.z, t2.x);
    if (l1 < 1e-9 || l2 < 1e-9) continue;
    const cos = (t1.z * t2.z + t1.x * t2.x) / (l1 * l2);
    const ang = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    if (ang > 180 - minDeg) {
      // nearly reverse — very sharp cusp
      hits.push({ level: "warn", message: `Острый излом ~${ang.toFixed(0)}° между сегм. ${i + 1}–${i + 2}` });
    }
  }
  return hits;
}

export function analyzeContour(solved: SolvedContour): LimitHit[] {
  return [...findSelfIntersections(solved), ...findSharpCorners(solved)];
}

/** Mirror document absolute Z about mid of bbox Z. */
export function mirrorDocZ(doc: ContourDoc, solved: SolvedContour): ContourDoc {
  let zMin = solved.start.z;
  let zMax = solved.start.z;
  for (const s of solved.segments) {
    zMin = Math.min(zMin, s.start.z, s.end.z);
    zMax = Math.max(zMax, s.start.z, s.end.z);
  }
  const zMid = (zMin + zMax) / 2;
  const mz = (z: number | null | undefined) =>
    z != null && Number.isFinite(z) ? 2 * zMid - z : z;

  const elements = doc.elements.map((el) => {
    if (el.kind === "start") return { ...el, zs: mz(el.zs) as number };
    if (el.kind === "line") {
      return {
        ...el,
        z: mz(el.z) as number | null,
        a: el.a != null && Number.isFinite(el.a) ? -el.a : el.a,
      };
    }
    if (el.kind === "arc") {
      return {
        ...el,
        z: mz(el.z) as number | null,
        k: mz(el.k) as number | null,
        rotation: el.rotation === "cw" ? ("ccw" as const) : ("cw" as const),
      };
    }
    return el;
  });
  return { ...doc, elements };
}

export type TemplateId = "chamfer45" | "groove" | "nose-r";

export function applyTemplate(
  doc: ContourDoc,
  solved: SolvedContour,
  id: TemplateId,
  mode: XMode,
): ContourDoc {
  const end = solved.end ?? solved.start;
  const X = fromRadius(end.x, mode);
  const Z = end.z;
  const els: ContourElement[] = [...doc.elements];
  if (id === "chamfer45") {
    // 1×45° style: back in Z and up in X by 1 mm (radius 0.5)
    els.push({
      id: newId("l"),
      kind: "line",
      x: fromRadius(end.x + 0.5, mode),
      z: Z - 1,
      a: 45,
    } as ContourElement);
  } else if (id === "groove") {
    els.push(
      { id: newId("l"), kind: "line", x: X, z: Z - 2 } as ContourElement,
      { id: newId("l"), kind: "line", x: fromRadius(Math.max(0, end.x - 1.5), mode), z: Z - 2 } as ContourElement,
      { id: newId("l"), kind: "line", x: fromRadius(Math.max(0, end.x - 1.5), mode), z: Z - 5 } as ContourElement,
      { id: newId("l"), kind: "line", x: X, z: Z - 5 } as ContourElement,
      { id: newId("l"), kind: "line", x: X, z: Z - 7 } as ContourElement,
    );
  } else if (id === "nose-r") {
    els.push({
      id: newId("a"),
      kind: "arc",
      rotation: "cw",
      r: 2,
      x: fromRadius(end.x + 2, mode),
      z: Z - 2,
      centerMode: "none",
    } as ContourElement);
  }
  return { ...doc, elements: els };
}

export function contourToSvg(
  solved: SolvedContour,
  opts?: { width?: number; height?: number; name?: string },
): string {
  const w = opts?.width ?? 800;
  const h = opts?.height ?? 400;
  const pad = 24;
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
  zMin -= 5;
  zMax += 5;
  xMax = Math.max(xMax + 5, 5);
  const zw = Math.max(zMax - zMin, 1);
  const scale = Math.min((w - 2 * pad) / zw, (h - 2 * pad) / (xMax * 1.2));
  const ox = pad - zMin * scale;
  const oy = h / 2;
  const px = (z: number, x: number) => `${(ox + z * scale).toFixed(2)},${(oy - x * scale).toFixed(2)}`;

  const parts: string[] = [];
  // axis
  parts.push(
    `<line x1="0" y1="${oy}" x2="${w}" y2="${oy}" stroke="#8ab0d0" stroke-width="1" opacity="0.5"/>`,
  );
  parts.push(
    `<line x1="${ox}" y1="0" x2="${ox}" y2="${h}" stroke="#d4a090" stroke-width="1" opacity="0.5"/>`,
  );
  for (const s of solved.segments) {
    if (s.type === "line") {
      const a = px(s.start.z, s.start.x).split(",");
      const b = px(s.end.z, s.end.x).split(",");
      parts.push(
        `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#e8c547" stroke-width="2"/>`,
      );
    } else {
      const n = Math.max(16, Math.ceil(Math.abs(s.sweep) / (Math.PI / 24)));
      const a0 = Math.atan2(s.start.x - s.center.x, s.start.z - s.center.z);
      const d: string[] = [];
      for (let i = 0; i <= n; i++) {
        const ang = a0 + (s.sweep * i) / n;
        const zz = s.center.z + s.r * Math.cos(ang);
        const xx = s.center.x + s.r * Math.sin(ang);
        const p = px(zz, xx);
        d.push(i === 0 ? `M ${p}` : `L ${p}`);
      }
      parts.push(`<path d="${d.join(" ")}" fill="none" stroke="#f0a0c0" stroke-width="2"/>`);
    }
  }
  const title = (opts?.name || "contour").replace(/[<>&]/g, "");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#0d1117"/>
  <text x="12" y="18" fill="#9aa4b2" font-size="12" font-family="monospace">${title}</text>
  ${parts.join("\n  ")}
</svg>
`;
}


/** Minimal DXF (LINE + ARC). CAD XY: X←Z, Y←x (radius). */
export function contourToDxf(solved: SolvedContour, name = "CONTOUR"): string {
  const lines: string[] = [];
  const w = (c: string | number) => { lines.push(String(c)); };
  w(0); w("SECTION"); w(2); w("HEADER");
  w(9); w("$INSUNITS"); w(70); w(4);
  w(0); w("ENDSEC");
  w(0); w("SECTION"); w(2); w("ENTITIES");
  for (const s of solved.segments) {
    if (s.type === "line") {
      w(0); w("LINE"); w(8); w("CONTOUR");
      w(10); w(s.start.z); w(20); w(s.start.x); w(30); w(0);
      w(11); w(s.end.z); w(21); w(s.end.x); w(31); w(0);
    } else {
      const a0 = Math.atan2(s.start.x - s.center.x, s.start.z - s.center.z);
      const a1 = Math.atan2(s.end.x - s.center.x, s.end.z - s.center.z);
      let startDeg = (a0 * 180) / Math.PI;
      let endDeg = (a1 * 180) / Math.PI;
      if (s.cw) {
        const t = startDeg; startDeg = endDeg; endDeg = t;
      }
      w(0); w("ARC"); w(8); w("CONTOUR");
      w(10); w(s.center.z); w(20); w(s.center.x); w(30); w(0);
      w(40); w(s.r);
      w(50); w(startDeg);
      w(51); w(endDeg);
    }
  }
  w(0); w("ENDSEC");
  w(0); w("EOF");
  return lines.join("\n") + "\n";
}
