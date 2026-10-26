import { fmtFixed, fmtSigned } from "./format.ts";
import { dist, fromRadius } from "./math.ts";
import type { SolvedContour, XMode } from "./types.ts";

import type { PostProfileId } from "./pilot-tools.ts";

export interface GCodeOptions {
  feed?: number;
  name?: string;
  /** O-number / program id */
  programNo?: number | string;
  /** WCS G54..G59 */
  wcs?: string;
  /** Post profile */
  profile?: PostProfileId;
  /** Segment comments */
  comments?: boolean;
  /** Spindle / tool optional */
  spindle?: number;
  tool?: number;
}

function safetyBlock(profile: PostProfileId, wcs: string): string {
  if (profile === "iso-siemens") return `G0 G18 G40 G90 G${wcs.replace("G","") || "54"}`;
  if (profile === "haas") return `G00 G18 G21 G40 ${wcs} G80 G99 G90`;
  return `G00 G18 G21 G40 ${wcs} G80 G99`;
}


/** Axis word for CNC: always with decimal point (12. not 12). */
function addrNum(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return "0.";
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  const rounded = Math.round(a * 10 ** digits) / 10 ** digits;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) return sign + String(Math.round(rounded)) + ".";
  let s = rounded.toFixed(digits).replace(/(\.\d*?)0+$/, "$1");
  if (!s.includes(".")) s += ".";
  return sign + s;
}

function addrX(xRadius: number, mode: XMode, digits = 3): string {
  return `X${addrNum(fromRadius(xRadius, mode), digits)}`;
}

function addrZ(z: number, digits = 3): string {
  return `Z${addrNum(z, digits)}`;
}

export function toIso(solved: SolvedContour, opts?: GCodeOptions): string {
  const F = opts?.feed ?? 0.2;
  const mode = solved.xMode;
  const profile: PostProfileId = opts?.profile ?? "iso-fanuc";
  const wcs = opts?.wcs ?? "G54";
  const comments = false;
  const lines: string[] = [];
  if (opts?.programNo != null && String(opts.programNo).trim() !== "") {
    const o = String(opts.programNo).replace(/\D/g, "") || "1000";
    lines.push(`O${o}`);
  }
  lines.push(`; ICP Contour — ${profile} G18 ZX`);
  lines.push(`; X ${mode === "diameter" ? "diameter" : "radius"}, mm`);
  lines.push(`; Length L=${fmtFixed(solved.length, 3)} mm`);
  if (opts?.name) lines.push(`; Name: ${opts.name}`);
  lines.push(safetyBlock(profile, wcs));
  if (opts?.tool != null && opts.tool > 0) lines.push(`T${Math.round(opts.tool)}`);
  if (opts?.spindle != null && opts.spindle > 0) lines.push(`S${Math.round(opts.spindle)} M3`);
  lines.push(`G0 ${addrX(solved.start.x, mode)} ${addrZ(solved.start.z)}`);
  let n = 10;
  const step = 10;
  const emit = (s: string, note?: string) => {
    const c = comments && note ? ` ${note}` : "";
    lines.push(`N${n} ${s}${c}`);
    n += step;
  };
  let si = 0;
  for (const seg of solved.segments) {
    si++;
    if (seg.type === "line") {
      const sameX = Math.abs(seg.end.x - seg.start.x) < 1e-7;
      const sameZ = Math.abs(seg.end.z - seg.start.z) < 1e-7;
      const parts = ["G1"];
      if (!sameX) parts.push(addrX(seg.end.x, mode));
      if (!sameZ) parts.push(addrZ(seg.end.z));
      if (parts.length === 1) continue;
      parts.push(`F${fmtFixed(F, 3)}`);
      emit(parts.join(" "));
    } else {
      const g = seg.cw ? "G2" : "G3";
      const R = Math.abs(seg.sweep) > Math.PI + 1e-9 ? -Math.abs(seg.r) : Math.abs(seg.r);
      emit(
        `${g} ${addrX(seg.end.x, mode)} ${addrZ(seg.end.z)} R${addrNum(R)} F${fmtFixed(F, 3)}`,
        `; seg${si} ${g} R${fmtFixed(Math.abs(seg.r), 3)}`,
      );
    }
  }
  lines.push(`M30`);
  return lines.join("\n") + "\n";
}
export function toKlartext(solved: SolvedContour, name = "CONTOUR"): string {
  const mode = solved.xMode;
  const lines: string[] = [];
  lines.push(`BEGIN PGM ${sanitize(name)} MM`);
  lines.push(`; Расчёт токарного контура для G-кода`);
  lines.push(`; Plane ZX  X=${mode === "diameter" ? "diameter" : "radius"}`);
  lines.push(`N10 G18`);
  lines.push(`N20 G90`);
  let n = 30;
  const emit = (s: string) => {
    lines.push(`N${n} ${s}`);
    n += 10;
  };
  emit(`L ${addrX(solved.start.x, mode)} ${addrZ(solved.start.z)}`);
  for (const seg of solved.segments) {
    if (seg.type === "line") {
      const sameX = Math.abs(seg.end.x - seg.start.x) < 1e-7;
      const sameZ = Math.abs(seg.end.z - seg.start.z) < 1e-7;
      const parts = ["L"];
      if (!sameX) parts.push(addrX(seg.end.x, mode));
      if (!sameZ) parts.push(addrZ(seg.end.z));
      if (parts.length > 1) emit(parts.join(" "));
    } else {
      const dr = seg.cw ? "DR-" : "DR+";
      emit(
        `CC X${addrNum(fromRadius(seg.center.x, mode))} Z${addrNum(seg.center.z)}`,
      );
      emit(
        `C ${addrX(seg.end.x, mode)} ${addrZ(seg.end.z)} ${dr} R${addrNum(seg.r)}`,
      );
    }
  }
  lines.push(`END PGM ${sanitize(name)} MM`);
  return lines.join("\n") + "\n";
}

function sanitize(name: string): string {
  const t = name
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 16);
  return t || "CONTOUR";
}

export function toPointsCsv(solved: SolvedContour): string {
  const rows = ["n,Z,X_dia,xs_radius,type"];
  let i = 0;
  rows.push(`${i++},${solved.start.z.toFixed(4)},${fromRadius(solved.start.x, "diameter").toFixed(4)},${solved.start.x.toFixed(4)},start`);
  for (const seg of solved.segments) {
    rows.push(
      `${i++},${seg.end.z.toFixed(4)},${fromRadius(seg.end.x, "diameter").toFixed(4)},${seg.end.x.toFixed(4)},${seg.type}`,
    );
  }
  return rows.join("\n") + "\n";
}

export function cycleComment(solved: SolvedContour): string {
  const dz = solved.end.z - solved.start.z;
  const dir = dz < -1e-6 ? "ICP-Zerspanen längs (−Z)" : dz > 1e-6 ? "ICP +Z" : "ICP-Zerspanen plan (X)";
  return `${dir}; L=${solved.length.toFixed(3)} mm; элементов ${solved.elements.length}`;
}

export function segmentLabel(i: number, type: string, z: number, xDia: number): string {
  return `N${(i + 1) * 10} ${type.toUpperCase()}  Z${addrNum(z)}  X${addrNum(xDia)}`;
}

export { dist };
