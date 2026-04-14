"use strict";
/**
 * claude/index.ts — Claude Code Integration Layer
 *
 * Exports:
 *  - All types and functions from skill.ts  (tapd-api injection)
 *  - All types and functions from mcp.ts    (confluence-mcp registration)
 *  - runClaudeIntegration()                 (single-call orchestrator for index.ts)
 *
 * Dependency graph:
 *   index.ts
 *     └── claude/index.ts
 *           ├── claude/skill.ts  → reads assets/, writes ~/.claude/skills/tapd-api/
 *           └── claude/mcp.ts   → reads/writes ~/.claude/settings.json
 *
 * Both operations are independent and run sequentially (not in parallel).
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runClaudeIntegration = runClaudeIntegration;
__exportStar(require("./skill"), exports);
__exportStar(require("./mcp"), exports);
const skill_1 = require("./skill");
const mcp_1 = require("./mcp");
/**
 * Run the full Claude Code integration in one call:
 *  1. Inject tapd-api skill into ~/.claude/skills/
 *  2. Register confluence-mcp (HTTP mode) in ~/.claude/settings.json
 *
 * Only call this when claudeInfo.installed === true.
 *
 * @example
 * if (claudeInfo.installed) {
 *   const result = await runClaudeIntegration(claudeInfo, {
 *     skill: { token: process.env['TAPD_API_TOKEN'] },
 *   });
 * }
 */
async function runClaudeIntegration(claudeInfo, opts = {}) {
    const skill = await (0, skill_1.injectTapdSkill)(claudeInfo, opts.skill ?? {});
    const mcp = await (0, mcp_1.registerConfluenceMcp)(claudeInfo, opts.mcp ?? {});
    return {
        skill,
        mcp,
        allSuccess: skill.success && mcp.success,
    };
}
//# sourceMappingURL=index.js.map