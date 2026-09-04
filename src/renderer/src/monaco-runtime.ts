/**
 * Monaco 按需运行时入口
 *
 * 只引入编辑器核心 + JSON 语言服务 + Markdown 语法高亮：
 * CCB 编辑的配置类型为 settings/MCP JSON、agents/skills Markdown、
 * YAML 与 TOML（monaco 无内置语言支持，按纯文本回退），不存在
 * TypeScript/CSS/HTML 编辑场景，引入对应语言服务只会把数 MB 的
 * 无关 worker 打进产物并增加编辑器初始化开销。
 *
 * 新增语言支持时在此按需补充对应 monaco.contribution，并同步
 * CodeEditor 的 getWorker 映射。
 */
import 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/language/json/monaco.contribution'
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'

export default monaco
