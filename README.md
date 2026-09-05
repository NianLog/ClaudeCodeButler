<div align="center">

# ⚡ CCB (Claude Code Butler)

**A local-first control plane for AI CLI tool configurations**

English | [简体中文](./README_CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-40.10.6-47848F?logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18.3.1-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-3178C6?logo=typescript)](https://www.typescriptlang.org/)

</div>

---

## 📖 Introduction

CCB (Claude Code Butler) is a local-first desktop application built with Electron, React, and TypeScript. Version `1.5.0` preserves the original product name while evolving the architecture into a rule-driven control plane that manages Claude Code and other AI CLI tools (Codex CLI, Gemini CLI, Antigravity) through a declarative JSON registry.

### Project Status

- **Current version**: `1.5.0` (released 2026-09-05); previous release `1.4.0`
- **v1.5.0 theme**: from a Claude Code-only manager to a registry-driven multi-AI-tool configuration control plane
- **Supported tools**: Claude Code, Codex CLI, Gemini CLI, and Antigravity — onboarded through a declarative JSON registry covering artifact discovery, validation, atomic edits, backup/restore, and configuration-set snapshot switching
- **Quality & security**: automated tests and both production builds green; root and proxy-server production-dependency audits report `0 vulnerabilities` (see [SECURITY_AUDIT_REPORT.md](./SECURITY_AUDIT_REPORT.md))

The product name remains **Claude Code Butler**. The name records the project's origin rather than limiting its architecture: new tools are integrated through a bounded registry and built-in capabilities, while `CCB`, `.ccb`, app identity, and repository identifiers remain stable.

### ✨ Key Features

- 🎯 **Multi-Tool Config Lifecycle Management**
  - Manage Claude Code, Codex CLI, Gemini CLI, and Antigravity configurations from one place
  - Create, edit, copy, import, export, backup, restore, and switch configurations
  - Linked multi-file editing for tools with split configs (e.g. Codex `config.toml` + `auth.json`), validated as one group before anything is written
  - Configuration-set snapshots per tool: save the current state, switch between sets from the tray, restore any time
  - Support `JSON`, `TOML`, and `Markdown` config types with matching validation rules; new files can be created from registry-declared templates

- 🔌 **MCP Server Management**
  - Manage global and project-scoped MCP servers in one panel
  - Support local command-based servers and remote `http` servers that do not require a `command`
  - Enable, disable, duplicate, import, export, archive, and validate server availability

- 🧠 **Editor & Settings Experience**
  - Monaco-based editor with on-demand runtime loading to keep the initial renderer light
  - Built-in formatting, syntax validation, and modal preview using the same editor component
  - Artifact selector, effective-source indicator, bounded diff preview, and per-artifact template override controls
  - Terminal presets, theme/language preferences, and editor behavior settings

- 🤖 **Automation & Managed Mode**
  - Trigger-condition-action automation rules with time, file, and manual execution flows
  - Managed-mode proxy tooling for request transformation, logging, diagnostics, and provider control
  - Environment checks for Claude Code and related tooling versions

- 📊 **Operations & Insights**
  - Usage analytics, model/token statistics, and project associations
  - Agent and skill management panels for advanced workflows
  - Local logging, UTF-8-safe file output, and privacy-friendly local storage

- 🌐 **Built for Daily Use**
  - Chinese and English UI
  - Windows Portable, ZIP, and NSIS installer delivery paths
  - Local-first architecture with no forced cloud dependency; remote tool registry is opt-in and signature-verified

---

## 📸 Screenshots

<details open>
<summary>Click to expand/collapse screenshots</summary>

### 🎛️ Configuration & Management
| Configuration Management | MCP Server Control |
|:---:|:---:|
| ![Config](resources/img/config-management.png) | ![MCP](resources/img/mcp-server.png) |

### 📊 Analytics & Projects
| Usage Analytics | Project Management |
|:---:|:---:|
| ![Analytics](resources/img/analytics.png) | ![Projects](resources/img/project-management.png) |

### 🚀 Automation & Environment
| Automation Rules | Environment Check |
|:---:|:---:|
| ![Automation](resources/img/automation-rules.png) | ![Environment](resources/img/environment-check.png) |

### 🤖 Advanced Features
| Sub-Agent Management | Skills Management |
|:---:|:---:|
| ![Sub-Agent](resources/img/sub-agent.png) | ![Skills](resources/img/skills.png) |

</details>

---

## 🚀 Quick Start

### Requirements

- Node.js >= 20.19.0 (Node.js 22 LTS recommended)
- npm >= 10.0.0
- Python >= 3.10 only when running the local Semgrep audit

### Installation

```bash
# Clone the repository
git clone https://github.com/NianLog/ClaudeCodeButler.git

# Navigate to project directory
cd ClaudeCodeButler

# Install locked application dependencies
npm ci

# Install the standalone proxy-server dependencies
npm ci --prefix src/proxy-server
```

### Development Mode

```bash
# Start in standard mode
npm run dev

# Start with admin privileges (required for some environment / terminal flows)
npm run dev:admin
```

### Build & Verify

```bash
# Build the application
npm run build

# Type-check
npm run type-check

# Run tests once (non-watch mode)
npm run test -- --run

# Audit root and proxy-server dependencies
npm audit --audit-level=low
npm audit --audit-level=low --prefix src/proxy-server

# Launch the built app
npm start
```

---

## 📦 Packaging & Distribution

### Windows artifacts

```bash
# Portable single-file build
npm run pack:portable

# Guided installer (NSIS)
npm run pack:installer

# ZIP package
npm run pack:zip

# Unpacked directory for fast smoke checks
npm run pack:dir

# Build Portable, NSIS, and ZIP in one release pass
npm run pack:win:all
```

Artifacts are emitted to `release/` by default:

- `CCB-Portable-{version}.exe` - Single-file portable build
- `CCB-Setup-{version}.exe` - Assisted installer with custom install directory and shortcut options
- `CCB-{version}-win.zip` - ZIP package
- `win-unpacked/` - Unpacked directory build

Before packaging, run `npm run release:preflight:preview` during development and `npm run release:preflight` for a production release. The production preflight intentionally fails closed while `REGISTRY_TRUSTED_PUBLIC_KEYS` is empty.

If the build machine sits behind a TLS-intercepting network, configure the trusted root once via `NODE_EXTRA_CA_CERTS` or the npm `cafile` setting — disabling TLS verification is never accepted in this project. Electron distribution downloads can be accelerated with `ELECTRON_MIRROR` / `ELECTRON_BUILDER_BINARIES_MIRROR`; verify the downloaded archive against the official `SHASUMS256.txt` afterwards.

### Distribution notes

- The Portable target is convenient, but Electron Builder's single-file Portable flow extracts to a temporary directory before the app process becomes visible. On Windows, that means noticeably slower startup than `win-unpacked` or the NSIS installer.
- The NSIS installer is the recommended option when startup latency matters and a traditional installation flow is acceptable.
- The project keeps the original compressed Portable strategy to avoid large package size growth.

### Cross-platform release commands

```bash
# Default release targets for the current platform
npm run dist

# macOS
npm run dist:mac

# Linux
npm run dist:linux

# All configured platforms
npm run dist:all
```

---

## 🛠️ Tech Stack

### Application runtime

- **Electron**: 40.10.6
- **electron-vite**: 5.0.0
- **Vite**: 7.3.6
- **TypeScript**: 5.9.3

### Renderer (bundled at build time, kept out of runtime `dependencies`)

- **React**: 18.3.1
- **Ant Design**: 5.27.6
- **Zustand**: 4.5.7
- **Monaco Editor**: 0.55.1 via `@monaco-editor/react` 4.7 (on-demand runtime)
- **Recharts**: 2.15.4
- **react-markdown**: 9.1 / **remark-gfm**: 4.0.1

### Main process & services (runtime `dependencies`, 6 packages)

- **chokidar**: 3.6.0 — file watching
- **express**: 5.1.0 — managed-mode proxy-server package
- **node-cron**: 4.6.0 — automation scheduling
- **js-yaml**: 4.3.2 — YAML parsing
- **smol-toml**: 1.8.0 — dependency-free TOML validation for Codex configs
- **https-proxy-agent**: 7.x — upstream proxying for managed mode

### Tooling & quality gates

- **Vitest**: 4.x (33 files / 211 tests, CI-blocking)
- **ESLint**: 8.57.1 (zero errors, CI-blocking with a changed-files ratchet)
- **electron-builder**: 26.15.3
- **patch-package**: 8.0.1
- **Semgrep CLI**: 1.169.0 (isolated in the root `.venv`)

---

## 📚 Project Architecture

### Directory Structure

```text
ClaudeCodeButler/
├── src/
│   ├── main/                # Electron main process: services, utils, IPC registry
│   ├── preload/             # The single contextBridge exposed to the renderer
│   ├── renderer/            # React UI, Zustand stores, panels, locales
│   ├── shared/              # Cross-process domain contract: tool registry model,
│   │                        # registry validator, builtin registry JSON
│   └── proxy-server/        # Managed-mode proxy (standalone npm package)
├── scripts/                 # dev-runner, release-preflight, signing helpers
├── resources/               # Icons, screenshots, packaged resources
├── docs/                    # Version planning documents
├── tests/                   # Unit tests per layer (main/preload/proxy/renderer/shared)
└── release/                 # Packaging output (gitignored)
```

### Core architecture invariants

- The main process owns all filesystem, path, and subprocess access; the renderer runs fully sandboxed with a narrow IPC surface
- Tool support is declared in a declarative JSON registry (never executable code); remote registries must pass an Ed25519 → SHA-256 → size → schema → version verification chain that fails closed
- All JSON persistence is atomic (temp + rename); every artifact edit is authorized against a registry-derived allowlist and backed up before writing
- External commands run through a parameterized executor (`shell: false`); network egress goes through SSRF-guarded clients

Detailed module boundaries and data flows are documented in [ARCHITECTURE.md](./ARCHITECTURE.md), and the user-visible capability inventory in [CAPABILITIES.md](./CAPABILITIES.md).

### IPC Communication Pattern

Main and renderer communicate through a normalized IPC result shape:

```ts
{ success: true, data: T }
{ success: false, error: string }
```

---

## 🔧 Development Guide

### Common Commands

```bash
# Development
npm run dev
npm run dev:admin

# Build / preview
npm run build
npm run preview

# Quality gates
npm run type-check
npm run lint
npm run lint:changed
npm run test -- --run
npm audit --audit-level=low
npm audit --audit-level=low --prefix src/proxy-server
npm run release:preflight:preview

# Packaging
npm run pack:portable
npm run pack:installer
npm run pack:zip
npm run pack:dir
npm run pack:win:all
```

### Path Aliases

- `@/` → `src/renderer/src/`
- `@shared/*` → `src/shared/*`

### Local Security Audit (Windows Git Bash)

Semgrep is isolated from the Node.js toolchain in the root `.venv`. Recreate and run the audited rulesets with:

```bash
python -m venv .venv
source .venv/Scripts/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-security.txt

semgrep scan \
  --config p/security-audit \
  --config p/owasp-top-ten \
  --config p/javascript \
  --exclude-rule javascript.crypto-js.cryptojs-weak-algorithm.cryptojs-weak-algorithm \
  --exclude-rule javascript.koa.web.cors-default-config-koa.cors-default-config-koa \
  --exclude-rule javascript.express.web.cors-default-config-express.cors-default-config-express \
  --timeout 60 \
  --timeout-threshold 3 \
  --json-output .semgrep/security-audit.json \
  --sarif-output .semgrep/security-audit.sarif \
  .
```

The three excluded registry rules require the Semgrep Pro engine. Their corresponding CryptoJS, Koa, and Express CORS cases were manually reviewed; details and the exact rationale are retained in [SECURITY_AUDIT_REPORT.md](./SECURITY_AUDIT_REPORT.md).

### Notes for contributors

- Renderer-only dependencies are intentionally kept out of runtime `dependencies` where possible to reduce packaged size.
- Monaco is loaded at runtime instead of being part of the initial renderer dependency graph.
- On Windows, UTF-8 handling is explicitly enforced in dev and logging related flows to reduce mojibake risk.

---

## 🆕 Recent Product Updates

### 2026-09 v1.5.0 multi-tool & performance pass

- Built-in registry now covers four tools: Claude Code, Codex CLI (full six capabilities incl. `config.toml` via a comment-preserving `TOML_FILE_V1` codec and `auth.json` key management), Gemini CLI, and Antigravity.
- Linked multi-file editing (`editGroup`): split-config tools validate the whole group first, then write sequentially through the existing authorize → backup → atomic-write chain.
- Configuration-set snapshots (`configSet`) with a per-tool dropdown in the config page and a two-layer tray quick-switch menu; Claude Code keeps its original workspace channel with hot reload.
- Packaging size nearly halved (`app.asar` 23.16 → 11.76 MB) via on-demand Monaco runtime, dependency pruning (axios/uuid removed), and maximum compression; network egress moved to native clients.
- Single-instance lock, Windows notifications now show the app name, and startup work is deferred to idle batches.

### 2026-07-12 Security and quality baseline

- Parameterized privilege elevation with `execFile`, executable allowlists, and platform-specific escaping; elevation confirmation now fails closed.
- GitHub Actions are pinned to full commit SHAs to reduce mutable-tag supply-chain risk.
- Removed default-open CORS from the local proxy server and removed the unused CORS dependencies.
- Updated security-sensitive dependencies; root and proxy-server npm audits now report 0 vulnerabilities.
- Added a reproducible Semgrep environment, raw JSON/SARIF output workflow, and a maintained security audit report.

### v1.5.0 release candidate engineering complete

- Added a declarative JSON tool registry model with bounded validation and an embedded Claude Code compatibility adapter.
- Added generic `PATH_EXISTS` / `COMMAND_EXISTS` detection and registry-allowlisted artifact discovery.
- Added a lazy-loaded AI Tool Configuration panel and effective-registry snapshot cache with storage fingerprint invalidation.
- Added backup history/restore workflows; generic backups retain at most 20 versions per artifact path.
- Added explicit, integrity-checked registry installation and last-known-good rollback; automatic checks fetch only the small manifest.
- Added Ed25519 raw-bundle signature verification and a key-rotation contract; remote registry remains fail-closed preview until the production publisher public key is injected.
- Added artifact-specific template ownership with `USER_OVERRIDE > REGISTRY > EMBEDDED` precedence, legacy customized-template migration, and bounded diff preview.
- Added registry controls under Settings/About and an on-demand local performance snapshot exporter with no sampling timer and no upload.
- Non-critical data now loads in idle batches after critical first-render initialization; app exit waits for idempotent cleanup before allowing quit.
- Claude configuration workspace paths now use a compatibility facade; `1.5.0` keeps reading `.ccb/claude-configs` and never silently creates or migrates to a new location.
- Added release preflight and a combined Windows Portable/NSIS/ZIP command; hardened Electron windows with sandboxing plus fail-closed new-window and external-navigation policies.
- Architecture and capability references live in [ARCHITECTURE.md](./ARCHITECTURE.md) and [CAPABILITIES.md](./CAPABILITIES.md); the audit evidence trail is in [SECURITY_AUDIT_REPORT.md](./SECURITY_AUDIT_REPORT.md).

### Product experience updates

- The former global customizable default template is now **outdated** and has been replaced by per-artifact template ownership in `Settings -> Editor Settings`.
- Reworked template preview into an artifact-aware bounded diff while the editor continues to provide validation and formatting.
- Fixed config copy behavior to open an editor with a localized copy suffix and defer file creation until explicit save.
- Improved config-type aware validation so Markdown-based preference files are no longer forced through JSON parsing in preview flows.
- Added NSIS installer packaging as a lower-latency alternative to the single-file Portable build.

---

## 🤝 Contributing

We welcome bug reports, feature proposals, documentation improvements, and code contributions.

### Contribution Flow

1. Fork the repository
2. Create a branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m "feat: add amazing feature"`)
4. Push the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Commit Convention

Use Conventional Commit prefixes: `feat` / `fix` / `docs` / `refactor` / `perf` / `test` / `chore`.

---

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

Thanks to these open source projects and tools:

- [Electron](https://www.electronjs.org/)
- [React](https://react.dev/)
- [Ant Design](https://ant.design/)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- [Zustand](https://github.com/pmndrs/zustand)
- [Claude Code](https://claude.com/claude-code)

---

## 📮 Contact

- **Author**: NianSir
- **Project Home**: [GitHub](https://github.com/NianLog/ClaudeCodeButler)
- **Issue Tracker**: [Issues](https://github.com/NianLog/ClaudeCodeButler/issues)

---

<div align="center">

**If this project helps you, please give it a ⭐ Star!**

Made by NianSir

</div>
