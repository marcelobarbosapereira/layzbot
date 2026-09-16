# LazyBot development protocol

## Long-running Codex work

This project is implemented across repeated Codex usage windows. Treat every completed plan task as a durable checkpoint.

Default to the most automated safe execution path. For approved implementation plans, use Superpowers Subagent-Driven Development with an isolated worktree, a fresh implementer per task, task-scoped review, fix/re-review loops, and a final whole-branch review. Do not pause between plan tasks unless a safety boundary, external side effect, broken plan, or window checkpoint requires it.

### Continuation command

When the user says **“pode continuar a implementação”**:

1. Read this file, the approved design, the active implementation plan, and `docs/progress.md` when it exists.
2. Inspect `git status --short`, the latest commits, and the last recorded verification results.
3. Resume the first incomplete checkbox of the active task. Do not restart completed work or redesign approved architecture.
4. If the previous task is complete, begin the next task in plan order.
5. Follow the task's required Superpowers execution skill and TDD steps.

### Window budget

- Plan for one implementation task per five-hour Codex window.
- Target at most 80% of the window for implementation and reserve the remainder for tests, review, documentation, and commit.
- Do not start a new task when estimated window consumption is at or above 75%.
- Prefer completing the active task and its verification before pausing.
- At approximately 90% or more of the window, stop at the next safe checkpoint and notify the user instead of risking an incomplete fiscal, database, or security operation.

### Safe pause protocol

If a task must pause before completion:

1. Finish the current atomic step; do not begin another external or destructive action.
2. Run the focused tests that are meaningful for the current state and `git diff --check`.
3. Update `docs/progress.md` with the active plan, task, completed checkbox, files changed, tests run, failures, and exact next command.
4. Commit only when the repository is coherent and the recorded checks pass. Never create a success commit for broken or partial behavior.
5. Leave a concise user-facing notice beginning with `Pausa de janela:` and state the exact resume point.

### Completion protocol

Every completed task must end with:

- Required focused and regression tests passing.
- Build, lint, and typecheck results required by that task.
- `git diff --check` passing.
- `docs/progress.md` updated.
- One descriptive commit.
- The next incomplete plan task identified.

Do not push commits, deploy, or perform real fiscal transmissions unless the user has separately authorized that external action.
