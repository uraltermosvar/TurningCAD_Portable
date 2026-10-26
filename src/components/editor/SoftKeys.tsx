import { useState } from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal, RotateCcw, Spline, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useContourStore } from "@/store/contour-store";

/** Нижний бар BASE v6: ← → переноса заготовки нет (кнопка на канве сверху). */
export function SoftKeys() {
  const addKind = useContourStore((s) => s.addKind);
  const undo = useContourStore((s) => s.undo);
  const reverse = useContourStore((s) => s.reverse);
  const deleteSelected = useContourStore((s) => s.deleteSelected);
  const stepAnchor = useContourStore((s) => s.stepAnchor);
  const mirrorZ = useContourStore((s) => s.mirrorZ);
  const applyTemplate = useContourStore((s) => s.applyTemplate);
  const [more, setMore] = useState(false);

  const MAIN = [
    { label: "Линия", sub: "G1", a: () => addKind("line") },
    { label: "G2", sub: "CW", a: () => addKind("arc", { rotation: "cw" }) },
    { label: "G3", sub: "CCW", a: () => addKind("arc", { rotation: "ccw" }) },
    { label: "CHF", sub: "фаска", a: () => addKind("chamfer") },
    { label: "RND", sub: "R", a: () => addKind("rounding") },
  ];

  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-1 px-2 py-2">
      <Button variant="key" size="key" className="h-11 min-w-[2.2rem] flex-none" onClick={() => stepAnchor?.(1)}>
        <ChevronLeft className="size-4 text-phosphor" />
      </Button>
      <Button variant="key" size="key" className="h-11 min-w-[2.2rem] flex-none" onClick={() => stepAnchor?.(-1)}>
        <ChevronRight className="size-4 text-phosphor" />
      </Button>
      {MAIN.map((k) => (
        <Button
          key={k.label}
          variant="key"
          size="key"
          className="h-11 min-w-[3.6rem] flex-1 basis-[4.5rem] max-w-[7rem] px-1.5"
          onClick={k.a}
        >
          <span className="font-mono text-[12px] font-semibold text-phosphor">{k.label}</span>
          <span className="text-[9px] text-muted-foreground">{k.sub}</span>
        </Button>
      ))}
      <Button variant="key" size="key" className="h-11" onClick={() => setMore((v) => !v)}>
        <MoreHorizontal className="size-4 text-phosphor" />
        <span className="text-[9px] text-muted-foreground">ещё</span>
      </Button>
      {more && (
        <>
          <Button variant="key" size="key" className="h-11" onClick={() => addKind("undercut", { form: "din76" })}>
            <span className="font-mono text-[11px] font-semibold text-phosphor">DIN76</span>
          </Button>
          <Button variant="key" size="key" className="h-11" onClick={() => addKind("undercut", { form: "din509e" })}>
            <span className="font-mono text-[11px] font-semibold text-phosphor">509E</span>
          </Button>
          <Button variant="key" size="key" className="h-11" onClick={() => mirrorZ()}>
            <span className="font-mono text-[11px] font-semibold text-phosphor">↔Z</span>
            <span className="text-[8px] text-muted-foreground">зерк</span>
          </Button>
          <Button variant="key" size="key" className="h-11" onClick={() => applyTemplate("chamfer45")}>
            <span className="font-mono text-[10px] font-semibold text-phosphor">1×45°</span>
          </Button>
          <Button variant="key" size="key" className="h-11" onClick={() => applyTemplate("groove")}>
            <span className="font-mono text-[10px] font-semibold text-phosphor">канав</span>
          </Button>
          <Button variant="key" size="key" className="h-11" onClick={() => applyTemplate("nose-r")}>
            <span className="font-mono text-[10px] font-semibold text-phosphor">Rнос</span>
          </Button>
        </>
      )}
      <Button variant="key" size="key" className="min-h-11" onClick={undo}>
        <RotateCcw className="size-3.5 text-steel" />
        <span className="text-[9px] text-muted-foreground">отмена</span>
      </Button>
      <Button variant="key" size="key" className="min-h-11" onClick={reverse}>
        <Spline className="size-3.5 text-steel" />
        <span className="text-[9px] text-muted-foreground">реверс</span>
      </Button>
      <Button variant="key" size="key" className="min-h-11" onClick={deleteSelected}>
        <Trash2 className="size-3.5 text-destructive" />
        <span className="text-[9px] text-muted-foreground">удалить</span>
      </Button>
    </div>
  );
}