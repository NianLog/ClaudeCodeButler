<div align="center">

# ⚡ CCB (Claude Code Butler)

**本地优先的多 AI CLI 工具配置控制平面**

[English](./README.md) | 简体中文

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-40.10.6-47848F?logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18.3.1-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-3178C6?logo=typescript)](https://www.typescriptlang.org/)

</div>

---

## 📖 简介

CCB（Claude Code Butler）是一个基于 Electron、React 和 TypeScript 构建的本地优先桌面应用。`1.5.0` 保留原始产品名称，同时把底层架构演进为规则驱动的配置控制平面：通过声明式 JSON registry 统一管理 Claude Code 与其他 AI CLI 工具（Codex CLI、Gemini CLI、Antigravity）的配置。

### 项目状态

- **当前版本**：`1.5.0`（开发中）；发布基线 `1.4.0`
- **v1.5.0 主题**：从 Claude Code 专用管理器演进为规则驱动的多 AI 工具配置控制平面
- **已支持工具**：Claude Code、Codex CLI、Gemini CLI、Antigravity —— 声明式 JSON registry 接入，覆盖配置发现、校验、原子编辑、备份恢复与配置集快照切换全链路
- **质量与安全**：自动化测试与双端构建全绿；root 与 proxy-server 生产依赖 audit 均 `0 vulnerabilities`（详见 [SECURITY_AUDIT_REPORT.md](./SECURITY_AUDIT_REPORT.md)）

产品名称继续使用 **Claude Code Butler**。名称用于记录项目起源，不再承担描述全部管理范围的职责；新增工具通过受约束 registry 与内置 capabilities 接入，`CCB`、`.ccb`、应用 identity 和仓库标识保持稳定。

### ✨ 核心功能

- 🎯 **多工具配置全生命周期管理**
  - 统一管理 Claude Code、Codex CLI、Gemini CLI 与 Antigravity 的配置
  - 支持创建、编辑、复制、导入、导出、备份、恢复与一键切换
  - 分离配置工具的多文件联动编辑（如 Codex `config.toml` + `auth.json`）：整组先校验、再顺序写入
  - 每工具配置集快照：保存当前状态、托盘一键切换、随时恢复
  - 支持 `JSON`、`TOML`、`Markdown` 类型配置并按真实文件类型校验；缺失文件可按 registry 声明模板创建

- 🔌 **MCP 服务器管理**
  - 在同一个面板中管理全局与项目级 MCP 服务器
  - 支持本地命令型服务器，也支持仅包含 `http` / `url` 等字段的远程服务器
  - 支持启用、禁用、复制、导入、导出、归档与可用性验证

- 🧠 **编辑器与设置体验**
  - 基于 Monaco 的编辑器，并采用按需加载运行时以减轻首屏压力
  - 内置格式化、语法校验与弹窗预览，预览和编辑复用同一套编辑器能力
  - 支持 artifact selector、生效来源标识、bounded diff preview 与逐 artifact override 管理
  - 支持终端预设、主题语言、编辑器行为等偏好设置

- 🤖 **自动化与托管模式**
  - 提供基于触发-条件-动作模型的自动化规则系统
  - 提供托管模式代理能力，支持请求转换、日志、诊断和 Provider 管理
  - 提供 Claude Code 与相关工具的环境检查与版本诊断

- 📊 **运维与洞察**
  - 提供使用分析、模型/Token 统计与项目关联管理
  - 提供 Agent 与 Skill 管理面板
  - 提供本地日志、UTF-8 安全输出和本地优先的数据存储策略

- 🌐 **面向日常使用**
  - 提供中文与英文界面
  - 提供 Windows Portable、ZIP 与 NSIS 安装版分发方式
  - 本地优先、不强制依赖云端；远程规则库为可选能力且强制签名校验

---

## 📸 截图

<details open>
<summary>点击展开/收起截图</summary>

### 🎛️ 配置与管理
| 配置管理 | MCP 服务器控制 |
|:---:|:---:|
| ![配置](resources/img/config-management.png) | ![MCP](resources/img/mcp-server.png) |

### 📊 分析与项目
| 用量分析 | 项目管理 |
|:---:|:---:|
| ![分析](resources/img/analytics.png) | ![项目](resources/img/project-management.png) |

### 🚀 自动化与环境
| 自动化规则 | 环境检查 |
|:---:|:---:|
| ![自动化](resources/img/automation-rules.png) | ![环境](resources/img/environment-check.png) |

### 🤖 高级功能
| 子 Agent 管理 | 技能库管理 |
|:---:|:---:|
| ![子Agent](resources/img/sub-agent.png) | ![技能](resources/img/skills.png) |

</details>

---

## 🚀 快速开始

### 环境要求

- Node.js >= 20.19.0（推荐 Node.js 22 LTS）
- npm >= 10.0.0
- 仅在执行本地 Semgrep 审计时需要 Python >= 3.10

### 安装

```bash
# 克隆仓库
git clone https://github.com/NianLog/ClaudeCodeButler.git

# 进入项目目录
cd ClaudeCodeButler

# 按 lockfile 安装应用依赖
npm ci

# 安装独立 proxy-server 依赖
npm ci --prefix src/proxy-server
```

### 开发模式

```bash
# 标准模式启动
npm run dev

# 管理员模式启动（部分环境检查 / 终端流程需要）
npm run dev:admin
```

### 构建与验证

```bash
# 构建应用
npm run build

# 类型检查
npm run type-check

# 单次运行测试（非 watch 模式）
npm run test -- --run

# 审计 root 与 proxy-server 依赖
npm audit --audit-level=low
npm audit --audit-level=low --prefix src/proxy-server

# 启动构建后的应用
npm start
```

---

## 📦 打包与分发

### Windows 产物

```bash
# 单文件 Portable
npm run pack:portable

# 引导式安装包（NSIS）
npm run pack:installer

# ZIP 压缩包
npm run pack:zip

# 目录版，适合快速冒烟验证
npm run pack:dir

# 一次生成 Portable、NSIS 与 ZIP
npm run pack:win:all
```

默认输出到 `release/`：

- `CCB-Portable-{version}.exe` - 单文件便携版
- `CCB-Setup-{version}.exe` - 支持自定义安装目录和快捷方式选项的安装版
- `CCB-{version}-win.zip` - ZIP 压缩包
- `win-unpacked/` - 目录版构建产物

打包前，开发阶段运行 `npm run release:preflight:preview`，正式发布运行 `npm run release:preflight`。当 `REGISTRY_TRUSTED_PUBLIC_KEYS` 为空时 production preflight 会按设计 fail-closed。

若构建机网络存在 TLS 拦截（如企业代理），请一次性配置可信根证书（`NODE_EXTRA_CA_CERTS` 或 npm `cafile`）——本项目任何情况下都不接受关闭 TLS 校验的绕过方式。Electron 发行版下载可用 `ELECTRON_MIRROR` / `ELECTRON_BUILDER_BINARIES_MIRROR` 加速，下载后请对照官方 `SHASUMS256.txt` 核验。

### 分发说明

- Portable 版本虽然便于分发，但 `electron-builder` 的单文件 Portable 方案会在真正显示主界面前先把运行体释放到临时目录，因此在 Windows 上启动速度会明显慢于 `win-unpacked` 或 NSIS 安装版。
- 如果更重视启动体验，推荐优先使用 NSIS 安装版。
- 当前项目保留原本的压缩 Portable 策略，以避免产物体积明显增大。

### 跨平台发布命令

```bash
# 当前平台默认发布目标
npm run dist

# macOS
npm run dist:mac

# Linux
npm run dist:linux

# 全部已配置平台
npm run dist:all
```

---

## 🛠️ 技术栈

### 应用运行时

- **Electron**: 40.10.6
- **electron-vite**: 5.0.0
- **Vite**: 7.3.6
- **TypeScript**: 5.9.3

### 渲染层（构建期打包，不进运行时 `dependencies`）

- **React**: 18.3.1
- **Ant Design**: 5.27.6
- **Zustand**: 4.5.7
- **Monaco Editor**: 0.55.1，搭配 `@monaco-editor/react` 4.7（按需加载运行时）
- **Recharts**: 2.15.4
- **react-markdown**: 9.1 / **remark-gfm**: 4.0.1

### 主进程与服务层（运行时 `dependencies`，共 6 个包）

- **chokidar**: 3.6.0 — 文件监听
- **express**: 5.1.0 — 托管模式 proxy-server 子包
- **node-cron**: 4.6.0 — 自动化调度
- **js-yaml**: 4.3.2 — YAML 解析
- **smol-toml**: 1.8.0 — 零传递依赖的 TOML 校验（Codex 配置）
- **https-proxy-agent**: 7.x — 托管模式上游代理

### 工具链与质量保障

- **Vitest**: 4.x（33 files / 211 tests，CI 阻塞）
- **ESLint**: 8.57.1（零错误，CI 阻塞 + 变更文件 ratchet 双保险）
- **electron-builder**: 26.15.3
- **patch-package**: 8.0.1
- **Semgrep CLI**: 1.169.0（隔离安装在 root `.venv`）

---

## 📚 项目架构

### 目录结构

```text
ClaudeCodeButler/
├── src/
│   ├── main/                # Electron 主进程：服务、工具、IPC 注册中心
│   ├── preload/             # 暴露给渲染层的唯一 contextBridge
│   ├── renderer/            # React UI、Zustand store、功能面板、多语言
│   ├── shared/              # 跨进程领域契约：工具 registry 模型、validator、
│   │                        # 内置 registry JSON
│   └── proxy-server/        # 托管模式代理（独立 npm 包）
├── scripts/                 # dev-runner、release-preflight、签名辅助脚本
├── resources/               # 图标、截图、打包资源
├── docs/                    # 版本规划文档
├── tests/                   # 分层单元测试（main/preload/proxy/renderer/shared）
└── release/                 # 打包输出（gitignored）
```

### 架构核心不变量

- 主进程拥有全部文件系统、路径与子进程访问权；渲染层完全沙箱化，仅暴露窄 IPC 面
- 工具支持以声明式 JSON registry 描述（绝不分发可执行代码）；远程 registry 必须通过 Ed25519 → SHA-256 → size → schema → 版本校验链，任何一环失败即整体拒绝（fail-closed）
- JSON 持久化全部原子化（temp + rename）；每次 artifact 编辑都先按 registry 推导的 allowlist 授权并备份后再写入
- 外部命令一律走参数化执行器（`shell: false`）；网络出口统一经过 SSRF 防护客户端

模块边界与数据流详见 [ARCHITECTURE.md](./ARCHITECTURE.md)，用户可见能力清单见 [CAPABILITIES.md](./CAPABILITIES.md)。

### IPC 通信模式

主进程与渲染进程统一使用如下结果结构：

```ts
{ success: true, data: T }
{ success: false, error: string }
```

---

## 🔧 开发指南

### 常用命令

```bash
# 开发
npm run dev
npm run dev:admin

# 构建 / 预览
npm run build
npm run preview

# 质量检查
npm run type-check
npm run lint
npm run lint:changed
npm run test -- --run
npm audit --audit-level=low
npm audit --audit-level=low --prefix src/proxy-server
npm run release:preflight:preview

# 打包
npm run pack:portable
npm run pack:installer
npm run pack:zip
npm run pack:dir
npm run pack:win:all
```

### 路径别名

- `@/` → `src/renderer/src/`
- `@shared/*` → `src/shared/*`

### 本地安全审计（Windows Git Bash）

Semgrep 与 Node.js 工具链隔离，安装在 root `.venv`。可通过以下命令重建环境并运行本次审计使用的 rulesets：

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

上述 3 条被排除的 registry rules 依赖 Semgrep Pro engine；对应的 CryptoJS、Koa 与 Express CORS 场景已执行人工补偿检查。完整原因与审计记录保存在 [SECURITY_AUDIT_REPORT.md](./SECURITY_AUDIT_REPORT.md)。

### 开发注意事项

- 仅用于渲染层打包的依赖会尽量保留在非运行时依赖范围，减少最终包体积。
- Monaco 不直接进入首屏依赖图，而是在实际打开编辑器时再加载。
- 在 Windows 下，开发链路和日志链路都会显式处理 UTF-8，以降低终端乱码风险。

---

## 🆕 最近更新

### 2026-09 v1.5.0 多工具与性能批次

- 内置 registry 覆盖四个工具：Claude Code、Codex CLI（全六能力，含经 `TOML_FILE_V1` codec 保注释编辑的 `config.toml` 与 `auth.json` key 管理）、Gemini CLI、Antigravity。
- 多文件联动编辑（`editGroup`）：分离配置工具整组先校验、再经既有 授权 → 备份 → 原子写链顺序写入。
- 配置集快照（`configSet`）：配置页每工具下拉框 + 托盘两层快速切换菜单；Claude Code 保留原工作区通道与热重载。
- 打包体积近乎减半（`app.asar` 23.16 → 11.76 MB）：Monaco 按需运行时、依赖裁剪（移除 axios/uuid）、最大压缩；网络出口切换为原生客户端。
- 单实例锁、Windows 通知显示应用名、启动非关键工作延迟到空闲批次执行。

### 2026-07-12 安全与质量基线

- 权限提升改为 `execFile` 参数化执行，增加 executable allowlist 与平台级 escaping；权限确认异常时默认拒绝。
- GitHub Actions 固定为完整 commit SHA，降低 mutable tag 带来的供应链风险。
- 移除本地 proxy server 默认全开放的 CORS，并清理不再使用的 CORS dependencies。
- 更新安全相关 dependencies，root 与 proxy-server npm audit 均降至 0 vulnerabilities。
- 增加可复现的 Semgrep 虚拟环境、JSON/SARIF 原始结果流程与持续维护的安全审计报告。

### v1.5.0 release candidate 工程实现完成

- 新增声明式 JSON 工具规则库模型、bounded validation 与内置 Claude Code 兼容 adapter。
- 新增通用 `PATH_EXISTS` / `COMMAND_EXISTS` 检测与 registry allowlist 约束的 artifact discovery。
- 新增 lazy-loaded“AI 工具配置”面板，以及具备 storage fingerprint 自动失效能力的 effective-registry snapshot cache。
- 新增备份历史/恢复流程；通用备份默认每个 artifact path 最多保留 20 份。
- 新增需用户明确确认、具备 integrity 校验的规则库安装和 last-known-good rollback；自动检查只获取小型 manifest。
- Remote registry 已加入 Ed25519 raw-bundle signature verification 与 key rotation contract；正式 publisher public key 注入前保持 fail-closed preview。
- 新增 artifact-specific template ownership，采用 `USER_OVERRIDE > REGISTRY > EMBEDDED` 优先级，支持旧自定义模板迁移与 bounded diff preview。
- Settings/About 已加入规则库操作入口，并提供完全按需的本地 performance snapshot exporter（无采样 timer、无上传）。
- 首屏 critical 初始化完成后才按 idle batch 加载非关键数据；退出流程会等待幂等 cleanup 完成后再放行。
- Claude 配置工作区路径已集中到 compatibility facade；`1.5.0` 继续读取原 `.ccb/claude-configs`，不会静默创建或迁移到新目录。
- 新增 release preflight 与 Windows Portable/NSIS/ZIP 聚合打包命令；Electron window 已启用 sandbox，并以 fail-closed 策略拒绝新窗口与外部 navigation。
- 架构与能力说明见 [ARCHITECTURE.md](./ARCHITECTURE.md) 与 [CAPABILITIES.md](./CAPABILITIES.md)；审计证据链见 [SECURITY_AUDIT_REPORT.md](./SECURITY_AUDIT_REPORT.md)。

### 产品体验更新

- 原“全局新建配置默认模板”设计现已**过时**，由 `设置 -> 编辑器设置` 中的逐 artifact template ownership 取代。
- 模板预览改为 artifact-aware bounded diff；实际编辑器继续提供校验和格式化能力。
- 修复了复制配置逻辑，现在会先打开预填编辑器并添加国际化副本后缀，仅在显式保存后才创建新文件。
- 修复了基于 `Markdown` 的偏好配置在预览流程中被错误按 `JSON` 解析的问题。
- 新增 NSIS 安装版打包命令，作为 Portable 单文件方案之外的低等待分发选择。

---

## 🤝 贡献指南

欢迎提交问题反馈、功能建议、文档改进和代码贡献。

### 贡献流程

1. Fork 本仓库
2. 创建分支（`git checkout -b feature/AmazingFeature`）
3. 提交变更（`git commit -m "feat: add amazing feature"`）
4. 推送分支（`git push origin feature/AmazingFeature`）
5. 发起 Pull Request

### 提交约定

请使用 Conventional Commit 前缀：`feat` / `fix` / `docs` / `refactor` / `perf` / `test` / `chore`。

---

## 📄 许可证

本项目使用 MIT License，详见 [LICENSE](LICENSE)。

---

## 🙏 致谢

感谢以下开源项目与工具：

- [Electron](https://www.electronjs.org/)
- [React](https://react.dev/)
- [Ant Design](https://ant.design/)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- [Zustand](https://github.com/pmndrs/zustand)
- [Claude Code](https://claude.com/claude-code)

---

## 📮 联系方式

- **作者**: NianSir
- **项目主页**: [GitHub](https://github.com/NianLog/ClaudeCodeButler)
- **问题反馈**: [Issues](https://github.com/NianLog/ClaudeCodeButler/issues)

---

<div align="center">

**如果这个项目对你有帮助，欢迎点亮 ⭐ Star!**

Made by NianSir

</div>
