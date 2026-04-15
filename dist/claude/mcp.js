"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerConfluenceMcp = registerConfluenceMcp;
exports.formatMcpResult = formatMcpResult;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const SERVER_NAME = 'confluence-mcp';
/** 公司统一部署的 Confluence MCP HTTP 服务地址 */
const MCP_HTTP_URL = 'http://dy.gaodunwangxiao.com/mcp/server/3HHD6dOdK1eJF1U5/mcp';
// ─────────────────────────────────────────────
// Internal: settings.json I/O
// ─────────────────────────────────────────────
function readSettings(settingsFile) {
    try {
        return JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    }
    catch {
        return {};
    }
}
/**
 * 原子写：先写 .tmp → fsync → rename
 * 进程被 kill 也不会产生半截 JSON
 */
function writeSettingsAtomic(settingsFile, data) {
    const tmp = settingsFile + '.tmp';
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
async function registerConfluenceMcp(claudeInfo, opts = {}) {
    const { force = false } = opts;
    const warnings = [];
    const settingsFile = claudeInfo.settingsFile;
    // ── 读取现有配置（保留 model 等其他字段）────────────────────────────
    const settings = readSettings(settingsFile);
    if (!settings.mcpServers)
        settings.mcpServers = {};
    const alreadyExists = claudeInfo.existingMcpServers.includes(SERVER_NAME);
    // ── 幂等检查 ─────────────────────────────────────────────────────────
    if (alreadyExists && !force) {
        return {
            success: true,
            status: 'already-registered',
            settingsFile,
            summary: `confluence-mcp registered (HTTP mode) - skipped. Use force=true to update.`,
            warnings,
        };
    }
    // ── 写入 HTTP 条目 ───────────────────────────────────────────────────
    settings.mcpServers[SERVER_NAME] = {
        type: 'http',
        url: MCP_HTTP_URL,
    };
    try {
        writeSettingsAtomic(settingsFile, settings);
    }
    catch (err) {
        return {
            success: false,
            status: 'failed',
            settingsFile,
            summary: `Failed to write ${path.basename(settingsFile)}: ${err.message}`,
            warnings,
        };
    }
    const status = alreadyExists ? 'updated' : 'registered';
    return {
        success: true,
        status,
        settingsFile,
        summary: `confluence-mcp ${status === 'registered' ? 'registered' : 'updated'} (HTTP mode) -> ${MCP_HTTP_URL}`,
        warnings,
    };
}
/**
 * 格式化 McpInstallResult 用于 CLI 输出。
 */
function formatMcpResult(result) {
    const icon = result.success ? '[ok]' : '[x]';
    const lines = [`${icon} confluence-mcp - ${result.summary}`];
    for (const w of result.warnings) {
        lines.push(`  [warn] ${w}`);
    }
    return lines.join('\n');
}
//# sourceMappingURL=mcp.js.map