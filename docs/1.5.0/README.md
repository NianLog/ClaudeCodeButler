# CCB v1.5.0 规划索引

> 状态：Phase 1 registry core、manifest update 与 performance snapshot foundation 已实施
> 基线提交：`42dff6d`
> 当前发布版本：`1.4.0`（在 v1.5.0 验收完成前不提前修改 package version）

## 文档

- [01-产品需求文档-PRD.md](./01-产品需求文档-PRD.md)：目标、范围、用户故事、验收指标
- [02-规则驱动架构设计.md](./02-规则驱动架构设计.md)：domain model、边界、迁移架构
- [03-规则库协议与安全模型.md](./03-规则库协议与安全模型.md)：JSON protocol、更新、校验、回滚与 threat model
- [04-性能工程与实施路线图.md](./04-性能工程与实施路线图.md)：性能预算、测量方法、阶段计划与发布门禁
- [05-品牌语义ADR.md](./05-品牌语义ADR.md)：CCB 新全称与兼容策略

## 决策摘要

1. CCB 从 Claude Code 专用管理器演进为规则驱动的多 AI 工具配置控制平面。
2. 远程规则只允许引用应用内置、审计过的 declarative capabilities，不允许携带 JS、shell 或动态 module。
3. 应用可以自动检查规则 manifest 版本，但完整规则包必须由用户明确确认后下载。
4. Claude Code 在 v1.5.0 中作为第一个内置 adapter，现有配置和功能必须保持兼容。
5. 品牌建议将 CCB 解释为 `Cognitive Configuration Bridge`；在用户确认前保持 provisional，不全仓替换。
6. 性能优化以数据基线和预算为门禁，不接受无法测量的“感觉更快”。

## 当前实现进度

- [x] Shared registry domain contract 与 UPPERCASE enums
- [x] Bounded bundle/manifest validator
- [x] Embedded Claude Code compatibility adapter
- [x] Atomic installed/last-known-good storage、merge、integrity 与 rollback
- [x] Manifest-only automatic check、explicit bundle install
- [x] Main/preload IPC 与 Settings/About 最小 UI
- [x] On-demand performance snapshot/export foundation
- [ ] Generic detector/path resolver 与 read-only artifact discovery
- [ ] 第二个真实 AI tool read-only adapter
- [ ] Generic format codecs、edit/backup/restore
- [ ] 实机 performance baseline 与首批优化
- [ ] 品牌全称最终确认与 UI/installer 迁移

> 开发期兼容提示：package version 当前仍为 `1.4.0`，因此 `minimumAppVersion: 1.5.0` 的远程 manifest 会被按设计拒绝。Release phase 正式 bump 到 `1.5.0` 后才启用 production registry update；内置 registry 不受影响。
