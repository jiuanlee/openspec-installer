---
name: tapd-api
description: Fetch TAPD requirement/story/bug details using personal API token with Bearer authentication. Use when user provides TAPD link and has API token configured.
version: 1.1.0
---

# TAPD API Client

Fetch TAPD requirement/story/bug details using personal API token via TAPD Open Platform API.

## Configuration

### Step 1: Get Your TAPD API Token

1. Login to TAPD (https://www.tapd.cn)
2. Go to: **个人设置** > **API 访问** > **申请令牌**
3. Or visit: https://www.tapd.cn/tapd_api_token/token
4. Create a new token and copy it

### Step 2: Configure Token

Save your API token to `~/.claude/skills/tapd-api/config.json`:

```json
{
  "api_token": "your_api_token_here"
}
```

Or run the setup command:
```bash
python ~/.claude/skills/tapd-api/setup.py
```

## Usage

### Get Requirement/Story Details

Provide a TAPD link:
```
https://www.tapd.cn/tapd_fe/37748852/story/detail/1137748852001368717
```

Or use command:
```bash
python ~/.claude/skills/tapd-api/tapd_api.py "https://www.tapd.cn/tapd_fe/37748852/story/detail/1137748852001368717"
```

### Supported URL Types

| Type | URL Pattern |
|------|-------------|
| Story/故事 | `/story/detail/{id}` |
| Requirement/需求 | `/requirement/detail/{id}` |
| Bug/缺陷 | `/bug/view/{id}` |
| Task/任务 | `/task/view/{id}` |

## API Reference

TAPD Open Platform API: https://www.tapd.cn/help/api_reference

### Endpoints

- **Stories**: `https://api.tapd.cn/stories`
- **Requirements**: `https://api.tapd.cn/requirements`
- **Bugs**: `https://api.tapd.cn/bugs`
- **Tasks**: `https://api.tapd.cn/tasks`

### Authentication

All API requests use Bearer Token authentication:
```
Authorization: Bearer <your_api_token>
```

### Example API Call

```bash
curl -H "Authorization: Bearer your_token" \
  "https://api.tapd.cn/stories?workspace_id=37748852&id=1137748852001368717"
```

## Output Format

```
============================================================
TAPD Requirement Details
============================================================

**URL**: https://www.tapd.cn/tapd_fe/37748852/story/detail/1137748852001368717
**Type**: Story
**ID**: 1137748852001368717

## Basic Info

**Title**: 【PC】面授管理增加课堂链接
**Status**: 开发中
**Priority**: 17
**Iteration**: S 239 学习平台

## People

**Creator**: 余莹
**Owner**: 张鑫; 葛承猛; 王英

## Timeline

**Created**: 2026-03-17
**Modified**: 2026-03-20

## Description
需求描述内容...

============================================================
```

## Troubleshooting

### Error: Invalid API Token
- Check if token is correctly configured in `config.json`
- Verify token hasn't expired (check in TAPD settings)
- Re-generate token if needed

### Error: Permission Denied
- Ensure your account has access to the workspace
- Check if API access is enabled for your account

### Error: Resource Not Found
- Verify the URL/ID is correct
- Check if you have permission to view this resource
