# openspec-installer

一键安装 **openspec** 并自动配置 Claude Code 开发环境的跨平台工具。

支持 Windows / macOS / Linux / WSL，自动完成 Node.js 安装、openspec 安装、TAPD 需求卡片 skill 注入、Confluence MCP 服务注册，开箱即用。

---

## 快速开始

> **推荐安装方式**：使用 PowerShell / curl 脚本安装（无需 npm 全局安装，避免符号链接问题）

### macOS / Linux / WSL

```bash
curl -fsSL https://raw.githubusercontent.com/jiuanlee/openspec-installer/main/scripts/install.sh | bash
```

### Windows（PowerShell）

```powershell
irm https://raw.githubusercontent.com/jiuanlee/openspec-installer/main/scripts/install.ps1 | iex
```

> 如果无法访问 jsDelivr CDN，请使用 GitHub raw 地址（上方默认命令）

安装完成后运行：

```bash
openspec --help
```

### 备选方案：npm 全局安装

如果你有 npm 权限，可以发布到 npm registry 后安装：

```bash
npm install -g openspec-installer
```

> ⚠️ 注意：`npm install -g github:jiuanlee/openspec-installer` 在部分环境（如 nvm4w）会因符号链接指向临时目录而失败，不推荐使用。

---

## 功能

| 阶段 | 内容 |
|------|------|
| Phase 1 · 检测 | 识别操作系统（windows / macos / linux / WSL）、CPU 架构（x64 / arm64）、Claude Code 安装状态 |
| Phase 2 · 安装 | 自动安装 Node.js >= 18（winget / brew / nvm / MSI）、全局安装 openspec |
| Phase 3 · 集成 | 注入 `tapd-api` skill、注册 `confluence-mcp-server` 到 Claude Code |

---

## 安装后效果

### tapd-api Skill

在 Claude Code 中直接粘贴 TAPD 链接，自动获取需求详情：

```
https://www.tapd.cn/tapd_fe/37748852/story/detail/1137748852001368717
```

支持 Story / Requirement / Bug / Task 四种类型。

### Confluence MCP

在 Claude Code 中直接查询 Confluence 页面内容，无需切换浏览器。

> 使用公司统一部署的远程 MCP 服务（HTTP 模式），无需个人配置账号或 Token。

---

## 环境变量（可选）

通过环境变量预置配置，跳过交互式提示，适合 CI / 团队统一部署。

| 变量 | 说明 | 示例 |
|------|------|------|
| `TAPD_API_TOKEN` | TAPD 个人 API Token | `eyJhbGci...` |
| `OPENSPEC_NPM_REGISTRY` | 自定义 npm registry（企业内网） | `https://npm.company.com` |

> Confluence MCP 使用公司统一部署的 HTTP 服务，无需配置任何 Confluence 相关环境变量。

**示例：CI 无交互安装**

```bash
# macOS / Linux
TAPD_API_TOKEN=your_token bash install.sh

# Windows PowerShell
$env:TAPD_API_TOKEN = "your_token"
.\install.ps1
```

---

## 配置 Token

### TAPD API Token

1. 登录 [TAPD](https://www.tapd.cn)
2. 进入 **个人设置 → API 访问 → 申请令牌**
3. 或直接访问：https://www.tapd.cn/tapd_api_token/token

---

## 安装后的文件位置

```
~/.claude/
├── settings.json          ← 新增 mcpServers.confluence-mcp 配置
└── skills/
    └── tapd-api/
        ├── SKILL.md       ← Skill 描述文件
        ├── tapd_api.py    ← TAPD API 客户端
        ├── setup.py       ← Token 交互式配置工具
        ├── config.example.json
        └── config.json    ← 你的 API Token（自动生成，不会被覆盖）
```

---

## 项目结构

```
openspec-installer/
├── src/
│   ├── index.ts              # CLI 入口，串联所有阶段
│   ├── detect/
│   │   ├── os.ts             # OS / 架构检测
│   │   └── claude.ts         # Claude Code 安装检测
│   ├── install/
│   │   ├── node.ts           # Node.js 安装（winget / brew / nvm）
│   │   └── openspec.ts       # openspec 全局安装
│   └── claude/
│       ├── skill.ts          # tapd-api skill 注入
│       └── mcp.ts            # confluence-mcp-server 注册
├── assets/
│   └── skills/tapd-api/      # 随安装包分发的 skill 文件
├── scripts/
│   ├── install.sh            # macOS / Linux / WSL 一键脚本
│   └── install.ps1           # Windows PowerShell 一键脚本
├── package.json
└── tsconfig.json
```

---

## 本地开发

```bash
# 克隆
git clone https://github.com/jiuanlee/openspec-installer.git
cd openspec-installer

# 安装依赖
npm install

# 开发模式运行
npm run dev

# 编译
npm run build
```

---

## 修复历史

| 版本 | 日期 | 修复内容 |
|------|------|----------|
| v1.0.0 | 2026-04-15 | **Node.js 18+ 支持**：降低最低版本要求至 18（Claude Code 官方要求），自动卸载旧版 Node.js 避免 MSI 1603 错误 |
| v1.0.0 | 2026-04-15 | **npm 包优化**：排除 `.d.ts` 和 `.map` 文件，解决 `TAR_ENTRY_ERROR` 错误 |
| v1.0.0 | 2026-04-14 | **Windows 兼容性**：替换所有 Unicode 字符为 ASCII，解决终端乱码问题 |
| v1.0.0 | 2026-04-14 | **实时输出**：改用 `& $exe` 直接执行，支持命令输出实时显示 |
| v1.0.0 | 2026-04-14 | **日志持久化**：PowerShell 和 bash 脚本均记录日志到 `~/.openspec-installer/` |
| v1.0.0 | 2026-04-14 | **防闪退**：PowerShell 脚本增加 try/catch 和 pause，错误时显示信息后再退出 |

### 详细修复说明

#### 1. Node.js 版本要求降低至 18+
- **问题**：原要求 Node.js >= 22，用户已有 Node.js 21 仍需升级
- **修复**：改为 >= 18（Claude Code 官方最低要求）
- **相关文件**：`src/install/node.ts`, `scripts/install.ps1`, `package.json`

#### 2. MSI 安装 1603 错误
- **问题**：Windows MSI 安装旧版本 Node.js 时冲突，退出码 1603
- **修复**：安装新版前先检测并卸载旧版 Node.js
- **相关文件**：`scripts/install.ps1::Install-NodeViaMsi()`

#### 3. npm 包包含 `.d.ts` 文件导致安装错误
- **问题**：`npm install -g github:...` 时报错 `TAR_ENTRY_ERROR ENOENT`
- **修复**：`package.json` 的 `"files"` 改为 `dist/**/*.js`，排除类型声明文件
- **相关文件**：`package.json`

#### 4. Windows 终端乱码（?  路 鉁？等）
- **问题**：Windows 默认代码页无法显示 Unicode 框线字符和中文
- **修复**：全部替换为 ASCII：
  - `╔║╚╠╣` → `+|=`
  - `✔✘` → `[ok][x]`
  - `——` → `--`
  - `·` → `-`
  - 中文 summary → 英文
- **相关文件**：`src/*.ts`, `src/**/*.ts`

#### 5. 命令输出无法实时显示
- **问题**：`ProcessStartInfo` 的 `RedirectStandardOutput` 在 `irm|iex` 模式下异步事件不触发
- **修复**：改用 `& $resolvedPath @ArgList 2>&1 | ForEach-Object` 直接执行
- **相关文件**：`scripts/install.ps1::Invoke-Command-Logged()`

#### 6. 日志文件编码问题
- **问题**：PowerShell 5.1 `Add-Content` 默认 ASCII 编码，日志乱码
- **修复**：使用 `[System.IO.File]::AppendAllText()` 指定 UTF8 编码
- **相关文件**：`scripts/install.ps1`

#### 7. 窗口闪退无法查看错误
- **问题**：`$ErrorActionPreference='Stop'` 导致异常直接退出，`Invoke-Pause` 不执行
- **修复**：`Main` 函数包裹 `try/catch`，确保 pause 始终执行
- **相关文件**：`scripts/install.ps1`

---

## 系统要求

| 项目 | 要求 |
|------|------|
| Node.js | >= 18（由安装脚本自动处理） |
| 操作系统 | Windows 10 1709+ / macOS 12+ / Ubuntu 20.04+ / WSL2 |
| CPU | x64 或 arm64 |
| Claude Code | >= 1.0（Phase 3 需要，未安装则跳过） |

---

## License

MIT
