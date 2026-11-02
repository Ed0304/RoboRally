
"use client";

import { STRATEGY_LABEL } from "@/lib/replay";
import type {
  SearchStrategy,
  SearchTraceEvent,
  StrategyComparison,
} from "@/lib/pathfinding";
import type { SummaryInput } from "@/lib/explainSearch";
import ThinkingPanel from "../learn/ThinkingPanel";

export interface ReplayThinking {
  strategy: SearchStrategy;
  event: SearchTraceEvent | null;
  step: number;
  total: number;
  summary: SummaryInput;
}

interface ReplayPanelProps {
  routes: StrategyComparison[];
  active: SearchStrategy | null;
  finished: boolean;
  exploring: boolean;
  thinking: ReplayThinking | null;
  onSelect: (strategy: SearchStrategy) => void;
  onClose: () => void;
}

export default function ReplayPanel({
  routes,
  active,
  finished,
  exploring,
  thinking,
  onSelect,
  onClose,
}: ReplayPanelProps) {
  const dijkstra = routes.find((entry) => entry.strategy === "dijkstra");
  const astar = routes.find((entry) => entry.strategy === "astar");
  const sameOptimum =
    dijkstra?.result.reached === true &&
    astar?.result.reached === true &&
    dijkstra.result.moves === astar.result.moves &&
    dijkstra.result.cost === astar.result.cost;
  const sameCells =
    sameOptimum &&
    dijkstra?.result.path.map((cell) => `${cell.x},${cell.z}`).join(" ") ===
      astar?.result.path.map((cell) => `${cell.x},${cell.z}`).join(" ");

  return (
    <div className="mt-3 rounded-md border border-cyan-400/30 bg-[#22262D] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
        What-if route replay
      </p>
      <p className="mt-1 text-xs leading-5 text-[#9299A6]">
        Watch how each algorithm would have crossed this maze from the
        start. Visualization only — the robot, battery, and results are
        untouched.
      </p>

      <div
        className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#9299A6]"
        aria-label="Replay map legend"
      >
        <span className="font-semibold uppercase tracking-wider">Map:</span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-3 w-3 rounded-sm"
            style={{ backgroundColor: "#3D5A73" }}
          />
          Expanded
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-3 w-3 rounded-sm"
            style={{ backgroundColor: "#22D3EE" }}
          />
          Route
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-3 w-3 rounded-sm"
            style={{ backgroundColor: "#F2A93B" }}
          />
          Head
        </span>
      </div>

      <ul className="mt-2 space-y-1">
        {routes.map(({ strategy, result }) => {
          const isActive = active === strategy;
          return (
            <li
              key={strategy}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
            >
              <span className="font-semibold text-[#E7E8EA]">
                {STRATEGY_LABEL[strategy]}
              </span>
              {result.reached ? (
                <span className="text-[#ADB2BD]">
                  {result.moves} {result.moves === 1 ? "move" : "moves"} ·{" "}
                  {result.cost}% cost · {result.expanded} expanded
                </span>
              ) : (
                <span className="text-[#FFB020]">
                  no route ({result.reason || "unreachable"})
                </span>
              )}
              <button
                type="button"
                onClick={() => onSelect(strategy)}
                disabled={!result.reached || (isActive && !finished)}
                title={
                  result.reached
                    ? `Animate the ${STRATEGY_LABEL[strategy]} route`
                    : result.reason || "No route to animate"
                }
                className="ml-auto rounded-md border border-cyan-400/50 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isActive && !finished
                  ? exploring
                    ? "Expanding…"
                    : "Playing…"
                  : "Animate"}
              </button>
            </li>
          );
        })}
      </ul>

      {sameOptimum && (
        <p className="mt-2 text-xs leading-5 text-[#9299A6]">
          {sameCells
            ? `Dijkstra and A* traced the identical ${dijkstra?.result.moves}-move route — the same optimum, found two ways. The expanded counts above show the different search.`
            : `Dijkstra and A* reached the same optimum (${dijkstra?.result.moves} moves, ≈${dijkstra?.result.cost}%) through different cells — equal cost is still agreement.`}
        </p>
      )}

      {active !== null && (
        <div className="mt-2 border-t border-[#3B414B] pt-2">
          <p className="text-xs leading-5 text-[#ADB2BD]">
            {STRATEGY_LABEL[active]} replay{" "}
            {exploring
              ? "expanding — blue tiles are states being searched."
              : finished
                ? "finished."
                : "playing — follow the amber marker."}
          </p>
          {thinking !== null && (
            <div className="mt-2">
              <ThinkingPanel
                strategy={thinking.strategy}
                event={thinking.event}
                step={thinking.step}
                total={thinking.total}
                summary={thinking.summary}
                tone="hud"
              />
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full rounded-md border border-[#3B414B] bg-[#292E36] px-3 py-1.5 text-xs font-semibold text-[#F3F0E8] transition hover:border-cyan-400/50"
          >
            Stop replay
          </button>
        </div>
      )}
    </div>
  );
}
