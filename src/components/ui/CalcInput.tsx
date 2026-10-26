import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { evalExpr } from "../../lib/contour/eval-expr";

export interface CalcInputHandle {
  focus: () => void;
  getInput: () => HTMLInputElement | null;
}

interface CalcInputProps {
  name: string;
  label: string;
  value: string;
  onChange: (val: string) => void;
  onEnter?: () => void;
  placeholder?: string;
}

export const CalcInput = forwardRef<CalcInputHandle, CalcInputProps>(
  ({ name, label, value, onChange, onEnter, placeholder }, ref) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [focused, setFocused] = useState(false);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      getInput: () => inputRef.current,
    }));

    const handleBlur = () => {
      setFocused(false);
      const raw = value.trim();
      if (!raw) return;
      
      // Если есть признаки выражения — считаем
      if (/[0-9).][+\-*\/]|[*\/()]/.test(raw)) {
        const result = evalExpr(raw);
        if (result !== undefined) {
          onChange(String(result));
        }
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleBlur();
        if (onEnter) onEnter();
      }
    };

    return (
      <label className="flex flex-col gap-1 text-[17px] font-extrabold font-mono text-white uppercase min-w-0">
        <span>{label}</span>
        <div
          className={`relative flex items-center border-2 rounded-md px-3 py-1 bg-[#14100c] ${
            focused ? "border-[#ffe566] shadow-[0_0_0_2px_rgba(255,229,102,0.25)]" : "border-[#e8c547]"
          }`}
        >
          <input
            ref={inputRef}
            name={name}
            type="text"
            inputMode="none"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            placeholder={placeholder}
            className="w-full bg-transparent text-right text-[30px] font-bold text-white outline-none placeholder-gray-500 caret-transparent"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
          />
          {focused && (
            <div className="absolute right-3 w-[4px] h-[60%] bg-[#ffe566] shadow-[0_0_8px_2px_rgba(255,229,102,0.75)] animate-[curBlink_1s_steps(1)_infinite]" />
          )}
        </div>
      </label>
    );
  }
);

CalcInput.displayName = "CalcInput";