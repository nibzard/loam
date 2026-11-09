import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCommentsCsv,
  buildCommentsCsvFilename,
} from "@/lib/commentCsv";

test("exports comments and replies in thread order", () => {
  const csv = buildCommentsCsv([
    {
      text: "First comment",
      timestampSeconds: 65,
      replies: [
        {
          text: "First reply",
          timestampSeconds: 65,
        },
        {
          text: "Second reply",
          timestampSeconds: 65,
        },
      ],
    },
    {
      text: "Later comment",
      timestampSeconds: 125,
      replies: [],
    },
  ]);

  assert.equal(
    csv,
    [
      "Timestamp,Comment",
      '"1:05","First comment"',
      '"1:05","Reply: First reply"',
      '"1:05","Reply: Second reply"',
      '"2:05","Later comment"',
    ].join("\r\n"),
  );
});

test("escapes CSV content and neutralizes spreadsheet formulas", () => {
  const csv = buildCommentsCsv([
    {
      text: 'Comma, quote "and"\nnewline',
      timestampSeconds: 0,
      replies: [
        {
          text: "Reply with a comma, too",
          timestampSeconds: 0,
        },
      ],
    },
    {
      text: "=HYPERLINK(\"https://example.com\")",
      timestampSeconds: 1,
      replies: [],
    },
    {
      text: "+SUM(A1:A5)",
      timestampSeconds: 2,
      replies: [],
    },
    {
      text: " =cmd|' /C calc'!A0",
      timestampSeconds: 3,
      replies: [],
    },
    {
      text: "-SUM(A1:A2)",
      timestampSeconds: 2,
      replies: [],
    },
    {
      text: "@import",
      timestampSeconds: 3,
      replies: [],
    },
  ]);

  assert.equal(
    csv,
    [
      "Timestamp,Comment",
      '"0:00","Comma, quote ""and""\nnewline"',
      '"0:00","Reply: Reply with a comma, too"',
      '"0:01","\'=HYPERLINK(""https://example.com"")"',
      '"0:02","\'+SUM(A1:A5)"',
      '"0:03","\' =cmd|\' /C calc\'!A0"',
      '"0:02","\'-SUM(A1:A2)"',
      '"0:03","\'@import"',
    ].join("\r\n"),
  );
});

test("exports team and share audience rows by default", () => {
  const csv = buildCommentsCsv([
    {
      text: "Team comment",
      timestampSeconds: 65,
      audience: "team",
      replies: [],
    },
    {
      text: "Share comment",
      timestampSeconds: 70,
      audience: "share",
      replies: [
        {
          text: "Share reply",
          timestampSeconds: 71,
          audience: "share",
        },
      ],
    },
    {
      text: "Legacy comment without audience",
      timestampSeconds: 75,
      replies: [],
    },
  ]);

  assert.equal(
    csv,
    [
      "Timestamp,Comment",
      '"1:05","Team comment"',
      '"1:10","Share comment"',
      '"1:11","Reply: Share reply"',
      '"1:15","Legacy comment without audience"',
    ].join("\r\n"),
  );
});

test("share audience export keeps only share rows", () => {
  const csv = buildCommentsCsv(
    [
      {
        text: "Team comment",
        timestampSeconds: 65,
        audience: "team",
        replies: [
          {
            text: "Team reply",
            timestampSeconds: 66,
            audience: "team",
          },
        ],
      },
      {
        text: "Share comment",
        timestampSeconds: 70,
        audience: "share",
        replies: [
          {
            text: "Team reply under share parent",
            timestampSeconds: 71,
            audience: "team",
          },
          {
            text: "Share reply",
            timestampSeconds: 72,
            audience: "share",
          },
        ],
      },
      {
        text: "Legacy comment without audience",
        timestampSeconds: 75,
        replies: [],
      },
    ],
    { audience: "share" },
  );

  assert.equal(
    csv,
    [
      "Timestamp,Comment",
      '"1:10","Share comment"',
      '"1:12","Reply: Share reply"',
    ].join("\r\n"),
  );
});

test("explicit all audience export matches the default export", () => {
  const threads = [
    {
      text: "Team comment",
      timestampSeconds: 65,
      audience: "team" as const,
      replies: [],
    },
    {
      text: "Share comment",
      timestampSeconds: 70,
      audience: "share" as const,
      replies: [],
    },
  ];

  assert.equal(
    buildCommentsCsv(threads, { audience: "all" }),
    buildCommentsCsv(threads),
  );
});

test("builds a stable filesystem-safe filename", () => {
  assert.equal(
    buildCommentsCsvFilename('  Launch / Review: "Final"  '),
    "launch-review-final-comments.csv",
  );
  assert.equal(buildCommentsCsvFilename("你好"), "video-comments.csv");
});
