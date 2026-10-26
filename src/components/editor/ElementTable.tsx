import { kindLabel } from "@/lib/contour/format.ts";
import { useContourStore } from "@/store/contour-store";
import { cn } from "@/lib/utils";

export function ElementTable() {
  const elements = useContourStore((s) => s.doc.elements);
  const selectedId = useContourStore((s) => s.selectedId);
  const select = useContourStore((s) => s.select);
  const solved = useContourStore((s) => s.solved);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-[32px_1fr_64px_64px] gap-0 border-b border-border px-2 py-1.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
        <span>N</span>
        <span>Тип</span>
        <span className="text-right">X</span>
        <span className="text-right">Z</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {elements.map((el, i) => {
          const s = solved.elements.find((x) => x.id === el.id);
          const err = solved.issues.find((x) => x.id === el.id && x.level === "error");
          return (
            <button
              key={el.id}
              type="button"
              onClick={() => select(el.id)}
              className={cn(
                "grid w-full grid-cols-[32px_1fr_64px_64px] items-center px-2 py-2 text-left font-mono text-xs tabular-nums transition-colors duration-150",
                selectedId === el.id ? "bg-accent text-phosphor-hot" : "hover:bg-secondary",
                err && "text-destructive",
              )}
            >
              <span className="text-muted-foreground">{(i + 1) * 10}</span>
              <span className="truncate text-[12px]">{kindLabel(el.kind)}</span>
              <span className="text-right">{s ? s.xEnd.toFixed(3) : "—"}</span>
              <span className="text-right">{s ? s.zEnd.toFixed(3) : "—"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
