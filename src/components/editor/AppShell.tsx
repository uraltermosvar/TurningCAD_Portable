import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Calculator,
  ChevronDown,
  Copy,
  Eye,
  ArrowDown,
  ArrowUp,
  Grid3x3,
  Layers,
  Save,
  Scan,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useContourStore, type TabId } from "@/store/contour-store";
import { ContourCanvas } from "./ContourCanvas";
import { ElementTable } from "./ElementTable";
import { FormulaPanel } from "./FormulaPanel";
import { GCodePanel } from "./GCodePanel";
import { HelpPanel } from "./HelpPanel";
import { ParamPanel } from "./ParamPanel";
import { SoftKeys } from "./SoftKeys";
import { cn } from "@/lib/utils";

const TABS: { id: TabId; label: string; icon: typeof Eye }[] = [
  { id: "params", label: "Параметры", icon: Layers },
  { id: "math", label: "Расчёт", icon: Calculator },
  { id: "gcode", label: "G-код", icon: Copy },
  { id: "help", label: "ICP", icon: BookOpen },
];

export function AppShell() {
  const hydrate = useContourStore((s) => s.hydrate);
  const tab = useContourStore((s) => s.tab);
  const setTab = useContourStore((s) => s.setTab);
  const doc = useContourStore((s) => s.doc);
  const solved = useContourStore((s) => s.solved);
  const loadDoc = useContourStore((s) => s.loadDoc);
  const newBlank = useContourStore((s) => s.newBlank);
  const saveNamed = useContourStore((s) => s.saveNamed);
  const removeSaved = useContourStore((s) => s.removeSaved);
  const saved = useContourStore((s) => s.saved);
  const toggle = useContourStore((s) => s.toggle);
  const [contoursOpen, setContoursOpen] = useState(false);
  const contoursRef = useRef<HTMLDivElement>(null);
  const showMirror = useContourStore((s) => s.showMirror);
  const contourSide = useContourStore((s) => s.contourSide);
  const flipSide = useContourStore((s) => s.flipSide);
  const showGrid = useContourStore((s) => s.showGrid);
  const showArrows = useContourStore((s) => s.showArrows);
  const showDims = useContourStore((s) => s.showDims);
  const showStock = useContourStore((s) => s.showStock);
  const errors = solved.issues.filter((i) => i.level === "error").length;

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) useContourStore.getState().redo();
        else useContourStore.getState().undo();
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        useContourStore.getState().deleteSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!contoursOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (contoursRef.current && !contoursRef.current.contains(e.target as Node)) {
        setContoursOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [contoursOpen]);

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-bezel px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="hidden size-8 shrink-0 items-center justify-center rounded-sm border border-primary/30 bg-accent font-mono text-[10px] font-semibold tracking-widest text-phosphor sm:flex">
            HH
          </div>
          <div className="min-w-0">
            <div className="truncate text-[11px] tracking-[0.18em] text-steel uppercase">Расчёт токарного контура для G-кода</div>
            <h1 className="truncate text-sm font-semibold tracking-tight text-foreground">ICP Контур · токарный редактор</h1>
          </div>
        </div>
        <div className="hidden items-center gap-1 md:flex">
          <HeaderToggle
            active={contourSide < 0}
            onClick={() => flipSide()}
            label={contourSide < 0 ? "Низ" : "Верх"}
            icon={contourSide < 0 ? ArrowDown : ArrowUp}
          />
          <HeaderToggle active={showGrid} onClick={() => toggle("showGrid")} label="Сетка" icon={Grid3x3} />
          <HeaderToggle active={showMirror} onClick={() => toggle("showMirror")} label="Зеркало" icon={Scan} />
          <HeaderToggle active={showStock} onClick={() => toggle("showStock")} label="Заг." icon={Eye} />
          <HeaderToggle active={showDims} onClick={() => toggle("showDims")} label="Размеры" icon={Layers} />
        </div>
        <div className="flex items-center gap-1">
          <div className="relative" ref={contoursRef}>
            <button
              type="button"
              onClick={() => setContoursOpen((o) => !o)}
              className="inline-flex h-9 max-w-40 items-center gap-1 rounded-md border border-border bg-card px-2 font-mono text-xs text-foreground"
            >
              <span className="truncate">Контуры…</span>
              <ChevronDown className={cn("size-3.5 shrink-0 opacity-60 transition-transform", contoursOpen && "rotate-180")} />
            </button>
            {contoursOpen ? (
              <div className="absolute right-0 z-50 mt-1 min-w-52 overflow-hidden rounded-md border border-border bg-card shadow-lg">
                <button
                  type="button"
                  className="flex w-full items-center px-3 py-2 text-left font-mono text-xs hover:bg-accent"
                  onClick={() => {
                    newBlank();
                    setContoursOpen(false);
                  }}
                >
                  Новый контур
                </button>
                {saved.length > 0 ? (
                  <>
                    <div className="border-t border-border px-3 py-1.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                      История
                    </div>
                    <ul className="max-h-56 overflow-y-auto">
                      {saved.map((s, i) => (
                        <li
                          key={`${s.at}-${i}`}
                          className="group flex items-center gap-1 border-t border-border/60"
                        >
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate px-3 py-2 text-left font-mono text-xs hover:bg-accent"
                            onClick={() => {
                              loadDoc(s.doc);
                              setContoursOpen(false);
                            }}
                          >
                            {s.name}
                          </button>
                          <button
                            type="button"
                            title="Удалить"
                            aria-label={`Удалить ${s.name}`}
                            className="mr-1.5 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeSaved(i);
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <div className="border-t border-border px-3 py-2 font-mono text-[11px] text-muted-foreground">
                    История пуста
                  </div>
                )}
              </div>
            ) : null}
          </div>
          <Button size="sm" variant="secondary" onClick={saveNamed} className="hidden sm:inline-flex">
            <Save className="size-3.5" />
            Сохранить
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <aside className="flex max-h-36 shrink-0 flex-col border-b border-border lg:max-h-none lg:w-64 lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Элементы</span>
            <span className="font-mono text-[10px] text-phosphor">{doc.elements.length} · L {solved.length.toFixed(1)}</span>
          </div>
          <ElementTable />
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="relative min-h-[200px] flex-1">
            <ContourCanvas />
            {errors > 0 ? (
              <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-sm border border-destructive/40 bg-background/90 px-2 py-1 font-mono text-[11px] text-destructive">
                {errors} ошибк{errors === 1 ? "а" : "и"} геометрии
              </div>
            ) : null}
          </div>
        </main>

        <aside className="flex h-[40vh] min-h-[220px] shrink-0 flex-col border-t border-border lg:h-auto lg:min-h-0 lg:w-80 lg:border-t-0 lg:border-l">
          <div className="flex shrink-0 gap-0 border-b border-border">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex h-11 flex-1 items-center justify-center gap-1 px-1 text-[11px] transition-colors duration-150",
                    tab === t.id ? "bg-accent text-phosphor-hot" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              );
            })}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {tab === "params" ? <ParamPanel /> : null}
            {tab === "math" ? <FormulaPanel /> : null}
            {tab === "gcode" ? <GCodePanel /> : null}
            {tab === "help" ? <HelpPanel /> : null}
          </div>
        </aside>
      </div>

      {/* Полная ширина экрана: кнопки функций справа */}
      <div className="shrink-0 border-t border-border bg-bezel">
        <SoftKeys />
      </div>
    </div>
  );
}

function HeaderToggle({
  active,
  onClick,
  label,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: typeof Eye;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        "inline-flex h-8 items-center gap-1 rounded-sm border px-2 text-[11px]",
        active ? "border-primary/30 bg-accent text-phosphor-hot" : "border-border bg-card text-muted-foreground",
      )}
    >
      <Icon className="size-3.5" />
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}
