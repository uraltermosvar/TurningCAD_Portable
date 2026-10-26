import { add, DEG, dirFromAngle, dist, newId, v } from "./math.ts";
import type { Segment, UndercutElement, Vec } from "./types.ts";

export interface Din76Row {
  p: number;
  r: number;
  k: number;
  w: number;
  /** Diameter reduction: I = d − di. */
  di: number;
}

/** Practical shop table matching MANUALplus DIN 76 defaults (external, Form A-ish). */
export const DIN76_TABLE: Din76Row[] = [
  { p: 0.25, r: 0.12, k: 0.75, w: 30, di: 0.3 },
  { p: 0.3, r: 0.16, k: 0.9, w: 30, di: 0.4 },
  { p: 0.35, r: 0.16, k: 1.05, w: 30, di: 0.4 },
  { p: 0.4, r: 0.2, k: 1.2, w: 30, di: 0.5 },
  { p: 0.45, r: 0.2, k: 1.35, w: 30, di: 0.5 },
  { p: 0.5, r: 0.25, k: 1.5, w: 30, di: 0.6 },
  { p: 0.6, r: 0.3, k: 1.8, w: 30, di: 0.7 },
  { p: 0.7, r: 0.35, k: 2.1, w: 30, di: 0.8 },
  { p: 0.75, r: 0.4, k: 2.25, w: 30, di: 0.9 },
  { p: 0.8, r: 0.4, k: 2.4, w: 30, di: 0.9 },
  { p: 1, r: 0.5, k: 3, w: 30, di: 1.1 },
  { p: 1.25, r: 0.6, k: 3.75, w: 30, di: 1.3 },
  { p: 1.5, r: 0.8, k: 4.5, w: 30, di: 1.6 },
  { p: 1.75, r: 0.9, k: 5.25, w: 30, di: 1.8 },
  { p: 2, r: 1, k: 6, w: 30, di: 2.0 },
  { p: 2.5, r: 1.2, k: 7.5, w: 30, di: 2.6 },
  { p: 3, r: 1.6, k: 9, w: 30, di: 3.0 },
  { p: 3.5, r: 1.6, k: 10.5, w: 30, di: 3.6 },
  { p: 4, r: 2, k: 12, w: 30, di: 4.0 },
  { p: 4.5, r: 2, k: 13.5, w: 30, di: 4.5 },
  { p: 5, r: 2.5, k: 15, w: 30, di: 5.0 },
  { p: 5.5, r: 2.5, k: 16.5, w: 30, di: 5.5 },
  { p: 6, r: 3, k: 18, w: 30, di: 6.0 },
];

export function din76FromPitch(p: number, threadDia: number): { r: number; k: number; w: number; i: number } {
  const row = DIN76_TABLE.reduce((best, cur) =>
    Math.abs(cur.p - p) < Math.abs(best.p - p) ? cur : best,
  );
  return { r: row.r, k: row.k, w: row.w, i: threadDia - row.di };
}

export interface Din509Row {
  dMin: number;
  dMax: number;
  r: number;
  t: number;
  f: number;
}

/** DIN 509 Form E, series 1 (preferred). */
export const DIN509E_TABLE: Din509Row[] = [
  { dMin: 0, dMax: 1.6, r: 0.1, t: 0.1, f: 0.5 },
  { dMin: 1.6, dMax: 3, r: 0.2, t: 0.1, f: 1 },
  { dMin: 3, dMax: 10, r: 0.4, t: 0.2, f: 2 },
  { dMin: 10, dMax: 18, r: 0.6, t: 0.2, f: 2 },
  { dMin: 18, dMax: 80, r: 0.6, t: 0.3, f: 2.5 },
  { dMin: 80, dMax: 1e6, r: 1.0, t: 0.4, f: 4 },
];

export function din509eFromDia(d: number): { r: number; t: number; f: number } {
  const row = DIN509E_TABLE.find((r) => d > r.dMin && d <= r.dMax) ?? DIN509E_TABLE[DIN509E_TABLE.length - 1];
  return { r: row.r, t: row.t, f: row.f };
}

export function pitchFromDiameter(d: number): number {
  if (d <= 3) return 0.5;
  if (d <= 5) return 0.8;
  if (d <= 8) return 1.25;
  if (d <= 12) return 1.75;
  if (d <= 16) return 2;
  if (d <= 20) return 2.5;
  if (d <= 24) return 3;
  if (d <= 30) return 3.5;
  if (d <= 36) return 4;
  if (d <= 42) return 4.5;
  if (d <= 48) return 5;
  return 5.5;
}

function line(a: Vec, b: Vec, sourceId: string): Segment {
  return { type: "line", start: a, end: b, sourceId };
}

function arc(start: Vec, end: Vec, center: Vec, r: number, cw: boolean, sourceId: string): Segment {
  const a1 = Math.atan2(start.x - center.x, start.z - center.z);
  const a2 = Math.atan2(end.x - center.x, end.z - center.z);
  let sweep = a2 - a1;
  if (cw) {
    if (sweep > 0) sweep -= 2 * Math.PI;
  } else if (sweep < 0) sweep += 2 * Math.PI;
  return { type: "arc", start, end, center, r, cw, sweep, sourceId };
}

/**
 * Expand a DIN 76 thread undercut into line/arc segments.
 *
 * J=1: longitudinal (const X) → undercut → transverse (const Z).
 * Geometry in the radius-ZX plane:
 *   depth δ = r_thread − r_under
 *   entry at angle W from the cylinder toward the axis
 *   Δz_entry = δ / tan(W)
 *   bottom along Z of remaining K − Δz_entry − R
 *   exit radius R into the face
 */
export function expandDin76(
  start: Vec,
  el: UndercutElement,
  threadDia: number,
  xMode: "diameter" | "radius",
  toRadius: (X: number) => number,
): { segments: Segment[]; end: Vec } {
  const fp = el.fp ?? pitchFromDiameter(threadDia);
  const def = din76FromPitch(fp, threadDia);
  const I = el.i ?? def.i;
  const K = el.k ?? def.k;
  const W = el.w ?? def.w;
  const R = el.r ?? def.r;
  const xUnder = toRadius(I);
  const xThread = start.x;
  const depth = xThread - xUnder;
  if (Math.abs(depth) < 1e-9) {
    throw new Error("DIN 76: глубина канавки нулевая (I совпадает с диаметром резьбы)");
  }

  const towardChuck = el.j === 1 ? -1 : 1;
  // Face Z: if target Z given use it, else start.z + j*K
  const zFace = el.z ?? start.z + towardChuck * K;
  const xShoulder = el.x != null ? toRadius(el.x) : xThread + Math.sign(depth) * 4;

  // Longitudinal direction from start toward the face.
  const dirZ = Math.sign(zFace - start.z) || towardChuck;
  const tanW = Math.tan(W * DEG);
  if (Math.abs(tanW) < 1e-9) throw new Error("DIN 76: угол W слишком мал");
  const dzEntry = Math.abs(depth / tanW);
  const dzRad = R;
  const dzBottom = Math.max(0, K - dzEntry - dzRad);

  const p0 = start;
  const p1 = v(zFace - dirZ * (dzBottom + dzRad + dzEntry), xThread);
  const p2 = v(zFace - dirZ * (dzBottom + dzRad), xUnder);
  const p3 = v(zFace - dirZ * dzRad, xUnder);
  // Arc R into the face: center at (zFace - dirZ*R? wait center at z = zFace, x = xUnder + dirX*R)
  // Face is at zFace, going from xUnder toward xShoulder.
  const dirX = Math.sign(xShoulder - xUnder) || 1;
  // For OD: xUnder < xThread, xShoulder > xThread, dirX > 0.
  // Arc from p3 (zFace - dirZ*R, xUnder) to p4 (zFace, xUnder + dirX*R)
  const p4 = v(zFace, xUnder + dirX * R);
  const center = v(zFace, xUnder);
  // CW/CCW: OD J=1, dirZ=-1, dirX=+1: from left-of-face up... 
  // p3 is at more positive Z than face if dirZ=-1 (face more negative).
  // From p3 (right of face if Z+) actually dirZ=-1: p3.z = zFace - (-1)*R = zFace+R (to the right of face)
  // to p4 (zFace, xUnder+R) (up). That's CW if Z right X up? From 3 o'clock-ish...
  // Vector from C= (zFace, xUnder): p3-C = (dirZ? zFace+R - zFace, 0) = (+R, 0) when dirZ=-1
  // p4-C = (0, R)
  // From +Z to +X is CCW. But wait dirZ=-1 means p3 is at +R in Z. Yes G3.
  // If dirZ=+1, p3.z = zFace - R, from -Z to +X is CW.
  const cw = dirZ > 0 ? dirX > 0 : dirX < 0;
  const p5 = v(zFace, xShoulder);

  const id = el.id;
  const segs: Segment[] = [];
  if (dist(p0, p1) > 1e-6) segs.push(line(p0, p1, id));
  segs.push(line(p1, p2, id));
  if (dist(p2, p3) > 1e-6) segs.push(line(p2, p3, id));
  segs.push(arc(p3, p4, center, R, cw, id));
  if (dist(p4, p5) > 1e-6) segs.push(line(p4, p5, id));
  return { segments: segs, end: p5 };
}

/**
 * DIN 509 E: radial undercut at a 90° shoulder.
 * Contour (OD, −Z then −X or +X on the face):
 *   cylinder → width f → depth t with radius r → face.
 */
export function expandDin509(
  start: Vec,
  el: UndercutElement,
  dia: number,
  form: "din509e" | "din509f",
  toRadius: (X: number) => number,
): { segments: Segment[]; end: Vec } {
  const def = din509eFromDia(dia);
  const r = el.r ?? def.r;
  const t = el.t ?? def.t;
  const f = el.f ?? def.f;
  const zFace = el.z ?? start.z - f;
  const xShoulder = el.x != null ? toRadius(el.x) : start.x + 6;
  const dirZ = Math.sign(zFace - start.z) || -1;
  const xBot = start.x - t;
  if (xBot < -1e-6) throw new Error("DIN 509: канавка пересекает ось");

  const id = el.id;
  const p0 = start;
  const p1 = v(zFace - dirZ * f, start.x);
  // Arc r from cylinder into the groove (quarter-ish)
  const c1 = v(p1.z, start.x - r);
  const p2 = v(p1.z, xBot);
  // If r != t, go vertical from r-drop to depth
  const pArc1 = v(p1.z, start.x - r);
  const segs: Segment[] = [];
  if (dist(p0, p1) > 1e-6) segs.push(line(p0, p1, id));

  // Arc from cylinder (p1) CW/CCW to pArc1
  const cw1 = dirZ < 0; // OD going -Z then down in X: from +Z dir into -X is CW? 
  // p1 relative to c1: (0, r), to pArc1: wait pArc1 IS (p1.z, start.x - r) which is c1.
  // Better: center at (p1.z + dirZ*r? Standard E:
  // Center of the cylinder-side radius: (z = p1.z, x = start.x - r) no.
  // The radius sits in the groove: start at cylinder, arc down and toward the face.
  // Center: z = p1.z + dirZ * 0? 
  // Typical: center at (z_start_of_groove + 0, x = x_cyl - r) and we arc from
  // (z, x_cyl) which is not at distance r from that center...
  // Correct: center C = (p1.z, start.x - r), start P1 = (p1.z, start.x), |P1-C|=r.
  // End of quarter: (p1.z + dirZ*r, start.x - r). That's INTO the groove axially.
  const cEntry = v(p1.z, start.x - r);
  const pEntryEnd = v(p1.z + dirZ * r, start.x - r);
  const cwEntry = dirZ < 0 ? true : false;
  segs.push(arc(p1, pEntryEnd, cEntry, r, cwEntry, id));

  const pBot = v(zFace - dirZ * r, xBot);
  // If t != r, drop to depth
  const pAfterR = v(pEntryEnd.z, xBot);
  if (Math.abs(t - r) > 1e-6) segs.push(line(pEntryEnd, pAfterR, id));
  const pBotStart = Math.abs(t - r) > 1e-6 ? pAfterR : pEntryEnd;
  if (dist(pBotStart, pBot) > 1e-6) segs.push(line(pBotStart, pBot, id));

  if (form === "din509f") {
    // Second radius into the face (axial undercut)
    const c2 = v(zFace, xBot + r);
    const pFace = v(zFace, xBot + r);
    const cw2 = dirZ < 0 ? false : true;
    segs.push(arc(pBot, pFace, v(zFace, xBot + r), r, cw2, id));
    const pEnd = v(zFace, xShoulder);
    if (dist(pFace, pEnd) > 1e-6) segs.push(line(pFace, pEnd, id));
    return { segments: segs, end: pEnd };
  }

  // Form E: rise to the face diameter along Z=zFace? E only cuts the cylinder,
  // the face stays at original X after a short run. Connect to face at zFace
  // going out to xShoulder from xBot through a sharp inner corner, then up.
  const pInner = v(zFace, xBot);
  if (dist(pBot, pInner) > 1e-6) segs.push(line(pBot, pInner, id));
  const pEnd = v(zFace, xShoulder);
  segs.push(line(pInner, pEnd, id));
  return { segments: segs, end: pEnd };
}

export function defaultUndercut(form: UndercutElement["form"]): UndercutElement {
  return {
    id: newId("u"),
    kind: "undercut",
    form,
    j: 1,
  };
}

export function undercutTitle(form: UndercutElement["form"]): string {
  if (form === "din76") return "DIN 76";
  if (form === "din509e") return "DIN 509 E";
  return "DIN 509 F";
}

/** Unused import guard helper kept for angle-based construction elsewhere. */
export function entryDelta(depth: number, wDeg: number): Vec {
  const u = dirFromAngle(180 - wDeg);
  const L = Math.abs(depth / Math.sin(wDeg * DEG));
  return add(v(0, 0), { z: u.z * L, x: Math.sign(depth) * -Math.abs(u.x * L) });
}
