/**
 * monaco-editor 深层 ESM 路径的类型声明
 *
 * monaco-editor 的 package.json exports 仅对根路径（"."）提供 types 条件，
 * 深层 `esm/vs/editor/editor.api` 在 TS bundler 解析下找不到伴随类型声明（TS2307）。
 * 此处用根包类型（editor.main.d.ts，为 editor.api 的超集）补齐；
 * 运行时仍走深层路径，以保持按需加载（见 monaco-runtime.ts）。
 */
declare module 'monaco-editor/esm/vs/editor/editor.api' {
  export * from 'monaco-editor'
}
