<div align="center">

# ⚡ CCB (Claude Code Butler)

**A Powerful Configuration Management Tool for Claude Code Users**

English | [简体中文](./README_CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-32.0.0-47848F?logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18.2.0-61DAFB?logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3.0-3178C6?logo=typescript)](https://www.typescriptlang.org/)

</div>

---

## 📖 Introduction

CCB (Claude Code Butler) is a modern configuration management tool built with Electron + React + TypeScript, specifically designed to enhance the productivity of Claude Code users. With its intuitive visual interface, users can easily manage multiple configuration files, create automation rules, analyze usage data, making Claude Code configuration management simple and efficient.

### ✨ Key Features

- 🎯 **Configuration File Management** - Visual management of Claude Code, MCP server, and project configuration files
  - Support for CRUD operations on configuration files
  - JSON Schema validation to ensure configuration correctness
  - One-click switching between different configuration files
  - Configuration backup and restore functionality

- 🔌 **MCP Server Management** - Comprehensive Model Context Protocol server management
  - Visual management of global and project-level MCP servers
  - Enable/disable servers (archive-based mechanism)
  - CRUD operations for server configurations
  - Server duplication and import/export support
  - Grouped display by project path
  - Real-time status monitoring

- 🤖 **Automation Rule Engine** - Intelligent rule system based on trigger-condition-action pattern
  - Scheduled task scheduling (Cron expressions)
  - File monitoring triggers
  - Custom condition evaluation
  - Multiple action types (config switching, command execution, notifications, etc.)

- 📊 **Usage Statistics & Analytics** - Deep insights into your Claude Code usage
  - API call count statistics
  - Token usage analysis
  - Model usage distribution
  - Visual chart displays

- 📁 **Project Management** - Centralized management of multiple development projects
  - Project configuration associations
  - Quick project configuration switching
  - Project usage statistics

- 🔄 **Managed Mode** - Built-in proxy server support
  - API request/response transformation
  - Custom request handling logic
  - Logging and debugging

- 🌐 **Multi-language Support** - Built-in Chinese and English interfaces
- 🎨 **Modern UI** - Beautiful interface based on Ant Design
- 💾 **Data Security** - Local storage for privacy protection

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

- Node.js >= 20.0.9
- npm >= 9.0.0

### Installation

```bash
# Clone the repository
git clone https://github.com/NianLog/ClaudeCodeButler.git

# Navigate to project directory
cd ClaudeCodeButler

# Install dependencies
npm install
```

### Development Mode

```bash
# Start in standard mode
npm run dev

# Start with admin privileges (required for some features)
npm run dev:admin
```

### Build Application

```bash
# Build the project
npm run build

# Run the built application
npm start
```

---

## 📦 Packaging & Distribution

### Windows

```bash
npm run dist
```

Output files in `release/` directory:
- `CCB-Portable-{version}.exe` - Portable version
- `CCB-{version}-win.zip` - Compressed package

### macOS

```bash
npm run dist:mac
```

Output files:
- `CCB-{version}.dmg` - Installer
- `CCB-{version}-mac.zip` - Compressed package

### Linux

```bash
npm run dist:linux
```

Output files:
- `CCB-{version}.AppImage` - AppImage format
- `CCB-{version}-linux.tar.gz` - Compressed package

### All Platforms

```bash
npm run dist:all
```

---

## 🛠️ Tech Stack

### Frontend

- **Framework**: React 18.2 + TypeScript 5.3
- **UI Library**: Ant Design 5.12
- **State Management**: Zustand 4.4
- **Code Editor**: Monaco Editor 0.54
- **Charts**: Recharts 2.8
- **Build Tools**: Vite 5.0 + electron-vite 2.0

### Backend

- **Runtime**: Electron 32.0
- **File Monitoring**: Chokidar 3.5
- **Task Scheduling**: node-cron 3.0
- **Logging**: Winston
- **Proxy Server**: Express 5.1

### Development Tools

- **Testing**: Vitest 1.0
- **Linting**: ESLint + TypeScript ESLint
- **Formatting**: Prettier
- **Packaging**: electron-builder 24.9

---

## 📚 Project Architecture

### Directory Structure

```
ClaudeCodeButler/
├── src/
│   ├── main/              # Electron main process
│   │   ├── index.ts       # Main process entry
│   │   ├── ipc-handlers.ts # IPC communication handlers
│   │   ├── services/      # Business logic services
│   │   └── utils/         # Utility functions
│   ├── preload/           # Preload scripts
│   ├── renderer/          # React renderer process
│   │   ├── src/
│   │   │   ├── components/ # React components
│   │   │   ├── store/      # Zustand state management
│   │   │   ├── hooks/      # Custom hooks
│   │   │   └── utils/      # Utility functions
│   │   └── index.html
│   ├── shared/            # Shared types and constants
│   │   ├── types/         # TypeScript type definitions
│   │   └── constants/     # Constants
│   └── proxy-server/      # Proxy server (standalone)
├── resources/             # Application resources
├── docs/                  # Project documentation
└── release/               # Build output directory
```

### Core Services

- **ConfigService** - Configuration file management service
- **MCPManagementService** - MCP server management service
- **RuleEngineService** - Automation rule engine
- **StatisticsService** - Usage statistics service
- **ProjectManagementService** - Project management service
- **ManagedModeService** - Managed mode service
- **LogStorageService** - Log storage service

### IPC Communication Pattern

Main process and renderer process communicate through standardized IPC pattern:

```typescript
// Response format
{ success: true, data: T }      // Success
{ success: false, error: string } // Error
```

---

## 🔧 Development Guide

### Development Commands

```bash
# Development mode
npm run dev              # Standard privileges
npm run dev:admin        # Admin privileges

# Build
npm run build            # Build to out/ directory
npm run preview          # Preview build result

# Testing
npm test                 # Run tests
npm run lint             # Code linting
npm run type-check       # Type checking
```

### Proxy Server Development

```bash
cd src/proxy-server

# Development mode
npm run dev

# Build
npm run build

# Start
npm start
```

### Path Aliases

The project is configured with the following path aliases:

- `@/` → `src/renderer/src/` (renderer process)
- `@shared/` → `src/shared/` (all processes)

### Code Standards

- Prefer `const`, avoid `var`
- Use TypeScript strict mode
- Add JSDoc comments for all public functions
- Follow ESLint rules
- Format code with Prettier

---

## 🤝 Contributing

We welcome all forms of contribution! Whether it's reporting bugs, suggesting new features, or submitting code improvements.

### Contribution Process

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Submit a Pull Request

### Commit Convention

Please follow this commit message format:

```
<type>: <subject>

<body>
```

**Type:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation update
- `style`: Code style adjustment
- `refactor`: Code refactoring
- `perf`: Performance optimization
- `test`: Test related
- `chore`: Build/toolchain update

**Example:**
```
feat: add batch import for configuration files

- Support batch import from folder
- Add import progress indicator
- Optimize import performance
```

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details

---

## 🙏 Acknowledgments

### Development Tools

This project was developed with assistance from [Claude Code](https://claude.com/claude-code), a powerful AI programming assistant that significantly improved development efficiency and code quality.

### Open Source Projects

Thanks to these excellent open source projects:

- [Electron](https://www.electronjs.org/) - Cross-platform desktop application framework
- [React](https://reactjs.org/) - User interface library
- [Ant Design](https://ant.design/) - Enterprise-class UI design language
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editor
- [Zustand](https://github.com/pmndrs/zustand) - State management library

---

## 📮 Contact

- **Author**: NianSir
- **Project Home**: [GitHub](https://github.com/NianLog/ClaudeCodeButler)
- **Issue Tracker**: [Issues](https://github.com/NianLog/ClaudeCodeButler/issues)

---

<div align="center">

**If this project helps you, please give it a ⭐ Star!**

Made with ❤️ by NianSir

</div>
