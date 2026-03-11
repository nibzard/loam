"use client";

import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { Clock, MessageSquare } from "lucide-react";

import { QUICK_REACTIONS, ReactionBar } from "@/components/reactions/ReactionBar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { usePublicViewerAuth } from "@/lib/publicViewerAuth";
import { cn, formatTimestamp } from "@/lib/utils";

type ReactionEmoji = (typeof QUICK_REACTIONS)[number];

export function PublicReactionControls({
  counts,
  onReact,
}: {
  counts: Array<{ emoji: string; count: number }>;
  onReact: (emoji: ReactionEmoji) => Promise<void>;
}) {
  const { user, isLoaded } = usePublicViewerAuth();
  const canReact = Boolean(isLoaded && user);

  const handleAddReaction = useCallback(
    async (emoji: ReactionEmoji) => {
      if (!canReact) return;
      try {
        await onReact(emoji);
      } catch (error) {
        console.error("Failed to post reaction:", error);
      }
    },
    [canReact, onReact],
  );

  return (
    <ReactionBar
      counts={counts}
      disabled={!canReact}
      onReact={(emoji) => {
        void handleAddReaction(emoji);
      }}
    />
  );
}

export function PublicCommentComposer({
  currentTime,
  onSubmitComment,
  signInHref,
  textareaClassName,
  submitButtonClassName,
  submitButtonSize = "default",
  loadingFallback,
}: {
  currentTime: number;
  onSubmitComment: (input: { text: string; timestampSeconds: number }) => Promise<void>;
  signInHref: string;
  textareaClassName?: string;
  submitButtonClassName?: string;
  submitButtonSize?: "default" | "sm";
  loadingFallback?: ReactNode;
}) {
  const { user, isLoaded } = usePublicViewerAuth();
  const [commentText, setCommentText] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  const handleSubmitComment = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!user || !commentText.trim() || isSubmittingComment) return;

      setIsSubmittingComment(true);
      setCommentError(null);

      try {
        await onSubmitComment({
          text: commentText.trim(),
          timestampSeconds: currentTime,
        });
        setCommentText("");
      } catch {
        setCommentError("Failed to post comment.");
      } finally {
        setIsSubmittingComment(false);
      }
    },
    [commentText, currentTime, isSubmittingComment, onSubmitComment, user],
  );

  if (!isLoaded) {
    return loadingFallback ?? (
      <p className="text-sm text-[var(--foreground-muted)]">Loading discussion controls...</p>
    );
  }

  if (!user) {
    return (
      <Button asChild className={cn("w-full", submitButtonClassName)}>
        <a href={signInHref}>
          <MessageSquare className="mr-1.5 h-4 w-4" />
          Sign in to comment
        </a>
      </Button>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmitComment(event)} className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-[var(--foreground-subtle)]">
        <Clock className="h-3.5 w-3.5" />
        Comment at {formatTimestamp(currentTime)}
      </div>
      <Textarea
        value={commentText}
        onChange={(event) => setCommentText(event.target.value)}
        placeholder="Leave a comment..."
        className={cn("min-h-[90px]", textareaClassName)}
      />
      {commentError ? <p className="text-xs text-[var(--destructive)]">{commentError}</p> : null}
      <Button
        type="submit"
        size={submitButtonSize}
        disabled={!commentText.trim() || isSubmittingComment}
        className={submitButtonClassName}
      >
        <MessageSquare className="mr-1.5 h-4 w-4" />
        {isSubmittingComment ? "Posting..." : "Post comment"}
      </Button>
    </form>
  );
}

export function PublicDiscussionControls({
  counts,
  currentTime,
  onReact,
  onSubmitComment,
  signInHref,
  textareaClassName,
  submitButtonClassName,
  submitButtonSize = "default",
  loadingFallback,
}: {
  counts: Array<{ emoji: string; count: number }>;
  currentTime: number;
  onReact: (emoji: ReactionEmoji) => Promise<void>;
  onSubmitComment: (input: { text: string; timestampSeconds: number }) => Promise<void>;
  signInHref: string;
  textareaClassName?: string;
  submitButtonClassName?: string;
  submitButtonSize?: "default" | "sm";
  loadingFallback?: ReactNode;
}) {
  return (
    <>
      <PublicReactionControls counts={counts} onReact={onReact} />
      <PublicCommentComposer
        currentTime={currentTime}
        onSubmitComment={onSubmitComment}
        signInHref={signInHref}
        textareaClassName={textareaClassName}
        submitButtonClassName={submitButtonClassName}
        submitButtonSize={submitButtonSize}
        loadingFallback={loadingFallback}
      />
    </>
  );
}
