import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ang,
  arcFromRadius,
  chamferLines,
  dist,
  filletLines,
  hypotV,
  intersectLines,
  radToDeg,
  toRadius,
} from "./math.ts";
import { solveContour } from "./solver.ts";
import { EXAMPLE_SHAFT, EXAMPLE_STUD } from "./examples.ts";
import type { ContourElement } from "./types.ts";

test("45° chamfer: Δz = Δradius, ΔX = 2 Δz in diameter mode", () => {
  const elements: ContourElement[] = [
    { id: "s", kind: "start", xs: 16, zs: 0 },
    { id: "l", kind: "line", x: 20, a: 45, dir: "z-x+" },
  ];
  const s = solveContour(elements, "diameter");
  assert.equal(s.issues.filter((i) => i.level === "error").length, 0);
  const end = s.end;
  assert.ok(Math.abs(end.x - 10) < 1e-9, `radius ${end.x}`);
  assert.ok(Math.abs(end.z - -2) < 1e-6, `z ${end.z} expected -2`);
});

test("atan2 angle in ZX radius plane", () => {
  const a = radToDeg(ang({ z: 1, x: 0 }));
  const b = radToDeg(ang({ z: 0, x: 1 }));
  const c = radToDeg(ang({ z: -1, x: 0 }));
  assert.equal(a, 0);
  assert.equal(b, 90);
  assert.equal(c, 180);
});

test("G3 quarter-circle around origin", () => {
  const p1 = { z: 10, x: 0 };
  const p2 = { z: 0, x: 10 };
  const res = arcFromRadius(p1, p2, 10, false);
  assert.ok(Math.abs(res.center.z) < 1e-6, `${res.center.z}`);
  assert.ok(Math.abs(res.center.x) < 1e-6, `${res.center.x}`);
  assert.ok(Math.abs(Math.abs(res.sweep) - Math.PI / 2) < 1e-6);
  assert.equal(res.cw, false);
});

test("G2 uses the other center (minor arc)", () => {
  const p1 = { z: 10, x: 0 };
  const p2 = { z: 0, x: 10 };
  const res = arcFromRadius(p1, p2, 10, true);
  assert.ok(Math.abs(res.center.z - 10) < 1e-6, `${res.center.z}`);
  assert.ok(Math.abs(res.center.x - 10) < 1e-6, `${res.center.x}`);
});

test("impossible arc when chord > 2R", () => {
  assert.throws(() => arcFromRadius({ z: 0, x: 0 }, { z: 10, x: 0 }, 4, false));
});

test("line-line intersection", () => {
  const hit = intersectLines({ z: 0, x: 0 }, { z: -1, x: 0 }, { z: -5, x: 10 }, { z: 0, x: -1 });
  assert.ok(hit);
  assert.ok(Math.abs(hit!.p.z + 5) < 1e-9);
  assert.ok(Math.abs(hit!.p.x) < 1e-9);
});

test("90° fillet trim equals R", () => {
  const f = filletLines({ z: 10, x: 5 }, { z: 0, x: 5 }, { z: 0, x: 0 }, 2);
  assert.ok(Math.abs(f.trim - 2) < 1e-6, `${f.trim}`);
  assert.ok(Math.abs(f.interiorDeg - 90) < 1e-3);
  assert.ok(dist(f.center, f.t1) - 2 < 1e-6);
  assert.ok(dist(f.center, f.t2) - 2 < 1e-6);
});

test("90° chamfer B=1 face is √2", () => {
  const c = chamferLines({ z: 10, x: 5 }, { z: 0, x: 5 }, { z: 0, x: 0 }, 1);
  assert.ok(Math.abs(c.faceLen - Math.SQRT2) < 1e-6, `${c.faceLen}`);
});

test("diameter conversion", () => {
  assert.equal(toRadius(20, "diameter"), 10);
  assert.equal(toRadius(10, "radius"), 10);
});

test("example shaft solves without errors", () => {
  const s = solveContour(EXAMPLE_SHAFT.elements, "diameter");
  const errs = s.issues.filter((i) => i.level === "error");
  assert.equal(errs.length, 0, errs.map((e) => e.message).join("; "));
  assert.ok(s.segments.length >= 4);
  assert.ok(s.length > 10);
});

test("example stud solves", () => {
  const s = solveContour(EXAMPLE_STUD.elements, "diameter");
  const errs = s.issues.filter((i) => i.level === "error");
  assert.equal(errs.length, 0, errs.map((e) => e.message).join("; "));
});

test("hypot length of 3-4-5", () => {
  assert.equal(hypotV({ z: 3, x: 4 }), 5);
});
