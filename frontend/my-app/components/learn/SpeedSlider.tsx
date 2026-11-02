
"use client";

import {
  MAX_EXPLAIN_SPEED,
  MIN_EXPLAIN_SPEED,
} from "@/lib/explainSearch";

interface SpeedSliderProps {
  /** Unique id wiring the label to the slider. */
  id: string;
  speed: number;
  onChange: (speed: number) => void;
  /** Visual context: learn pages or the dark 3D replay HUD. */
  tone?: "page" | "hud";
}

/**
 * Playback-speed slider shared by every explanation animation.
 * 0.5x lingers, 1x is the base pace, 4x skims.
 */
export default function SpeedSlider({
  id,
  speed,
  onChange,
  tone = "page",
}: SpeedSliderProps) {
  const label = tone === "hud" ? "text-[#ADB2BD]" : "text-muted";
  const value = tone === "hud" ? "text-cyan-200" : "text-foreground";

  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className={`text-xs font-semibold ${label}`}>
        Speed
      </label>
      <input
        id={id}
        type="range"
        min={MIN_EXPLAIN_SPEED}
        max={MAX_EXPLAIN_SPEED}
        step={0.5}
        value={speed}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-valuetext={`${speed}x speed`}
        className="flex-1 cursor-pointer accent-[#F2A93B]"
      />
      <span
        className={`w-10 text-right font-mono text-xs font-bold ${value}`}
      >
        {speed}×
      </span>
    </div>
  );
}
