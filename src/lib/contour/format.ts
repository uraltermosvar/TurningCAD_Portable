export function fmtMm(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return "—";
  const s = n.toFixed(digits);
  if (digits === 0) return s;
  return s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

export function fmtFixed(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return "0." + "0".repeat(digits);
  const sign = n < 0 ? "-" : "";
  return sign + Math.abs(n).toFixed(digits);
}

export function fmtSigned(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return "+0." + "0".repeat(digits);
  const sign = n >= 0 ? "+" : "-";
  return sign + Math.abs(n).toFixed(digits);
}

export function fmtDeg(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return "—";
  return `${fmtMm(n, digits)}°`;
}

export function parseNum(raw: string): number | undefined {
  const t = raw.trim().replace(",", ".");
  if (t === "" || t === "+" || t === "-") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export function kindLabel(kind: string): string {
  switch (kind) {
    case "start":
      return "Старт";
    case "line":
      return "Прямая";
    case "arc":
      return "Дуга";
    case "chamfer":
      return "Фаска";
    case "rounding":
      return "Радиус";
    case "undercut":
      return "Канавка";
    default:
      return kind;
  }
}

export function dirLabel(dir?: string): string {
  switch (dir) {
    case "z+":
      return "+Z";
    case "z-":
      return "−Z";
    case "x+":
      return "+X";
    case "x-":
      return "−X";
    case "z+x+":
      return "+Z +X";
    case "z+x-":
      return "+Z −X";
    case "z-x+":
      return "−Z +X";
    case "z-x-":
      return "−Z −X";
    default:
      return "";
  }
}
