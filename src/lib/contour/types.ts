/** Internal contour geometry uses the ZX plane with X as RADIUS (mm). */

export type Vec = { z: number; x: number };

export type XMode = "diameter" | "radius";

export type LineDir =
  | "z+"
  | "z-"
  | "x+"
  | "x-"
  | "z+x+"
  | "z+x-"
  | "z-x+"
  | "z-x-";

export type ElementKind =
  | "start"
  | "line"
  | "arc"
  | "chamfer"
  | "rounding"
  | "undercut";

export type ArcRotation = "cw" | "ccw";

export type UndercutForm = "din76" | "din509e" | "din509f";

export type CenterMode = "none" | "absolute" | "incremental";

export interface StartElement {
  id: string;
  kind: "start";
  /** Diameter if xMode=diameter, else radius. Empty until user enters. */
  xs?: number;
  zs?: number;
}

export interface LineElement {
  id: string;
  kind: "line";
  /** End X (diameter or radius per xMode). */
  x?: number;
  z?: number;
  /** Incremental end, same unit as X. */
  xi?: number;
  zi?: number;
  /** Angle in degrees from +Z toward +X in the radius-ZX plane. */
  a?: number;
  /** Polar length in the radius-ZX plane (true generating-curve length). */
  l?: number;
  dir?: LineDir;
  feed?: number;
}

export interface ArcElement {
  id: string;
  kind: "arc";
  rotation: ArcRotation;
  x?: number;
  z?: number;
  xi?: number;
  zi?: number;
  r?: number;
  /** Absolute center: I as X (same unit as X), K as Z. */
  i?: number;
  k?: number;
  /** Incremental center: Ii in RADIUS, Ki in Z (ISO I/K). */
  ii?: number;
  ki?: number;
  centerMode: CenterMode;
  /** Negative R / major arc (> π). */
  major?: boolean;
  feed?: number;
}

export interface ChamferElement {
  id: string;
  kind: "chamfer";
  /** Distance from theoretical corner along each adjacent element (mm). */
  b?: number;
}

export interface RoundingElement {
  id: string;
  kind: "rounding";
  /** Fillet radius (mm). */
  b?: number;
}

export interface UndercutElement {
  id: string;
  kind: "undercut";
  form: UndercutForm;
  /** J=1 longitudinal→transverse, J=−1 reverse. */
  j: 1 | -1;
  x?: number;
  z?: number;
  /** Thread pitch (DIN 76). */
  fp?: number;
  /** Undercut diameter (DIN 76). */
  i?: number;
  /** Undercut axial length (DIN 76). */
  k?: number;
  /** Entry angle, degrees (DIN 76). */
  w?: number;
  /** Corner radius. */
  r?: number;
  /** Depth t1 (DIN 509). */
  t?: number;
  /** Width f (DIN 509). */
  f?: number;
  feed?: number;
}

export type ContourElement =
  | StartElement
  | LineElement
  | ArcElement
  | ChamferElement
  | RoundingElement
  | UndercutElement;

export type SegKind = "line" | "arc";

export interface LineSeg {
  type: "line";
  start: Vec;
  end: Vec;
  sourceId: string;
}

export interface ArcSeg {
  type: "arc";
  start: Vec;
  end: Vec;
  center: Vec;
  r: number;
  cw: boolean;
  sweep: number;
  sourceId: string;
}

export type Segment = LineSeg | ArcSeg;

export interface FormulaStep {
  label: string;
  expr: string;
  value?: string;
}

export interface SolvedElement {
  id: string;
  kind: ElementKind;
  start: Vec;
  end: Vec;
  /** End X as programmed (diameter if xMode=diameter). */
  xEnd: number;
  zEnd: number;
  angleDeg?: number;
  length: number;
  radius?: number;
  center?: Vec;
  cw?: boolean;
  sweepDeg?: number;
  formulas: FormulaStep[];
  segments: Segment[];
}

export interface ContourIssue {
  id: string;
  level: "error" | "warning";
  message: string;
}

export interface SolvedContour {
  elements: SolvedElement[];
  segments: Segment[];
  start: Vec;
  end: Vec;
  length: number;
  bbox: { zMin: number; zMax: number; xMin: number; xMax: number };
  issues: ContourIssue[];
  xMode: XMode;
}

export interface StockDef {
  diameter: number;
  length: number;
  /** Z of the right face (usually 0). */
  zFace: number;
}

export interface ContourDoc {
  name: string;
  xMode: XMode;
  stock: StockDef;
  elements: ContourElement[];
  notes?: string;
}
