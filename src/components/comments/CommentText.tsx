import { parseCommentLinks } from "./commentLinks";

interface CommentTextProps {
  text: string;
}

export function CommentText({ text }: CommentTextProps) {
  return parseCommentLinks(text).map((part, index) =>
    part.type === "link" ? (
      <a
        key={index}
        href={part.href}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-[var(--accent)] underline underline-offset-2 hover:text-[var(--accent-hover)]"
      >
        {part.value}
      </a>
    ) : (
      part.value
    ),
  );
}
