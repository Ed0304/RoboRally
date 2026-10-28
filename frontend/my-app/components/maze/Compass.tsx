
"use client";

import type { RobotState } from "@/lib/gamelogic";

interface CompassProps {
  direction: RobotState["direction"];
}

const directions = [
  { label: "N", name: "north", angle: 0 },
  { label: "E", name: "east", angle: 90 },
  { label: "S", name: "south", angle: 180 },
  { label: "W", name: "west", angle: 270 },
] as const;

export default function Compass({ direction }: CompassProps) {
  return (
    <div
      className="rounded-xl border border-[#515A61] bg-[#171A1D]/95 p-3 text-[#F5F2E9] shadow-xl"
      aria-label={`Robot heading ${direction}`}
    >
      <p className="mb-2 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-[#AAB3BA]">
        Compass
      </p>

      <div className="relative mx-auto h-28 w-28 rounded-full border border-[#515A61] bg-[#24292E]">
        {/* Cardinal direction labels */}
        {directions.map((item) => {
          const isActive = item.name === direction;

          const positions: Record<
            (typeof directions)[number]["name"],
            string
          > = {
            north: "left-1/2 top-1 -translate-x-1/2",
            east: "right-2 top-1/2 -translate-y-1/2",
            south: "bottom-1 left-1/2 -translate-x-1/2",
            west: "left-2 top-1/2 -translate-y-1/2",
          };

          return (
            <span
              key={item.name}
              className={`absolute z-10 font-mono text-xs font-bold ${
                positions[item.name]
              } ${
                isActive
                  ? "text-[#FF8A24]"
                  : "text-[#AAB3BA]"
              }`}
            >
              {item.label}
            </span>
          );
        })}

        {/* Compass needle points in the robot's heading direction */}
        <div
          className="absolute inset-0 flex items-center justify-center transition-transform duration-200"
          style={{
            transform: `rotate(${directions.find(
              (item) => item.name === direction
            )?.angle ?? 0}deg)`,
          }}
        >
          <svg
            viewBox="0 0 32 64"
            className="h-14 w-7"
            aria-hidden="true"
          >
            <path
              d="M16 2 L27 32 L16 25 L5 32 Z"
              fill="#FF8A24"
            />
            <path
              d="M5 32 L16 25 L27 32 L16 62 Z"
              fill="#515A61"
            />
          </svg>
        </div>

        {/* Center pivot */}
        <div className="absolute left-1/2 top-1/2 z-20 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#171A1D] bg-[#F5F2E9]" />
      </div>

      <p className="mt-2 text-center text-xs font-semibold uppercase tracking-wider text-[#FF8A24]">
        {direction}
      </p>
    </div>
  );
}
