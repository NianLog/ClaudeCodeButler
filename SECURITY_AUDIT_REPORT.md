# Semgrep 安全审计与改进报告

## 审计记录

### 2026-07-12：首次基线审计与整改

#### 范围与工具

- 仓库：`ClaudeCodeButler`，分支 `main`
- 工具：根目录 `.venv` 中的 Semgrep CLI `1.169.0`
- 规则：`p/security-audit`、`p/owasp-top-ten`、`p/javascript`
- 范围：Git tracked application source、scripts、tests 与 GitHub Actions；基线 162 files，加入报告与版本锁定文件后终态 164 files
- 排除：`.venv`、`node_modules`、`out`、`release`、`coverage`、`backup`、`.git`
- 原始结果：本地 `.semgrep/security-audit.json` 与 `.semgrep/security-audit.sarif`，已通过 `.gitignore` 排除

#### 基线结果

首次扫描运行 372 条适用规则，得到 16 个 findings：

| 类别 | 数量 | 研判 | 处置 |
| --- | ---: | --- | --- |
| GitHub Actions mutable action tag | 9 | 真实供应链风险 | 已固定为官方 tag 在审计日对应的 40-character commit SHA |
| `privilege-manager` 动态 `exec` | 3 | 真实 command injection 风险，来自 2 个调用点 | 已改为 `execFile` argument array，并增加 executable allowlist 与跨平台 escaping |
| 受控 `child_process` 边界 | 4 | 规则无法识别既有控制措施 | 逐点复核后使用 rule-specific suppression，并在源码记录信任边界 |
| Express default CORS | 1 | 对应 registry rule 依赖 Pro engine；人工补偿检查确认真实 localhost cross-origin 风险 | 已移除 CORS middleware 与冗余 dependencies |

首次扫描曾有 1 条规则在大型 locale 文件上 timeout。复扫将单规则 timeout 提高到 60 秒后，162 个 targets 均完成解析，未再发生 timeout。

#### 已实施改进

1. GitHub Actions 中的 `checkout`、`setup-node`、`cache`、`upload-artifact`、`action-gh-release` 全部固定 commit SHA，并保留版本注释供 Dependabot 或人工更新。
2. 权限提升执行从 shell string 拼接改为 `execFile(command, args)`；允许的 executable 限制为 `powershell.exe`、`osascript`、`pkexec`、`sudo`。
3. Windows 使用 PowerShell single-quoted literal escaping；macOS 同时应用 POSIX argument quoting 与 AppleScript string escaping；Linux 保持 argument array，不构造 shell command string。
4. 同文件的静态权限探测命令一并从 `exec` 改为 `execFile`，防止后续维护重新引入字符串拼接。
5. 权限确认对话框异常时由默认允许改为默认拒绝，消除 fail-open 行为。
6. 新增跨平台提权规格回归测试，覆盖 quotes、spaces、command substitution 与 command separator 输入。
7. 新增 `requirements-security.txt` 锁定 Semgrep 版本；`.venv/` 与 `.semgrep/` 已加入 `.gitignore`。
8. 移除本地 proxy server 的 default-open CORS。合法调用方均为 Claude CLI 或 Electron IPC，不需要浏览器跨源访问；同时移除 root 与 proxy-server 的 `cors` dependencies。
9. 补充执行 npm dependency audit：将 Electron/Vite/Vitest 等 transitive packages 更新到现有 semver range 内的修复版本；升级 `node-cron` 4.6.0 与 `uuid` 14.0.1；覆盖 Monaco 固定的旧 DOMPurify 至 3.4.12，并覆盖 brace-expansion 至 2.0.3。
10. node-cron 4 不再支持 v3 的 `scheduled:false` 语义，`TaskScheduler` 已改用 `createTask`，保持 disabled rule 注册后不自动启动。
11. dependency 更新后 root audit 从 31 vulnerabilities（2 critical、17 high、10 moderate、2 low）降至 0；proxy-server audit 同样为 0。
12. production build 暴露出旧 CSS `@import` 顺序错误及两个此前未解析到的残缺 style fragments；已移动 imports、删除无 selector 的无效 declarations，build 不再产生 PostCSS warning。

#### 已接受的边界与依据

- `command-executor`：`parseCommand` 拒绝 shell metacharacters，执行固定为 `shell:false`，binary 与 args 保持独立。
- `project-management-service`：launch spec 仅由 class 内私有平台构造器产生，使用 argument array 且不启用 shell。
- `terminal-management-service`：MCP stdio server 启动探测需要加载用户本地 shell 环境。该能力仅消费用户明确保存的本地 MCP 配置；renderer IPC 使用独立 command allowlist，不提供任意 shell passthrough。

以上位置只抑制 `javascript.lang.security.detect-child-process.detect-child-process` 单条规则，没有全局关闭规则。若未来扩大调用来源或移除现有 allowlist/validation，必须删除 suppression 并重新建模该边界。

#### 验证结果

- Full Vitest：65 tests passed（10 test files）
- TypeScript：`npm run type-check` passed
- Targeted ESLint：passed
- Root production build：passed
- Proxy-server TypeScript build：passed
- Root `npm audit --audit-level=low`：0 vulnerabilities
- Proxy-server `npm audit --audit-level=low`：0 vulnerabilities
- 整改后 Semgrep：相同 rulesets 与 164 targets 完成扫描；3 条 Pro-only rules 由 OSS CLI 明确排除并人工补偿检查，最终 0 unsuppressed findings、0 scan errors、0 timeout

#### 后续建议

1. 在 CI 中使用锁定版本的 Semgrep，并将 SARIF 上传到 GitHub Code Scanning；PR 应只扫描 diff，定时任务执行 full scan。
2. 启用 Dependabot 更新 pinned action SHA，避免固定 SHA 后长期错过 action security patches。
3. Semgrep 是 pattern-based SAST，不能替代 dependency、secret 与 runtime audit；应并行保留 `npm audit`、secret scanning 和 Electron security checklist。
4. MCP 本地配置属于显式信任边界。若未来支持远程同步或共享配置，必须改为 executable allowlist 或用户逐次确认，不能沿用当前 suppression。
5. Browserslist build metadata 当前提示 `caniuse-lite` 已陈旧 9 个月；应在独立 dependency maintenance PR 中更新并执行 UI/browser compatibility regression，避免把兼容基线变化混入安全修复。

#### OSS CLI 规则兼容说明

Registry 中以下规则使用 `metavariable-name:module`，Semgrep OSS CLI `1.169.0` 无法执行，未登录 Pro engine 时会对每个 JS/TS target 重复产生 internal matching warning：

- `javascript.crypto-js.cryptojs-weak-algorithm.cryptojs-weak-algorithm`
- `javascript.koa.web.cors-default-config-koa.cors-default-config-koa`
- `javascript.express.web.cors-default-config-express.cors-default-config-express`

最终扫描通过 `--exclude-rule` 明确排除这 3 条规则。人工补偿检查确认项目未使用 CryptoJS 或 Koa；Express default CORS 问题已发现并移除。若 CI 后续启用 Semgrep Pro，应移除这些 exclusions 并恢复对应规则。

### 2026-07-12：v1.5.0 generic discovery 增量复审

#### 审计范围与结果

- 使用根目录 `.venv` 中锁定的 Semgrep CLI `1.169.0`，复用 `p/security-audit`、`p/owasp-top-ten`、`p/javascript` 与既有 3 条 OSS Pro-only exclusions。
- 扫描 179 个 Git tracked targets、执行 369 条规则，约 100% lines parsed；JSON 原始结果为 `0 findings / 0 errors`。
- Root 与 `src/proxy-server` 的 `npm audit --audit-level=low` 均为 `0 vulnerabilities`。
- Full Vitest 为 16 files / 104 tests，TypeScript、ESLint、root production build 与 proxy-server build 全部通过。

#### 本阶段安全改进

1. Registry path template 只允许 `HOME`、`APPDATA`、`LOCALAPPDATA`、`XDG_CONFIG_HOME`、`CCB_DATA` 根变量，并拒绝 traversal、UNC、glob、未知变量和嵌套变量。
2. `COMMAND_EXISTS` 使用 `execFile(locator, [command])`、`shell: false`、5 秒 timeout 与 executable-name allowlist，不接受参数或 shell metacharacters。
3. Artifact discovery/read 每次从 effective registry 重新推导路径 allowlist；renderer 提供的 path 只作为候选选择器，不能扩展 main process 文件权限。
4. Read-only artifact 限制为当前平台 registry 声明、具有 `READ` capability、最大 1 MiB 的普通文件，并拒绝最终文件及中间目录中的 symbolic link/junction。
5. Codex CLI adapter 首版只声明 `DISCOVER` / `READ`，TOML 以 raw UTF-8 text 返回；未验证的 edit semantics 不会伪装为通用能力。

#### 保留建议

- Semgrep 属于 pattern-based SAST，`0 findings` 不能替代 runtime authorization review、secret scanning 或手工 threat modeling。
- 当前路径校验适合本地可信用户模型；若未来引入多用户服务或不可信本地进程对抗，应进一步采用 OS-level file handles、identity checks 与更严格的 TOCTOU 防护。
- Remote registry 在 Ed25519 publisher signature 未实施前应维持 preview/beta，不能仅凭 HTTPS 与 SHA-256 宣称 publisher authenticity。

### 2026-07-12：v1.5.0 generic management 增量复审

#### 审计范围与结果

- Semgrep CLI `1.169.0` full scan 覆盖 181 个既有 Git tracked targets、执行 369 条规则，约 100% lines parsed，结果为 `0 findings / 0 errors`。
- Semgrep 默认 tracked-file 枚举不包含 staged-but-uncommitted new files，因此对 2 个新 services 与 2 个新 specs 额外执行显式路径扫描；4 targets、332 applicable rules 同样为 `0 findings / 0 errors`。
- Full Vitest 为 18 files / 113 tests；TypeScript、ESLint、root production build、proxy-server build 全部通过。
- Root 与独立 proxy package 的 `npm audit --audit-level=low` 均为 `0 vulnerabilities`。

#### 本阶段安全改进

1. Generic edit、validate、backup、restore 各自要求 effective registry 中对应 UPPERCASE capability，不能由 format 或 renderer 自行推导权限。
2. JSON/JSONC/YAML codecs 限制为内置实现，并加入 64-level / 50,000-node 结构预算；remote registry 不能下载 parser code。TOML 在可信 parser 接入前明确拒绝 validation/edit，不伪造支持。
3. Edit 使用目标目录内随机 exclusive temp file、flush 与 atomic rename；带 `BACKUP` capability 的 artifact 在更新前自动备份，invalid content 不修改原文件。
4. Backup 使用 UUID、exclusive copy、受控目录和 bounded metadata；restore 根据 metadata 重新校验 registry path 与 `RESTORE` capability，拒绝 symbolic link、超限内容、无效 UTF-8 和目标路径篡改。
5. Codex CLI adapter 继续仅声明 `DISCOVER` / `READ`，因此新管理 IPC 不会扩大其写权限。

### 2026-07-13：generic management UI 与 registry cache 增量复审

- Semgrep full scan 覆盖 183 targets、369 rules，结果为 `0 findings / 0 errors`；对 staged 新 UI TSX 显式补扫 1 target、332 applicable rules，同样为 `0 findings / 0 errors`。
- Full Vitest 为 18 files / 114 tests；TypeScript、ESLint、root/proxy builds 与两套 npm audit 全部通过。
- 新增 AI Tool Configuration lazy panel；renderer 只能调用既有 capability-aware IPC，不能提供额外 filesystem roots、handlers 或 executable code。
- UI 仅在 registry 声明对应 capability 时展示 validate/edit/backup 操作；main process 仍在每次调用时重新授权，因此 UI 隐藏不是安全边界。
- Effective registry snapshot 使用 single-flight cache，fingerprint 包含 installed/last-known-good 的 nanosecond `mtime`、`ctime` 与 size；storage 变化后重新读取并执行完整 validator。
- Codex CLI 在 UI 中保持 read-only；未实现可信 TOML codec 前不会显示 edit/validate 操作。
- Backup history listing 会先重新授权 `RESTORE` capability，再逐条校验 UUID、metadata/content 普通文件属性、大小和 originalPath；损坏记录 fail-closed 排除。
- Full Vitest 更新为 18 files / 116 tests；build 日志已确认无 Ant Design `destroyOnClose` deprecation warning。
- 本阶段 Semgrep full scan 继续覆盖 183 targets / 369 rules，结果为 `0 findings / 0 errors`。
- 通用 backup create/prune 使用单进程 mutation queue；retention 只删除经过 UUID、metadata/content 普通文件与路径一致性校验的 service-owned records。
- 本阶段 Semgrep full scan 覆盖 183 targets / 369 rules，结果保持 `0 findings / 0 errors`。

### 2026-07-13：Phase 5 performance lifecycle 增量复审

- Semgrep full scan 覆盖 184 个 Git tracked targets、执行 369 条规则，约 100% lines parsed，结果为 `0 findings / 0 errors`。
- 对本阶段 5 个 lifecycle/scheduler implementation 与 spec paths 显式补扫，执行 332 条适用规则，结果同为 `0 findings / 0 errors`。
- Root 与独立 proxy package 的 `npm audit --audit-level=low` 均为 `0 vulnerabilities`；full Vitest 为 20 files / 122 tests，TypeScript、ESLint、root/proxy builds 全部通过。
- Renderer background scheduler 只调度固定 store actions，不接收 renderer 字符串、路径或 executable；cancel 仅阻止尚未启动的 batch，不隐藏已发出 IPC 的真实状态。
- StatisticsService shutdown 使用幂等 Promise barrier，auto-save 串行化，并由 app-level single quit guard 等待 cleanup，降低退出阶段部分写入与并发写入风险。
- 本轮未启动应用，安全结论只覆盖静态分析、dependency audit、unit contract 与 production build；runtime Electron security checklist 仍应在 release 验收阶段执行。

### 2026-07-13：Ed25519 registry publisher identity 增量复审

- Remote manifest schema 新增必填 `signatureAlgorithm: ED25519`、stable `keyId` 与 64-byte standard Base64 detached signature；额外字段和其他算法 fail-closed。
- Bundle 使用 bounded `arraybuffer` 下载，先对 exact response bytes 验证 pinned Ed25519 public key signature，再校验 SHA-256/size，之后使用 fatal UTF-8 decoder 解析 schema。
- Signature 后继续绑定 manifest/bundle `registryVersion` 与 `minimumAppVersion`，并保留 app compatibility 和 downgrade protection，拒绝合法旧 bundle 被错误 manifest 重新包装。
- Unknown keyId 在 manifest check 阶段直接进入 `CHECK_FAILED`，不会向用户展示虚假的 `UPDATE_AVAILABLE`；production trust map 当前为空，正式 public key 注入前 remote registry 保持 fail-closed preview。
- Offline signing helper 已用一次性 Ed25519 keypair对内置 registry 的 exact `3458 bytes` 完成 rehearsal；独立核对 size、SHA-256 与 signature 后删除临时 private key。
- Full Vitest 为 20 files / 125 tests；TypeScript、ESLint、root/proxy builds 与两套 npm audit 全部通过。Main bundle 为 `277.85 KB`，preload/renderer 保持 `12.53 KB / 196.05 KB`。
- Semgrep full scan 覆盖 186 个 Git tracked targets、执行 369 条规则，结果为 `0 findings / 0 errors`；对签名链路 9 个 implementation/spec/script paths 显式补扫 332 条适用规则，结果同为 `0 findings / 0 errors`。

保留的 release blocker：维护者必须执行 offline key ceremony，将 private key 保存在 repository/CI/application package 之外，并只把对应 SPKI public key 注入 `REGISTRY_TRUSTED_PUBLIC_KEYS`。Verifier 完成不等于 publisher identity 已建立。
