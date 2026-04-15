# GitLab 仓库部署说明

将 `.gitlab/` 目录中的文件推送到公司 GitLab 仓库：

```
https://gitlab.gaodun.com/strom/openspec-installer
```

## 部署步骤

### 1. 在 GitLab 创建空仓库

访问 https://gitlab.gaodun.com/strom/openspec-installer 创建空仓库（如果没有自动创建）

### 2. 推送文件

**方式 A: 只推送 GitLab 版本文件（推荐）**

```bash
cd .gitlab
git init
git remote add origin https://gitlab.gaodun.com/strom/openspec-installer.git
git add .
git commit -m "Initial commit - GitLab version"
git branch -M master
git push -u origin master
```

**方式 B: 推送整个仓库（如果 GitLab 是主仓库）**

```bash
git remote add gitlab https://gitlab.gaodun.com/strom/openspec-installer.git
git push gitlab main:master
```

### 3. 安装命令（推送后）

**Windows:**
```powershell
irm https://gitlab.gaodun.com/strom/openspec-installer/-/raw/master/scripts/install.ps1 | iex
```

**macOS / Linux / WSL:**
```bash
curl -fsSL https://gitlab.gaodun.com/strom/openspec-installer/-/raw/master/scripts/install.sh | bash
```

---

## 文件清单

| 文件 | 说明 |
|------|------|
| `README.md` | 项目文档 |
| `scripts/install.ps1` | Windows PowerShell 安装脚本 |
| `scripts/install.sh` | macOS/Linux/WSL bash 安装脚本 |

## 与 GitHub 版本的区别

| 项目 | GitHub | GitLab |
|------|--------|--------|
| 仓库地址 | github.com/jiuanlee/openspec-installer | gitlab.gaodun.com/strom/openspec-installer |
| Raw URL | raw.githubusercontent.com/.../main/... | gitlab.gaodun.com/.../-/raw/master/... |
| 分支名 | main | master |
| npm 包来源 | github:jiuanlee/openspec-installer | npm registry (openspec-installer) |

## 注意事项

1. **npm 包安装**: GitLab 版本默认从 npm registry 安装 `openspec-installer`，需要确保：
   - 公网上 `npm install -g openspec-installer` 可用，或
   - 使用私有 npm registry 镜像

2. **网络问题**: 如果公司内网无法访问 GitHub，可以在安装时指定私有 registry：
   ```bash
   OPENSPEC_NPM_REGISTRY=https://npm.company.com bash install.sh
   ```

3. **Node.js 版本**: 最低要求 Node.js >= 18（Claude Code 官方要求）
