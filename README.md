# Codex Usage Monitor

A standalone GNOME Shell extension based on the
[Claude Code Usage Monitor](https://github.com/dvdstelt/ClaudeCodeUsage) UI.
It shows the plan and usage windows returned for the account currently signed
in to the Codex CLI. The panel offers a ring or bar gauge, percentage, reset
countdown, and a choice of one or both windows; the popup shows every window.
Plan labels come from the status response (for example Free, Go, Plus, Pro,
Business, Enterprise, or Edu, as listed in the [Codex pricing guide](https://learn.chatgpt.com/docs/pricing)).
The older backend label `team` is shown as Business. There is no Claude
Pro/Max mapping.

## Requirements

- GNOME Shell 46–51.
- A ChatGPT-based Codex CLI login: run `codex login` first. API-key-only CLI
  sessions have no ChatGPT subscription status to show.

The extension reads `$CODEX_HOME/auth.json` or `~/.codex/auth.json` using async
GIO. It never writes credentials or runs a shell command. The token is sent only
to `https://chatgpt.com/backend-api/wham/usage`, with the account ID when present.
That is an **undocumented internal endpoint** and may change. A failed or
expired login appears in the popup; refresh the CLI login with `codex login`.

## Build and install

```sh
./build.sh
gnome-extensions install --force dist/codex-usage@local.shell-extension.zip
```

On Wayland, log out and back in to load a newly installed extension, then run
`gnome-extensions enable codex-usage@local`. Open its preferences with
`gnome-extensions prefs codex-usage@local`. The original Claude extension can
remain installed; this one has a separate UUID and settings schema.

For development, symlink `src` to
`~/.local/share/gnome-shell/extensions/codex-usage@local`, compile the schema
with `glib-compile-schemas src/schemas`, and log out/in once.

Run the data-shaping tests with `node tools/test-statusModel.mjs`.

The UI is adapted from Claude Code Usage Monitor by dvdstelt and contributors.
This repository is distributed under [GPL-2.0](LICENSE).
