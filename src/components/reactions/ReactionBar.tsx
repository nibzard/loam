import { cn } from "@/lib/utils";

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "😮", "🔥"] as const;

type ReactionWithEmoji = { emoji: string };

export function summarizeReactions(reactions: ReactionWithEmoji[] | undefined) {
  const counts = new Map<string, number>();
  for (const reaction of reactions ?? []) {
    counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
  }

  return QUICK_REACTIONS.map((emoji) => ({
    emoji,
    count: counts.get(emoji) ?? 0,
  }));
}

export function ReactionBar({
  className,
  disabled = false,
  onReact,
  counts,
}: {
  className?: string;
  disabled?: boolean;
  onReact: (emoji: (typeof QUICK_REACTIONS)[number]) => void;
  counts: Array<{ emoji: string; count: number }>;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {QUICK_REACTIONS.map((emoji) => {
        const count = counts.find((item) => item.emoji === emoji)?.count ?? 0;
        return (
          <button
            key={emoji}
            type="button"
            className="inline-flex items-center gap-1 border-2 border-[#1a1a1a] bg-[#f0f0e8] px-2 py-1 text-sm font-semibold hover:bg-[#e8e8e0] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
            onClick={() => onReact(emoji)}
          >
            <span>{emoji}</span>
            {count > 0 ? (
              <span className="text-xs font-mono text-[#666]">{count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
