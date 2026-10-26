import { create } from "zustand";
import {
  cloneDoc,
  emptyDoc,
  type ContourDoc,
  type ContourElement,
  type ElementKind,
  type StockDef,
  type XMode,
  newId,
  solveContour,
  type SolvedContour,
} from "@/lib/contour";
import { fromRadius } from "@/lib/contour/math.ts";
import {
  type PostProfileId,
  type TemplateId,
  mirrorDocZ,
  applyTemplate,
  analyzeContour,
  type LimitHit,
} from "@/lib/contour/pilot-tools.ts";

const LS_KEY = "icp-contour.v4";
const LS_LEGACY_KEYS = ["icp-contour.v1"];

export type TabId = "params" | "gcode" | "math" | "help";

interface ContourState {
  doc: ContourDoc;
  selectedId: string | null;
  arcPointIdx: number;
  solved: SolvedContour;
  history: ContourDoc[];
  future: ContourDoc[];
  showMirror: boolean;
  contourSide: 1 | -1;
  showGrid: boolean;
  showDims: boolean;
  showStock: boolean;
  showTool: boolean;
  showArrows: boolean;
  animating: boolean;
  tab: TabId;
  saved: { name: string; doc: ContourDoc; at: number }[];
  hydrated: boolean;
  postProfile: PostProfileId;
  programNo: string;
  wcs: string;
  feed: number;
  spindle: number;
  tool: number;
  analysis: LimitHit[];
  setTab: (t: TabId) => void;
  select: (id: string | null, arcPointIdx?: number) => void;
  setArcPointIdx: (idx: number) => void;
  patchDoc: (fn: (d: ContourDoc) => ContourDoc, pushHistory?: boolean) => void;
  updateElement: (id: string, patch: Partial<ContourElement>) => void;
  addElement: (el: ContourElement, afterId?: string | null) => void;
  addKind: (kind: ElementKind, extra?: Record<string, unknown>) => void;
  deleteSelected: () => void;
  undo: () => void;
  redo: () => void;
  loadDoc: (doc: ContourDoc) => void;
  newBlank: () => void;
  setStock: (stock: Partial<StockDef>) => void;
  setXMode: (mode: XMode) => void;
  setName: (name: string) => void;
  toggle: (key: "showMirror" | "showGrid" | "showDims" | "showStock" | "showTool" | "showArrows" | "animating") => void;
  flipSide: () => void;
  reverse: () => void;
  flipZ: () => void;
  mirrorZ: () => void;
  applyTemplate: (id: TemplateId) => void;
  setPostProfile: (p: PostProfileId) => void;
  setProgramNo: (s: string) => void;
  setWcs: (s: string) => void;
  setFeed: (n: number) => void;
  setSpindle: (n: number) => void;
  setTool: (n: number) => void;
  reanalyze: () => void;
  saveNamed: () => void;
  removeSaved: (index: number) => void;
  hydrate: () => void;
  persist: () => void;
  stepAnchor: (dir: -1 | 1) => void;
}

function resolveDoc(doc: ContourDoc): SolvedContour {
  return solveContour(doc.elements, doc.xMode);
}

const INITIAL_DOC = emptyDoc("Контур");

function persistNow(state: Pick<ContourState, "doc" | "saved" | "showMirror" | "showGrid" | "showDims" | "showStock" | "contourSide">) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        lastDraft: state.doc,
        saved: state.saved,
        showMirror: state.showMirror,
        showGrid: state.showGrid,
        showDims: state.showDims,
        showStock: state.showStock,
        contourSide: state.contourSide,
      }),
    );
  } catch { /* ignore quota */ }
}

function readJson(key: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

type SavedEntry = { name: string; doc: ContourDoc; at: number };

function collectSaved(parsed: Record<string, unknown> | null): SavedEntry[] {
  if (!parsed || !Array.isArray(parsed.saved)) return [];
  return (parsed.saved as SavedEntry[]).filter(
    (s) => s && s.doc && Array.isArray(s.doc.elements) && typeof s.name === "string",
  );
}

function mergeSaved(...lists: SavedEntry[][]): SavedEntry[] {
  const map = new Map<string, SavedEntry>();
  for (const list of lists) {
    for (const s of list) {
      const key = `${s.name}@@${s.at}`;
      if (!map.has(key)) map.set(key, s);
    }
  }
  return [...map.values()].sort((a, b) => b.at - a.at).slice(0, 12);
}

function makeElement(kind: ElementKind, extra: Record<string, unknown> = {}): ContourElement {
  const id = newId(kind[0] ?? "e");
  switch (kind) {
    case "start": return { id, kind: "start" };
    case "line": return { id, kind: "line", ...(extra as object) } as ContourElement;
    case "arc":
      return {
        id, kind: "arc",
        rotation: extra.rotation === "cw" ? "cw" : "ccw",
        centerMode: "none",
        ...(extra as object),
      } as ContourElement;
    case "chamfer": return { id, kind: "chamfer", ...(extra as object) } as ContourElement;
    case "rounding": return { id, kind: "rounding", ...(extra as object) } as ContourElement;
    case "undercut":
      return {
        id, kind: "undercut",
        form: (extra.form as "din76" | "din509e" | "din509f") ?? "din76",
        j: 1,
        ...(extra as object),
      } as ContourElement;
  }
}

function seedElement(kind: ElementKind, extra: Record<string, unknown>, end: { z: number; x: number }, xMode: XMode): ContourElement {
  if (kind === "line") return makeElement("line", { ...extra });
  if (kind === "arc") return makeElement("arc", { ...extra });
  if (kind === "undercut") return makeElement("undercut", { ...extra });
  return makeElement(kind, extra);
}

function bakeTransitionsInline(elements: any[], solvedList: any[]): typeof elements | null {
  const isPrim = (e: any) => !!e && (e.kind === "line" || e.kind === "arc");
  const rnd3 = (v: number) => Math.round(v * 1000) / 1000;
  const fromR = (x: number) => rnd3(x * 2);
  let changed = false;
  const next = elements.map((e) => ({ ...e }));
  for (let i = 0; i < next.length; i++) {
    const el = next[i];
    if (el.kind !== "chamfer" && el.kind !== "rounding") continue;
    const tEl = solvedList.find((s) => s.id === el.id);
    if (!tEl?.segments?.length) continue;
    const seg = tEl.segments[0];
    if (!seg?.start || !seg?.end) continue;
    let prevIdx = -1;
    for (let p = i - 1; p >= 0; p--) {
      if (isPrim(next[p])) { prevIdx = p; break; }
    }
    if (prevIdx >= 0) {
      const prev = next[prevIdx];
      next[prevIdx] = {
        ...prev,
        x: fromR(seg.start.x),
        z: rnd3(seg.start.z),
        ...(prev.kind === "line" ? { a: null, l: null } : {}),
      };
    }
    if (el.kind === "rounding" && seg.type === "arc" && seg.center) {
      next[i] = {
        id: el.id, kind: "arc", rotation: seg.cw ? "cw" : "ccw",
        x: fromR(seg.end.x), z: rnd3(seg.end.z),
        r: rnd3(Math.abs(seg.r ?? (typeof el.b === "number" ? el.b : 0))),
        i: fromR(seg.center.x), k: rnd3(seg.center.z),
      };
    } else {
      next[i] = { id: el.id, kind: "line", x: fromR(seg.end.x), z: rnd3(seg.end.z), a: null, l: null };
    }
    changed = true;
  }
  return changed ? next : null;
}

export const useContourStore = create<ContourState>((set, get) => ({
  doc: INITIAL_DOC,
  selectedId: INITIAL_DOC.elements[0]?.id ?? null,
  arcPointIdx: 2,
  solved: resolveDoc(INITIAL_DOC),
  history: [],
  future: [],
  showMirror: true,
  contourSide: 1,
  showGrid: true,
  showDims: true,
  showStock: true,
  showTool: false,
  showArrows: true,
  animating: false,
  tab: "params",
  saved: [],
  hydrated: false,
  postProfile: "iso-fanuc",
  programNo: "1000",
  wcs: "G54",
  feed: 0.2,
  spindle: 0,
  tool: 0,
  analysis: [],
  setTab: (tab) => set({ tab }),
  select: (id, arcPointIdx) =>
    set({
      selectedId: id,
      arcPointIdx: arcPointIdx != null ? Math.max(0, Math.min(2, arcPointIdx | 0)) : 2,
    }),
  setArcPointIdx: (idx) => set({ arcPointIdx: Math.max(0, Math.min(2, idx | 0)) }),
  patchDoc: (fn, pushHistory = true) => {
    const prev = get().doc;
    const doc = fn(prev);
    const solved = resolveDoc(doc);
    const analysis = analyzeContour(solved);
    set({
      doc,
      solved,
      analysis,
      history: pushHistory ? [...get().history.slice(-48), prev] : get().history,
      future: pushHistory ? [] : get().future,
    });
    persistNow({ ...get(), doc });
  },
  updateElement: (id, patch) => {
    get().patchDoc((d) => ({
      ...d,
      elements: d.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as ContourElement) : e)),
    }));
  },
  addElement: (el, afterId) => {
    get().patchDoc((d) => {
      const elems = [...d.elements];
      const idx = afterId ? elems.findIndex((e) => e.id === afterId) : elems.length - 1;
      const at = idx >= 0 ? idx + 1 : elems.length;
      elems.splice(at, 0, el);
      return { ...d, elements: elems };
    });
    set({ selectedId: el.id, arcPointIdx: 2, tab: "params" });
  },
  addKind: (kind, extra = {}) => {
    const { solved, doc } = get();
    const el = seedElement(kind, extra, solved.end, doc.xMode);
    get().addElement(el, get().selectedId);
  },
  deleteSelected: () => {
    try {
      const sol = get().solved as any;
      const list = sol?.elements ?? sol?.solved ?? [];
      const baked = bakeTransitionsInline(get().doc.elements, Array.isArray(list) ? list : []);
      if (baked) set({ doc: { ...get().doc, elements: baked } });
    } catch { /* */ }

    const id = get().selectedId;
    if (!id) return;
    const els = get().doc.elements;
    const idx = els.findIndex((e) => e.id === id);
    const el = idx >= 0 ? els[idx] : undefined;
    if (!el || el.kind === "start") return;
    const prevId = idx > 0 ? els[idx - 1]!.id : els[0]?.id ?? null;
    get().patchDoc((d) => ({ ...d, elements: d.elements.filter((e) => e.id !== id) }));
    set({ selectedId: prevId });
  },
  undo: () => {
    const hist = get().history;
    if (!hist.length) return;
    const prev = hist[hist.length - 1];
    const current = get().doc;
    set({
      doc: prev,
      solved: resolveDoc(prev),
      history: hist.slice(0, -1),
      future: [...get().future, current],
    });
  },
  redo: () => {
    const fut = get().future;
    if (!fut.length) return;
    const next = fut[fut.length - 1];
    const current = get().doc;
    set({
      doc: next,
      solved: resolveDoc(next),
      future: fut.slice(0, -1),
      history: [...get().history, current],
    });
  },
  loadDoc: (src) => {
    const doc = cloneDoc(src);
    get().patchDoc(() => doc);
    set({ selectedId: doc.elements[0]?.id ?? null });
  },
  newBlank: () => get().loadDoc(emptyDoc("Контур")),
  setStock: (stock) => get().patchDoc((d) => ({ ...d, stock: { ...d.stock, ...stock } })),
  setXMode: (xMode) => get().patchDoc((d) => ({ ...d, xMode })),
  setName: (name) => get().patchDoc((d) => ({ ...d, name }), false),
  toggle: (key) => set({ [key]: !get()[key] }),
  flipSide: () => {
    const next = get().contourSide < 0 ? 1 : -1;
    set({ contourSide: next as 1 | -1 });
    persistNow({ ...get(), contourSide: next as 1 | -1 });
  },
  reverse: () => {
    const { solved, doc } = get();
    if (solved.segments.length === 0) return;
    const segs = [...solved.segments].reverse();
    const startX = fromRadius(solved.end.x, doc.xMode);
    const elements: ContourElement[] = [{ id: newId("s"), kind: "start", xs: startX, zs: solved.end.z }];
    for (const seg of segs) {
      if (seg.type === "line") {
        elements.push({ id: newId("l"), kind: "line", x: fromRadius(seg.start.x, doc.xMode), z: seg.start.z });
      } else {
        elements.push({ id: newId("a"), kind: "arc", rotation: seg.cw ? "ccw" : "cw", x: fromRadius(seg.start.x, doc.xMode), z: seg.start.z, r: seg.r, centerMode: "none" });
      }
    }
    get().patchDoc((d) => ({ ...d, elements }));
    get().reanalyze();
  },

  /**
   * Перенос заготовки и контура по Z. (Версия из HTML)
   */
  flipZ: () => {
    const { doc } = get();
    const rnd = (v: number) => Math.round(v * 1000) / 1000;
    const shiftVal = (v: number | null | undefined, delta: number) =>
      v != null && Number.isFinite(+v) ? rnd(+v + delta) : v;

    const stock = (doc as any).stock || {};
    const zFace0 = Number(stock.zFace ?? 0);
    const len = Number(stock.length ?? 60) || 60;
    
    const zChuck0 = zFace0 - len;
    const zMin = Math.min(zFace0, zChuck0);
    const zMax = Math.max(zFace0, zChuck0);
    
    let delta = 0;
    if (zMax - zMin < 1e-9) {
      // Если длина 0, просто перекидываем по знаку
      delta = zFace0 >= 0 ? -len : len;
    } else {
      const mid = (zMin + zMax) / 2;
      // Справа от Z0 → правый край на Z0; слева → левый край на Z0
      delta = mid >= -1e-9 ? -zMax : -zMin;
      if (Math.abs(delta) < 1e-9) delta = mid >= -1e-9 ? -(zMax - zMin) : (zMax - zMin);
    }

    // Сдвигаем элементы контура
    const elements = (doc.elements ?? []).map((el) => {
      if (el.kind === "start") return { ...el, zs: shiftVal((el as any).zs, delta) };
      if (el.kind === "line") return { ...el, z: shiftVal((el as any).z, delta) };
      if (el.kind === "arc") return { ...el, z: shiftVal((el as any).z, delta), k: shiftVal((el as any).k, delta) };
      return el;
    });

    // Сдвигаем заготовку
    const nextStock = { ...stock, zFace: rnd(zFace0 + delta) };
    const nextDoc = { ...doc, elements, stock: nextStock } as ContourDoc;
    const nextSolved = resolveDoc(nextDoc);
    
    set({ 
      doc: nextDoc, 
      solved: nextSolved, 
      history: [...get().history.slice(-48), doc],
      future: []
    });
    persistNow({ ...get(), doc: nextDoc });
  },
  
  mirrorZ: () => {
    get().patchDoc((d) => mirrorDocZ(d));
  },
  applyTemplate: (id) => {
    get().patchDoc((d) => applyTemplate(d, id));
  },
  setPostProfile: (postProfile) => set({ postProfile }),
  setProgramNo: (programNo) => set({ programNo }),
  setWcs: (wcs) => set({ wcs }),
  setFeed: (feed) => set({ feed }),
  setSpindle: (spindle) => set({ spindle }),
  setTool: (tool) => set({ tool }),
  reanalyze: () => {
    const s = get().solved;
    set({ analysis: analyzeContour(s) });
  },
  saveNamed: () => {
    const { doc, saved } = get();
    const next = [
      { name: doc.name, doc: structuredClone(doc), at: Date.now() },
      ...saved.filter((s) => s.name !== doc.name),
    ].slice(0, 12);
    set({ saved: next });
    persistNow({ ...get(), saved: next });
  },
  removeSaved: (index) => {
    const { saved } = get();
    if (index < 0 || index >= saved.length) return;
    const next = saved.filter((_, i) => i !== index);
    set({ saved: next });
    persistNow({ ...get(), saved: next });
  },
  hydrate: () => {
    if (typeof window === "undefined" || get().hydrated) return;
    try {
      const blank = emptyDoc("Контур");
      const cur = readJson(LS_KEY);
      const legacyLists = LS_LEGACY_KEYS.map((k) => collectSaved(readJson(k)));
      let saved = mergeSaved(collectSaved(cur), ...legacyLists);

      for (const key of LS_LEGACY_KEYS) {
        const leg = readJson(key);
        if (!leg) continue;
        const doc = leg.doc as ContourDoc | undefined;
        if (doc?.elements && doc.elements.length > 1) {
          const stamp = Date.now() - 1;
          const name = (doc.name && doc.name.trim()) || "Из прошлой версии";
          saved = mergeSaved(saved, [{ name, doc: structuredClone(doc), at: stamp }]);
        }
      }

      set({
        doc: blank,
        solved: resolveDoc(blank),
        selectedId: blank.elements[0]?.id ?? null,
        saved,
        showMirror: typeof cur?.showMirror === "boolean" ? (cur.showMirror as boolean) : true,
        contourSide: cur?.contourSide === -1 ? -1 : 1,
        showGrid: typeof cur?.showGrid === "boolean" ? (cur.showGrid as boolean) : true,
        showDims: typeof cur?.showDims === "boolean" ? (cur.showDims as boolean) : true,
        showStock: typeof cur?.showStock === "boolean" ? (cur.showStock as boolean) : true,
        history: [],
        future: [],
      });
      persistNow({ ...get(), doc: blank, saved });
    } catch {
      const blank = emptyDoc("Контур");
      set({
        doc: blank,
        solved: resolveDoc(blank),
        selectedId: blank.elements[0]?.id ?? null,
      });
    }
    set({ hydrated: true });
  },
  persist: () => persistNow(get()),
  stepAnchor: (dir) => {
    const { selectedId, arcPointIdx, solved } = get();
    type Nav = { elId: string; subIdx: number };
    const list: Nav[] = [];
    const seen = new Set<string>();
    const push = (elId: string, subIdx: number, z: number, x: number) => {
      const key = `${z.toFixed(4)},${x.toFixed(4)}`;
      if (seen.has(key)) return;
      seen.add(key);
      list.push({ elId, subIdx });
    };
    for (const s of solved.elements) {
      if (s.kind === "start") {
        push(s.id, 0, s.start.z, s.start.x);
        continue;
      }
      const seg = s.segments?.[0];
      if ((s.kind === "arc" || s.kind === "rounding") && seg && seg.type === "arc" && seg.center) {
        const a0 = Math.atan2(seg.start.x - seg.center.x, seg.start.z - seg.center.z);
        const am = a0 + (seg.sweep || 0) * 0.5;
        const mid = {
          z: seg.center.z + seg.r * Math.cos(am),
          x: seg.center.x + seg.r * Math.sin(am),
        };
        push(s.id, 0, seg.start.z, seg.start.x);
        push(s.id, 1, mid.z, mid.x);
        push(s.id, 2, seg.end.z, seg.end.x);
      } else {
        push(s.id, 2, s.end.z, s.end.x);
      }
    }
    if (!list.length) return;
    let cur = 0;
    for (let i = 0; i < list.length; i++) {
      if (list[i].elId === selectedId && list[i].subIdx === (arcPointIdx | 0)) {
        cur = i;
        break;
      }
      if (list[i].elId === selectedId) cur = i;
    }
    const next = (cur + dir + list.length) % list.length;
    const t = list[next];
    set({ selectedId: t.elId, arcPointIdx: t.subIdx, tab: "params" });
  },
}));