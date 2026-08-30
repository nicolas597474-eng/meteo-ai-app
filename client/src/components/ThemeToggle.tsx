import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  compact?: boolean;
  className?: string;
}

export default function ThemeToggle({ compact = false, className }: ThemeToggleProps) {
  const { theme, toggleTheme, switchable } = useTheme();

  if (!switchable || !toggleTheme) return null;

  const isDark = theme === "dark";
  const nextMode = isDark ? "clair" : "sombre";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Activer le mode ${nextMode}`}
      aria-pressed={isDark}
      title={`Mode ${nextMode}`}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-2.5 text-xs font-semibold text-card-foreground shadow-sm transition-[background-color,border-color,color,transform] duration-200 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.97]",
        compact ? "min-w-0 px-2" : "min-w-[7.5rem]",
        className,
      )}
    >
      {isDark ? <Sun className="h-4 w-4 text-amber-400" aria-hidden="true" /> : <Moon className="h-4 w-4 text-indigo-500" aria-hidden="true" />}
      <span className={compact ? "sr-only sm:not-sr-only" : undefined}>{isDark ? "Mode clair" : "Mode sombre"}</span>
    </button>
  );
}
