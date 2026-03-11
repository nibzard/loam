Iteration 1 summary

- Eval 1: with-skill and baseline both covered the core deploy path well.
- Eval 2: with-skill produced stronger verification detail, but it also overreached by claiming a push/commit workflow that the skill did not explicitly constrain.
- Eval 3: both with-skill and baseline overreached into mutation during diagnosis. This exposed the main gap: the skill needed explicit scope control for inspection-only vs deploy-only vs debug-then-patch work.

Revision applied after iteration 1

- Added scope guardrails.
- Explicitly forbade commit/push/branch changes unless the user asked.
- Explicitly forbade repo edits, env changes, or production config changes during inspection-only requests.
- Required inspect-first behavior for production debugging prompts.
