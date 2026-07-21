# Project workflow

- Use Git (`git`) for all repository status, diff, history, and commit operations.
- After completing and verifying a fix or feature, commit it immediately unless the user explicitly asks to inspect or evaluate it first.
- Before committing, inspect the change with `git status` and `git diff`, and include only files related to the current task. Preserve unrelated work from parallel agents.
- Commit with a HEREDOC message (`git commit -m "$(cat <<'EOF' ... EOF)"`). Do not push unless the user explicitly asks.
- Do not update git config, skip hooks, force-push to main/master, or amend unless the user explicitly requests it (and amend rules in the user rules are satisfied).
