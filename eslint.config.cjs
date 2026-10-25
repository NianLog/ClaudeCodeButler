const js = require('@eslint/js')
const tsParser = require('@typescript-eslint/parser')
const tsPlugin = require('@typescript-eslint/eslint-plugin')
const globals = require('globals')
const dnsModules = ['dns', 'node:dns', 'dns/promises', 'node:dns/promises']
const restrictedNodeModules = /^(node:)?(dns(\/promises)?|undici|v8)$/

module.exports = [
  { ignores: ['dist/**', 'out/**', 'release/**', 'coverage/**', 'src/proxy-server/dist/**'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node }
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs['eslint-recommended'].overrides[0].rules,
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // 保留既有 lint 规则集，避免升级引擎时改写无关模块的错误处理。
      'preserve-caught-error': 'off',
      'no-useless-assignment': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'error'
    }
  },
  {
    files: ['src/main/**/*.ts', 'src/proxy-server/src/**/*.ts'],
    rules: {
      // Note: .agents/notes/implemented/bug-fix/2026-10-25-reachable-node-network-mitigations.md
      'no-restricted-globals': ['error', {
        globals: ['fetch', 'WebSocket', 'EventSource'],
        checkGlobalObject: true,
        globalObjects: ['globalThis', 'global']
      }],
      'no-restricted-properties': ['error',
        ...['globalThis', 'global'].flatMap(object => ['fetch', 'WebSocket', 'EventSource'].map(property => ({
          object, property, message: '禁止通过全局对象或解构别名引入未复核的 Node 网络入口。'
        })))
      ],
      'no-restricted-imports': ['error', {
        paths: [
          ...dnsModules.map(name => ({ name, allowImportNames: ['lookup', 'lookupService'], message: '使用已审查的 OS lookup；新增 c-ares Resolver 入口必须先复核运行时风险。' })),
          { name: 'undici', message: '主进程使用 Electron net.fetch；独立代理保留已审查的 HTTP adapter。' },
          { name: 'node:undici', message: '禁止新增未复核的 Undici 入口。' },
          { name: 'v8', importNames: ['startupSnapshot'], message: '用户 Node 启动快照尚未通过安全复核。' },
          { name: 'node:v8', importNames: ['startupSnapshot'], message: '用户 Node 启动快照尚未通过安全复核。' }
        ]
      }],
      'no-restricted-syntax': ['error',
        { selector: `ImportExpression[source.value=${restrictedNodeModules}]`, message: '使用受限的命名导入，禁止动态加载未复核的 Node 网络/快照接口。' },
        { selector: `CallExpression[callee.name='require'][arguments.0.value=${restrictedNodeModules}]`, message: '使用受限的命名导入，禁止 require 绕过 Node 网络/快照边界。' },
        { selector: `CallExpression[callee.object.name='process'][callee.property.name='getBuiltinModule'][arguments.0.value=${restrictedNodeModules}]`, message: '禁止 getBuiltinModule 绕过 Node 网络/快照边界。' }
      ]
    }
  }
]
