"use client";

/**
 * Shared step indicator for guided flows (Doctrine §1.5 — guided onboarding
 * rather than long setup forms).
 *
 * Shows position in a sequence without turning progress into a game: named
 * steps, a quiet rule beneath them, no percentages and no celebration.
 */
export default function StepHeader({
  eyebrow,
  title,
  steps,
  current,
}: {
  eyebrow: string;
  title: string;
  steps: string[];
  current: number;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">{eyebrow}</p>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink">{title}</h2>
      </div>

      <div>
        {/* Compact on mobile: the current step only, plus its position. */}
        <p className="sm:hidden font-body text-sm text-ink">
          <span className="text-stone">Step {current + 1} of {steps.length} · </span>
          {steps[current]}
        </p>

        <ol className="hidden sm:flex items-center gap-2 flex-wrap">
          {steps.map((step, index) => {
            const done = index < current;
            const active = index === current;
            return (
              // `aria-current="step"` is the semantic marker for "you are here"
              // in a sequence. Purely additive, and correct for every flow that
              // uses this header.
              <li key={step} aria-current={active ? 'step' : undefined} className="flex items-center gap-2">
                <span
                  className={`font-body text-sm ${
                    active ? 'text-ink font-semibold' : done ? 'text-stone' : 'text-stone/45'
                  }`}
                >
                  {done && <span aria-hidden className="text-gold mr-1">&#10003;</span>}
                  {step}
                </span>
                {index < steps.length - 1 && (
                  <span aria-hidden className="text-stone/25 text-xs">&#8212;</span>
                )}
              </li>
            );
          })}
        </ol>

        <div className="mt-2 h-0.5 bg-stone/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gold transition-all duration-300"
            style={{ width: `${((current + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
