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
import type { ClaudeInfo } from '../detect/claude';
export interface McpInstallOptions {
    /**
     * 强制覆盖已存在的注册项。
     * @default false
     */
    force?: boolean;
}
export type McpInstallStatus = 'already-registered' | 'registered' | 'updated' | 'failed';
export interface McpInstallResult {
    success: boolean;
    status: McpInstallStatus;
    settingsFile: string;
    summary: string;
    warnings: string[];
}
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
export declare function registerConfluenceMcp(claudeInfo: ClaudeInfo, opts?: McpInstallOptions): Promise<McpInstallResult>;
/**
 * 格式化 McpInstallResult 用于 CLI 输出。
 */
export declare function formatMcpResult(result: McpInstallResult): string;
//# sourceMappingURL=mcp.d.ts.map