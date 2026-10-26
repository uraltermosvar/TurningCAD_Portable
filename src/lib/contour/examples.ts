import { newId } from "./math.ts";
import type { ContourDoc, ContourElement } from "./types.ts";

function start(id: string, xs?: number, zs?: number): ContourElement {
  const el: ContourElement = { id, kind: "start" };
  if (xs != null && Number.isFinite(xs)) (el as { xs?: number }).xs = xs;
  if (zs != null && Number.isFinite(zs)) (el as { zs?: number }).zs = zs;
  return el;
}
function line(id: string, partial: Omit<Extract<ContourElement, { kind: "line" }>, "id" | "kind">): ContourElement {
  return { id, kind: "line", ...partial };
}
function arc(
  id: string,
  rotation: "cw" | "ccw",
  partial: Omit<Extract<ContourElement, { kind: "arc" }>, "id" | "kind" | "rotation" | "centerMode"> & {
    centerMode?: "none" | "absolute" | "incremental";
  },
): ContourElement {
  return { id, kind: "arc", rotation, centerMode: partial.centerMode ?? "none", ...partial };
}
function chf(id: string, b: number): ContourElement {
  return { id, kind: "chamfer", b };
}
function rnd(id: string, b: number): ContourElement {
  return { id, kind: "rounding", b };
}
function din76(id: string, partial: Partial<Extract<ContourElement, { kind: "undercut" }>> = {}): ContourElement {
  return { id, kind: "undercut", form: "din76", j: 1, ...partial };
}

export const EXAMPLE_STUD: ContourDoc = {
  name: "Шпилька M20",
  notes: "Пример «Threaded stud» фаска резьбы, DIN 76, галтель, ступень.",
  xMode: "diameter",
  stock: { diameter: 52, length: 72, zFace: 0 },
  elements: [
    start("stud-s", 16, 0),
    line("stud-l1", { x: 20, z: -2, a: 45, dir: "z-x+" }),
    line("stud-l2", { x: 20, z: -24, dir: "z-" }),
    din76("stud-u", { fp: 1.5, i: 18.4, k: 4.5, w: 30, r: 0.8, x: 32, z: -28.5, j: 1 }),
    rnd("stud-r", 2),
    line("stud-l3", { x: 32, z: -50, dir: "z-" }),
    chf("stud-c", 1.5),
    line("stud-l4", { x: 48, z: -50, dir: "x+" }),
    line("stud-l5", { x: 48, z: -70, dir: "z-" }),
    line("stud-l6", { x: 52, z: -70, dir: "x+" }),
  ],
};

export const EXAMPLE_SHAFT: ContourDoc = {
  name: "Ступенчатый вал",
  notes: "Две ступени, фаска 1×45° и галтель R3. Угол фаски в плоскости ZX (X как радиус).",
  xMode: "diameter",
  stock: { diameter: 40, length: 80, zFace: 2 },
  elements: [
    start("shaft-s", 0, 2),
    line("shaft-l1", { x: 0, z: 0, dir: "z-" }),
    line("shaft-l2", { x: 20, z: 0, dir: "x+" }),
    chf("shaft-c", 1),
    line("shaft-l3", { x: 20, z: -35, dir: "z-" }),
    rnd("shaft-r", 3),
    line("shaft-l4", { x: 36, z: -35, dir: "x+" }),
    line("shaft-l5", { x: 36, z: -78, dir: "z-" }),
    line("shaft-l6", { x: 40, z: -78, dir: "x+" }),
  ],
};

export const EXAMPLE_BOWL: ContourDoc = {
  name: "Чашка / сфера",
  notes: "Дуга G3 R20 и конус 15°. Центр дуги из хорды: C = M ± h n̂.",
  xMode: "diameter",
  stock: { diameter: 50, length: 40, zFace: 0 },
  elements: [
    start("bowl-s", 0, 0),
    line("bowl-l1", { x: 12, z: 0, dir: "x+" }),
    arc("bowl-a", "ccw", { x: 40, z: -16, r: 20 }),
    line("bowl-l2", { a: 195, l: 18, dir: "z-x-" }),
    line("bowl-l3", { x: 8, dir: "x-" }),
    line("bowl-l4", { z: -38, dir: "z-" }),
    line("bowl-l5", { x: 0, dir: "x-" }),
  ],
};

export const EXAMPLE_INTERNAL: ContourDoc = {
  name: "Расточка",
  notes: "Внутренний контур (расточка). Описание тоже в −Z; X растёт к наружи отверстия.",
  xMode: "diameter",
  stock: { diameter: 60, length: 50, zFace: 0 },
  elements: [
    start("bore-s", 30, 2),
    line("bore-l1", { x: 30, z: 0, dir: "z-" }),
    chf("bore-c", 1),
    line("bore-l2", { x: 24, z: 0, dir: "x-" }),
    line("bore-l3", { x: 24, z: -28, dir: "z-" }),
    rnd("bore-r", 2),
    line("bore-l4", { x: 16, z: -28, dir: "x-" }),
    line("bore-l5", { x: 16, z: -42, dir: "z-" }),
    line("bore-l6", { x: 0, z: -42, dir: "x-" }),
  ],
};

export const EXAMPLES: ContourDoc[] = [EXAMPLE_STUD, EXAMPLE_SHAFT, EXAMPLE_BOWL, EXAMPLE_INTERNAL];

export function emptyDoc(name = "Контур 1"): ContourDoc {
  return {
    name,
    xMode: "diameter",
    stock: { diameter: 40, length: 60, zFace: 0 },
    // Start fields intentionally empty — user fills XS/ZS
    elements: [start(newId("s"))],
  };
}

export function cloneDoc(doc: ContourDoc): ContourDoc {
  return {
    ...doc,
    stock: { ...doc.stock },
    elements: doc.elements.map((e) => ({ ...e, id: newId(e.kind[0] ?? "e") })),
  };
}
