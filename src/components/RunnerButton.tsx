import type { ReactNode } from "react";

type RunnerButtonProps = {
  selected?: boolean;           // only show runner when true
  className?: string;           // your normal tailwind classes
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  gradientId?: string;          // optional, defaults to unique-ish value
};

export default function RunnerButton({
  selected = false,
  className = "",
  onClick,
  disabled,
  children,
  gradientId = "runnerGradient",
}: RunnerButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`${selected ? "outline-runner" : ""} ${className}`}
    >
      {selected && (
        <svg aria-hidden="true">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#22c55e" />
              <stop offset="20%" stopColor="#06b6d4" />
              <stop offset="40%" stopColor="#3b82f6" />
              <stop offset="60%" stopColor="#a855f7" />
              <stop offset="80%" stopColor="#ec4899" />
              <stop offset="100%" stopColor="#f97316" />
            </linearGradient>
          </defs>

          <rect
            className="runner-rect"
            x="1"
            y="1"
            width="calc(100% - 2px)"
            height="calc(100% - 2px)"
            rx="12"
            ry="12"
            pathLength="1000"
            stroke={`url(#${gradientId})`}
          />
        </svg>
      )}

      <span className="outline-runner-content">{children}</span>
    </button>
  );
}
