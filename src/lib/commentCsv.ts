import { formatTimestamp } from "@/lib/utils";
import {
  isVisibleToShareDiscussion,
  type DiscussionAudience,
} from "@convex/discussionAudience";

interface CsvComment {
  text: string;
  timestampSeconds: number;
  audience?: DiscussionAudience | null;
}

interface CsvCommentThread extends CsvComment {
  replies: CsvComment[];
}

export type CommentsCsvAudience = "all" | "share";

export interface CommentsCsvOptions {
  /**
   * "all" (default) exports every row for the dashboard.
   * "share" exports only rows whose audience resolves to "share",
   * so team-audience text never reaches a share viewer.
   */
  audience?: CommentsCsvAudience;
}

function escapeCsvCell(value: string) {
  const spreadsheetSafeValue = /^\s*[=+\-@]/.test(value)
    ? `'${value}`
    : value;
  return `"${spreadsheetSafeValue.replaceAll('"', '""')}"`;
}

export function buildCommentsCsv(
  comments: CsvCommentThread[],
  options: CommentsCsvOptions = {},
) {
  const shareOnly = options.audience === "share";

  const rows = comments.flatMap((comment) => {
    const replies = comment.replies
      .filter((reply) => !shareOnly || isVisibleToShareDiscussion(reply))
      .map((reply) => ({
        ...reply,
        text: `Reply: ${reply.text}`,
      }));

    if (shareOnly && !isVisibleToShareDiscussion(comment)) {
      return replies;
    }

    return [comment, ...replies];
  });

  return [
    "Timestamp,Comment",
    ...rows.map((comment) =>
      [
        escapeCsvCell(formatTimestamp(comment.timestampSeconds)),
        escapeCsvCell(comment.text),
      ].join(","),
    ),
  ].join("\r\n");
}

export function buildCommentsCsvFilename(videoTitle: string) {
  const slug = videoTitle
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");

  return `${slug || "video"}-comments.csv`;
}
