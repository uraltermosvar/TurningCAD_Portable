import { useContourStore } from "@/store/contour-store";

export function FormulaPanel() {
  const selectedId = useContourStore((s) => s.selectedId);
  const solved = useContourStore((s) => s.solved);
  const el = solved.elements.find((e) => e.id === selectedId) ?? solved.elements[0];
  const issues = solved.issues;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Внутренняя геометрия — плоскость ZX, X как <span className="text-foreground">радиус</span>. Ввод X — диаметр
        (диаметр). Угол от +Z к +X: A = atan2(Δx, Δz).
      </p>
      {el ? (
        <div className="flex flex-col gap-2">
          {el.formulas.map((f, i) => (
            <div key={`${el.id}-${i}`} className="rounded-md border border-border bg-bezel p-2">
              <div className="text-[10px] tracking-wider text-steel uppercase">{f.label}</div>
              <div className="font-mono text-[12px] text-phosphor-hot">{f.expr}</div>
              {f.value ? <div className="font-mono text-[11px] text-phosphor">{f.value}</div> : null}
            </div>
          ))}
          {el.formulas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Для этого элемента формулы появятся после расчёта.</p>
          ) : null}
        </div>
      ) : null}
      {issues.length ? (
        <div className="flex flex-col gap-1">
          {issues.map((iss) => (
            <div
              key={iss.id + iss.message}
              className={iss.level === "error" ? "text-xs text-destructive" : "text-xs text-warn"}
            >
              {iss.message}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-phosphor">Контур решён без ошибок.</p>
      )}
    </div>
  );
}
