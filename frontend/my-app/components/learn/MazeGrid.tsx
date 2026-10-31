
"use client";

import type { MazeDefinition } from "@/lib/maze";
import { cellKey, type GridCell } from "@/lib/bfs";

interface MazeGridProps {
  maze: MazeDefinition;
  /** Cells the search has expanded. */
  explored?: ReadonlySet<string>;
  /** Cells discovered but not yet expanded. */
  frontier?: ReadonlySet<string>;
  /** Final route cells, visually distinct from search coverage. */
  path?: ReadonlySet<string>;
  /** Cell currently being expanded, if any. */
  current?: GridCell | null;
  /** Playback head (robot position), if any. */
  marker?: GridCell | null;
  label: string;
}

function cellClass(
  isWall: boolean,
  isStart: boolean,
  isExit: boolean,
  inPath: boolean,
  inFrontier: boolean,
  inExplored: boolean,
  isCurrent: boolean,
  isMarker: boolean
): string {
  if (isWall) return "bg-[#2A2E35]";

  let tone = "bg-[#22262D]";

  if (inExplored) tone = "bg-[#3D5A73]";
  if (inFrontier) tone = "bg-[#F2A93B]/70";
  if (inPath) tone = "bg-[#65D982]";
  if (isCurrent) tone = "bg-[#FFC15B]";
  if (isMarker) tone = "bg-[#7FE7F2]";

  if (isStart || isExit) tone += " font-black";

  return tone;
}

export default function MazeGrid({
  maze,
  explored,
  frontier,
  path,
  current,
  marker,
  label,
}: MazeGridProps) {
  const currentKey = current ? cellKey(current) : null;
  const markerKey = marker ? cellKey(marker) : null;

  return (
    <div
      role="img"
      aria-label={label}
      className="grid w-full gap-[2px]"
      style={{
        gridTemplateColumns: `repeat(${maze.width}, minmax(0, 1fr))`,
      }}
    >
      {maze.tiles.map((tile) => {
        const key = `${tile.x},${tile.z}`;
        const isStart =
          tile.x === maze.start.x && tile.z === maze.start.z;
        const isExit =
          tile.x === maze.exit.x && tile.z === maze.exit.z;

        return (
          <div
            key={key}
            title={
              isStart
                ? `Start (${tile.x}, ${tile.z})`
                : isExit
                  ? `Exit (${tile.x}, ${tile.z})`
                  : `(${tile.x}, ${tile.z})`
            }
            className={`flex aspect-square items-center justify-center rounded-[3px] text-[10px] transition-colors ${cellClass(
              tile.type === "wall",
              isStart,
              isExit,
              path?.has(key) ?? false,
              frontier?.has(key) ?? false,
              explored?.has(key) ?? false,
              currentKey === key,
              markerKey === key
            )}`}
          >
            {isStart ? "S" : isExit ? "E" : ""}
          </div>
        );
      })}
    </div>
  );
}
