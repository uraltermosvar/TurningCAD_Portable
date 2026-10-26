import type { Vec, LineDir, Segment } from "./types.ts";

export const EPS = 1e-9;
export const DEG = Math.PI / 180;

export function almostEqual(a: number, b: number, eps = 1e-7): boolean {
  return Math.abs(a - b) <= eps;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function v(z: number, x: number): Vec {
  return { z, x };
}

export function add(a: Vec, b: Vec): Vec {
  return { z: a.z + b.z, x: a.x + b.x };
}

export function sub(a: Vec, b: Vec): Vec {
  return { z: a.z - b.z, x: a.x - b.x };
}

export function scale(a: Vec, s: number): Vec {
  return { z: a.z * s, x: a.x * s };
}

export function mid(a: Vec, b: Vec): Vec {
  return { z: (a.z + b.z) / 2, x: (a.x + b.x) / 2 };
}

export function dot(a: Vec, b: Vec): number {
  return a.z * b.z + a.x * b.x;
}

/** z × x component of the 2D cross product in the ZX plane. */
export function cross(a: Vec, b: Vec): number {
  return a.z * b.x - a.x * b.z;
}

export function hypotV(a: Vec): number {
  return Math.hypot(a.z, a.x);
}

export function dist(a: Vec, b: Vec): number {
  return hypotV(sub(b, a));
}

export function norm(a: Vec): Vec {
  const L = hypotV(a);
  if (L < EPS) return { z: 0, x: 0 };
  return { z: a.z / L, x: a.x / L };
}

/** Rotate 90° CCW in ZX (Z as Cartesian x, X as Cartesian y). */
export function perpCCW(a: Vec): Vec {
  return { z: -a.x, x: a.z };
}

/** Rotate 90° CW in ZX. */
export function perpCW(a: Vec): Vec {
  return { z: a.x, x: -a.z };
}

/** Polar angle from +Z toward +X, radians. */
export function ang(a: Vec): number {
  return Math.atan2(a.x, a.z);
}

export function dirFromAngle(deg: number): Vec {
  const r = deg * DEG;
  return { z: Math.cos(r), x: Math.sin(r) };
}

export function radToDeg(r: number): number {
  return r / DEG;
}

export function degToRad(d: number): number {
  return d * DEG;
}

export function wrapDeg(d: number): number {
  let x = d % 360;
  if (x > 180) x -= 360;
  if (x <= -180) x += 360;
  return x;
}

export function wrapPi(a: number): number {
  let x = a;
  while (x <= -Math.PI) x += 2 * Math.PI;
  while (x > Math.PI) x -= 2 * Math.PI;
  return x;
}

export function toRadius(X: number, xMode: "diameter" | "radius"): number {
  return xMode === "diameter" ? X / 2 : X;
}

export function fromRadius(x: number, xMode: "diameter" | "radius"): number {
  return xMode === "diameter" ? x * 2 : x;
}

/**
 * Direction unit vector implied by an ICP line-direction key.
 * Diagonals return a 45° hint; the true angle may still be entered as A.
 */
export function dirVector(dir: LineDir, angleDeg?: number): Vec {
  if (dir === "z+") return { z: 1, x: 0 };
  if (dir === "z-") return { z: -1, x: 0 };
  if (dir === "x+") return { z: 0, x: 1 };
  if (dir === "x-") return { z: 0, x: -1 };
  if (angleDeg != null && Number.isFinite(angleDeg)) return dirFromAngle(quadrantAngle(dir, angleDeg));
  if (dir === "z+x+") return dirFromAngle(45);
  if (dir === "z+x-") return dirFromAngle(-45);
  if (dir === "z-x+") return dirFromAngle(135);
  return dirFromAngle(-135);
}

/**
 * ICP direction + drawing angle.
 * If |A| ≤ 90 and a diagonal dir is set, A is the inclination from the Z-axis
 * in that quadrant (shop 1×45°). If |A| > 90, A is the polar atan2 angle.
 */
export function quadrantAngle(dir: LineDir | undefined, a: number): number {
  if (!dir || dir === "z+" || dir === "z-" || dir === "x+" || dir === "x-") return a;
  if (Math.abs(a) > 90) return a;
  const mag = Math.abs(a);
  if (dir === "z+x+") return mag;
  if (dir === "z+x-") return -mag;
  if (dir === "z-x+") return 180 - mag;
  return 180 + mag;
}

export function isHorizontal(dir?: LineDir, a?: number): boolean {
  if (dir === "z+" || dir === "z-") return true;
  if (a != null && Number.isFinite(a)) {
    const w = ((a % 180) + 180) % 180;
    return almostEqual(w, 0) || almostEqual(w, 180);
  }
  return false;
}

export function isVertical(dir?: LineDir, a?: number): boolean {
  if (dir === "x+" || dir === "x-") return true;
  if (a != null && Number.isFinite(a)) {
    const w = ((a % 180) + 180) % 180;
    return almostEqual(w, 90);
  }
  return false;
}

export function signZ(dir?: LineDir): number | null {
  if (!dir) return null;
  if (dir.startsWith("z+")) return 1;
  if (dir.startsWith("z-")) return -1;
  return 0;
}

export function signX(dir?: LineDir): number | null {
  if (!dir) return null;
  if (dir === "x+") return 1;
  if (dir === "x-") return -1;
  if (dir.endsWith("x+")) return 1;
  if (dir.endsWith("x-")) return -1;
  return 0;
}

export interface LineHit {
  p: Vec;
  t: number;
  s: number;
}

/**
 * Intersection of two parametric lines p1 + t d1 and p2 + s d2.
 * d1, d2 need not be unit length; t, s are in those parameter units.
 */
export function intersectLines(p1: Vec, d1: Vec, p2: Vec, d2: Vec): LineHit | null {
  const den = cross(d1, d2);
  if (Math.abs(den) < EPS) return null;
  const w = sub(p2, p1);
  const t = cross(w, d2) / den;
  const s = cross(w, d1) / den;
  return { p: add(p1, scale(d1, t)), t, s };
}

export interface ArcCenterResult {
  center: Vec;
  r: number;
  sweep: number;
  cw: boolean;
}

/**
 * Center of a circular arc through P1 → P2 with radius R.
 *
 * In the ZX plane (Z right, X up):
 *   G2 = CW, G3 = CCW.
 * For the minor arc, the center lies to the right of chord P1P2 for CW
 * and to the left for CCW.
 *
 * Negative R follows the Fanuc/ISO convention: |R| with sweep > π.
 * `major` forces the long arc with positive R.
 *
 * Chord length d must satisfy d ≤ 2|R|.
 *
 *   M = (P1+P2)/2
 *   h = √(R² − (d/2)²)
 *   C = M ± h n̂
 */
export function arcFromRadius(
  p1: Vec,
  p2: Vec,
  radius: number,
  cw: boolean,
  major = false,
): ArcCenterResult {
  const rAbs = Math.abs(radius);
  if (rAbs < EPS) {
    throw new Error("Радиус дуги должен быть > 0");
  }
  const chord = sub(p2, p1);
  const d = hypotV(chord);
  if (d < EPS) {
    throw new Error("Хорда дуги нулевая: задайте конечную точку, отличную от начальной");
  }
  if (d > 2 * rAbs + 1e-7) {
    throw new Error(
      `Хорда ${d.toFixed(4)} мм больше 2R=${(2 * rAbs).toFixed(4)} мм — дуга невозможна`,
    );
  }
  const useMajor = major || radius < 0;
  const half = d / 2;
  const inside = Math.max(0, rAbs * rAbs - half * half);
  let h = Math.sqrt(inside);
  if (useMajor) h = -h;

  const u = scale(chord, 1 / d);
  const n = cw ? perpCW(u) : perpCCW(u);
  const center = add(mid(p1, p2), scale(n, h));
  const sweep = arcSweep(p1, p2, center, cw);
  return { center, r: rAbs, sweep, cw };
}

export function arcFromCenter(
  p1: Vec,
  p2: Vec,
  center: Vec,
  cw: boolean,
): ArcCenterResult {
  const r1 = dist(center, p1);
  const r2 = dist(center, p2);
  if (r1 < EPS) throw new Error("Центр дуги совпадает со стартом");
  if (Math.abs(r1 - r2) > 0.02 * Math.max(1, r1) && Math.abs(r1 - r2) > 0.02) {
    throw new Error(
      `Конец не лежит на окружности: Rстарт=${r1.toFixed(4)}, Rконец=${r2.toFixed(4)}`,
    );
  }
  const r = r1;
  const sweep = arcSweep(p1, p2, center, cw);
  return { center, r, sweep, cw };
}

/**
 * Signed sweep P1 → P2 around C.
 * CW sweeps are ≤ 0, CCW ≥ 0, in (−2π, 2π] excluding 0 unless P1=P2.
 */
export function arcSweep(p1: Vec, p2: Vec, center: Vec, cw: boolean): number {
  const a1 = ang(sub(p1, center));
  const a2 = ang(sub(p2, center));
  let sweep = a2 - a1;
  if (cw) {
    if (sweep > EPS) sweep -= 2 * Math.PI;
    else if (sweep > -EPS) sweep = 0;
  } else if (sweep < -EPS) sweep += 2 * Math.PI;
  else if (sweep < EPS) sweep = 0;
  return sweep;
}

export function pointOnArc(center: Vec, r: number, start: Vec, sweep: number, t: number): Vec {
  const a0 = ang(sub(start, center));
  const a = a0 + sweep * t;
  return { z: center.z + r * Math.cos(a), x: center.x + r * Math.sin(a) };
}

export function sampleArc(center: Vec, r: number, start: Vec, sweep: number, stepMm = 0.35): Vec[] {
  const len = Math.abs(sweep) * r;
  const n = Math.max(8, Math.ceil(len / stepMm));
  const pts: Vec[] = [];
  for (let i = 0; i <= n; i++) pts.push(pointOnArc(center, r, start, sweep, i / n));
  return pts;
}

export function sampleSegment(
  seg: { type: "line"; start: Vec; end: Vec } | { type: "arc"; start: Vec; end: Vec; center: Vec; r: number; sweep: number },
  stepMm = 0.4,
): Vec[] {
  if (seg.type === "line") {
    const L = dist(seg.start, seg.end);
    const n = Math.max(1, Math.ceil(L / Math.max(stepMm, 0.2)));
    const pts: Vec[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push({
        z: seg.start.z + (seg.end.z - seg.start.z) * t,
        x: seg.start.x + (seg.end.x - seg.start.x) * t,
      });
    }
    return pts;
  }
  return sampleArc(seg.center, seg.r, seg.start, seg.sweep, stepMm);
}

export interface FilletResult {
  t1: Vec;
  t2: Vec;
  center: Vec;
  cw: boolean;
  sweep: number;
  trim: number;
  interiorDeg: number;
}

/**
 * Fillet of radius R at the polyline corner start → corner → endHint.
 *
 * Let u1 be the incoming unit direction, u2 the outgoing.
 * The two element half-lines from the corner are −u1 and u2.
 * Interior angle α = ∠(−u1, u2) (the wedge replaced by the fillet).
 * Tangent length t = R / tan(α/2).
 * The fillet is CW iff the contour turns right (cross(u1,u2) < 0).
 */
export function filletLines(start: Vec, corner: Vec, endHint: Vec, radius: number): FilletResult {
  if (radius <= EPS) throw new Error("Радиус скругления должен быть > 0");
  const u1 = norm(sub(corner, start));
  const u2 = norm(sub(endHint, corner));
  if (hypotV(u1) < EPS || hypotV(u2) < EPS) {
    throw new Error("Вырожденный угол: нулевая длина смежного элемента");
  }
  const back = scale(u1, -1);
  const cr = cross(back, u2);
  const dt = dot(back, u2);
  const alpha = Math.abs(Math.atan2(cr, dt));
  if (alpha < 1e-4 || alpha > Math.PI - 1e-4) {
    throw new Error("Скругление невозможно: элементы почти коллинеарны");
  }
  const trim = radius / Math.tan(alpha / 2);
  const t1 = add(corner, scale(u1, -trim));
  const t2 = add(corner, scale(u2, trim));
  const turn = cross(u1, u2);
  const cw = turn < 0;
  const inward = cw ? perpCW(u1) : perpCCW(u1);
  const center = add(t1, scale(inward, radius));
  const sweep = arcSweep(t1, t2, center, cw);
  return { t1, t2, center, cw, sweep, trim, interiorDeg: radToDeg(alpha) };
}

export interface ChamferResult {
  t1: Vec;
  t2: Vec;
  trim: number;
  faceLen: number;
  interiorDeg: number;
}

/**
 * Isosceles chamfer: trim distance B along each adjacent element from the
 * theoretical corner (Heidenhain «Fasenbreite B»).
 * For a 90° corner this is the classic B×45° (cathetus B, face B√2).
 *
 * Face length = 2 B sin(α/2), where α is the interior angle of the corner.
 */
export function chamferLines(start: Vec, corner: Vec, endHint: Vec, b: number): ChamferResult {
  if (b <= EPS) throw new Error("Ширина фаски должна быть > 0");
  const u1 = norm(sub(corner, start));
  const u2 = norm(sub(endHint, corner));
  if (hypotV(u1) < EPS || hypotV(u2) < EPS) {
    throw new Error("Вырожденный угол для фаски");
  }
  const back = scale(u1, -1);
  const alpha = Math.abs(Math.atan2(cross(back, u2), dot(back, u2)));
  if (alpha < 1e-4) throw new Error("Фаска невозможна: элементы коллинеарны");
  const t1 = add(corner, scale(u1, -b));
  const t2 = add(corner, scale(u2, b));
  return {
    t1,
    t2,
    trim: b,
    faceLen: dist(t1, t2),
    interiorDeg: radToDeg(alpha),
  };
}

export function trimLineEnd(start: Vec, end: Vec, trim: number): Vec {
  const L = dist(start, end);
  if (L < EPS) return start;
  if (trim >= L - EPS) throw new Error("Подрезка длиннее элемента");
  const u = norm(sub(end, start));
  return add(start, scale(u, L - trim));
}

export function trimLineStart(start: Vec, end: Vec, trim: number): Vec {
  const L = dist(start, end);
  if (L < EPS) return end;
  if (trim >= L - EPS) throw new Error("Подрезка длиннее элемента");
  const u = norm(sub(end, start));
  return add(start, scale(u, trim));
}

export function lineLength(start: Vec, end: Vec): number {
  return dist(start, end);
}

export function arcLength(r: number, sweep: number): number {
  return Math.abs(sweep) * r;
}

/** Closest point on segment AB to P, with parameter t in [0,1]. */
export function closestOnSeg(p: Vec, a: Vec, b: Vec): { q: Vec; t: number; d: number } {
  const ab = sub(b, a);
  const L2 = dot(ab, ab);
  if (L2 < EPS) return { q: a, t: 0, d: dist(p, a) };
  const t = clamp(dot(sub(p, a), ab) / L2, 0, 1);
  const q = add(a, scale(ab, t));
  return { q, t, d: dist(p, q) };
}

export function lerp(a: Vec, b: Vec, t: number): Vec {
  return { z: a.z + (b.z - a.z) * t, x: a.x + (b.x - a.x) * t };
}

export function bboxOf(points: Vec[]): { zMin: number; zMax: number; xMin: number; xMax: number } {
  if (points.length === 0) return { zMin: 0, zMax: 1, xMin: 0, xMax: 1 };
  let zMin = Infinity,
    zMax = -Infinity,
    xMin = Infinity,
    xMax = -Infinity;
  for (const p of points) {
    if (p.z < zMin) zMin = p.z;
    if (p.z > zMax) zMax = p.z;
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
  }
  return { zMin, zMax, xMin, xMax };
}


/** Path length of a solved segment. */
export function segLength(seg: Segment): number {
  if (seg.type === "line") return dist(seg.start, seg.end);
  return Math.abs(seg.sweep) * seg.r;
}

/** Unit travel direction at the end of a segment. */
export function tangentAtEnd(seg: Segment): Vec {
  if (seg.type === "line") {
    const d = sub(seg.end, seg.start);
    return hypotV(d) > EPS ? norm(d) : { z: 1, x: 0 };
  }
  const radial = norm(sub(seg.end, seg.center));
  return seg.cw ? perpCW(radial) : perpCCW(radial);
}

/** Unit travel direction at the start of a segment. */
export function tangentAtStart(seg: Segment): Vec {
  if (seg.type === "line") {
    const d = sub(seg.end, seg.start);
    return hypotV(d) > EPS ? norm(d) : { z: 1, x: 0 };
  }
  const radial = norm(sub(seg.start, seg.center));
  return seg.cw ? perpCW(radial) : perpCCW(radial);
}

/** Point on segment at arc-length s from the start (clamped). */
export function pointAtSegParam(seg: Segment, s: number): Vec {
  const L = segLength(seg);
  if (L < EPS) return seg.start;
  const t = Math.max(0, Math.min(1, s / L));
  if (seg.type === "line") {
    return {
      z: seg.start.z + (seg.end.z - seg.start.z) * t,
      x: seg.start.x + (seg.end.x - seg.start.x) * t,
    };
  }
  return pointOnArc(seg.center, seg.r, seg.start, seg.sweep, t);
}

/** Point on segment at distance d before its end. */
export function pointBeforeEnd(seg: Segment, d: number): Vec {
  const L = segLength(seg);
  return pointAtSegParam(seg, Math.max(0, L - d));
}

/** Point on segment at distance d after its start. */
export function pointAfterStart(seg: Segment, d: number): Vec {
  return pointAtSegParam(seg, d);
}

/** Truncate segment so it ends at newEnd (recompute arc sweep). */
export function trimSegToEnd(seg: Segment, newEnd: Vec): Segment {
  if (seg.type === "line") return { ...seg, end: newEnd };
  const sweep = arcSweep(seg.start, newEnd, seg.center, seg.cw);
  return { ...seg, end: newEnd, sweep };
}

/** Truncate segment so it starts at newStart (recompute arc sweep). */
export function trimSegFromStart(seg: Segment, newStart: Vec): Segment {
  if (seg.type === "line") return { ...seg, start: newStart };
  const sweep = arcSweep(newStart, seg.end, seg.center, seg.cw);
  return { ...seg, start: newStart, sweep };
}

export function newId(prefix = "e"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}
