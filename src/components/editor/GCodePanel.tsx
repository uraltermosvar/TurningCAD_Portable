import { useMemo, useState } from "react";
import { cycleComment, toIso, toKlartext, toPointsCsv } from "@/lib/contour/gcode.ts";
import { contourToSvg, contourToDxf } from "@/lib/contour/pilot-tools.ts";
import { printContourDrawing } from "@/lib/contour/print-drawing.ts";
import type { PostProfileId } from "@/lib/contour/pilot-tools.ts";
import { useContourStore } from "@/store/contour-store";
import { Button } from "@/components/ui/button";

type CodeKind = "iso" | "klartext" | "csv";

const PROFILES: { id: PostProfileId; label: string }[] = [
  { id: "iso-fanuc", label: "Fanuc ISO" },
  { id: "iso-siemens", label: "Siemens" },
  { id: "haas", label: "Haas" },
];

export function GCodePanel() {
  const solved = useContourStore((s) => s.solved);
  const name = useContourStore((s) => s.doc.name);
  const postProfile = useContourStore((s) => s.postProfile);
  const setPostProfile = useContourStore((s) => s.setPostProfile);
  const programNo = useContourStore((s) => s.programNo);
  const setProgramNo = useContourStore((s) => s.setProgramNo);
  const wcs = useContourStore((s) => s.wcs);
  const setWcs = useContourStore((s) => s.setWcs);
  const feed = useContourStore((s) => s.feed);
  const setFeed = useContourStore((s) => s.setFeed);
  const spindle = useContourStore((s) => s.spindle);
  const setSpindle = useContourStore((s) => s.setSpindle);
  const tool = useContourStore((s) => s.tool);
  const setTool = useContourStore((s) => s.setTool);
  const analysis = useContourStore((s) => s.analysis);
  const selectedId = useContourStore((s) => s.selectedId);
  const xMode = useContourStore((s) => s.doc.xMode);

  const [kind, setKind] = useState<CodeKind>("iso");
  const [copied, setCopied] = useState(false);

  const text = useMemo(() => {
    if (kind === "iso")
      return toIso(solved, {
        feed,
        name,
        programNo,
        wcs,
        profile: postProfile,
        spindle,
        tool,
      });
    if (kind === "klartext") return toKlartext(solved, name);
    return toPointsCsv(solved);
  }, [kind, solved, name, feed, programNo, wcs, postProfile, spindle, tool]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  const download = (ext?: string) => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name.replace(/\s+/g, "_")}.${ext ?? (kind === "csv" ? "csv" : "nc")}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadDxf = () => {
    const dxf = contourToDxf(solved, name);
    const blob = new Blob([dxf], { type: "application/dxf;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name.replace(/\s+/g, "_")}.dxf`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadSvg = () => {
    const svg = contourToSvg(solved, { name });
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name.replace(/\s+/g, "_")}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };


  const printSketch = (withGcode: boolean) => {
    printContourDrawing(solved, {
      scope: "all",
      selectedId,
      name,
      xMode,
      gcodeText: withGcode ? text : undefined,
    });
  };

  const printCode = () => {
    const safe = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const title = (name || "G-code").replace(/[<>&"]/g, "");
    const svg = contourToSvg(solved, { name, width: 640, height: 280 });
    const html =
      `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"/><title>${title}</title>` +
      `<style>
  @page { margin: 10mm; }
  body { font-family: ui-monospace, Consolas, monospace; font-size: 10px; color: #111; margin: 0; padding: 8px; }
  h1 { font-size: 13px; margin: 0 0 8px; }
  pre { white-space: pre-wrap; word-break: break-all; margin: 8px 0 0; }
  .sketch { border: 1px solid #ccc; margin-bottom: 8px; }
</style></head><body>
<h1>${title}</h1>
<div class="sketch">${svg.replace(/<\?xml[^>]*>/, "")}</div>
<pre>${safe}</pre>
</body></html>`;

    const iframe = document.createElement("iframe");
    iframe.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
    document.body.appendChild(iframe);
    const win = iframe.contentWindow;
    const doc = win?.document ?? iframe.contentDocument;
    if (!win || !doc) {
      document.body.removeChild(iframe);
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    const cleanup = () => {
      try {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      } catch {
        /* */
      }
    };
    win.onafterprint = cleanup;
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        cleanup();
      }
      setTimeout(cleanup, 60_000);
    }, 300);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <p className="text-[11px] text-muted-foreground">{cycleComment(solved)}</p>

      {analysis.length > 0 && (
        <div className="max-h-24 overflow-auto rounded border border-amber-700/50 bg-amber-950/40 px-2 py-1 text-[10px] text-amber-200">
          {analysis.map((h, i) => (
            <div key={i}>
              {h.level === "error" ? "⛔" : "⚠"} {h.message}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-1 text-[10px] sm:grid-cols-3">
        <label className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Профиль</span>
          <select
            className="rounded border border-border bg-bezel px-1 py-1 text-[11px]"
            value={postProfile}
            onChange={(e) => setPostProfile(e.target.value as PostProfileId)}
          >
            {PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">O-номер</span>
          <input
            className="rounded border border-border bg-bezel px-1 py-1 font-mono text-[11px]"
            value={programNo}
            onChange={(e) => setProgramNo(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">WCS</span>
          <select
            className="rounded border border-border bg-bezel px-1 py-1 text-[11px]"
            value={wcs}
            onChange={(e) => setWcs(e.target.value)}
          >
            {["G54", "G55", "G56", "G57", "G58", "G59"].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">F</span>
          <input
            type="number"
            step="0.01"
            className="rounded border border-border bg-bezel px-1 py-1 font-mono text-[11px]"
            value={feed}
            onChange={(e) => setFeed(Number(e.target.value) || 0)}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">S (0=нет)</span>
          <input
            type="number"
            className="rounded border border-border bg-bezel px-1 py-1 font-mono text-[11px]"
            value={spindle}
            onChange={(e) => setSpindle(Number(e.target.value) || 0)}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">T (0=нет)</span>
          <input
            type="number"
            className="rounded border border-border bg-bezel px-1 py-1 font-mono text-[11px]"
            value={tool}
            onChange={(e) => setTool(Number(e.target.value) || 0)}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-1">
        {(["iso", "klartext", "csv"] as const).map((k) => (
          <Button key={k} size="sm" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>
            {k === "iso" ? "ISO G18" : k === "klartext" ? "Klartext" : "CSV"}
          </Button>
        ))}
        <Button size="sm" variant="secondary" onClick={() => void copy()}>
          {copied ? "Скопировано" : "Копировать"}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => download()}>
          Скачать NC
        </Button>
        <Button size="sm" variant="secondary" onClick={downloadSvg}>
          SVG
        </Button>
        <Button size="sm" variant="secondary" onClick={downloadDxf}>
          DXF
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => printSketch(false)}
          title="Печать эскиза контура"
        >
          Эскиз
        </Button>
        <Button size="sm" variant="secondary" onClick={() => printSketch(true)} title="Эскиз + G-код">
          Эскиз+G
        </Button>
        <Button size="sm" variant="secondary" onClick={printCode} title="Печать G-кода">
          Печать
        </Button>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-bezel p-3 font-mono text-[11px] leading-5 text-phosphor">
        {text}
      </pre>
    </div>
  );
}
