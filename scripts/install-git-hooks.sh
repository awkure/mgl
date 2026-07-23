#!/usr/bin/env bash
# Symlink versioned hooks from .githooks/ into .git/hooks/.
# Prefer this over `git config core.hooksPath .githooks` so a global
# hooksPath (e.g. VPN gate) can still chain into the repo pre-push.
set -euo pipefail

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

root="$(git rev-parse --show-toplevel)"
# Always install into the repo's .git/hooks — not core.hooksPath.
# Global hooks (e.g. ~/.git-hooks) often chain into this path.
hooks_dir="$(git rev-parse --git-dir)/hooks"
mkdir -p "$hooks_dir"

install_hook() {
  local name="$1"
  local src="$root/.githooks/$name"
  local dest="$hooks_dir/$name"

  if [[ ! -f "$src" ]]; then
    echo "install-git-hooks: missing $src" >&2
    exit 1
  fi

  chmod +x "$src"
  ln -sfn "$src" "$dest"
  echo "install-git-hooks: $dest -> $src"
}

install_hook pre-push
