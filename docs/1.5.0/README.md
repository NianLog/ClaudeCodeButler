# CCB v1.5.0 规划索引

> 状态：Phase 1-5 foundation 与首轮 lifecycle performance 优化已实施，Phase 6 release hardening 进行中
> 基线提交：`42dff6d`
> 当前开发版本：`1.5.0`（公共 release 仍需完成 publisher key、兼容迁移、模板 ownership 与实机性能验收）

## 文档

- [01-产品需求文档-PRD.md](./01-产品需求文档-PRD.md)：目标、范围、用户故事、验收指标
- [02-规则驱动架构设计.md](./02-规则驱动架构设计.md)：domain model、边界、迁移架构
- [03-规则库协议与安全模型.md](./03-规则库协议与安全模型.md)：JSON protocol、更新、校验、回滚与 threat model
- [04-性能工程与实施路线图.md](./04-性能工程与实施路线图.md)：性能预算、测量方法、阶段计划与发布门禁
- [05-品牌语义ADR.md](./05-品牌语义ADR.md)：CCB 新全称与兼容策略
- [06-迁移与发布计划.md](./06-迁移与发布计划.md)：release blockers、兼容迁移、验收与回滚清单

## 决策摘要

1. CCB 从 Claude Code 专用管理器演进为规则驱动的多 AI 工具配置控制平面。
2. 远程规则只允许引用应用内置、审计过的 declarative capabilities，不允许携带 JS、shell 或动态 module。
3. 应用可以自动检查规则 manifest 版本，但完整规则包必须由用户明确确认后下载。
4. Claude Code 在 v1.5.0 中作为第一个内置 adapter，现有配置和功能必须保持兼容。
5. 品牌保留原始名称 `Claude Code Butler`；名称记录项目起源，通用架构不受单工具品牌语义限制。
6. 性能优化以数据基线和预算为门禁，不接受无法测量的“感觉更快”。

## 当前实现进度

- [x] Shared registry domain contract 与 UPPERCASE enums
- [x] Bounded bundle/manifest validator
- [x] Embedded Claude Code compatibility adapter
- [x] Embedded Codex CLI read-only adapter
- [x] Atomic installed/last-known-good storage、merge、integrity 与 rollback
- [x] Manifest-only automatic check、explicit bundle install
- [x] Main/preload IPC 与 Settings/About 最小 UI
- [x] On-demand performance snapshot/export foundation
- [x] Generic detector/path resolver 与 read-only artifact discovery
- [x] 第二个真实 AI tool read-only adapter
- [x] Generic format codecs、validation、edit/backup/restore foundation
- [x] Lazy-loaded generic AI tool management UI
- [x] Generic backup history 与 restore UI
- [x] Global compact Card/List layout policy
- [x] Per-artifact backup retention 与 serialized pruning
- [x] Effective registry fingerprint cache 与 single-flight load
- [x] 首轮 lifecycle performance 逻辑优化
- [ ] 实机 performance baseline 与数据驱动的二次优化
- [x] 品牌恢复为 Claude Code Butler
- [x] Runtime display branding 回退
- [ ] Production registry publisher public key 注入与签名 rehearsal
- [x] Claude legacy path compatibility facade（不移动用户数据）
- [ ] Artifact-specific template ownership
- [ ] Installer 与官网多工具能力说明更新

### 当前安全边界

- Artifact read 每次重新从 effective registry 推导 allowlist，不信任 renderer 回传路径。
- Path template 仅允许 `HOME`、`APPDATA`、`LOCALAPPDATA`、`XDG_CONFIG_HOME`、`CCB_DATA` 根变量，并拒绝 traversal、UNC 与 glob。
- `COMMAND_EXISTS` 通过 `execFile` 参数数组和 `shell: false` 执行；首版 artifact read 拒绝 symbolic link 与超过 1 MiB 的文件。
- Codex CLI adapter 当前仅支持 `DISCOVER` / `READ`，TOML 保持 raw UTF-8 text；未验证的 write semantics 不进入 1.5.0 foundation。

> 开发期兼容提示：package version 已为 `1.5.0`。Ed25519 verifier 已实施，但正式 publisher public key 尚未注入；remote registry 因而保持 fail-closed preview，不能进入 production 安装链路。
