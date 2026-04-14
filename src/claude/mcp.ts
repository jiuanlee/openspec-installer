/**
 * mcp.ts — confluence-mcp Registration into Claude Code settings.json
 *
 * Transport: HTTP (type: "http")
 * Service:   公司统一部署的远程 Confluence MCP 服务
 *            http://dy.gaodunwangxiao.com/mcp/server/3HHD6dOdK1eJF1U5/mcp
 *
 * 与 stdio 模式的区别：
 *  - 无需本地安装任何 npm 包
 *  - 无需配置 Confluence 账号 / Token
 *  - Token 内嵌在 URL 中，由公司统一管理
 *  - 所有团队成员使用同一服务地址
 *
 * 写入 settings.json 的结构：
 *
 *   {
 *     "mcpServers": {
 *       "confluence-mcp": {
 *         "type": "http",
 *         "url":  "http://dy.gaodunwangxiao.com/mcp/server/3HHD6dOdK1eJF1U5/mcp"
 *       }
 *     }
 *   }
 *
 * 写入位置：~/.claude/settings.json（全局，对所有项目生效）
 *
 * 原子写策略：tmp → fsync → rename，防止写入中断导致文件损坏
 */

import * as fs   from 'fs';
import * as path from 'path';
import type { ClaudeInfo } from '../detect/claude';
import { logger } from '../logger';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const SERVER_NAME = 'confluence-mcp';

/** 公司统一部署的 Confluence MCP HTTP 服务地址 */
const MCP_HTTP_URL = 'http://dy.gaodunwangxiao.com/mcp/server/3HHD6dOdK1eJF1U5/mcp';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface McpInstallOptions {
  /**
   * 强制覆盖已存在的注册项。
   * @default false
   */
  force?: boolean;
}

export type McpInstallStatus =
  | 'already-registered'
  | 'registered'
  | 'updated'
  | 'failed';

export interface McpInstallResult {
  success:      boolean;
  status:       McpInstallStatus;
  settingsFile: string;
  summary:      string;
  warnings:     string[];
}

/** settings.json 的顶层结构 */
interface ClaudeSettings {
  mcpServers?: Record<string, McpServerEntry>;
  [key: string]: unknown;
}

/** HTTP 类型的 MCP server 条目 */
interface McpServerEntry {
  type: 'http';
  url:  string;
}

// ─────────────────────────────────────────────
// Internal: settings.json I/O
// ─────────────────────────────────────────────

function readSettings(settingsFile: string): ClaudeSettings {
  try {
    return JSON.parse(fs.readFileSync(settingsFile, 'utf8')) as ClaudeSettings;
  } catch {
    return {};
  }
}

/**
 * 原子写：先写 .tmp → fsync → rename
 * 进程被 kill 也不会产生半截 JSON
 */
function writeSettingsAtomic(settingsFile: string, data: ClaudeSettings): void {
  const tmp     = settingsFile + '.tmp';
  const content = JSON.stringify(data, null, 2) + '\n';

  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });

  const fd = fs.openSync(tmp, 'w');
  fs.writeSync(fd, content);
  fs.fsyncSync(fd);
  fs.closeSync(fd);

  fs.renameSync(tmp, settingsFile);
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * 将 confluence-mcp（HTTP 模式）注册到 ~/.claude/settings.json。
 *
 * 幂等：已注册时直接返回，除非 force=true。
 * 深合并：仅写入 mcpServers["confluence-mcp"]，不影响其他字段（如 "model"）。
 *
 * @example
 * const result = await registerConfluenceMcp(claudeInfo);
 * console.log(result.summary);
 */
export async function registerConfluenceMcp(
  claudeInfo: ClaudeInfo,
  opts: McpInstallOptions = {},
): Promise<McpInstallResult> {
  const { force = false } = opts;
  const warnings:    string[] = [];
  const settingsFile          = claudeInfo.settingsFile;

  // ── 读取现有配置（保留 model 等其他字段）────────────────────────────
  const settings = readSettings(settingsFile);
  if (!settings.mcpServers) settings.mcpServers = {};

  const alreadyExists = claudeInfo.existingMcpServers.includes(SERVER_NAME);

  // ── 幂等检查 ─────────────────────────────────────────────────────────
  if (alreadyExists && !force) {
    return {
      success:      true,
      status:       'already-registered',
      settingsFile,
      summary:      `confluence-mcp registered (HTTP mode) - skipped. Use force=true to update.`,
      warnings,
    };
  }

  // ── 写入 HTTP 条目 ───────────────────────────────────────────────────
  settings.mcpServers[SERVER_NAME] = {
    type: 'http',
    url:  MCP_HTTP_URL,
  };

  try {
    writeSettingsAtomic(settingsFile, settings);
  } catch (err) {
    return {
      success:      false,
      status:       'failed',
      settingsFile,
      summary:      `写入 ${path.basename(settingsFile)} 失败：${(err as Error).message}`,
      warnings,
    };
  }

  const status: McpInstallStatus = alreadyExists ? 'updated' : 'registered';

  return {
    success:      true,
    status,
    settingsFile,
    summary:
      `confluence-mcp ${status === 'registered' ? '注册成功' : '已更新'}（HTTP 模式）-> ${MCP_HTTP_URL}`,
    warnings,
  };
}

/**
 * 格式化 McpInstallResult 用于 CLI 输出。
 */
export function formatMcpResult(result: McpInstallResult): string {
  const icon  = result.success ? '[ok]' : '[x]';
  const lines = [`${icon} confluence-mcp - ${result.summary}`];
  for (const w of result.warnings) {
    lines.push(`  [warn] ${w}`);
  }
  return lines.join('\n');
}
