import { useEffect, useState, type ReactNode } from "react";
import { kindLabel, parseNum } from "@/lib/contour/format.ts";
import type { ArcElement, ContourElement, LineElement, UndercutElement } from "@/lib/contour/types.ts";
import { useContourStore } from "@/store/contour-store";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { evalExpr } from "@/lib/contour/eval-expr";

export function ParamPanel() {
  const doc = useContourStore((s) => s.doc);
  const selectedId = useContourStore((s) => s.selectedId);
  const solved = useContourStore((s) => s.solved);
  const updateElement = useContourStore((s) => s.updateElement);
  const setStock = useContourStore((s) => s.setStock);
  const setXMode = useContourStore((s) => s.setXMode);
  const setName = useContourStore((s) => s.setName);
  const patchDoc = useContourStore((s) => s.patchDoc);

  const el = doc.elements.find((e) => e.id === selectedId) ?? doc.elements[0];
  const solvedEl = solved.elements.find((e) => e.id === el?.id);
  const issue = solved.issues.find((i) => i.id === el?.id);

  const partLen = (doc.stock as any).partLen ?? 0;
  const stockLength = doc.stock.length;

  const handlePartLenChange = (val: number | undefined) => {
    const newPart = val ?? 0;
    patchDoc((d) => {
      const stock = (d.stock as any) || {};
      const L = Number(stock.length ?? 60);
      const oldShift = Number(stock.shift ?? 0);
      
      // Логика: сдвиг = (Длина заготовки - Длина детали) / 2
      // Знак минус, чтобы утапливать деталь ВЛЕВО (в минус), от торца заготовки.
      const newShift = (newPart > 0 && newPart <= L) ? -Math.round(((L - newPart) / 2) * 1000) / 1000 : 0;
      const delta = newShift - oldShift;

      if (Math.abs(delta) < 1e-9) {
        return { ...d, stock: { ...d.stock, partLen: newPart, shift: newShift } };
      }

      const shiftZ = (v: number | null | undefined) =>
        v != null && Number.isFinite(+v) ? Math.round((+v + delta) * 1000) / 1000 : v;

      // Сдвигаем все элементы контура на delta
      const elements = d.elements.map((el) => {
        if (el.kind === "start") return { ...el, zs: shiftZ((el as any).zs) };
        if ("z" in el) return { ...el, z: shiftZ((el as any).z) };
        if ("k" in el) return { ...el, k: shiftZ((el as any).k) };
        return el;
      });

      return {
        ...d,
        elements,
        stock: { ...d.stock, partLen: newPart, shift: newShift }
      };
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3">
      <Field label="Имя контура">
        <Input value={doc.name} onChange={(e) => setName(e.target.value)} />
      </Field>

      <div className="rounded-sm border border-border/60 bg-secondary/40 p-2">
        <div className="mb-1.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          Заготовка
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Ø Заготовки">
            <Num
              value={doc.stock.diameter}
              onChange={(v) => setStock({ diameter: v ?? doc.stock.diameter })}
            />
          </Field>
          <Field label="Длина загот.">
            <Num
              value={stockLength}
              onChange={(v) => setStock({ length: v ?? stockLength })}
            />
          </Field>
          <Field label="Длина детали">
            <Num
              value={partLen > 0 ? partLen : undefined}
              onChange={handlePartLenChange}
            />
          </Field>
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
          Контур сдвигается на -(L загот. − L детали) / 2.
        </p>
      </div>

      <div className="flex gap-1">
        <ModeChip active={doc.xMode === "diameter"} onClick={() => setXMode("diameter")}>
          X = Ø
        </ModeChip>
        <ModeChip active={doc.xMode === "radius"} onClick={() => setXMode("radius")}>
          X = R
        </ModeChip>
      </div>

      {el ? (
        <>
          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="text-xs font-medium tracking-wide text-steel uppercase">{kindLabel(el.kind)}</div>
            {issue ? <Badge variant={issue.level === "error" ? "error" : "warn"}>{issue.level}</Badge> : <Badge>OK</Badge>}
          </div>
          {issue ? <p className="text-xs text-destructive">{issue.message}</p> : null}

          <ElementFields el={el} onChange={(p) => updateElement(el.id, p)} />

          {solvedEl ? (
            <div className="rounded-md border border-border bg-bezel p-2 font-mono text-[11px] leading-relaxed text-phosphor">
              <div>X {solvedEl.xEnd.toFixed(3)}</div>
              <div>Z {solvedEl.zEnd.toFixed(3)}</div>
              {solvedEl.angleDeg != null ? <div>A {solvedEl.angleDeg.toFixed(3)}°</div> : null}
              <div>L {solvedEl.length.toFixed(3)} мм</div>
              {solvedEl.radius != null ? <div>R {solvedEl.radius.toFixed(3)}</div> : null}
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Выберите элемент или нажмите softkey.</p>
      )}
    </div>
  );
}

function ElementFields({
  el,
  onChange,
}: {
  el: ContourElement;
  onChange: (p: Partial<ContourElement>) => void;
}) {
  if (el.kind === "start") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Field label="XS">
          <Num value={el.xs} onChange={(v) => onChange({ xs: v })} />
        </Field>
        <Field label="ZS">
          <Num value={el.zs} onChange={(v) => onChange({ zs: v })} />
        </Field>
      </div>
    );
  }
  if (el.kind === "line") {
    const line = el;
    return (
      <div className="flex flex-col gap-2">
        <div className="rounded-sm border border-border/60 bg-secondary/40 p-2">
          <div className="mb-1.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            Линия · X / Z / A
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="X">
              <Num value={line.x} onChange={(v) => onChange({ x: v })} />
            </Field>
            <Field label="Z">
              <Num value={line.z} onChange={(v) => onChange({ z: v })} />
            </Field>
            <Field label="A °">
              <Num value={line.a} onChange={(v) => onChange({ a: v })} />
            </Field>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="L мм">
            <Num value={line.l} onChange={(v) => onChange({ l: v })} />
          </Field>
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Пустые X и Z наследуют предыдущую точку. A — угол ZX, L — длина. Вводите только то, что меняется.
        </p>
      </div>
    );
  }
  if (el.kind === "arc") {
    const a = el;
    return (
      <div className="flex flex-col gap-2">
        <div className="flex gap-1">
          <ModeChip active={a.rotation === "cw"} onClick={() => onChange({ rotation: "cw" } as Partial<ArcElement>)}>
            G2 CW
          </ModeChip>
          <ModeChip active={a.rotation === "ccw"} onClick={() => onChange({ rotation: "ccw" } as Partial<ArcElement>)}>
            G3 CCW
          </ModeChip>
          <ModeChip active={!!a.major} onClick={() => onChange({ major: !a.major } as Partial<ArcElement>)}>
            {">"}180°
          </ModeChip>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="X">
            <Num value={a.x} onChange={(v) => onChange({ x: v })} />
          </Field>
          <Field label="Z">
            <Num value={a.z} onChange={(v) => onChange({ z: v })} />
          </Field>
          <Field label="R">
            <Num value={a.r} onChange={(v) => onChange({ r: v })} />
          </Field>
          <Field label="I (Ø)">
            <Num value={a.i} onChange={(v) => onChange({ i: v, centerMode: "absolute" })} />
          </Field>
          <Field label="K">
            <Num value={a.k} onChange={(v) => onChange({ k: v, centerMode: "absolute" })} />
          </Field>
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Z можно не задавать: X+R+I → авто Z. I=0 — центр на оси. G2 CW / G3 CCW.
        </p>
      </div>
    );
  }
  if (el.kind === "chamfer" || el.kind === "rounding") {
    return (
      <Field label={el.kind === "chamfer" ? "B фаска" : "B радиус"}>
        <Num value={el.b} onChange={(v) => onChange({ b: v })} />
      </Field>
    );
  }
  if (el.kind === "undercut") {
    const u = el;
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1">
          {(["din76", "din509e", "din509f"] as const).map((f) => (
            <ModeChip key={f} active={u.form === f} onClick={() => onChange({ form: f } as Partial<UndercutElement>)}>
              {f === "din76" ? "DIN 76" : f === "din509e" ? "509 E" : "509 F"}
            </ModeChip>
          ))}
          <ModeChip active={u.j === 1} onClick={() => onChange({ j: 1 } as Partial<UndercutElement>)}>
            J=1
          </ModeChip>
          <ModeChip active={u.j === -1} onClick={() => onChange({ j: -1 } as Partial<UndercutElement>)}>
            J=−1
          </ModeChip>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="X торец">
            <Num value={u.x} onChange={(v) => onChange({ x: v })} />
          </Field>
          <Field label="Z торец">
            <Num value={u.z} onChange={(v) => onChange({ z: v })} />
          </Field>
          {u.form === "din76" ? (
            <>
              <Field label="FP шаг">
                <Num value={u.fp} onChange={(v) => onChange({ fp: v })} />
              </Field>
              <Field label="I Ø">
                <Num value={u.i} onChange={(v) => onChange({ i: v })} />
              </Field>
              <Field label="K длина">
                <Num value={u.k} onChange={(v) => onChange({ k: v })} />
              </Field>
              <Field label="W °">
                <Num value={u.w} onChange={(v) => onChange({ w: v })} />
              </Field>
              <Field label="R">
                <Num value={u.r} onChange={(v) => onChange({ r: v })} />
              </Field>
            </>
          ) : (
            <>
              <Field label="r">
                <Num value={u.r} onChange={(v) => onChange({ r: v })} />
              </Field>
              <Field label="t глубина">
                <Num value={u.t} onChange={(v) => onChange({ t: v })} />
              </Field>
              <Field label="f ширина">
                <Num value={u.f} onChange={(v) => onChange({ f: v })} />
              </Field>
            </>
          )}
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Пустые поля берутся из таблицы DIN. J=1: сначала продольный, затем торец.
        </p>
      </div>
    );
  }
  return null;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">{label}</span>
      {children}
    </label>
  );
}

function Num({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  const [text, setText] = useState(() => (value === undefined ? "" : String(value)));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setText(value === undefined ? "" : String(value));
    }
  }, [value, focused]);

  const commitValue = (raw: string) => {
    if (!raw.trim()) {
      onChange(undefined);
      setText("");
      return;
    }
    if (/[0-9).][+\-*\/]|[*\/()]/.test(raw)) {
      const result = evalExpr(raw);
      if (result !== undefined) {
        onChange(result);
        setText(String(result));
        return;
      }
    }
    const n = parseNum(raw);
    onChange(n);
    setText(n === undefined ? "" : String(n));
  };

  return (
    <Input
      inputMode="decimal"
      value={text}
      placeholder="—"
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commitValue(text);
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(",", ".");
        setText(raw);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitValue(text);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function ModeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "h-8 rounded-sm border border-primary/40 bg-accent px-2 font-mono text-[11px] text-phosphor-hot"
          : "h-8 rounded-sm border border-border bg-secondary px-2 font-mono text-[11px] text-muted-foreground hover:text-foreground"
      }
    >
      {children}
    </button>
  );
}