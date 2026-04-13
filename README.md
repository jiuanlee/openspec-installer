# openspec-installer

一键安装 **openspec** 并自动配置 Claude Code 开发环境的跨平台工具。

支持 Windows / macOS / Linux / WSL，自动完成 Node.js 安装、openspec 安装、TAPD 需求卡片 skill 注入、Confluence MCP 服务注册，开箱即用。

---

## 快速开始

### macOS / Linux / WSL

```bash
curl -fsSL https://raw.githubusercontent.com/jiuanlee/openspec-installer/main/scripts/install.sh | bash
```

### Windows（PowerShell）

```powershell
irm https://raw.githubusercontent.com/jiuanlee/openspec-installer/main/scripts/install.ps1 | iex
```

安装完成后运行：

```bash
openspec --help
```

---

## 功能

| 阶段 | 内容 |
|------|------|
| Phase 1 · 检测 | 识别操作系统（windows / macos / linux / WSL）、CPU 架构（x64 / arm64）、Claude Code 安装状态 |
| Phase 2 · 安装 | 自动安装 Node.js >= 22（winget / brew / nvm）、全局安装 openspec |
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

---

## 环境变量（可选）

通过环境变量预置配置，跳过交互式提示，适合 CI / 团队统一部署。

| 变量 | 说明 | 示例 |
|------|------|------|
| `TAPD_API_TOKEN` | TAPD 个人 API Token | `eyJhbGci...` |
| `CONF_BASE_URL` | Confluence 实例地址 | `https://confluence.example.com` |
| `CONF_MODE` | 部署模式：`server`（默认）或 `cloud` | `server` |
| `CONF_AUTH_MODE` | 认证模式：`auto`（默认）/ `basic` / `bearer` | `auto` |
| `CONF_USERNAME` | Confluence 登录用户名 | `zhangsan` |
| `CONF_TOKEN` | Confluence 个人访问令牌 | `NjY4...` |
| `CONF_DEFAULT_SPACE` | 默认 Confluence 空间 Key（可选） | `DOC` |
| `OPENSPEC_NPM_REGISTRY` | 自定义 npm registry（企业内网） | `https://npm.company.com` |

**示例：CI 无交互安装**

```bash
# macOS / Linux
TAPD_API_TOKEN=your_token \
CONF_BASE_URL=https://confluence.example.com \
CONF_TOKEN=your_confluence_token \
bash install.sh

# Windows PowerShell
$env:TAPD_API_TOKEN = "your_token"
$env:CONF_BASE_URL  = "https://confluence.example.com"
$env:CONF_TOKEN     = "your_confluence_token"
.\install.ps1
```

---

## 配置 Token

### TAPD API Token

1. 登录 [TAPD](https://www.tapd.cn)
2. 进入 **个人设置 → API 访问 → 申请令牌**
3. 或直接访问：https://www.tapd.cn/tapd_api_token/token

### Confluence 个人访问令牌（Server / Data Center）

```
https://confluence.example.com/plugins/personalaccesstokens/usertokens.action
```

### Confluence API Token（Cloud）

https://id.atlassian.com/manage-profile/security/api-tokens

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

## 系统要求

| 项目 | 要求 |
|------|------|
| Node.js | >= 22（由安装脚本自动处理） |
| 操作系统 | Windows 10 1709+ / macOS 12+ / Ubuntu 20.04+ / WSL2 |
| CPU | x64 或 arm64 |
| Claude Code | >= 1.0（Phase 3 需要，未安装则跳过） |

---

## License

MIT
