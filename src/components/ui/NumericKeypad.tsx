import React from "react";
import { Button } from "@/components/ui/button";

interface NumericKeypadProps {
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onOk: () => void;
  onCancel: () => void;
}

export function NumericKeypad({ onKeyPress, onBackspace, onClear, onOk, onCancel }: NumericKeypadProps) {
  const keys = [
    ["7", "8", "9", "÷", "/"],
    ["4", "5", "6", "×", "*"],
    ["1", "2", "3", "−", "-"],
    ["0", ".", "+", "⌫", "C"],
  ];

  const handleKey = (label: string, value: string) => {
    if (value === "⌫") onBackspace();
    else if (value === "C") onClear();
    else onKeyPress(value);
  };

  return (
    <div className="flex flex-col gap-2 w-full mt-4 pt-4 border-t border-[#e8c547]/35 select-none">
      <div className="grid grid-cols-5 gap-2">
        {keys.map((row, ri) =>
          row.map((val, ci) => {
            const isOp = ["÷", "×", "−", "+", "(", ")"].includes(val);
            const isDanger = ["⌫", "C"].includes(val);
            const label = ["÷", "×", "−"].includes(val) ? val : val;
            return (
              <button
                key={`${ri}-${ci}`}
                type="button"
                onClick={() => handleKey(label, val)}
                className={`
                  h-12 rounded-lg text-xl font-mono font-bold transition-all
                  ${isDanger ? "bg-[#c4160f] text-white hover:bg-[#e8322a] border-b-4 border-[#8a0000] active:border-b-0 active:translate-y-1" : ""}
                  ${isOp ? "bg-[#5a5a60] text-white hover:bg-[#6a6a70] border-b-4 border-[#19191b] active:border-b-0 active:translate-y-1" : ""}
                  ${!isOp && !isDanger ? "bg-[#cc625a] text-white hover:bg-[#e07060] border-b-4 border-[#5a1c18] active:border-b-0 active:translate-y-1" : ""}
                `}
              >
                {label}
              </button>
            );
          })
        )}
      </div>
      
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-12 rounded-lg text-[15px] font-bold bg-[#4d4636] text-[#eadfc4] border-b-4 border-[#0f0b06] active:border-b-0 active:translate-y-1"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={onOk}
          className="flex-1 h-12 rounded-lg text-[15px] font-bold bg-[#a8892a] text-white border-b-4 border-[#2a1f05] active:border-b-0 active:translate-y-1"
        >
          ОК
        </button>
      </div>
    </div>
  );
}