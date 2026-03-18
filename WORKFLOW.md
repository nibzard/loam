---
name: Loam
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: "loam-578872121350"
  active_states:
    - Todo
    - In Progress
    - In Review
  terminal_states:
    - Closed
    - Cancelled
    - Canceled
    - Duplicate
    - Done
polling:
  interval_ms: 5000
workspace:
  root: ~/code/loam-workspaces
hooks:
  after_create: |
    git clone --branch main --single-branch https://github.com/nibzard/loam.git .
  before_run: |
    set -eu
    git fetch origin --prune
    issue_identifier="$(basename "$PWD")"
    issue_branch="symphony/${issue_identifier}"
    current_branch="$(git branch --show-current 2>/dev/null || true)"
    if [ -z "$current_branch" ] || [ "$current_branch" = "main" ]; then
      if git show-ref --verify --quiet "refs/heads/$issue_branch"; then
        git switch "$issue_branch"
      else
        git switch -c "$issue_branch"
      fi
    fi
    if [ -f mise.toml ] && command -v mise >/dev/null 2>&1; then
      mise trust -y mise.toml >/dev/null 2>&1 || mise trust -y mise.toml
      mise install >/dev/null 2>&1 || mise install
    fi
agent:
  max_concurrent_agents: 4
  max_concurrent_agents_by_state:
    "Todo": 3
    "In Progress": 3
    "In Review": 1
  max_turns: 10
observability:
  dashboard_enabled: true
server:
  host: "0.0.0.0"
  port: 4002
codex:
  command: env PATH="$HOME/.local/share/mise/shims:$PATH" codex --config shell_environment_policy.inherit=all --config model_reasoning_effort=high --model gpt-5.4 app-server
  approval_policy: never
  thread_sandbox: danger-full-access
  turn_sandbox_policy:
    type: dangerFullAccess
---

You are working on a Linear issue `{{ issue.identifier }}` for Loam.

Issue context:
- Identifier: `{{ issue.identifier }}`
- Title: `{{ issue.title }}`
- State: `{{ issue.state }}`
- URL: `{{ issue.url }}`

Project source of truth:
- Loam is an async video sharing platform built with React, Convex, and Vite.
- Uses Bun as the JavaScript runtime and package manager.
- Read relevant documentation in `./docs/` and `./CLAUDE.md` for project conventions.
- The app uses Convex for backend/database and React for frontend components.

Execution rules:
1. Work only inside the provided workspace copy. Do not modify `/home/agent/loam` directly.
2. Start by identifying the smallest correct implementation slice for the issue.
3. If the workspace only contains spec files, scaffold the minimum project structure needed to satisfy the issue.
4. Keep changes narrow, but add tests and docs when behavior changes.
5. Do not assume GitHub, PRs, or repo-local skills exist. Use them only if they are actually present in the workspace.
6. If `linear_graphql` is available, keep issue progress updated there; otherwise continue without it.
7. Before finishing, run the most direct validation you can for the files you changed and report what passed and what remains unverified.
8. This Loam workflow is fully autonomous and uses Linear state as an execution gate:
  - `Todo` or `In Progress` means implementation phase on a dedicated issue branch.
  - `In Review` means publication phase: land the already-pushed issue branch to `main` without opening a pull request.
9. Each Symphony run is single-turn. Leave the workspace and Linear state in a clean handoff state for the next run instead of trying to finish every phase in one turn.

Git publication rules:
- Treat `Done` as a published state, not just a local-workspace state.
- Never do implementation work directly on `main`.
- Preserve an existing non-`main` branch in the workspace. If the workspace is still on `main`, create or use `symphony/{{ issue.identifier }}` before editing.
- Do not open pull requests for Loam.
- In `Todo` or `In Progress`:
  - implement on the issue branch only
  - commit all intended changes to the issue branch
  - push the issue branch to `origin`
  - leave `git status --short` clean
  - move the issue to `In Review` only after the branch is pushed and ready to land
  - do not merge to `main` in this phase
- In `In Review`:
  - treat the issue branch as the source of truth
  - fetch `origin`, merge the latest `origin/main` into the issue branch, resolve conflicts, and rerun the most relevant validation
  - push the updated issue branch
  - switch to local `main`, fast-forward `main` to the issue branch, and push `origin/main`
  - move the issue to `Done` only after the `origin/main` push succeeds
- If branch publication, conflict resolution, or `main` publication fails, keep the issue in `In Review` and report the blocker clearly.
- For transient network failures during `git push` or `git fetch`, retry once after a fresh `git fetch origin --prune` before treating the failure as a real blocker.
- In the final message:
  - for implementation phase, include the issue branch name and pushed branch commit SHA
  - for publication phase, include the issue branch name, the final branch SHA, and the pushed `main` commit SHA

Implementation posture:
- Prefer simple, explicit designs over generalized abstractions.
- Use React functional components with hooks.
- For backend, use Convex functions (queries, mutations, actions).
- Follow TypeScript best practices and maintain type safety.

Final response requirements:
- Summarize completed changes.
- List validation performed.
- List blockers only if they are real external blockers such as missing auth, missing access, or missing required infrastructure.
