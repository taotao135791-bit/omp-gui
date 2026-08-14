# Security Model

This file records the actual trust boundaries of OMP GUI. It is intentionally
plain about what is protected and what is not — no "fully sandboxed / zero risk"
claims.

## Runtime boundary

Oh My Pi is the **only** agent runtime. The GUI never spawns an agent, never
calls a model, never runs a tool, and never persists a session transcript
itself. It is a desktop host that:

- owns the `omp|pi --mode rpc` child process,
- normalizes the wire protocol (`src/main/omp/OmpProtocol.ts`),
- projects runtime events into UI state (`src/renderer/lib/execution.ts`),
- persists only GUI-owned metadata (`electron-store`), never OMP credentials.

## Renderer trust

The renderer is treated as **not fully trusted**:

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
  (`src/main/index.ts`). No Node access in the renderer.
- The renderer talks to the host only through the typed `contextBridge` API
  (`src/main/preload.ts`). There is no `invoke(command, args)` escape hatch.
- Payloads from the renderer are re-validated in main: prompt images
  (`src/main/imageValidation.ts`), subagent selectors, session names, etc.

## Workspace authorization

Filesystem reads go through `FsGuard` (`src/main/fsGuard.ts`), a
realpath-canonicalized root allowlist. Roots originate only from Main-owned
trusted flows:

- the native folder dialog (`dialog.showOpenDialog`),
- a verified session working directory,
- a verified recent workspace (re-checked for existence / directory / realpath).

`FS_SET_ROOT` accepts only real, existing directories; the renderer never grants
itself arbitrary filesystem authority.

## Symlink containment

A path that is lexically inside a workspace is not trusted until symlink
resolution proves its real path is also inside:

- **Git changes** (`src/main/gitinfo.ts`): untracked-file line counts and
  synthetic diffs resolve real paths; an in-workspace symlink pointing outside
  is shown as `symlink → outside workspace`, never read through.
- **Session history** (`src/main/sessionHistory.ts`): `isSessionFilePath`
  verifies real-path containment, so a `session.jsonl -> /outside/file` symlink
  is never resumed/read.
- **Package manifests** (`src/main/packages.ts`): `pi.*` resource paths that
  escape the package dir are dropped.

## Session storage boundary

OMP owns durable session transcripts under `~/.omp/agent/sessions` (or the
isolated `PI_CODING_AGENT_DIR` in tests). The GUI reads them read-only for
history/resume and reconstructs metadata/agents from the active branch only
(`src/main/sessionMetadata.ts`). A GUI sidecar is not used for execution truth.

## External URL policy

- Auth/open-URL flows use `shell.openExternal` only for `http(s)` URLs, and the
  installer downloads only from an HTTPS host allowlist (`omp.sh` / GitHub),
  refusing redirects to untrusted hosts (`src/main/installer.ts`).

## Installer trust model

The auto-installer runs remote code, so its boundary is explicit:

- HTTPS-only, host allowlist, redirect-host validation, redirect cap, script
  size cap.
- The child process receives a **minimal** environment (PATH/HOME/SHELL/… only) —
  provider keys, `GITHUB_TOKEN`, `AWS_*` etc. are never forwarded.
- Failures surface an exit code + a safe stderr summary, never environment
  values.

## Credential handling

The GUI does not store Current OMP credentials. Provider auth goes through the
runtime's native login flow; keys live in the runtime's own store. GUI metadata
(`electron-store`) never contains API keys, OAuth tokens, or credentials.

## RPC capability semantics

A capability is a runtime fact, not a UI guess:

- a `success` or a non-"Unknown command:" `success:false` proves the command
  exists (`supported`);
- only `Unknown command: X` marks it `unsupported`;
- a timeout / transport failure / death leaves it `unknown` (never downgrades a
  known state).

## Release signing

Unsigned (ad-hoc) development builds are separate from signed/notarized
releases. Signing/notarization is env-var driven (`CSC_LINK`,
`APPLE_ID`, …) and only active when configured — certificates and passwords are
never committed. See `README.md` and `.github/workflows/release.yml`.
