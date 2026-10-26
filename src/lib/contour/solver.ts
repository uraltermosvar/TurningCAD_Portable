import { din76FromPitch, expandDin509, expandDin76, pitchFromDiameter } from "./din.ts";
import {
  add,
  ang,
  arcFromCenter,
  arcFromRadius,
  arcLength,
  arcSweep,
  bboxOf,
  chamferLines,
  cross,
  dirFromAngle,
  dist,
  dot,
  EPS,
  filletLines,
  fromRadius,
  hypotV,
  intersectLines,
  isHorizontal,
  isVertical,
  lineLength,
  norm,
  perpCCW,
  perpCW,
  pointAfterStart,
  pointBeforeEnd,
  quadrantAngle,
  radToDeg,
  scale,
  signX,
  signZ,
  sub,
  tangentAtEnd,
  tangentAtStart,
  toRadius,
  trimSegFromStart,
  trimSegToEnd,
  wrapDeg,
} from "./math.ts";
import type {
  ArcElement,
  ContourElement,
  ContourIssue,
  FormulaStep,
  LineDir,
  LineElement,
  Segment,
  SolvedContour,
  SolvedElement,
  StartElement,
  UndercutElement,
  Vec,
  XMode,
} from "./types.ts";

const OPEN = 1e-6;

function defined(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function toRad(X: number | undefined, mode: XMode): number | undefined {
  if (!defined(X)) return undefined;
  return toRadius(X, mode);
}

function formula(label: string, expr: string, value?: string): FormulaStep {
  return { label, expr, value };
}

function emptySolved(el: ContourElement, start: Vec, mode: XMode): SolvedElement {
  return {
    id: el.id,
    kind: el.kind,
    start,
    end: start,
    xEnd: fromRadius(start.x, mode),
    zEnd: start.z,
    length: 0,
    formulas: [],
    segments: [],
  };
}

function pack(
  el: ContourElement,
  start: Vec,
  end: Vec,
  segs: Segment[],
  formulas: FormulaStep[],
  mode: XMode,
  extra: Partial<SolvedElement> = {},
): SolvedElement {
  const length = segs.reduce((acc, s) => {
    if (s.type === "line") return acc + lineLength(s.start, s.end);
    return acc + arcLength(s.r, s.sweep);
  }, 0);
  const last = segs[segs.length - 1];
  const e = last ? last.end : end;
  return {
    id: el.id,
    kind: el.kind,
    start,
    end: e,
    xEnd: fromRadius(e.x, mode),
    zEnd: e.z,
    length,
    formulas,
    segments: segs,
    ...extra,
  };
}

interface LineSolve {
  end: Vec;
  angleDeg: number;
  length: number;
  formulas: FormulaStep[];
  deferred: boolean;
  dir: Vec;
}

function lineDirVec(el: LineElement): Vec | null {
  if (defined(el.a)) return dirFromAngle(quadrantAngle(el.dir, el.a));
  if (el.dir) {
    if (el.dir === "z+") return { z: 1, x: 0 };
    if (el.dir === "z-") return { z: -1, x: 0 };
    if (el.dir === "x+") return { z: 0, x: 1 };
    if (el.dir === "x-") return { z: 0, x: -1 };
  }
  return null;
}

function solveLineKnown(start: Vec, el: LineElement, mode: XMode): LineSolve {
  const formulas: FormulaStep[] = [];
  
  const xAbs = toRad(el.x, mode);
  const zAbs = el.z;
  const xInc = toRad(el.xi, mode);
  const zInc = el.zi;

  const hasX = defined(xAbs) || defined(xInc);
  const hasZ = defined(zAbs) || defined(zInc);
  const hasA = defined(el.a);
  const hasL = defined(el.l);

  // --- ПУНКТ 3: Только L (без A, X, Z, dir) ---
  // Принудительно строим отрезок по оси Z (в +Z или -Z).
  if (hasL && !hasA && !hasX && !hasZ && !el.dir) {
    const L = el.l!;
    const end = { z: start.z + L, x: start.x };
    formulas.push(formula("Отрезок L", "Только L: горизонтально по Z, X не меняется", `L=${L}`));
    formulas.push(formula("Конец", "Z = Zs + L", `Z=${end.z.toFixed(3)}`));
    return {
      end,
      angleDeg: L >= 0 ? 0 : 180,
      length: Math.abs(L),
      formulas,
      deferred: false,
      dir: L >= 0 ? { z: 1, x: 0 } : { z: -1, x: 0 },
    };
  }
  // ------------------------------------------

  let xEnd = start.x;
  let zEnd = start.z;

  if (defined(xAbs)) xEnd = xAbs;
  else if (defined(xInc)) xEnd = start.x + xInc;

  if (defined(zAbs)) zEnd = zAbs;
  else if (defined(zInc)) zEnd = start.z + zInc;

  if (isHorizontal(el.dir, el.a)) {
    xEnd = start.x;
    formulas.push(formula("Горизонталь", "X = Xs (радиус постоянен)", `${fromRadius(xEnd, mode).toFixed(3)}`));
  }
  if (isVertical(el.dir, el.a)) {
    zEnd = start.z;
    formulas.push(formula("Вертикаль", "Z = Zs", zEnd.toFixed(3)));
  }

  const dz = zEnd - start.z;
  const dx = xEnd - start.x;
  const polarA = defined(el.a) ? quadrantAngle(el.dir, el.a) : radToDeg(ang({ z: dz, x: dx }));
  let angleDeg = polarA;
  let length = hypotV({ z: dz, x: dx });
  let deferred = false;
  let dir = lineDirVec(el);

  const hasEndX = defined(xAbs) || defined(xInc) || isHorizontal(el.dir, polarA);
  const hasEndZ = defined(zAbs) || defined(zInc) || isVertical(el.dir, polarA);

  if (defined(el.l) && defined(el.a)) {
    dir = dirFromAngle(polarA);
    zEnd = start.z + el.l * dir.z;
    xEnd = start.x + el.l * dir.x;
    length = el.l;
    angleDeg = polarA;
    formulas.push(formula("Полярные", "Δz = L cos A,  Δx = L sin A", `L=${el.l}, A=${polarA}°`));
    formulas.push(formula("Конец", "Z = Zs + Δz,  X = 2(xs + Δx)", `Z=${zEnd.toFixed(3)}, X=${fromRadius(xEnd, mode).toFixed(3)}`));
    return { end: { z: zEnd, x: xEnd }, angleDeg, length, formulas, deferred: false, dir };
  }

  if (defined(el.a) && hasEndZ && !hasEndX && !isHorizontal(el.dir, polarA)) {
    dir = dirFromAngle(polarA);
    if (Math.abs(dir.z) < OPEN) throw new Error("Угол 90°: Z не задаёт длину, укажите X");
    const t = (zEnd - start.z) / dir.z;
    xEnd = start.x + t * dir.x;
    length = Math.abs(t);
    const end = { z: zEnd, x: xEnd };
    const travel = length > OPEN ? norm(sub(end, start)) : dir;
    formulas.push(formula("Из Z и A", "t = (Z − Zs) / cos A,  Δx = t sin A", `t=${t.toFixed(4)}`));
    return { end, angleDeg: polarA, length, formulas, deferred: false, dir: travel };
  }

  if (defined(el.a) && hasEndX && !hasEndZ && !isVertical(el.dir, polarA)) {
    dir = dirFromAngle(polarA);
    if (Math.abs(dir.x) < OPEN) throw new Error("Угол 0°: X не задаёт длину, укажите Z");
    const t = (xEnd - start.x) / dir.x;
    zEnd = start.z + t * dir.z;
    length = Math.abs(t);
    const end = { z: zEnd, x: xEnd };
    const travel = length > OPEN ? norm(sub(end, start)) : dir;
    formulas.push(formula("Из X и A", "t = Δx / sin A,  Δz = t cos A", `t=${t.toFixed(4)}`));
    return { end, angleDeg: polarA, length, formulas, deferred: false, dir: travel };
  }

  if (defined(el.l) && (hasEndX || hasEndZ || el.dir)) {
    dir = dir ?? (hasEndX || hasEndZ ? norm({ z: dz, x: dx }) : lineDirVec(el));
    if (!dir || hypotV(dir) < OPEN) {
      deferred = true;
      return { end: start, angleDeg, length: el.l, formulas, deferred, dir: { z: 1, x: 0 } };
    }
    dir = norm(dir);
    const sx = signX(el.dir);
    const sz = signZ(el.dir);
    if (sx != null && sx !== 0) dir = { ...dir, x: Math.abs(dir.x) * sx || sx };
    if (sz != null && sz !== 0) dir = { ...dir, z: Math.abs(dir.z) * sz || sz };
    dir = hypotV(dir) > OPEN ? norm(dir) : dir;
    zEnd = start.z + el.l * dir.z;
    xEnd = start.x + el.l * dir.x;
    length = el.l;
    angleDeg = radToDeg(ang(dir));
    formulas.push(formula("Длина L", "Конец = Старт + L · û", `L=${el.l}`));
    return { end: { z: zEnd, x: xEnd }, angleDeg, length, formulas, deferred: false, dir };
  }

  if (hasEndX && hasEndZ) {
    const end = { z: zEnd, x: xEnd };
    length = dist(start, end);
    angleDeg = radToDeg(ang(sub(end, start)));
    dir = length > OPEN ? norm(sub(end, start)) : { z: 1, x: 0 };
    formulas.push(
      formula("Приращения", "Δz = Z − Zs,  Δx = (X − Xs)/2", `Δz=${(zEnd - start.z).toFixed(4)}, Δx=${(xEnd - start.x).toFixed(4)}`),
    );
    formulas.push(formula("Угол", "A = atan2(Δx, Δz)", `${angleDeg.toFixed(4)}°`));
    formulas.push(formula("Длина", "L = √(Δz² + Δx²)", `${length.toFixed(4)} мм`));
    return { end, angleDeg, length, formulas, deferred: false, dir };
  }

  if (el.dir && (hasEndX || hasEndZ || defined(el.l))) {
    dir = lineDirVec(el)!;
    if (el.dir === "z+" || el.dir === "z-") {
      if (!hasEndZ && !defined(el.l)) {
        return { end: start, angleDeg: el.dir === "z+" ? 0 : 180, length: 0, formulas, deferred: true, dir };
      }
      if (defined(el.l)) zEnd = start.z + (el.dir === "z+" ? el.l : -el.l);
      xEnd = start.x;
      const end = { z: zEnd, x: xEnd };
      return {
        end,
        angleDeg: el.dir === "z+" ? 0 : 180,
        length: Math.abs(zEnd - start.z),
        formulas: [...formulas, formula("Осевая", "X = const,  Z = Zs ± L", `Z=${zEnd.toFixed(3)}`)],
        deferred: false,
        dir,
      };
    }
    if (el.dir === "x+" || el.dir === "x-") {
      if (!hasEndX && !defined(el.l)) {
        return { end: start, angleDeg: el.dir === "x+" ? 90 : -90, length: 0, formulas, deferred: true, dir };
      }
      if (defined(el.l)) xEnd = start.x + (el.dir === "x+" ? el.l : -el.l);
      zEnd = start.z;
      const end = { z: zEnd, x: xEnd };
      return {
        end,
        angleDeg: el.dir === "x+" ? 90 : -90,
        length: Math.abs(xEnd - start.x),
        formulas: [...formulas, formula("Торцевая", "Z = const,  xs = xs ± L", `X=${fromRadius(xEnd, mode).toFixed(3)}`)],
        deferred: false,
        dir,
      };
    }
  }

  if (dir && hypotV(dir) > OPEN && !(hasEndX || hasEndZ || defined(el.l))) {
    formulas.push(formula("Не решено", "Задан только угол/направление — конец из пересечения со следующим", undefined));
    return { end: start, angleDeg: defined(el.a) ? el.a : radToDeg(ang(dir)), length: 0, formulas, deferred: true, dir };
  }

  if (!defined(el.a) && !defined(el.l) && !el.dir) {
    const end = { z: zEnd, x: xEnd };
    length = dist(start, end);
    angleDeg = length > OPEN ? radToDeg(ang(sub(end, start))) : 0;
    dir = length > OPEN ? norm(sub(end, start)) : { z: 1, x: 0 };
    const parts: string[] = [];
    if (!defined(xAbs) && !defined(xInc)) parts.push("X←пред.");
    else parts.push(`X=${fromRadius(xEnd, mode).toFixed(3)}`);
    if (!defined(zAbs) && !defined(zInc)) parts.push("Z←пред.");
    else parts.push(`Z=${zEnd.toFixed(3)}`);
    formulas.push(formula("X / Z", parts.join("  "), length > OPEN ? `L=${length.toFixed(4)}` : "L=0 (ожидание ввода)"));
    return { end, angleDeg, length, formulas, deferred: length < OPEN, dir };
  }

  if (!hasEndX && !hasEndZ && !defined(el.a) && !defined(el.l) && !el.dir) {
    throw new Error("Прямая: задайте X/Z, угол A, длину L или направление");
  }

  if (dir) {
    formulas.push(formula("Не решено", "Недостаточно данных — жду следующий элемент", undefined));
    return { end: start, angleDeg: defined(el.a) ? el.a : radToDeg(ang(dir)), length: 0, formulas, deferred: true, dir };
  }

  throw new Error("Прямая: недостаточно данных для построения");
}

function nextPrimitiveIndex(elements: ContourElement[], from: number): number {
  for (let i = from; i < elements.length; i++) {
    const k = elements[i].kind;
    if (k === "line" || k === "arc" || k === "undercut") return i;
  }
  return -1;
}

function primitiveDir(el: ContourElement, start: Vec, mode: XMode): Vec | null {
  if (el.kind === "line") {
    const s = solveLineKnown(start, el, mode);
    if (s.deferred) return s.dir;
    const d = sub(s.end, start);
    return hypotV(d) > OPEN ? norm(d) : s.dir;
  }
  if (el.kind === "arc") {
    const end = arcEndHint(el, start, mode);
    if (!end) return null;
    return norm(sub(end, start));
  }
  if (el.kind === "undercut") {
    const z = el.z ?? start.z - 1;
    const x = el.x != null ? toRad(el.x, mode)! : start.x;
    return norm(sub({ z, x }, start));
  }
  return null;
}

function arcEndHint(el: ArcElement, start: Vec, mode: XMode): Vec | null {
  const xAbs = toRad(el.x, mode);
  const zAbs = el.z;
  const xInc = toRad(el.xi, mode);
  const zInc = el.zi;
  let x = start.x;
  let z = start.z;
  let hasX = false;
  let hasZ = false;
  if (defined(xAbs)) {
    x = xAbs;
    hasX = true;
  } else if (defined(xInc)) {
    x = start.x + xInc;
    hasX = true;
  }
  if (defined(zAbs)) {
    z = zAbs;
    hasZ = true;
  } else if (defined(zInc)) {
    z = start.z + zInc;
    hasZ = true;
  }
  if (hasX && hasZ) return { z, x };
  return null;
}

function axisRoots(c: number, remSq: number): number[] {
  if (remSq < -1e-8) return [];
  const rem = Math.sqrt(Math.max(0, remSq));
  if (rem < 1e-10) return [c];
  return [c - rem, c + rem];
}

function pickArcCandidate(
  start: Vec,
  candidates: { end: Vec; center: Vec }[],
  cw: boolean,
  major: boolean | undefined,
): { end: Vec; center: Vec; sweep: number; r: number } | null {
  const scored: { end: Vec; center: Vec; sweep: number; r: number; score: number }[] = [];
  for (const c of candidates) {
    const sweep = arcSweepLocal(start, c.end, c.center, cw);
    if (Math.abs(sweep) < OPEN) continue;
    const absSw = Math.abs(sweep);
    const isMajor = absSw > Math.PI + 1e-6;
    let score = 0;
    if (!!major === isMajor) score += 1000;
    else score -= 500;
    score -= absSw * 10;
    if (c.end.z <= start.z + 1e-6) score += 50;
    score -= Math.abs(c.end.z - start.z) * 0.01;
    scored.push({ end: c.end, center: c.center, sweep, r: dist(c.center, start), score });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  const b = scored[0];
  return { end: b.end, center: b.center, sweep: b.sweep, r: b.r };
}

function arcSweepLocal(p1: Vec, p2: Vec, center: Vec, cw: boolean): number {
  const a1 = ang(sub(p1, center));
  const a2 = ang(sub(p2, center));
  let sweep = a2 - a1;
  if (cw) {
    if (sweep > OPEN) sweep -= 2 * Math.PI;
    else if (sweep > -OPEN) sweep = 0;
  } else if (sweep < -OPEN) sweep += 2 * Math.PI;
  else if (sweep < OPEN) sweep = 0;
  return sweep;
}

function snapToCircle(center: Vec, r: number, p: Vec): Vec {
  if (!(r > OPEN)) return p;
  const d = sub(p, center);
  const L = hypotV(d);
  if (L < OPEN) return { z: center.z + r, x: center.x };
  return { z: center.z + (d.z / L) * r, x: center.x + (d.x / L) * r };
}

function solveArc(start: Vec, el: ArcElement, mode: XMode): SolvedElement {
  const formulas: FormulaStep[] = [];
  const cw = el.rotation === "cw";
  const major = el.major;

  const xAbs = toRad(el.x, mode);
  const zAbs = el.z;
  const xInc = toRad(el.xi, mode);
  const zInc = el.zi;
  let hasX = false;
  let hasZ = false;
  let xEnd: number | null = null;
  let zEnd: number | null = null;
  if (defined(xAbs)) {
    xEnd = xAbs;
    hasX = true;
  } else if (defined(xInc)) {
    xEnd = start.x + xInc;
    hasX = true;
  }
  if (defined(zAbs)) {
    zEnd = zAbs;
    hasZ = true;
  } else if (defined(zInc)) {
    zEnd = start.z + zInc;
    hasZ = true;
  }

  const hasI = defined(el.i);
  const hasK = defined(el.k);
  const hasIi = defined(el.ii);
  const hasKi = defined(el.ki);
  const hasR = defined(el.r) && Math.abs(el.r!) > OPEN;
  const R = hasR ? Math.abs(el.r!) : null;

  const centers: Vec[] = [];
  const cxOnly: number[] = [];
  const czOnly: number[] = [];

  if ((el.centerMode === "absolute" || (hasI && hasK)) && hasI && hasK) {
    centers.push({ z: el.k!, x: toRadius(el.i!, mode) });
    formulas.push(formula("Центр абс.", "C = (K, I→xs)", undefined));
  }
  if ((el.centerMode === "incremental" || (hasIi && hasKi)) && hasIi && hasKi) {
    centers.push({ z: start.z + el.ki!, x: start.x + el.ii! });
    formulas.push(formula("Центр инкр.", "C = S + (Ki, Ii)", `Ii=${el.ii}, Ki=${el.ki}`));
  }
  if (hasIi && !hasKi) cxOnly.push(start.x + el.ii!);
  if (hasKi && !hasIi) czOnly.push(start.z + el.ki!);
  if (hasI && !hasK && !(hasIi && hasKi)) {
    cxOnly.push(toRadius(el.i!, mode));
  }
  if (hasK && !hasI && !(hasIi && hasKi)) {
    czOnly.push(el.k!);
  }

  const uniqNum = (arr: number[]) => [...new Set(arr.map((v) => +v.toFixed(9)))];

  if (R != null) {
    for (const cx of uniqNum(cxOnly)) {
      const remSq = R * R - (start.x - cx) * (start.x - cx);
      for (const cz of axisRoots(start.z, remSq)) centers.push({ z: cz, x: cx });
    }
    for (const cz of uniqNum(czOnly)) {
      const remSq = R * R - (start.z - cz) * (start.z - cz);
      for (const cx of axisRoots(start.x, remSq)) centers.push({ z: cz, x: cx });
    }
  }

  if (
    R != null &&
    !hasI &&
    !hasK &&
    !hasIi &&
    !hasKi &&
    hasX &&
    !hasZ &&
    xEnd != null
  ) {
    if (Math.abs(start.x) > R - EPS) {
      throw new Error(
        `Старт на X${fromRadius(start.x, mode).toFixed(3)} — R${R.toFixed(3)} слишком мал для сферы на оси.`,
      );
    }
    const dz = Math.sqrt(Math.max(0, R * R - start.x * start.x));
    centers.push({ z: start.z + dz, x: 0 });
    centers.push({ z: start.z - dz, x: 0 });
    formulas.push(formula("Сфера на оси", "C = (Zs ± √(R²−xs²), 0)", undefined));
  }

  const centerMap = new Map<string, Vec>();
  for (const c of centers) centerMap.set(`${c.z.toFixed(6)},${c.x.toFixed(6)}`, c);
  const centerList = [...centerMap.values()];

  type Cand = { end: Vec; center: Vec };
  const candidates: Cand[] = [];

  if (hasX && hasZ && xEnd != null && zEnd != null) {
    const end = { z: zEnd, x: xEnd };
    if (dist(start, end) < OPEN) throw new Error("Дуга: конец совпадает со стартом");
    if (centerList.length) {
      for (const c of centerList) {
        const r1 = dist(c, start);
        const r2 = dist(c, end);
        if (Math.abs(r1 - r2) <= Math.max(0.05, 0.02 * r1)) candidates.push({ end, center: c });
      }
    }
    if (R != null) {
      try {
        const res = arcFromRadius(start, end, el.r!, cw, major);
        candidates.push({ end, center: res.center });
      } catch {
        /* ignore */
      }
    }
  } else if (hasX && !hasZ && xEnd != null) {
    if (!centerList.length) {
      throw new Error("Дуга: для авто-Z задайте R и I (или Ii) / K");
    }
    for (const c of centerList) {
      const rr = R != null ? R : dist(c, start);
      if (R != null && Math.abs(dist(c, start) - R) > 0.08) continue;
      const remSq = rr * rr - (xEnd - c.x) * (xEnd - c.x);
      for (const ez of axisRoots(c.z, remSq)) {
        const end = { z: ez, x: xEnd };
        if (dist(start, end) < OPEN) continue;
        if (Math.abs(dist(c, end) - rr) > 0.08) continue;
        candidates.push({ end, center: c });
      }
    }
    formulas.push(formula("Авто Z", "Z из окружности: (Z−K)² + (xs−I)² = R²", undefined));
  } else if (hasZ && !hasX && zEnd != null) {
    if (!centerList.length) throw new Error("Дуга: для авто-X задайте R и I/K");
    for (const c of centerList) {
      const rr = R != null ? R : dist(c, start);
      if (R != null && Math.abs(dist(c, start) - R) > 0.08) continue;
      const remSq = rr * rr - (zEnd - c.z) * (zEnd - c.z);
      for (const ex of axisRoots(c.x, remSq)) {
        if (ex < -1e-6) continue;
        const end = { z: zEnd, x: ex };
        if (dist(start, end) < OPEN) continue;
        candidates.push({ end, center: c });
      }
    }
    formulas.push(formula("Авто X", "X из окружности при заданных Z, R, I/K", undefined));
  } else {
    throw new Error("Дуга: задайте конец (X и/или Z) и R либо центр I,K");
  }

  const candMap = new Map<string, Cand>();
  for (const c of candidates) {
    candMap.set(
      `${c.center.z.toFixed(6)},${c.center.x.toFixed(6)}>${c.end.z.toFixed(6)},${c.end.x.toFixed(6)}`,
      c,
    );
  }
  const uniqCand = [...candMap.values()];
  if (!uniqCand.length) throw new Error("Дуга: нет решения для заданных X/Z/R/I/K");

  const best = pickArcCandidate(start, uniqCand, cw, major);
  if (!best) throw new Error(`Дуга: нет решения с направлением ${cw ? "G2" : "G3"}`);

  formulas.push(formula("Радиус", "R = |C − S|", best.r.toFixed(4)));
  formulas.push(
    formula("Центр", "C=(K, xs)", `Z=${best.center.z.toFixed(3)}, xs=${best.center.x.toFixed(3)}`),
  );
  formulas.push(formula("Конец", "X,Z", `X=${fromRadius(best.end.x, mode).toFixed(3)}, Z=${best.end.z.toFixed(3)}`));
  formulas.push(formula("Развёртка", "α = Δarg(P − C)", `${radToDeg(best.sweep).toFixed(4)}°`));
  formulas.push(formula("Длина дуги", "L = |α| R", (Math.abs(best.sweep) * best.r).toFixed(4)));
  const Iiso = best.center.x - start.x;
  const Kiso = best.center.z - start.z;
  formulas.push(formula("I, K ISO", "I = Cx − xs,  K = Cz − Zs", `I=${Iiso.toFixed(4)}, K=${Kiso.toFixed(4)}`));

  const r0 = dist(best.center, start) > OPEN ? dist(best.center, start) : best.r;
  const end0 = snapToCircle(best.center, r0, best.end);
  const sw0 = arcSweepLocal(start, end0, best.center, cw);

  return pack(
    el,
    start,
    end0,
    [
      {
        type: "arc",
        start,
        end: end0,
        center: best.center,
        r: r0,
        cw,
        sweep: sw0,
        sourceId: el.id,
      },
    ],
    formulas,
    mode,
    {
      radius: r0,
      center: best.center,
      cw,
      sweepDeg: radToDeg(sw0),
      angleDeg: radToDeg(ang(sub(end0, start))),
    },
  );
}

function solveUndercut(start: Vec, el: UndercutElement, mode: XMode): SolvedElement {
  const threadDia = fromRadius(start.x, "diameter");
  const toR = (X: number) => toRadius(X, mode);
  const formulas: FormulaStep[] = [];
  if (el.form === "din76") {
    const fp = el.fp ?? pitchFromDiameter(threadDia);
    const def = din76FromPitch(fp, threadDia);
    formulas.push(formula("Шаг FP", el.fp != null ? "задан" : "из таблицы по диаметру", `${fp}`));
    formulas.push(formula("I, K, W, R", "DIN 76 / таблица", `I=${(el.i ?? def.i).toFixed(3)}  K=${el.k ?? def.k}  W=${el.w ?? def.w}°  R=${el.r ?? def.r}`));
    formulas.push(formula("Вход", "Δz = δ / tan W,  δ = xs − I/2", undefined));
    const exp = expandDin76(start, el, threadDia, mode, toR);
    return pack(el, start, exp.end, exp.segments, formulas, mode);
  }
  const exp = expandDin509(start, el, threadDia, el.form === "din509f" ? "din509f" : "din509e", toR);
  formulas.push(formula("DIN 509", "r, t, f из диаметра ступени (ряд 1)", undefined));
  return pack(el, start, exp.end, exp.segments, formulas, mode);
}

function applyTransition(
  prev: SolvedElement,
  next: SolvedElement,
  kind: "chamfer" | "rounding",
  b: number,
  id: string,
  mode: XMode,
): { prev: SolvedElement; trans: SolvedElement; next: SolvedElement } | { error: string } {
  const last = prev.segments[prev.segments.length - 1];
  const first = next.segments[0];
  if (!last || !first) return { error: "Нет смежных сегментов для перехода" };

  const corner = last.end;
  if (dist(last.end, first.start) > 0.05) {
    return { error: "Смежные элементы не сходятся в одной точке" };
  }

  const u1 = tangentAtEnd(last);   
  const u2 = tangentAtStart(first); 
  if (hypotV(u1) < OPEN || hypotV(u2) < OPEN) {
    return { error: "Вырожденное направление смежного элемента" };
  }

  const startRef = add(corner, scale(u1, -1));
  const endHint = add(corner, u2);

  try {
    if (kind === "rounding") {
      const f = filletLines(startRef, corner, endHint, b);
      const Lprev = last.type === "line" ? dist(last.start, last.end) : Math.abs(last.sweep) * last.r;
      const Lnext = first.type === "line" ? dist(first.start, first.end) : Math.abs(first.sweep) * first.r;

      let useClamped = false;
      let t1: Vec;
      let t2: Vec;
      let center: Vec;
      let cw: boolean;
      let sweep: number;
      let trimUsed: number;

      if (f.trim >= Lprev - OPEN || f.trim >= Lnext - OPEN) {
        useClamped = true;
        const trimIdeal = f.trim;
        const T1_ideal = add(corner, scale(u1, -trimIdeal));
        const T2_ideal = add(corner, scale(u2, trimIdeal));
        const turnIdeal = cross(u1, u2);
        const cwIdeal = turnIdeal < 0;
        const inwardIdeal = cwIdeal ? perpCW(u1) : perpCCW(u1);
        const C_ideal = add(T1_ideal, scale(inwardIdeal, b));

        const clampToSeg = (seg: Segment, pt: Vec): Vec => {
          if (seg.type !== "line") return pt;
          const s = seg.start;
          const e = seg.end;
          const d = sub(e, s);
          const L2 = dot(d, d);
          if (L2 < EPS) return { z: s.z, x: s.x };
          const t = dot(sub(pt, s), d) / L2;
          if (t < 0) return { z: s.z, x: s.x };
          if (t > 1) return { z: e.z, x: e.x };
          return pt;
        };
        const T1c = clampToSeg(last, T1_ideal);
        const T2c = clampToSeg(first, T2_ideal);

        const chord = dist(T1c, T2c);
        if (chord < OPEN) return { error: "R: точки касания совпали" };
        if (chord > 2 * b + 1e-7) {
          return { error: `R${b} не помещается (хорда > 2R)` };
        }

        const midPt = { z: (T1c.z + T2c.z) / 2, x: (T1c.x + T2c.x) / 2 };
        const half = chord / 2;
        const h = Math.sqrt(Math.max(0, b * b - half * half));
        const u = norm(sub(T2c, T1c));
        const n = { z: -u.x, x: u.z };
        const cA = add(midPt, scale(n, h));
        const cB = add(midPt, scale(n, -h));
        const C_final = dist(cA, C_ideal) <= dist(cB, C_ideal) ? cA : cB;

        const turn = cross(u1, u2);
        cw = turn < 0;
        t1 = T1c;
        t2 = T2c;
        center = C_final;
        sweep = arcSweep(t1, t2, center, cw);
        trimUsed = Math.max(dist(corner, t1), dist(corner, t2));
      } else {
        t1 = pointBeforeEnd(last, f.trim);
        t2 = pointAfterStart(first, f.trim);
        const turn = cross(u1, u2);
        cw = turn < 0;
        const inward = cw ? perpCW(u1) : perpCCW(u1);
        center = add(t1, scale(inward, b));
        sweep = arcSweep(t1, t2, center, cw);
        trimUsed = f.trim;
      }

      const prevSeg = trimSegToEnd(last, t1);
      const transSeg: Segment = {
        type: "arc",
        start: t1,
        end: t2,
        center,
        r: b,
        cw,
        sweep,
        sourceId: id,
      };
      const nextSeg = trimSegFromStart(first, t2);
      const formulas = [
        formula("Угол контура", "α = ∠(−u1, u2)", `${f.interiorDeg.toFixed(3)}°`),
        formula("Касательная", "t = R / tan(α/2)", `${trimUsed.toFixed(4)} мм`),
        formula("Центр", "C = T1 + R n̂_внутрь", `Z=${center.z.toFixed(3)}, xs=${center.x.toFixed(3)}`),
        formula("Тип стыка", `${last.type} → ${first.type}`, undefined),
        formula("Направление", cw ? "G2 (CW), поворот вправо" : "G3 (CCW), поворот влево", undefined),
        ...(useClamped
          ? [formula("Прижатие", `R${b} вставлен с прижатием (не хватило длины сегмента)`, undefined)]
          : []),
      ];
      return {
        prev: rebuildSolved(prev, [...prev.segments.slice(0, -1), prevSeg], mode),
        trans: pack({ id, kind: "rounding", b } as ContourElement, t1, t2, [transSeg], formulas, mode, {
          radius: b,
          center,
          cw,
          sweepDeg: radToDeg(sweep),
        }),
        next: rebuildSolved(next, [nextSeg, ...next.segments.slice(1)], mode),
      };
    }

    const c = chamferLines(startRef, corner, endHint, b);
    const Lprev = last.type === "line" ? dist(last.start, last.end) : Math.abs(last.sweep) * last.r;
    const Lnext = first.type === "line" ? dist(first.start, first.end) : Math.abs(first.sweep) * first.r;
    if (c.trim >= Lprev - OPEN || c.trim >= Lnext - OPEN) {
      return { error: "Фаска слишком велика для длины элементов" };
    }
    const t1 = pointBeforeEnd(last, c.trim);
    const t2 = pointAfterStart(first, c.trim);

    const prevSeg = trimSegToEnd(last, t1);
    const transSeg: Segment = { type: "line", start: t1, end: t2, sourceId: id };
    const nextSeg = trimSegFromStart(first, t2);
    const formulas = [
      formula("Катет", "B — расстояние от теоретического угла вдоль каждого элемента", `${b}`),
      formula("Угол", "α = ∠(−u1, u2)", `${c.interiorDeg.toFixed(3)}°`),
      formula("Длина фаски", "L = √(Δz² + Δx²)", `${dist(t1, t2).toFixed(4)} мм`),
      formula("Тип стыка", `${last.type} → ${first.type}`, undefined),
    ];
    return {
      prev: rebuildSolved(prev, [...prev.segments.slice(0, -1), prevSeg], mode),
      trans: pack({ id, kind: "chamfer", b } as ContourElement, t1, t2, [transSeg], formulas, mode, {
        angleDeg: radToDeg(ang(sub(t2, t1))),
      }),
      next: rebuildSolved(next, [nextSeg, ...next.segments.slice(1)], mode),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function rebuildSolved(el: SolvedElement, segs: Segment[], mode: XMode): SolvedElement {
  const start = segs[0]?.start ?? el.start;
  const end = segs[segs.length - 1]?.end ?? el.end;
  const length = segs.reduce((acc, s) => {
    if (s.type === "line") return acc + lineLength(s.start, s.end);
    return acc + arcLength(s.r, s.sweep);
  }, 0);
  return {
    ...el,
    start,
    end,
    xEnd: fromRadius(end.x, mode),
    zEnd: end.z,
    length,
    segments: segs,
  };
}

export function solveContour(elements: ContourElement[], xMode: XMode = "diameter"): SolvedContour {
  const issues: ContourIssue[] = [];
  const solved: SolvedElement[] = [];
  const startEl = elements.find((e): e is StartElement => e.kind === "start");
  if (!startEl) {
    return {
      elements: [],
      segments: [],
      start: { z: 0, x: 0 },
      end: { z: 0, x: 0 },
      length: 0,
      bbox: { zMin: 0, zMax: 1, xMin: 0, xMax: 1 },
      issues: [{ id: "start", level: "error", message: "Нет стартовой точки XS, ZS" }],
      xMode,
    };
  }

  if (
    startEl.xs == null ||
    !Number.isFinite(startEl.xs) ||
    startEl.zs == null ||
    !Number.isFinite(startEl.zs)
  ) {
    return {
      elements: [],
      segments: [],
      start: { z: 0, x: 0 },
      end: { z: 0, x: 0 },
      length: 0,
      bbox: { zMin: 0, zMax: 1, xMin: 0, xMax: 1 },
      issues: [{ id: startEl.id, level: "error", message: "Задайте стартовую точку XS и ZS" }],
      xMode,
    };
  }

  const start: Vec = { z: startEl.zs, x: toRadius(startEl.xs, xMode) };
  solved.push(
    pack(
      startEl,
      start,
      start,
      [],
      [formula("Старт", xMode === "diameter" ? "xs = XS/2,  Z = ZS" : "xs = XS,  Z = ZS", `Z=${start.z}, xs=${start.x.toFixed(4)}`)],
      xMode,
    ),
  );

  let cursor = start;

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.kind === "start") continue;

    if (el.kind === "chamfer" || el.kind === "rounding") {
      if (el.b == null || !Number.isFinite(el.b) || el.b <= 0) {
        issues.push({ id: el.id, level: "error", message: el.kind === "chamfer" ? "Задайте размер фаски B" : "Задайте радиус R" });
        solved.push(pack(el, cursor, cursor, [], [], xMode));
      }
      continue;
    }

    try {
      if (el.kind === "line") {
        const s = solveLineKnown(cursor, el, xMode);
        if (s.deferred) {
          throw new Error("Незамкнутый элемент: нет следующего для пересечения");
        }
        if (s.end.x < -1e-6) {
          issues.push({ id: el.id, level: "warning", message: "Контур пересёк ось (отрицательный радиус)" });
        }
        solved.push(
          pack(
            el,
            cursor,
            s.end,
            [{ type: "line", start: cursor, end: s.end, sourceId: el.id }],
            s.formulas,
            xMode,
            { angleDeg: wrapDeg(s.angleDeg) },
          ),
        );
        cursor = s.end;
        continue;
      }

      if (el.kind === "arc") {
        const packed = solveArc(cursor, el, xMode);
        if (packed.end.x < -1e-6) {
          issues.push({ id: el.id, level: "warning", message: "Дуга пересекает ось" });
        }
        solved.push(packed);
        cursor = packed.end;
        continue;
      }

      if (el.kind === "undercut") {
        const packed = solveUndercut(cursor, el, xMode);
        solved.push(packed);
        cursor = packed.end;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      issues.push({ id: el.id, level: "error", message });
      solved.push(emptySolved(el, cursor, xMode));
    }
  }

  const transEls = elements.filter((e) => e.kind === "chamfer" || e.kind === "rounding");
  for (const tEl of transEls) {
    const idx = elements.indexOf(tEl);
    const prevPrim = [...elements.slice(0, idx)].reverse().find((e) => e.kind === "line" || e.kind === "arc" || e.kind === "undercut" || e.kind === "start");
    const nextPrim = elements.slice(idx + 1).find((e) => e.kind === "line" || e.kind === "arc" || e.kind === "undercut");
    if (!prevPrim || !nextPrim || prevPrim.kind === "start") {
      issues.push({ id: tEl.id, level: "error", message: "Фаска/радиус нуждается в двух смежных элементах" });
      continue;
    }
    const prevS = solved.find((s) => s.id === prevPrim.id);
    const nextS = solved.find((s) => s.id === nextPrim.id);
    if (!prevS || !nextS || prevS.segments.length === 0 || nextS.segments.length === 0) {
      issues.push({ id: tEl.id, level: "error", message: "Смежные элементы не построены" });
      continue;
    }
    const b = tEl.kind === "chamfer" || tEl.kind === "rounding" ? tEl.b : 0;
    const res = applyTransition(prevS, nextS, tEl.kind, b, tEl.id, xMode);
    if ("error" in res) {
      issues.push({ id: tEl.id, level: "error", message: res.error });
      continue;
    }
    const pi = solved.findIndex((s) => s.id === prevS.id);
    const ni = solved.findIndex((s) => s.id === nextS.id);
    solved[pi] = res.prev;
    solved[ni] = res.next;
    const exists = solved.findIndex((s) => s.id === tEl.id);
    if (exists >= 0) solved[exists] = res.trans;
    else solved.splice(pi + 1, 0, res.trans);
  }

  for (let ji = 1; ji < solved.length; ji++) {
    const prevJ = solved[ji - 1];
    const curJ = solved[ji];
    if (!prevJ.segments?.length || !curJ.segments?.length) continue;
    const joint = prevJ.segments[prevJ.segments.length - 1].end;
    if (!joint || !Number.isFinite(joint.z)) continue;
    const jpt = { z: joint.z, x: joint.x };
    const seg0 = { ...curJ.segments[0], start: jpt };
    if (seg0.type === "arc" && seg0.center && seg0.r != null) {
      const r = dist(seg0.center, jpt);
      if (r > OPEN) {
        const end = snapToCircle(seg0.center, r, seg0.end);
        const sweep = arcSweepLocal(jpt, end, seg0.center, !!seg0.cw);
        curJ.segments[0] = { ...seg0, start: jpt, end, r, sweep };
        curJ.start = jpt;
        curJ.end = end;
        curJ.radius = r;
        curJ.length = Math.abs(sweep) * r;
      } else {
        curJ.segments[0] = seg0;
        curJ.start = jpt;
      }
    } else {
      curJ.segments[0] = seg0;
      curJ.start = jpt;
    }
  }

  const segments = solved.flatMap((s) => s.segments);
  const pts: Vec[] = [start];
  for (const s of segments) {
    pts.push(s.start, s.end);
    if (s.type === "arc") pts.push(s.center);
  }
  const length = solved.reduce((a, s) => a + s.length, 0);
  const last = segments[segments.length - 1]?.end ?? start;
  return {
    elements: solved,
    segments,
    start,
    end: last,
    length,
    bbox: bboxOf(pts),
    issues,
    xMode,
  };
}

export function contourPoints(solved: SolvedContour, stepMm = 0.45): Vec[] {
  const pts: Vec[] = [];
  for (const seg of solved.segments) {
    if (seg.type === "line") {
      if (pts.length === 0) pts.push(seg.start);
      pts.push(seg.end);
    } else {
      const a0 = Math.atan2(seg.start.x - seg.center.x, seg.start.z - seg.center.z);
      const len = Math.abs(seg.sweep) * seg.r;
      const n = Math.max(8, Math.ceil(len / stepMm));
      for (let i = 0; i <= n; i++) {
        if (i === 0 && pts.length) continue;
        if (i === 0) { pts.push(seg.start); continue; }
        if (i === n) { pts.push(seg.end); continue; }
        const a = a0 + (seg.sweep * i) / n;
        pts.push({ z: seg.center.z + seg.r * Math.cos(a), x: seg.center.x + seg.r * Math.sin(a) });
      }
    }
  }
  return pts;
}

export function pointAtLength(solved: SolvedContour, s: number): { p: Vec; tangent: Vec } | null {
  if (solved.segments.length === 0) return null;
  let rest = ((s % solved.length) + solved.length) % solved.length;
  for (const seg of solved.segments) {
    const L = seg.type === "line" ? dist(seg.start, seg.end) : Math.abs(seg.sweep) * seg.r;
    if (rest > L && L > OPEN) {
      rest -= L;
      continue;
    }
    const t = L < OPEN ? 0 : rest / L;
    if (seg.type === "line") {
      const d = sub(seg.end, seg.start);
      return { p: add(seg.start, scale(d, t)), tangent: hypotV(d) > OPEN ? norm(d) : { z: 1, x: 0 } };
    }
    const a0 = Math.atan2(seg.start.x - seg.center.x, seg.start.z - seg.center.z);
    const a = a0 + seg.sweep * t;
    const p = { z: seg.center.z + seg.r * Math.cos(a), x: seg.center.x + seg.r * Math.sin(a) };
    const tang = seg.cw ? { z: Math.sin(a), x: -Math.cos(a) } : { z: -Math.sin(a), x: Math.cos(a) };
    return { p, tangent: tang };
  }
  const last = solved.segments[solved.segments.length - 1];
  return { p: last.end, tangent: { z: 1, x: 0 } };
}

export function suggestLineDir(from: Vec, to: Vec): LineDir {
  const d = sub(to, from);
  const az = Math.abs(d.z);
  const ax = Math.abs(d.x);
  if (ax < 1e-6 && az < 1e-6) return "z-";
  if (ax < 1e-6) return d.z >= 0 ? "z+" : "z-";
  if (az < 1e-6) return d.x >= 0 ? "x+" : "x-";
  if (d.z >= 0 && d.x >= 0) return "z+x+";
  if (d.z >= 0 && d.x < 0) return "z+x-";
  if (d.z < 0 && d.x >= 0) return "z-x+";
  return "z-x-";
}