# Settings / Authentication / Models — Runtime Compatibility

OMP GUI does not own Oh My Pi configuration — it **exposes** it. This file
records which interface owns what, verified against
`@oh-my-pi/pi-coding-agent` **17.2.12** and legacy Pi **0.80.3**. The pure
RPC wire protocol lives in `docs/protocol-facts.md`.

## Sources of truth

| Domain | Current Oh My Pi (17.x) | Legacy Pi (≤ 0.84) |
|---|---|---|
| Credentials | runtime-owned store; managed via RPC `login` / `omp auth-broker` | `~/.pi/agent/auth.json` |
| Provider list | RPC `get_login_providers` (66 providers, `available`/`authenticated`) | static GUI list + auth.json keys |
| Model catalog | `omp models --json` / RPC `get_available_models` (credential-filtered) | registry file + `get_available_models` |
| Default model | `omp config enabledModels` (first entry; empty = catalog default) | `settings.json` `defaultModel` |
| Default thinking | `omp config defaultThinkingLevel` | `settings.json` `defaultThinkingLevel` |
| Machine skills | `omp config skills.enableAgentsUser` | `settings.json` `skills` override list |
| GUI settings | electron-store (theme, language, notifications, …) — GUI-owned | same |

The GUI never writes `auth.json`/`settings.json` for the current runtime,
and never reads `agent.db`/`models.db`/`config.yml` directly — storage
location is not a public API.

## Authentication flow (current)

`login {providerId}` over RPC (verified live):

```
login
  → extension_ui_request open_url   (OAuth page or key dashboard → browser)
  → extension_ui_request input      ("Paste your X API key", 10 min timeout)
  → extension_ui_request select/confirm  (OAuth choices)
  → extension_ui_request notify     ("Validating API key…")
  → response {success} | {success:false, error}   (provider-validated)
```

- A successful login **persists** (verified: restart without env vars keeps
  the provider authenticated) and takes effect for new sessions.
- Logout rides the official `omp auth-broker logout <provider>` CLI.
- Every GUI write/login/logout is **read-after-write verified**: after the
  operation the runtime is re-queried, and a state it does not confirm is
  shown as failure, never as "saved".
- Zero-auth bootstrap: RPC mode refuses to start with no credentials at
  all. The GUI then spawns its probe with a placeholder env key for one
  provider with a static model catalog (deepseek, verified) — and masks
  exactly that provider's reported `authenticated` back to false, because
  the placeholder is not real auth.

## Models

- The picker lists what the runtime can actually run
  (credential-filtered catalog), never a static copy.
- **Scope is strict and separate:**
  - Composer picker WITH a session → switches exactly that session
    (`set_model`, session scope).
  - Composer picker WITHOUT one → a one-shot override consumed by the next
    session's spawn args (`--model` / `--thinking`).
  - Settings default model → `enabledModels` via `omp config`, applies to
    new sessions only.
  Changing one never moves the other — verified by real-binary regression
  tests (a session hot-switch never moves `enabledModels`; a fresh session
  starts on the runtime default).
- `model_changed` / `thinking_level_changed` events keep pickers in sync
  with the runtime-resolved state.

## Thinking levels

Current runtime levels: `off`, `minimal`, `low`, `medium`, `high`,
`xhigh`, `max` (verified via `Effort`/`THINKING_EFFORTS` and live probes).
Per-model subsets exist (`omp models --json` → `thinking: [...]`) and the
composer picker only offers what the current model supports (plus `off`,
which is universal); when the catalog doesn't know the model, the full set
is offered and capability reads as unknown.

`set_thinking_level` never errors — unsupported levels are **clamped**
(e.g. xhigh → high) or resolve to "auto" (unknown values). The GUI
therefore displays the runtime-resolved level (`thinking_level_changed` /
`get_state.thinkingLevel`), not the requested one. Scope mirrors models:
session picks are session-only; the Settings default applies to future
sessions only.

## Secrets

- API keys travel renderer → main → runtime only; the GUI never persists
  them, logs them, or echoes them back to the renderer.
- Settings only knows `connected | not connected`; no key material, not
  even masked (the runtime's own validation errors already mask keys).
- Login URLs are opened only from the runtime's login flow and only for
  `https:` (plus loopback `http://127.0.0.1|localhost` launch URLs).

## Known limitations (documented, not worked around)

- **Project trust** has no current-runtime equivalent; the row is shown on
  the legacy profile only.
- **Model catalog browsing without any credentials** is limited to
  providers with a static catalog — the runtime builds its catalog from
  authenticated providers.
- **Live permission-mode switching** (ask ↔ full) applies to new sessions
  on the current profile; there is no runtime RPC for it mid-session.
