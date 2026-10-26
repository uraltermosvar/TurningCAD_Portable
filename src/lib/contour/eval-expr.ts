/**
 * Калькулятор для полей ввода (X, Z, R, I, K, A, L).
 * Операции выполняются строго слева направо (без приоритета * и /).
 * Пример: "50-10*2" -> (50-10)*2 = 80
 * Поддерживаются скобки.
 */
export function evalExpr(raw: string | null | undefined): number | undefined {
  if (raw == null) return undefined;
  const s = String(raw).trim().replace(/,/g, ".").replace(/\s+/g, "");
  if (!s) return undefined;
  if (!/^[0-9+\-*/().]+$/.test(s)) return undefined;

  function parseNum(str: string, i: number): { v: number; i: number } | null {
    let start = i;
    if (str[i] === "+" || str[i] === "-") i++;
    if (i >= str.length || !/[0-9.]/.test(str[i])) return null;
    while (i < str.length && /[0-9.]/.test(str[i])) i++;
    const n = parseFloat(str.slice(start, i));
    if (!Number.isFinite(n)) return null;
    return { v: n, i: i };
  }

  function evalSeq(str: string): number | null {
    while (str.indexOf("(") >= 0) {
      let open = -1;
      for (let k = 0; k < str.length; k++) {
        if (str[k] === "(") open = k;
        else if (str[k] === ")") {
          if (open < 0) return null;
          const inner = evalSeq(str.slice(open + 1, k));
          if (inner == null || !Number.isFinite(inner)) return null;
          str = str.slice(0, open) + String(inner) + str.slice(k + 1);
          break;
        }
      }
      if (open < 0) return null;
    }
    const p = parseNum(str, 0);
    if (!p) return null;
    let acc = p.v;
    let i = p.i;
    while (i < str.length) {
      const op = str[i];
      if (op !== "+" && op !== "-" && op !== "*" && op !== "/") return null;
      i++;
      const q = parseNum(str, i);
      if (!q) return null;
      if (op === "+") acc += q.v;
      else if (op === "-") acc -= q.v;
      else if (op === "*") acc *= q.v;
      else {
        if (Math.abs(q.v) < 1e-15) return null;
        acc /= q.v;
      }
      i = q.i;
    }
    return acc;
  }

  try {
    const n = evalSeq(s);
    if (n == null || !Number.isFinite(n)) return undefined;
    return Math.round(n * 1000) / 1000;
  } catch {
    return undefined;
  }
}

/** Вставка текста в текущую позицию курсора для экранной клавиатуры */
export function insertAtCaret(input: HTMLInputElement | null, text: string) {
  if (!input) return;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  const pos = start + text.length;
  try {
    input.focus({ preventScroll: true });
    input.setSelectionRange(pos, pos);
  } catch (e) {}
  // Триггерим событие, чтобы React обновил состояние
  const event = new Event("input", { bubbles: true });
  input.dispatchEvent(event);
}

/** Удаление символа перед курсором */
export function backspaceAtCaret(input: HTMLInputElement | null) {
  if (!input) return;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  let newStart = start;
  if (start !== end) {
    input.value = input.value.slice(0, start) + input.value.slice(end);
  } else if (start > 0) {
    input.value = input.value.slice(0, start - 1) + input.value.slice(start);
    newStart = start - 1;
  }
  try {
    input.focus({ preventScroll: true });
    input.setSelectionRange(newStart, newStart);
  } catch (e) {}
  const event = new Event("input", { bubbles: true });
  input.dispatchEvent(event);
}