
"use client";

import type { SearchStrategy, SearchTraceEvent } from "@/lib/pathfinding";
import {
  STRATEGY_INTRO,
  describeStep,
  describeSummary,
  type SummaryInput,
} from "@/lib/explainSearch";

interface ThinkingPanelProps {
  strategy: SearchStrategy;
  /** The expansion to narrate; null before the first step. */
  event: SearchTraceEvent | null;
  /** Expansions completed so far. */
  step: number;
  /** Total expansions in the recorded trace. */
  total: number;
  /** Real outcome numbers; shown once the animation finishes. */
  summary: SummaryInput | null;
  /** Visual context: learn pages or the dark 3D replay HUD. */
  tone?: "page" | "hud";
}

/**
 * Beginner-friendly "thinking" narration synced to a pathfinding
 * animation. Every number comes from the recorded trace event; the
 * panel never invents steps or values.
 */
export default function ThinkingPanel({
  strategy,
  event,
  step,
  total,
  summary,
  tone = "page",
}: ThinkingPanelProps) {
  const intro = STRATEGY_INTRO[strategy];
  const narration = event ? describeStep(strategy, event) : null;
  const finished = total > 0 && step >= total;

  const frame =
    tone === "hud"
      ? "rounded-md border border-[#3B414B] bg-[#292E36] p-3"
      : "rounded-xl border border-border bg-background p-4";
  const title = tone === "hud" ? "text-[#E7E8EA]" : "text-foreground";
  const body = tone === "hud" ? "text-[#ADB2BD]" : "text-muted";
  const faint = tone === "hud" ? "text-[#9299A6]" : "text-muted";
  const chip =
    tone === "hud"
      ? "border-[#3B414B] bg-[#22262D] text-[#7FE7F2]"
      : "border-border bg-background text-foreground";
  const done = tone === "hud" ? "text-cyan-200" : "text-success";

  return (
    <section aria-live="polite" aria-label="Algorithm thinking" className={frame}>
      <p className={`text-sm font-bold ${title}`}>
        {intro.name}{" "}
        <span className={`font-normal ${faint}`}>
          · step {Math.min(step, total)} of {total}
        </span>
      </p>

      {event === null || narration === null ? (
        <p className={`mt-1 text-sm leading-6 ${body}`}>{intro.rule}</p>
      ) : (
        <>
          <p className={`mt-1 text-sm font-semibold ${title}`}>
            {narration.headline}
          </p>
          {narration.stats.length > 0 && (
            <dl className="mt-2 flex flex-wrap gap-2">
              {narration.stats.map((stat) => (
                <div
                  key={stat.label}
                  className={`rounded-md border px-2 py-1 text-xs ${chip}`}
                >
                  <dt className="inline">{stat.label}: </dt>
                  <dd className="inline font-mono font-bold">{stat.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className={`mt-2 text-sm leading-6 ${body}`}>
            {narration.detail}
          </p>
          <p className={`mt-1 font-mono text-xs ${faint}`}>
            cell ({event.node.x}, {event.node.z})
          </p>
        </>
      )}

      {finished && summary !== null && (
        <p className={`mt-2 text-sm font-semibold leading-6 ${done}`}>
          {describeSummary(strategy, summary)}
        </p>
      )}
    </section>
  );
}
