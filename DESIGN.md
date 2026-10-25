---
name: 'CCB'
description: '紧凑侧栏与内嵌工作区的本地 AI 配置管理界面'
colors:
  dark-pro-accent: '#82b3ff'
  dark-pro-accent-solid: '#2f6db5'
  dark-pro-accent-bg: '#253750'
  dark-pro-bg-base: '#131518'
  dark-pro-bg-panel: '#1a1c20'
  dark-pro-bg-elevated: '#22252b'
  dark-pro-bg-hover: '#2b3039'
  dark-pro-border: '#363c45'
  dark-pro-text-primary: '#edf0f5'
  dark-pro-text-secondary: '#a3adbb'
  dark-pro-green: '#6bd4b1'
  dark-pro-yellow: '#ebc483'
  dark-pro-red: '#ffa29a'
  minimal-accent: '#c0b0f5'
  minimal-accent-solid: '#7660b3'
  minimal-accent-bg: '#302940'
  minimal-bg-base: '#111113'
  minimal-bg-panel: '#19191c'
  minimal-bg-elevated: '#222226'
  minimal-bg-hover: '#2c2c32'
  minimal-border: '#37373e'
  minimal-text-primary: '#f0eff4'
  minimal-text-secondary: '#aaa7b7'
  minimal-green: '#6bd4b1'
  minimal-yellow: '#ebc483'
  minimal-red: '#ffa29a'
  terminal-accent: '#87d7a2'
  terminal-accent-solid: '#37744c'
  terminal-accent-bg: '#243c2d'
  terminal-bg-base: '#101512'
  terminal-bg-panel: '#151c18'
  terminal-bg-elevated: '#1c2620'
  terminal-bg-hover: '#243029'
  terminal-border: '#384a3d'
  terminal-text-primary: '#e2f0e7'
  terminal-text-secondary: '#a0b7a7'
  terminal-green: '#88d9aa'
  terminal-yellow: '#ebc483'
  terminal-red: '#ffa29a'
  light-accent: '#245b98'
  light-accent-solid: '#285e9d'
  light-accent-bg: '#eaf1fb'
  light-bg-base: '#f7f8fa'
  light-bg-panel: '#ffffff'
  light-bg-elevated: '#f5f6f8'
  light-bg-hover: '#edf0f5'
  light-border: '#dfe3eb'
  light-text-primary: '#263345'
  light-text-secondary: '#606c80'
  light-green: '#15795c'
  light-yellow: '#8f5d13'
  light-red: '#b13332'
  text-on-accent: '#ffffff'
typography:
  body:
    fontFamily: '''Segoe UI Variable'', ''Segoe UI'', ''Microsoft YaHei UI'', sans-serif'
    fontSize: '14px'
    fontWeight: 400
  label:
    fontFamily: '''Segoe UI Variable'', ''Segoe UI'', ''Microsoft YaHei UI'', sans-serif'
    fontSize: '12px'
    fontWeight: 450
  headline:
    fontFamily: '''Segoe UI Variable'', ''Segoe UI'', ''Microsoft YaHei UI'', sans-serif'
    fontSize: '22px'
    fontWeight: 550
    lineHeight: 1.35
    letterSpacing: '-0.025em'
  title:
    fontFamily: '''Segoe UI Variable'', ''Segoe UI'', ''Microsoft YaHei UI'', sans-serif'
    fontSize: '15px'
    fontWeight: 550
  light-body:
    fontFamily: '''Segoe UI Variable'', ''Segoe UI'', ''Microsoft YaHei UI'', sans-serif'
    fontSize: '14px'
    fontWeight: 450
  light-label:
    fontFamily: '''Segoe UI Variable'', ''Segoe UI'', ''Microsoft YaHei UI'', sans-serif'
    fontSize: '12px'
    fontWeight: 500
  light-headline:
    fontFamily: '''Segoe UI Variable'', ''Segoe UI'', ''Microsoft YaHei UI'', sans-serif'
    fontSize: '22px'
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: '-0.025em'
  light-title:
    fontFamily: '''Segoe UI Variable'', ''Segoe UI'', ''Microsoft YaHei UI'', sans-serif'
    fontSize: '15px'
    fontWeight: 600
  terminal-body:
    fontFamily: '''JetBrains Mono'', ''SF Mono'', ''Cascadia Code'', monospace'
    fontSize: '14px'
    fontWeight: 400
  terminal-label:
    fontFamily: '''JetBrains Mono'', ''SF Mono'', ''Cascadia Code'', monospace'
    fontSize: '12px'
    fontWeight: 450
  terminal-headline:
    fontFamily: '''JetBrains Mono'', ''SF Mono'', ''Cascadia Code'', monospace'
    fontSize: '22px'
    fontWeight: 550
    lineHeight: 1.35
    letterSpacing: '-0.025em'
  terminal-title:
    fontFamily: '''JetBrains Mono'', ''SF Mono'', ''Cascadia Code'', monospace'
    fontSize: '15px'
    fontWeight: 550
  mono:
    fontFamily: '''SF Mono'', ''Cascadia Code'', ''Consolas'', monospace'
    fontSize: '12px'
  mono-minimal:
    fontFamily: '''SF Mono'', ''JetBrains Mono'', monospace'
    fontSize: '12px'
  mono-terminal:
    fontFamily: '''JetBrains Mono'', ''SF Mono'', ''Cascadia Code'', monospace'
    fontSize: '12px'
rounded:
  dark-pro-sm: '5px'
  dark-pro-md: '7px'
  dark-pro-lg: '8px'
  minimal-sm: '7px'
  minimal-md: '9px'
  minimal-lg: '9px'
  terminal-sm: '2px'
  terminal-md: '2px'
  terminal-lg: '8px'
  light-sm: '6px'
  light-md: '8px'
  light-lg: '8px'
spacing:
  dark-pro-xs: '2px'
  dark-pro-sm: '4px'
  dark-pro-md: '8px'
  dark-pro-lg: '12px'
  dark-pro-xl: '16px'
  minimal-xs: '4px'
  minimal-sm: '6px'
  minimal-md: '10px'
  minimal-lg: '14px'
  minimal-xl: '20px'
  terminal-xs: '2px'
  terminal-sm: '4px'
  terminal-md: '6px'
  terminal-lg: '8px'
  terminal-xl: '12px'
  light-xs: '2px'
  light-sm: '4px'
  light-md: '8px'
  light-lg: '12px'
  light-xl: '16px'
  workspace-inset: '8px'
  page-padding: '28px'
  section-gap: '24px'
  inspector-padding: '22px'
  column-gap: '32px'
components:
  button-primary:
    backgroundColor: '{colors.dark-pro-accent-solid}'
    textColor: '{colors.text-on-accent}'
    typography: '{typography.body}'
    rounded: '{rounded.dark-pro-sm}'
    padding: '0px 15px'
    height: '34px'
  button-secondary:
    backgroundColor: '{colors.dark-pro-bg-panel}'
    textColor: '{colors.dark-pro-text-primary}'
    typography: '{typography.body}'
    rounded: '{rounded.dark-pro-sm}'
    padding: '0px 15px'
    height: '34px'
  button-text:
    backgroundColor: 'transparent'
    textColor: '{colors.dark-pro-text-primary}'
    typography: '{typography.body}'
    rounded: '{rounded.dark-pro-sm}'
    height: '34px'
  text-input:
    backgroundColor: '{colors.dark-pro-bg-elevated}'
    textColor: '{colors.dark-pro-text-primary}'
    typography: '{typography.body}'
    rounded: '{rounded.dark-pro-sm}'
    height: '34px'
  navigation-selected:
    backgroundColor: '{colors.dark-pro-accent-bg}'
    textColor: '{colors.dark-pro-accent}'
    typography: '{typography.label}'
    rounded: '{rounded.dark-pro-md}'
    padding: '4px 8px'
  tag-neutral:
    backgroundColor: '{colors.dark-pro-bg-elevated}'
    textColor: '{colors.dark-pro-text-secondary}'
    rounded: '{rounded.dark-pro-sm}'
  resource-inspector:
    backgroundColor: '{colors.dark-pro-bg-elevated}'
    textColor: '{colors.dark-pro-text-primary}'
    rounded: '{rounded.dark-pro-md}'
    padding: '{spacing.inspector-padding}'
  resource-row-selected:
    backgroundColor: '{colors.dark-pro-bg-elevated}'
    textColor: '{colors.dark-pro-text-primary}'
    typography: '{typography.body}'
    padding: '22px 16px'
  agent-selector:
    backgroundColor: '{colors.dark-pro-bg-elevated}'
    textColor: '{colors.dark-pro-text-primary}'
    typography: '{typography.body}'
    rounded: '{rounded.dark-pro-sm}'
    height: '34px'
    width: '190px'
---

# Design System: CCB

## Overview

**Creative North Star: "内嵌配置工作区"**

CCB 用紧凑侧栏组织入口，把当前任务放在连续的主工作区内。中性色承担背景、容器、输入与分隔；强调色标记当前导航、焦点和主要动作。列表保持可扫描的名称、格式与状态，详情区承接路径和后续操作。

保留 CCB 名称、标识、中英双语和四个主题 ID。Dark Pro、Minimal、Terminal 为深色，Light 为浅色；默认使用 Dark Pro。前三者的色相与密度各有差异，Terminal 使用等宽 UI，其余使用系统无衬线字体。组件通过同一主题变量和 Ant Design token 配对，避免切换主题后出现不一致的背景、文字和控件。

**Key Characteristics:**

- 紧凑侧栏与内嵌主工作区。
- 柔和背景层次、可辨认的控件边界与明确焦点。
- 通用资源入口与 Claude Code 专属入口分组。
- 路径和代码使用等宽字体，数字使用等宽数字。

本规范从当前源码提取。运行时主题以 [themes/index.ts](src/renderer/src/themes/index.ts) 为准，布局与状态以 [workspace.css](src/renderer/src/styles/workspace.css)、[ModernLayout](src/renderer/src/components/Layout/ModernLayout.tsx)、[资源页样式](src/renderer/src/components/AgentResources/AgentResources.css) 和 [main.tsx](src/renderer/src/main.tsx) 为准。启动前的 globals.css 兜底值和旧 Tailwind 调色板不代表当前主题。文档结构遵循 [DESIGN.md format](https://raw.githubusercontent.com/google-labs-code/design.md/main/docs/spec.md)。

## Colors

四套主题都使用低饱和的中性背景，以及可区分的文字强调色和实心动作色。Frontmatter 的主题前缀分别为 dark-pro、minimal、terminal、light，后缀对应同名 CSS 变量；text-on-accent 为四主题共用值。

### Primary

| 主题 ID | 强调色特征 | 使用方式 |
| --- | --- | --- |
| ccb-dark-pro | 柔和浅蓝与深蓝动作色 | accent 用于链接、当前导航与焦点；accent-solid 用于主要按钮 |
| ccb-minimal | 柔和浅紫与灰紫动作色 | 延续相同角色，保持深灰工作区 |
| ccb-terminal | 柔和浅绿与深绿动作色 | 延续相同角色，配合等宽文字 |
| ccb-light | 深蓝文字与蓝色动作色 | 在浅色表面维持可辨认的操作层次 |

accent-bg 只承接选中状态的背景。主要按钮使用 text-on-accent；悬停背景采用源码中的 accent-solid 与 bg-panel 混色。

### Secondary

green、yellow、red 对应成功、警告与错误，并传给 Ant Design 的语义 token。状态提示同时保留图标或文字，颜色本身不承担全部含义。

### Neutral

- bg-base 同时用于窗口基底与侧栏；bg-panel 用于主工作表面。
- bg-elevated 与同主题的 bg-input 值相同，用于浮层、输入和资源详情区。
- bg-hover 用于可交互行和导航的悬停；border 用于分隔与普通容器边界。
- text-primary 用于主要内容；text-secondary 同时承担当前主题的辅助文字与占位文字。
- 控件边框单独使用 border-control：深色由 text-secondary 与 bg-panel 按源码中的 60% 比例混合，浅色使用 82%。它比容器分隔线更明显。

**The Theme Pairing Rule.** 同一表面只使用当前主题前缀的颜色、圆角与密度；自定义 CSS 与 Ant Design 必须读取同一个主题。

## Typography

**Body Font:** Segoe UI Variable，依次回退到 Segoe UI、Microsoft YaHei UI 和 sans-serif；Terminal 的 UI 使用 JetBrains Mono、SF Mono、Cascadia Code、monospace。

**Label/Mono Font:** Dark Pro 与 Light 的路径、代码使用 SF Mono、Cascadia Code、Consolas、monospace；Minimal 使用 SF Mono、JetBrains Mono、monospace；Terminal 与其 UI 字体一致。字体均按系统可用情况回退，不承诺已安装特定字体。

### Hierarchy

- **Headline:** 资源页标题（22px），紧凑行高（1.35）与轻微负字距；使用主题 heading 字重。
- **Title:** 详情区标题（15px），使用主题 heading 字重。
- **Body:** 普通界面（14px）。深色 body、label、heading 字重依次为 400、450、550；Light 为 450、500、600。Ant Design 按钮保留组件自身的普通字重。
- **Label:** 导航文字与辅助尺寸（12px）；资源字段标签沿用正文尺寸并使用主题 label 字重。路径与代码预览使用等宽字体（12px）。
- **Numbers:** 页面、表格、统计、标签及终端日志使用 tabular-nums，减少数值变化造成的宽度跳动。

没有独立的大字号 Display 层级。标题平衡换行，说明文字使用自然换行；长名称与路径允许断行。

**The UI and Code Rule.** 普通界面使用当前主题的 UI 字体；路径、差异和代码使用该主题的等宽字体。Terminal 保持全等宽。

## Layout

当前桌面壳采用侧栏与主内容区的横向布局。窗口外边距与两区间隔一致（8px）；侧栏展开宽度（200px），收起宽度（56px）。主工作区有独立圆角并裁剪内部溢出，原生窗口标题栏保留。

内容区顶部工具栏保留唯一管理 Agent 选择器，选择器宽度（190px），工具栏最小高度（64px），水平内边距（24px）。主内容区滚动，默认内边距（28px）；侧栏独立滚动。

侧栏中，配置管理、MCP、Skills、子 Agent 使用全局管理目标。Claude Code 分组保留项目、统计与托管模式；自动化规则、环境排查与应用设置归入“工具”。工具页按操作本身指定的目标运行，提示其作用范围，不把侧栏归类变更表述为新增多 Agent 能力。

资源工作区居中且限制最大宽度（1500px）。资源列表与详情区使用两列：列表吸收剩余宽度，详情区从 240px 到 310px，列间距（32px）。搜索框不超过 360px。行内按“名称与描述、格式、状态”排列，行内间距（24px），内边距（22px 16px）。

### Density and responsive behavior

- Frontmatter 的各主题 xs–xl 对应源码 space 变量，用于侧栏和既有组件。资源页的 22px、24px、28px、32px 为实际布局值，不把整页强制改成单一等差比例。
- 宽度不超过 1100px 时，资源列表与详情区改为单列。
- 不超过 1000px 时，工具栏水平内边距改为 16px，内容内边距改为 20px，工具栏作用域标签隐藏；资源页仍说明作用域。
- 不超过 800px 时，资源页标题与动作上下排列，差异预览改为单列，行内间距减为 12px、内边距减为 18px 10px。
- 既有 768px 侧栏规则继续存在；该规则本身不构成移动端支持或触屏验收结论。

## Elevation & Depth

主工作区、侧栏与普通卡片保持平面结构，通过中性底色、输入背景和细分隔线建立层次。详情区使用输入背景，避免在每一行外再套卡片。选择器、Tooltip、Popover、Modal 与 Drawer 仍保留浮层语义。

### Shadow Vocabulary

- **Select dropdown:** 使用 globals.css 的实际投影（0 2px 8px rgba(0, 0, 0, 0.45)）。
- **Input focus:** 焦点边框外先留表面色间隔（1px），再显示淡强调色外环（4px 范围，强调色 24%）。键盘焦点另外保留可见轮廓（2px，外移 3px）。
- 组件库按钮与浮层继续使用当前 Ant Design algorithm 的阴影；不要把未生效的旧阴影变量当成新增表面规则。

**The Tonal Surface Rule.** 主工作区、侧栏和普通卡片依靠背景层次与分隔线区分，浮层和焦点保留各自的深度提示。

## Shapes

圆角使用当前主题的 sm、md、lg，具体值由 Frontmatter 给出。sm 用于按钮、输入与普通标签，md 用于导航、卡片和资源详情区，lg 用于主工作区。Terminal 的控件保持接近直角的轮廓；其主工作区仍有实际使用的外圆角。

容器与列表使用细边界（1px）。资源行保持平直，仅以底部分隔线组织连续列表。状态点保留圆形，不把普通按钮或输入改成胶囊。主要动作、普通动作与只读文字通过背景、边界和状态区分。

## Components

### Buttons

动作简短，复用 Ant Design 的 primary、default、text、danger 与 loading 状态。常规控件高度（34px），小号（28px）；默认按钮水平内边距由已安装 Ant Design 计算为 15px。主要按钮使用实心强调色与 text-on-accent，普通按钮保持表面色，工具栏图标动作使用 text 按钮。

悬停、键盘焦点和不可操作状态都必须可辨认。保存时使用 loading，资源只读或写入进行中时按现有能力禁用动作。复制路径保留成功图标反馈；成功缩放反馈时长（0.22s），启用减少动态时缩短动画和过渡。

### Chips

普通 Tag 使用 elevated 背景、辅助文字和细边框，表示作用域、格式与只读能力。成功、警告、错误标签继续走组件库的语义状态。标签用于说明当前事实，不能单凭着色表示资源已经运行成功。

### Cards / Containers

既有卡片使用 panel 背景、md 圆角、细边框。资源详情区使用 elevated 背景与内边距（22px），显示名称、说明、位置、验证状态及查看、编辑、删除动作。普通详情区不添加悬停抬升。

### Inputs / Fields

输入、Textarea 与 Select 使用 input 背景、sm 圆角和可辨认的控制边框。聚焦时切到 accent 边框并显示双环，光标使用 accent。占位文字保留完整不透明度并使用辅助文字颜色。错误和禁用状态继续使用 Ant Design 的语义状态；字段保留可关联的 label。

### Navigation

第一组依次为配置、MCP、Skills、子 Agent；第二组标明 Claude Code，容纳其专属功能；设置入口单独保留。选中项使用 accent-bg 与 accent，悬停使用 hover 背景；按钮可接收键盘焦点。侧栏收起后保留图标入口。顶部管理对象选择器说明当前 Agent 与用户范围；导入流程中的来源选择器承担另一项明确任务。

### Resource list and inspector

主列表使用连续的可选择行；名称和说明在左，格式与配置状态在右。选择一行后由旁侧详情区承接后续动作。页头保留创建与导入，搜索后展示数量，底部说明“已配置”与运行验证的区别。加载使用 Skeleton，空列表使用 Empty，读取失败显示错误与重试入口，只读能力同时显示标签并禁用写操作。

### Editors, import preview and draft decisions

长内容在 Drawer 内编辑，宽度为 min(900px, 92vw)，编辑区高度（55vh）；只读查看复用相同结构。Claude 专属高级界面使用独立 Drawer，宽度为 min(1200px, 96vw)。

导入使用宽度（920px）的 Modal，按来源、预览、结果分步。预览显示目标路径、冲突、错误、警告和逐项处理选择，源码与目标内容在宽屏并排、窄屏上下排列。写入时保留进度并阻止关闭或重复写入，结果逐项显示。

脏草稿的确认 Modal 宽度（520px），提供保存后继续、放弃后继续、留在当前页。写入期间禁用决策动作；保存失败显示错误并保留草稿。遮罩点击不关闭编辑、导入或草稿决策。

.impeccable/design.json 保存九个自包含的 HTML/CSS 预览。默认展示 Dark Pro，优先继承应用的 CSS 变量，缺省值来自 Frontmatter。预览说明形状与状态，不替代 React、Ant Design 或实际业务行为。派生色带仅供查看，不是运行时 token。

## Do's and Don'ts

### Do:

- **Do** 从当前主题读取配色、圆角和字体，并同步 Ant Design token。
- **Do** 使用细边框区分输入区，保留键盘焦点、双环输入焦点和可见的复制结果。
- **Do** 让名称可扫描、路径可复制，长路径和预览内容允许换行。
- **Do** 在资源详情中明确只读能力和“已配置、尚未验证”的状态。
- **Do** 让导入预览先展示目标、冲突、不可兼容字段和处理选择，再提供写入动作。
- **Do** 尊重 prefers-reduced-motion，并保留保存、放弃、取消三种草稿决策。

### Don't:

- **Don't** 改名或替换四个既有主题 ID，也不要把 Minimal 设为浅色主题。
- **Don't** 在通用资源页另设管理对象选择器；导入来源选择器只说明来源。
- **Don't** 用“已配置”表示工具已经运行或通过验证。
- **Don't** 用通用等宽字体覆盖非 Terminal 主题的普通界面文字。
- **Don't** 把仅用于色带预览的派生颜色作为新增运行时主题 token。
- **Don't** 在当前设计中加入逐字模糊动画、独立思考框或拖拽操作。
