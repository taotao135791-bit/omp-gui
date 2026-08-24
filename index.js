"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
const electron = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const Store = require("electron-store");
const fs$1 = require("node:fs/promises");
const os = require("node:os");
const node_child_process = require("node:child_process");
const node_string_decoder = require("node:string_decoder");
const node_url = require("node:url");
const https = require("node:https");
const node_util = require("node:util");
const electronUpdater = require("electron-updater");
const YAML = require("yaml");
const crypto$1 = require("node:crypto");
const SESSION_THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max"
];
const DEFAULT_THINKING_LEVELS = [
  "auto",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max"
];
const DEFAULT_SETTINGS = {
  theme: "light",
  language: "en",
  windowWidth: 1280,
  windowHeight: 800,
  recentProjects: [],
  setupComplete: false,
  toolAccess: "full",
  permissionMode: "ask",
  machineSkills: false,
  notifications: true,
  notificationPreviews: false,
  pinnedSessionIds: [],
  archivedSessionIds: []
};
const settingsFile = path.join(electron.app.getPath("userData"), "omp-gui-settings.json");
let persisted = {};
try {
  persisted = JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
} catch {
  persisted = {};
}
const store = new Store({
  name: "omp-gui-settings",
  defaults: DEFAULT_SETTINGS
});
function applyFirstRunDefaults() {
  if (!("language" in persisted)) {
    store.set("language", electron.app.getSystemLocale().startsWith("zh") ? "zh" : "en");
  }
  if (!("theme" in persisted)) {
    store.set("theme", electron.nativeTheme.shouldUseDarkColors ? "dark" : "light");
  }
}
const legacyToolAccess = persisted.toolAccess;
if (!("permissionMode" in persisted) && (legacyToolAccess === "full" || legacyToolAccess === "no-bash" || legacyToolAccess === "readonly")) {
  store.set("permissionMode", legacyToolAccess);
}
function getStore(key) {
  return store.get(key);
}
function setStore(key, value) {
  store.set(key, value);
}
function rememberRecentProject(realPath) {
  const recent = getStore("recentProjects");
  if (recent.includes(realPath)) return;
  setStore("recentProjects", [realPath, ...recent].slice(0, 10));
}
const IPC_CHANNELS = {
  OMP_DETECT: "omp:detect",
  OMP_CAPABILITIES: "omp:capabilities",
  OMP_CREATE_SESSION: "omp:create-session",
  OMP_SEND_MESSAGE: "omp:send-message",
  OMP_KILL_SESSION: "omp:kill-session",
  OMP_ABORT_SESSION: "omp:abort-session",
  OMP_SESSION_EVENT: "omp:session-event",
  OMP_LIST_SESSIONS: "omp:list-sessions",
  OMP_INSTALL: "omp:install",
  OMP_INSTALL_STATUS: "omp:install-status",
  FS_LIST_DIR: "fs:list-dir",
  FS_READ_FILE: "fs:read-file",
  /** @deprecated Workspace authority is grant-based; kept only for back-compat during transition. */
  FS_SET_ROOT: "fs:set-root",
  FS_LIST_PROJECT_FILES: "fs:list-project-files",
  WORKSPACE_SELECT: "workspace:select",
  WORKSPACE_ACTIVATE_RECENT: "workspace:activate-recent",
  WORKSPACE_LIST_RECENT: "workspace:list-recent",
  WORKSPACE_CLEAR_RECENT: "workspace:clear-recent",
  WORKSPACE_REMOVE_RECENT: "workspace:remove-recent",
  WORKSPACE_ACTIVATE: "workspace:activate",
  WORKSPACE_REVOKE: "workspace:revoke",
  WORKSPACE_LIST: "workspace:list",
  PACKAGES_LIST: "packages:list",
  PACKAGES_SEARCH: "packages:search",
  PACKAGES_INSTALL: "packages:install",
  PACKAGES_REMOVE: "packages:remove",
  PACKAGES_UPDATE: "packages:update",
  PACKAGES_SET_ENABLED: "packages:set-enabled",
  PLUGINS_SCAFFOLD: "plugins:scaffold",
  PLUGINS_REVEAL: "plugins:reveal",
  STORE_GET: "store:get",
  STORE_SET: "store:set",
  BOARDS_LIST: "boards:list",
  BOARDS_SAVE: "boards:save",
  BOARDS_DELETE: "boards:delete",
  DIALOG_SELECT_FOLDER: "dialog:select-folder",
  DIALOG_SELECT_FILE: "dialog:select-file",
  DIALOG_SELECT_IMAGE: "dialog:select-image",
  SHELL_SHOW_CLI_SETTINGS: "shell:show-cli-settings",
  OMP_RESPOND_UI: "omp:respond-ui",
  OMP_SET_MODEL: "omp:set-model",
  OMP_SESSION_STATS: "omp:session-stats",
  OMP_LIST_COMMANDS: "omp:list-commands",
  OMP_COMPACT: "omp:compact",
  PI_GET_MODEL_CONFIG: "pi:get-model-config",
  PI_SET_MODEL_CONFIG: "pi:set-model-config",
  PI_SET_API_KEY: "pi:set-api-key",
  PI_CLEAR_API_KEY: "pi:clear-api-key",
  PI_LIST_MODELS: "pi:list-models",
  PI_LIST_CATALOG_MODELS: "pi:list-catalog-models",
  PI_SET_MACHINE_SKILLS: "pi:set-machine-skills",
  PI_LIST_MACHINE_SKILLS: "pi:list-machine-skills",
  APP_VERSION: "app:version",
  OMP_STEER: "omp:steer",
  OMP_FOLLOW_UP: "omp:follow-up",
  OMP_SET_THINKING: "omp:set-thinking",
  OMP_UPDATE_APPROVAL_CONFIG: "omp:update-approval-config",
  OMP_EXPORT_HTML: "omp:export-html",
  OMP_SESSION_STATE: "omp:session-state",
  OMP_LIST_SESSION_HISTORY: "omp:list-session-history",
  OMP_RESUME_SESSION: "omp:resume-session",
  OMP_DELETE_SESSION_FILE: "omp:delete-session-file",
  OMP_SET_SESSION_NAME: "omp:set-session-name",
  OMP_GET_SUBAGENTS: "omp:get-subagents",
  OMP_GET_SUBAGENT_MESSAGES: "omp:get-subagent-messages",
  CHECKPOINT_CREATE: "checkpoint:create",
  CHECKPOINT_LIST: "checkpoint:list",
  CHECKPOINT_RESTORE: "checkpoint:restore",
  GIT_INFO: "git:info",
  GIT_FILE_DIFF: "git:file-diff",
  UPDATER_STATUS: "updater:status",
  UPDATER_GET_STATUS: "updater:get-status",
  UPDATER_CHECK: "updater:check",
  UPDATER_DOWNLOAD: "updater:download",
  UPDATER_QUIT_INSTALL: "updater:quit-install",
  UPDATER_OPEN_PAGE: "updater:open-release-page",
  NOTIFY_SELECT_SESSION: "notify:select-session",
  RUNTIME_OVERVIEW: "runtime:overview",
  RUNTIME_LIST_MODELS: "runtime:list-models",
  RUNTIME_LIST_MODEL_CATALOG: "runtime:list-model-catalog",
  RUNTIME_REFRESH_MODEL_CATALOG: "runtime:refresh-model-catalog",
  RUNTIME_SET_DEFAULT_MODEL: "runtime:set-default-model",
  RUNTIME_SET_DEFAULT_THINKING: "runtime:set-default-thinking",
  RUNTIME_SET_MACHINE_SKILLS: "runtime:set-machine-skills",
  CUSTOM_PROVIDERS_LIST: "custom-providers:list",
  CUSTOM_PROVIDERS_SAVE: "custom-providers:save",
  CUSTOM_PROVIDERS_DELETE: "custom-providers:delete",
  AUTH_START_LOGIN: "auth:start-login",
  AUTH_SET_API_KEY: "auth:set-api-key",
  AUTH_ANSWER_LOGIN: "auth:answer-login",
  AUTH_CANCEL_LOGIN: "auth:cancel-login",
  AUTH_LOGOUT: "auth:logout",
  AUTH_OPEN_LOGIN_URL: "auth:open-login-url",
  AUTH_LOGIN_STATE: "auth:login-state"
};
function joinText(content, separator) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const block of content) {
    if (block?.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join(separator);
}
function appendableAssistantText(out) {
  const last = out[out.length - 1];
  return last && last.role === "assistant" && !last.toolCall ? last : null;
}
function mapAgentMessages(messages) {
  const out = [];
  const pendingTools = /* @__PURE__ */ new Map();
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    if (msg.role === "user") {
      const text = joinText(msg.content, "\n").trim();
      if (!text) continue;
      out.push({
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        // OMP records steered messages with `steering: true` on the user message.
        kind: msg.steering === true ? "steer" : "prompt"
      });
      continue;
    }
    if (msg.role === "assistant") {
      if (!Array.isArray(msg.content)) continue;
      for (const block of msg.content) {
        if (block?.type === "text" && typeof block.text === "string") {
          const text = block.text;
          if (!text.trim()) continue;
          const current = appendableAssistantText(out);
          if (current) {
            current.content = current.content ? `${current.content}

${text}` : text;
          } else {
            out.push({ id: crypto.randomUUID(), role: "assistant", content: text });
          }
        } else if (block?.type === "thinking") {
          const text = block.thinking;
          if (typeof text !== "string" || !text.trim()) continue;
          let current = appendableAssistantText(out);
          if (!current) {
            current = { id: crypto.randomUUID(), role: "assistant", content: "" };
            out.push(current);
          }
          current.thinking = current.thinking ? `${current.thinking}
${text}` : text;
        } else if (block?.type === "toolCall") {
          const call = block;
          out.push({
            id: crypto.randomUUID(),
            role: "assistant",
            content: "",
            toolCall: { tool: String(call.name ?? "tool"), input: call.arguments }
          });
          if (typeof call.id === "string" && call.id) {
            pendingTools.set(call.id, out.length - 1);
          }
        }
      }
      continue;
    }
    if (msg.role === "toolResult") {
      const output = joinText(msg.content, "\n");
      const isError = msg.isError === true;
      const idx = typeof msg.toolCallId === "string" ? pendingTools.get(msg.toolCallId) : void 0;
      if (idx !== void 0 && out[idx]?.toolCall) {
        out[idx] = {
          ...out[idx],
          toolCall: { ...out[idx].toolCall, output, isError }
        };
        pendingTools.delete(msg.toolCallId);
      } else {
        out.push({
          id: crypto.randomUUID(),
          role: "assistant",
          content: "",
          toolCall: {
            tool: typeof msg.toolName === "string" ? msg.toolName : "tool",
            input: void 0,
            output,
            isError
          }
        });
      }
      continue;
    }
  }
  return out;
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function parseSessionEntries(content) {
  const entries = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
    }
  }
  return entries;
}
function resolveActivePath(entries) {
  const byId = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    if (typeof entry.id === "string") byId.set(entry.id, entry);
  }
  const leaf = entries.length > 0 ? entries[entries.length - 1] : void 0;
  if (!leaf) return [];
  const active = [];
  const seen = /* @__PURE__ */ new Set();
  let cursor = leaf;
  while (cursor && typeof cursor.id === "string" && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    active.push(cursor);
    cursor = typeof cursor.parentId === "string" ? byId.get(cursor.parentId) : void 0;
  }
  active.reverse();
  return active;
}
async function reconstructSessionMetadata(sessionFile) {
  let text;
  try {
    text = await fs$1.readFile(sessionFile, "utf8");
  } catch {
    return [];
  }
  const activePath = resolveActivePath(parseSessionEntries(text));
  const out = [];
  let currentModel;
  let currentThinking;
  for (const entry of activePath) {
    if (entry.type === "model_change") {
      const role = typeof entry.role === "string" && entry.role ? entry.role : "default";
      if (role === "default" && typeof entry.model === "string" && entry.model) {
        currentModel = entry.model;
      }
    } else if (entry.type === "thinking_level_change") {
      currentThinking = typeof entry.thinkingLevel === "string" ? entry.thinkingLevel : void 0;
    } else if (entry.type === "message") {
      if (entry.message?.role === "user") {
        out.push({ model: currentModel, thinking: currentThinking });
      }
    }
  }
  return out;
}
function asFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function asDuration(value) {
  const number = asFiniteNumber(value);
  return number !== void 0 && number >= 0 ? number : void 0;
}
function asTimestamp(value) {
  const number = asFiniteNumber(value);
  if (number !== void 0) return number;
  if (typeof value !== "string" || !value) return void 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : void 0;
}
function agentSource(value) {
  return value === "user" || value === "project" ? value : "bundled";
}
function statusFromResult(result) {
  if (result.aborted === true) return "aborted";
  const exitCode = asFiniteNumber(result.exitCode);
  if (exitCode !== void 0) return exitCode === 0 ? "completed" : "failed";
  if (typeof result.error === "string" && result.error.trim()) return "failed";
  return "unknown";
}
function usageRecord(raw) {
  return isRecord(raw) ? raw : void 0;
}
function usageTokens(usage) {
  if (!usage) return void 0;
  const input = asFiniteNumber(usage.input);
  const output = asFiniteNumber(usage.output);
  const cacheWrite = asFiniteNumber(usage.cacheWrite);
  if (input !== void 0 || output !== void 0 || cacheWrite !== void 0) {
    return (input ?? 0) + (output ?? 0) + (cacheWrite ?? 0);
  }
  return asFiniteNumber(usage.totalTokens);
}
function usageCost(usage) {
  return usage && isRecord(usage.cost) ? asFiniteNumber(usage.cost.total) : void 0;
}
function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter(isRecord).filter((block) => block.type === "text" && typeof block.text === "string").map((block) => block.text).join("\n");
}
function summaryFromResult(raw) {
  const output = typeof raw.output === "string" ? raw.output : void 0;
  if (output) return output.slice(0, 200);
  const error = typeof raw.error === "string" ? raw.error : void 0;
  return error ? error.slice(0, 200) : void 0;
}
function recordFromResult(raw) {
  if (typeof raw.id !== "string" || !raw.id) return null;
  const usage = usageRecord(raw.usage);
  return {
    id: raw.id,
    agent: typeof raw.agent === "string" ? raw.agent : "task",
    agentSource: agentSource(raw.agentSource),
    status: statusFromResult(raw),
    source: "task-result",
    index: asFiniteNumber(raw.index),
    task: typeof raw.task === "string" ? raw.task : void 0,
    assignment: typeof raw.assignment === "string" ? raw.assignment : void 0,
    description: typeof raw.description === "string" ? raw.description : void 0,
    lastIntent: typeof raw.lastIntent === "string" ? raw.lastIntent : void 0,
    resolvedModel: typeof raw.resolvedModel === "string" ? raw.resolvedModel : void 0,
    resolvedModelIsFallback: raw.resolvedModelIsFallback === true ? true : void 0,
    modelRole: typeof raw.modelRole === "string" ? raw.modelRole : void 0,
    startedAt: asTimestamp(raw.startedAt),
    endedAt: asTimestamp(raw.endedAt),
    durationMs: asDuration(raw.durationMs),
    tokens: asFiniteNumber(raw.tokens) ?? usageTokens(usage),
    requests: asFiniteNumber(raw.requests),
    contextTokens: asFiniteNumber(raw.contextTokens),
    contextWindow: asFiniteNumber(raw.contextWindow),
    cost: usageCost(usage),
    resultSummary: summaryFromResult(raw)
  };
}
function recordFromProgress(raw) {
  if (typeof raw.id !== "string" || !raw.id) return null;
  const duration = asDuration(raw.durationMs);
  return {
    id: raw.id,
    agent: typeof raw.agent === "string" ? raw.agent : "task",
    agentSource: agentSource(raw.agentSource),
    // AgentProgress.status is a live snapshot, not a durable terminal result.
    // On resume it cannot prove that the child is still running or completed.
    status: "unknown",
    source: "task-result",
    index: asFiniteNumber(raw.index),
    task: typeof raw.task === "string" ? raw.task : void 0,
    assignment: typeof raw.assignment === "string" ? raw.assignment : void 0,
    description: typeof raw.description === "string" ? raw.description : void 0,
    lastIntent: typeof raw.lastIntent === "string" ? raw.lastIntent : void 0,
    resolvedModel: typeof raw.resolvedModel === "string" ? raw.resolvedModel : void 0,
    resolvedModelIsFallback: raw.resolvedModelIsFallback === true ? true : void 0,
    modelRole: typeof raw.modelRole === "string" ? raw.modelRole : void 0,
    // OMP initializes durationMs to 0 before execution. That is not a measured
    // runtime duration, so omit it until a settled notification.
    durationMs: duration !== void 0 && duration > 0 ? duration : void 0,
    tokens: asFiniteNumber(raw.tokens),
    requests: asFiniteNumber(raw.requests),
    contextTokens: asFiniteNumber(raw.contextTokens),
    contextWindow: asFiniteNumber(raw.contextWindow),
    cost: asFiniteNumber(raw.cost)
  };
}
function asyncJobsFromEntry(entry) {
  let customType;
  let details;
  if (entry.type === "message" && entry.message?.role === "custom") {
    customType = entry.message.customType;
    details = entry.message.details;
  } else if (entry.type === "custom_message") {
    customType = entry.customType;
    details = entry.details;
  }
  if (customType !== "async-result" || !isRecord(details) || !Array.isArray(details.jobs)) return [];
  return details.jobs.filter(isRecord);
}
function recordFromAsyncJob(raw, existing) {
  if (typeof raw.jobId !== "string" || !raw.jobId) return null;
  const label = typeof raw.label === "string" && raw.label ? raw.label : void 0;
  return {
    id: raw.jobId,
    agent: existing?.agent ?? label ?? "task",
    agentSource: existing?.agentSource ?? "bundled",
    status: "unknown",
    source: "async-result",
    index: existing?.index,
    description: existing?.description ?? label,
    durationMs: asDuration(raw.durationMs),
    task: existing?.task,
    assignment: existing?.assignment,
    modelRole: existing?.modelRole,
    resolvedModel: existing?.resolvedModel,
    resolvedModelIsFallback: existing?.resolvedModelIsFallback
  };
}
function terminalStatusFromChild(message) {
  const stopReason = message?.stopReason;
  if (stopReason === "aborted") return "aborted";
  if (stopReason === "error") return "failed";
  if (stopReason === "stop" || stopReason === "length") return "completed";
  return "unknown";
}
async function recordFromChildSession(artifactsDir, id, existing) {
  const childFile = path.join(artifactsDir, `${id}.jsonl`);
  if (path.dirname(childFile) !== artifactsDir) return null;
  let text;
  try {
    text = await fs$1.readFile(childFile, "utf8");
  } catch {
    return null;
  }
  const activePath = resolveActivePath(parseSessionEntries(text));
  const init = activePath.find((entry) => entry.type === "session_init");
  const assistantEntries = activePath.filter(
    (entry) => entry.type === "message" && entry.message?.role === "assistant"
  );
  const assistantMessages = assistantEntries.map((entry) => entry.message);
  const finalAssistant = assistantMessages[assistantMessages.length - 1];
  let tokens = 0;
  let hasTokens = false;
  let cost = 0;
  let hasCost = false;
  let contextTokens;
  for (const message of assistantMessages) {
    const usage = usageRecord(message.usage);
    const messageTokens = usageTokens(usage);
    if (messageTokens !== void 0) {
      tokens += messageTokens;
      hasTokens = true;
    }
    const messageCost = usageCost(usage);
    if (messageCost !== void 0) {
      cost += messageCost;
      hasCost = true;
    }
    contextTokens = asFiniteNumber(usage?.contextTokens) ?? asFiniteNumber(usage?.totalTokens) ?? contextTokens;
  }
  const record = {
    id,
    agent: typeof init?.agent === "string" && init.agent ? init.agent : existing.agent,
    agentSource: existing.agentSource,
    status: terminalStatusFromChild(finalAssistant),
    source: "child-session",
    index: existing.index,
    task: typeof init?.task === "string" ? init.task : existing.task,
    assignment: existing.assignment,
    description: existing.description,
    lastIntent: existing.lastIntent,
    resolvedModel: typeof init?.resolvedModel === "string" ? init.resolvedModel : existing.resolvedModel,
    resolvedModelIsFallback: existing.resolvedModelIsFallback,
    modelRole: typeof init?.modelRole === "string" ? init.modelRole : existing.modelRole,
    // These timestamps are retained only when OMP wrote an explicit timestamp
    // on the corresponding child entry. No Date.now() fallback is allowed.
    startedAt: asTimestamp(init?.timestamp),
    endedAt: asTimestamp(assistantEntries[assistantEntries.length - 1]?.timestamp),
    tokens: hasTokens ? tokens : void 0,
    requests: assistantMessages.length > 0 ? assistantMessages.length : void 0,
    contextTokens,
    cost: hasCost ? cost : void 0,
    resultSummary: finalAssistant ? textFromContent(finalAssistant.content).slice(0, 200) || void 0 : void 0
  };
  return record;
}
function mergeRecord(existing, incoming) {
  if (!existing) return incoming;
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== void 0) merged[key] = value;
  }
  if (incoming.status === "unknown" && existing.status !== "unknown") merged.status = existing.status;
  return merged;
}
async function reconstructHistoricalAgents(sessionFile) {
  let text;
  try {
    text = await fs$1.readFile(sessionFile, "utf8");
  } catch {
    return [];
  }
  const activePath = resolveActivePath(parseSessionEntries(text));
  const byId = /* @__PURE__ */ new Map();
  for (const entry of activePath) {
    if (entry.type === "message") {
      const msg = entry.message;
      if (msg?.role === "toolResult" && (msg.toolName === "task" || msg.name === "task")) {
        const details = isRecord(msg.details) ? msg.details : void 0;
        if (details) {
          if (Array.isArray(details.results)) {
            for (const raw of details.results.filter(isRecord)) {
              const record = recordFromResult(raw);
              if (record) byId.set(record.id, mergeRecord(byId.get(record.id), record));
            }
          }
          if (Array.isArray(details.progress)) {
            for (const raw of details.progress.filter(isRecord)) {
              const record = recordFromProgress(raw);
              if (record) byId.set(record.id, mergeRecord(byId.get(record.id), record));
            }
          }
        }
      }
    }
    for (const raw of asyncJobsFromEntry(entry)) {
      const record = recordFromAsyncJob(raw, typeof raw.jobId === "string" ? byId.get(raw.jobId) : void 0);
      if (record) byId.set(record.id, mergeRecord(byId.get(record.id), record));
    }
  }
  const artifactsDir = sessionFile.endsWith(".jsonl") ? sessionFile.slice(0, -".jsonl".length) : void 0;
  if (artifactsDir) {
    for (const [id, existing] of byId) {
      const child = await recordFromChildSession(artifactsDir, id, existing);
      if (child) byId.set(id, mergeRecord(existing, child));
    }
  }
  return Array.from(byId.values());
}
function defaultPiAgentDir(cliCommand = detectCli().command) {
  const dir = cliCommand === "omp" ? ".omp" : ".pi";
  return path.join(os.homedir(), dir, "agent");
}
function readPiSettings(piAgentDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(piAgentDir, "settings.json"), "utf-8"));
  } catch {
    return {};
  }
}
function writePiSettings(piAgentDir, settings) {
  const target = path.join(piAgentDir, "settings.json");
  const tmp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + "\n", "utf-8");
  fs.renameSync(tmp, target);
}
function machineSkillsDir() {
  return path.join(os.homedir(), ".agents", "skills");
}
function listMachineSkillNames(dir = machineSkillsDir()) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name).sort();
  } catch {
    return [];
  }
}
function syncMachineSkills(enabled, piAgentDir = defaultPiAgentDir(), skillsDir = machineSkillsDir()) {
  const names = listMachineSkillNames(skillsDir);
  if (names.length === 0) return [];
  const settings = readPiSettings(piAgentDir);
  const current = Array.isArray(settings.skills) ? settings.skills.filter((s) => typeof s === "string") : [];
  const managed = names.map((n) => `!${n}`);
  const kept = current.filter((s) => !managed.includes(s));
  const next = enabled ? kept : [...kept, ...managed.filter((m) => !kept.includes(m))];
  if (next.length === 0) delete settings.skills;
  else settings.skills = next;
  writePiSettings(piAgentDir, settings);
  return enabled ? [] : names;
}
const THINKING_LEVELS = /* @__PURE__ */ new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);
const TRUST_MODES = /* @__PURE__ */ new Set(["ask", "always", "never"]);
function getModelConfig(piAgentDir = defaultPiAgentDir()) {
  const settings = readPiSettings(piAgentDir);
  return {
    defaultProvider: typeof settings.defaultProvider === "string" ? settings.defaultProvider : "",
    defaultModel: typeof settings.defaultModel === "string" ? settings.defaultModel : "",
    defaultThinkingLevel: THINKING_LEVELS.has(settings.defaultThinkingLevel ?? "") ? settings.defaultThinkingLevel : "",
    projectTrust: TRUST_MODES.has(settings.defaultProjectTrust ?? "") ? settings.defaultProjectTrust : "ask",
    authProviders: listAuthProviders(piAgentDir)
  };
}
function setModelConfig(patch, piAgentDir = defaultPiAgentDir()) {
  const settings = readPiSettings(piAgentDir);
  const apply = (key, value) => {
    if (value === void 0) return;
    if (value.trim() === "") delete settings[key];
    else settings[key] = value.trim();
  };
  apply("defaultProvider", patch.defaultProvider);
  apply("defaultModel", patch.defaultModel);
  apply("defaultThinkingLevel", patch.defaultThinkingLevel);
  if (patch.projectTrust !== void 0) {
    if (!TRUST_MODES.has(patch.projectTrust)) {
      return { ok: false, log: `invalid project trust mode: ${patch.projectTrust}` };
    }
    settings.defaultProjectTrust = patch.projectTrust;
  }
  try {
    writePiSettings(piAgentDir, settings);
    return { ok: true, log: "" };
  } catch (err) {
    return { ok: false, log: err instanceof Error ? err.message : String(err) };
  }
}
function authPath(piAgentDir) {
  return path.join(piAgentDir, "auth.json");
}
function readAuth(piAgentDir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(authPath(piAgentDir), "utf-8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function writeAuth(piAgentDir, auth) {
  const target = authPath(piAgentDir);
  const tmp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(auth, null, 2) + "\n", { mode: 384 });
  fs.chmodSync(tmp, 384);
  fs.renameSync(tmp, target);
}
function listAuthProviders(piAgentDir = defaultPiAgentDir()) {
  return Object.keys(readAuth(piAgentDir)).sort();
}
const PROVIDER_ID = /^[a-z0-9][a-z0-9-]*$/;
function setApiKey(provider, key, piAgentDir = defaultPiAgentDir()) {
  if (!PROVIDER_ID.test(provider)) {
    return { ok: false, log: `invalid provider id: ${provider}` };
  }
  if (!key.trim() || key.length > 1e3) {
    return { ok: false, log: "invalid api key" };
  }
  const auth = readAuth(piAgentDir);
  const existing = auth[provider];
  if (existing && existing.type && existing.type !== "api_key") {
    return { ok: false, log: `${provider} uses ${existing.type} auth; use pi /logout first` };
  }
  auth[provider] = { type: "api_key", key: key.trim() };
  try {
    writeAuth(piAgentDir, auth);
    return { ok: true, log: "" };
  } catch (err) {
    return { ok: false, log: err instanceof Error ? err.message : String(err) };
  }
}
function clearApiKey(provider, piAgentDir = defaultPiAgentDir()) {
  if (!PROVIDER_ID.test(provider)) {
    return { ok: false, log: `invalid provider id: ${provider}` };
  }
  const auth = readAuth(piAgentDir);
  if (!(provider in auth)) return { ok: true, log: "" };
  delete auth[provider];
  try {
    writeAuth(piAgentDir, auth);
    return { ok: true, log: "" };
  } catch (err) {
    return { ok: false, log: err instanceof Error ? err.message : String(err) };
  }
}
const TITLE_SCAN_BYTES = 256 * 1024;
const UNTITLED = "Untitled";
function sessionsRoot(agentDir = defaultPiAgentDir()) {
  return path.join(agentDir, "sessions");
}
function sessionDirFor(projectDir, agentDir = defaultPiAgentDir()) {
  let resolved;
  try {
    resolved = fs.realpathSync(projectDir);
  } catch {
    resolved = path.resolve(projectDir);
  }
  const dirName = `--${resolved.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
  return path.join(sessionsRoot(agentDir), dirName);
}
function currentSessionDirFor(projectDir, agentDir = defaultPiAgentDir()) {
  let resolved;
  try {
    resolved = fs.realpathSync(projectDir);
  } catch {
    resolved = path.resolve(projectDir);
  }
  if (process.platform === "darwin" && resolved.startsWith("/private/")) {
    const withoutPrivate = resolved.slice("/private".length);
    try {
      if (fs.realpathSync(resolved) === fs.realpathSync(withoutPrivate)) resolved = withoutPrivate;
    } catch {
    }
  }
  const home = (() => {
    try {
      return fs.realpathSync(os.homedir());
    } catch {
      return path.resolve(os.homedir());
    }
  })();
  const relative = path.relative(home, resolved);
  const slug = relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : resolved.replace(/^[/\\]/, "");
  return path.join(sessionsRoot(agentDir), `-${slug.replace(/[/\\:]/g, "-")}`);
}
function sessionDirCandidatesFor(projectDir, agentDir = defaultPiAgentDir()) {
  return Array.from(/* @__PURE__ */ new Set([currentSessionDirFor(projectDir, agentDir), sessionDirFor(projectDir, agentDir)]));
}
function isSessionFilePath(filePath, agentDir = defaultPiAgentDir()) {
  if (typeof filePath !== "string" || !filePath.endsWith(".jsonl")) return false;
  const root = path.resolve(sessionsRoot(agentDir));
  const resolved = path.resolve(filePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return false;
  try {
    const rootReal = fs.realpathSync(root);
    const fileReal = fs.realpathSync(resolved);
    return fileReal === rootReal || fileReal.startsWith(rootReal + path.sep);
  } catch {
    return true;
  }
}
async function readHead(filePath, bytes) {
  const fh = await fs$1.open(filePath, "r");
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, 0);
    return buf.toString("utf-8", 0, bytesRead);
  } finally {
    await fh.close();
  }
}
function textContentOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const block of content) {
    if (block?.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join("\n");
}
async function parseSessionFile(filePath) {
  let head;
  try {
    head = await readHead(filePath, TITLE_SCAN_BYTES);
  } catch {
    return null;
  }
  const lines = head.split("\n");
  let header = null;
  let headerIndex = -1;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    if (!lines[i].trim()) continue;
    let candidate;
    try {
      candidate = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (candidate?.type === "session" && typeof candidate.id === "string") {
      header = { id: candidate.id, timestamp: candidate.timestamp, cwd: candidate.cwd };
      headerIndex = i;
      break;
    }
  }
  if (!header) return null;
  let timestamp = typeof header.timestamp === "number" ? header.timestamp : Date.parse(String(header.timestamp));
  if (!Number.isFinite(timestamp)) {
    timestamp = await fs$1.stat(filePath).then((s) => s.mtimeMs, () => 0);
  }
  let title = UNTITLED;
  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry?.type === "message" && entry.message?.role === "user") {
      const text = textContentOf(entry.message.content).replace(/\s+/g, " ").trim();
      if (text) {
        title = text.slice(0, 80);
        break;
      }
    }
  }
  return {
    uuid: header.id,
    filePath,
    title,
    timestamp,
    cwd: typeof header.cwd === "string" ? header.cwd : ""
  };
}
async function listSessionHistory(projectDir, agentDir) {
  const out = [];
  const seenFiles = /* @__PURE__ */ new Set();
  for (const dir of sessionDirCandidatesFor(projectDir, agentDir)) {
    let names;
    try {
      names = await fs$1.readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(".jsonl")) continue;
      const filePath = path.join(dir, name);
      if (seenFiles.has(filePath)) continue;
      seenFiles.add(filePath);
      const info = await parseSessionFile(filePath);
      if (info) out.push(info);
    }
  }
  out.sort((a, b) => b.timestamp - a.timestamp);
  return out;
}
async function deleteSessionFile(filePath, agentDir) {
  if (!isSessionFilePath(filePath, agentDir)) return false;
  try {
    await fs$1.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}
const ZH_REPLY_PROMPT = "Always respond in Simplified Chinese (简体中文), unless the user explicitly writes in another language.";
function buildLanguageArgs(language) {
  return language === "zh" ? ["--append-system-prompt", ZH_REPLY_PROMPT] : [];
}
let cliInfoCache = null;
let capabilitiesCache = null;
let pendingHandshake = null;
function detectCli() {
  if (cliInfoCache) return cliInfoCache;
  for (const cmd of ["omp", "pi"]) {
    const candidate = findExecutable(cmd);
    if (candidate) {
      cliInfoCache = { command: cmd, path: candidate, available: true };
      return cliInfoCache;
    }
  }
  return { command: "omp", available: false };
}
function invalidateCliCache() {
  cliInfoCache = null;
  capabilitiesCache = null;
  pendingHandshake = null;
}
function executableSearchDirs() {
  const dirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const home = os.homedir();
  dirs.push(
    "/opt/homebrew/bin",
    "/usr/local/bin",
    path.join(home, ".local", "bin"),
    path.join(home, ".npm-global", "bin"),
    path.join(home, "bin")
  );
  return Array.from(new Set(dirs));
}
function findExecutable(cmd) {
  for (const dir of executableSearchDirs()) {
    const full = path.join(dir, cmd);
    try {
      if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue;
      fs.accessSync(full, fs.constants.X_OK);
      return full;
    } catch {
      continue;
    }
  }
  return null;
}
const VERSION_PROBE_TIMEOUT_MS = 5e3;
function probeCliVersion(cli) {
  if (!cli.available) return Promise.resolve(null);
  return new Promise((resolve) => {
    node_child_process.execFile(
      cli.path ?? cli.command,
      ["--version"],
      { timeout: VERSION_PROBE_TIMEOUT_MS, maxBuffer: 64 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          resolve(null);
          return;
        }
        const match = `${stdout}
${stderr}`.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/);
        resolve(match ? match[0] : null);
      }
    );
  });
}
function featureMatrix(enabled) {
  return {
    steering: enabled,
    followUp: enabled,
    images: enabled,
    compaction: enabled,
    extensionUi: enabled,
    fork: enabled,
    thinking: enabled
  };
}
const SUBAGENT_CAPABILITY_DEFAULTS = {
  subagents: "unknown",
  subagentProgress: "unknown",
  subagentMessages: "unknown",
  subagentControl: "unsupported"
};
function handshakeFacts(outcome) {
  return {
    protocol: outcome.protocolVersion,
    profile: outcome.profile,
    ...outcome.runtimeProtocols ? { protocolVersions: outcome.runtimeProtocols } : {},
    ...outcome.maxFrameBytes !== void 0 ? { maxFrameBytes: outcome.maxFrameBytes } : {},
    ...outcome.maxReassembledFrameBytes !== void 0 ? { maxReassembledFrameBytes: outcome.maxReassembledFrameBytes } : {}
  };
}
async function getCapabilities() {
  if (capabilitiesCache) return capabilitiesCache;
  const cli = detectCli();
  const cliVersion = await probeCliVersion(cli);
  capabilitiesCache = {
    cliVersion,
    protocol: pendingHandshake?.protocolVersion ?? 1,
    ...pendingHandshake ? handshakeFacts(pendingHandshake) : {},
    ...featureMatrix(cliVersion !== null),
    ...SUBAGENT_CAPABILITY_DEFAULTS
  };
  return capabilitiesCache;
}
function noteHandshake(outcome) {
  pendingHandshake = outcome;
  if (!capabilitiesCache) return;
  capabilitiesCache = { ...capabilitiesCache, ...handshakeFacts(outcome) };
}
function noteSessionState(_state) {
  if (!capabilitiesCache) return;
  capabilitiesCache = { ...capabilitiesCache, ...featureMatrix(true) };
}
function noteSubagentCapability(patch) {
  if (capabilitiesCache) {
    capabilitiesCache = { ...capabilitiesCache, ...patch };
  }
}
function outcomeState(outcome) {
  switch (outcome.kind) {
    case "success":
    case "command-error":
      return "supported";
    case "unsupported":
      return "unsupported";
    case "unknown":
      return "unknown";
  }
}
function noteSubagentCapabilityOutcome(field, outcome) {
  const state = outcomeState(outcome);
  if (state === "unknown") return;
  noteSubagentCapability({ [field]: state });
}
function resolveSubprocessEnv(mode, overrides = {}) {
  return mode === "replace" ? { ...overrides } : { ...process.env, ...overrides };
}
function approvalExtensionPath() {
  return electron.app.isPackaged ? path.join(process.resourcesPath, "omp-approval", "index.ts") : path.join(electron.app.getAppPath(), "resources", "omp-approval", "index.ts");
}
function approvalConfigPath(sessionId) {
  return path.join(electron.app.getPath("userData"), `omp-approval-config-${sessionId}.json`);
}
function writeApprovalConfig(sessionId, config) {
  const file = approvalConfigPath(sessionId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
  return file;
}
function removeApprovalConfig(sessionId) {
  try {
    fs.unlinkSync(approvalConfigPath(sessionId));
  } catch {
  }
}
function resolvePermissionMode(mode) {
  switch (mode) {
    case "no-bash":
      return { excludeTools: "bash", approval: { mode: "off" } };
    case "readonly":
      return { excludeTools: "bash,edit,write", approval: { mode: "off" } };
    case "ask":
      return { excludeTools: null, approval: { mode: "writes", locale: getStore("language") } };
    case "full":
    default:
      return { excludeTools: null, approval: { mode: "off" } };
  }
}
const OMP_READONLY_TOOLS = ["read", "grep", "glob", "lsp", "inspect_image", "web_search", "todo"];
const OMP_NO_BASH_TOOLS = [...OMP_READONLY_TOOLS, "edit", "write", "notebook", "browser"];
function resolvePermissionModeCurrent(mode) {
  switch (mode) {
    case "no-bash":
      return { tools: OMP_NO_BASH_TOOLS.join(","), approvalMode: "yolo" };
    case "readonly":
      return { tools: OMP_READONLY_TOOLS.join(","), approvalMode: "yolo" };
    case "ask":
      return { approvalMode: "always-ask" };
    case "full":
    default:
      return { approvalMode: "yolo" };
  }
}
function planSpawn(sessionId, cli, opts) {
  const args = ["--mode", "rpc"];
  const isCurrent = cli.command === "omp";
  let approval = { mode: "off" };
  if (isCurrent) {
    const plan = resolvePermissionModeCurrent(opts.permissionMode);
    if (plan.tools) args.push("--tools", plan.tools);
    if (plan.approvalMode) args.push("--approval-mode", plan.approvalMode);
  } else {
    const legacy = resolvePermissionMode(opts.permissionMode);
    approval = legacy.approval;
    if (legacy.excludeTools) {
      args.push("--exclude-tools", legacy.excludeTools);
    }
    const approvalExtension = approvalExtensionPath();
    if (fs.existsSync(approvalExtension)) {
      args.push("-e", approvalExtension);
    }
  }
  if (opts.resumeSessionPath) {
    args.push("--session", opts.resumeSessionPath);
  }
  if (opts.modelSelector) {
    args.push("--model", opts.modelSelector);
  }
  if (opts.thinkingLevel) {
    args.push("--thinking", opts.thinkingLevel);
  }
  args.push(...buildLanguageArgs(opts.language));
  const approvalConfigFile = writeApprovalConfig(sessionId, approval);
  return {
    command: cli.path ?? cli.command,
    args,
    env: resolveSubprocessEnv(opts.envMode ?? "inherit", {
      PATH: executableSearchDirs().join(path.delimiter),
      HOME: os.homedir(),
      FORCE_COLOR: "0",
      OMP_APPROVAL_CONFIG: approvalConfigFile
    }),
    approvalConfigFile
  };
}
function spawnProcess(plan, cwd) {
  return node_child_process.spawn(plan.command, plan.args, { cwd, env: plan.env });
}
const MAX_LINE_BYTES = 16 * 1024 * 1024;
const MAX_RPC_FRAME_BYTES = 1024 * 1024;
const MAX_RPC_REASSEMBLED_BYTES = 64 * 1024 * 1024;
const RPC_CHUNK_PAYLOAD_BYTES = 256 * 1024;
class LineReader {
  decoder = new node_string_decoder.StringDecoder("utf8");
  buffer = "";
  /** Byte length of `buffer` (tracked incrementally; byteLength is O(n)). */
  pendingBytes = 0;
  /** Dropping the remainder of an oversize line until its LF arrives. */
  dropping = false;
  push(chunk) {
    const events = [];
    let text = this.decoder.write(chunk);
    if (this.dropping) {
      const idx = text.indexOf("\n");
      if (idx === -1) return events;
      text = text.slice(idx + 1);
      this.dropping = false;
      this.buffer = "";
      this.pendingBytes = 0;
    }
    this.pendingBytes += chunk.length;
    const combined = this.buffer + text;
    const parts = combined.split("\n");
    this.buffer = parts.pop() ?? "";
    if (parts.length > 0) {
      this.pendingBytes = Buffer.byteLength(this.buffer, "utf8");
      for (const part of parts) {
        const line = part.endsWith("\r") ? part.slice(0, -1) : part;
        if (line.trim().length > 0) events.push({ kind: "line", line });
      }
    }
    if (this.pendingBytes > MAX_LINE_BYTES) {
      events.push({
        kind: "error",
        message: `RPC line exceeded the ${MAX_LINE_BYTES}-byte limit; dropping it`
      });
      this.buffer = "";
      this.pendingBytes = 0;
      this.dropping = true;
    }
    return events;
  }
  /** EOF: emit a residual line that never got its terminating LF. */
  flush() {
    const tail = this.decoder.end();
    const events = [];
    if (!this.dropping) {
      let rest = this.buffer + tail;
      if (rest.endsWith("\r")) rest = rest.slice(0, -1);
      if (rest.trim().length > 0) events.push({ kind: "line", line: rest });
    }
    this.buffer = "";
    this.pendingBytes = 0;
    this.dropping = false;
    return events;
  }
}
function drainLines(buffer, chunk) {
  const combined = buffer + chunk;
  const parts = combined.split("\n");
  const rest = parts.pop() || "";
  const lines = [];
  for (const part of parts) {
    const line = part.endsWith("\r") ? part.slice(0, -1) : part;
    if (line.trim().length > 0) lines.push(line);
  }
  return { lines, rest };
}
function serializeCommand(command) {
  return JSON.stringify(command) + "\n";
}
class RpcFrameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "RpcFrameError";
  }
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function decodeChunkData(data) {
  if (typeof data !== "string" || data.length === 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) {
    throw new RpcFrameError("chunk_data", "invalid rpc chunk data");
  }
  const buf = Buffer.from(data, "base64");
  if (buf.toString("base64") !== data) {
    throw new RpcFrameError("chunk_data", "invalid rpc chunk data");
  }
  return buf;
}
class RpcFrameDecoder {
  pending;
  /** Drop a half-received sequence (e.g. after EOF or a transport error). */
  reset() {
    this.pending = void 0;
  }
  push(value) {
    if (!isPlainObject(value) || value.type !== "rpc_chunk") {
      if (this.pending) {
        this.pending = void 0;
        throw new RpcFrameError("chunk_interrupted", "rpc chunk sequence interrupted");
      }
      if (!isPlainObject(value)) {
        throw new RpcFrameError("not_object", "rpc frame must be an object");
      }
      return value;
    }
    try {
      return this.pushChunk(value);
    } catch (err) {
      this.pending = void 0;
      throw err;
    }
  }
  pushChunk(frame) {
    const { chunkId, index, count, byteLength } = frame;
    const maxCount = Math.ceil(MAX_RPC_REASSEMBLED_BYTES / RPC_CHUNK_PAYLOAD_BYTES);
    if (typeof chunkId !== "string" || chunkId.length === 0 || chunkId.length > 128 || !Number.isSafeInteger(index) || !Number.isSafeInteger(count) || !Number.isSafeInteger(byteLength) || index < 0 || count < 2 || count > maxCount || index >= count || byteLength < MAX_RPC_FRAME_BYTES || byteLength > MAX_RPC_REASSEMBLED_BYTES) {
      throw new RpcFrameError("chunk_metadata", "invalid rpc chunk metadata");
    }
    const payload = decodeChunkData(frame.data);
    if (payload.byteLength > RPC_CHUNK_PAYLOAD_BYTES) {
      throw new RpcFrameError("chunk_payload_size", "rpc chunk payload exceeds the transport limit");
    }
    if (!this.pending) {
      if (index !== 0) {
        throw new RpcFrameError("chunk_sequence", "rpc chunk sequence must start at index 0");
      }
      this.pending = {
        chunkId,
        count,
        byteLength,
        nextIndex: 0,
        chunks: [],
        receivedBytes: 0
      };
    }
    const seq = this.pending;
    if (seq.chunkId !== chunkId || seq.count !== count || seq.byteLength !== byteLength || seq.nextIndex !== index) {
      throw new RpcFrameError("chunk_sequence", "rpc chunk sequence mismatch");
    }
    seq.chunks.push(payload);
    seq.receivedBytes += payload.byteLength;
    seq.nextIndex++;
    if (seq.receivedBytes > seq.byteLength) {
      throw new RpcFrameError("chunk_length", "rpc chunk sequence exceeds declared length");
    }
    if (seq.nextIndex < seq.count) return void 0;
    if (seq.receivedBytes !== seq.byteLength) {
      throw new RpcFrameError("chunk_length", "rpc chunk sequence length mismatch");
    }
    this.pending = void 0;
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(seq.chunks));
    } catch {
      throw new RpcFrameError("chunk_utf8", "rpc chunk payload is not valid UTF-8");
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new RpcFrameError("chunk_json", "rpc chunk payload is not valid JSON");
    }
    if (!isPlainObject(parsed)) {
      throw new RpcFrameError("not_object", "rpc frame must be an object");
    }
    return parsed;
  }
}
class StderrRing {
  constructor(maxChars = 1e4) {
    this.maxChars = maxChars;
  }
  buffer = "";
  push(chunk) {
    this.buffer += typeof chunk === "string" ? chunk : chunk.toString("utf-8");
    if (this.buffer.length > this.maxChars) {
      this.buffer = this.buffer.slice(-this.maxChars);
    }
  }
  /** Last `maxLines` lines of the captured output ('' when empty). */
  tail(maxLines = 3) {
    return this.buffer.trim().split("\n").slice(-maxLines).join("\n");
  }
}
const GUI_SUPPORTED_PROTOCOLS = [1, 2];
const MIN_DECLARED_LIMIT = 1024;
const MAX_DECLARED_LIMIT = 1024 * 1024 * 1024;
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseLimit(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= MIN_DECLARED_LIMIT && value <= MAX_DECLARED_LIMIT ? value : void 0;
}
function parseReadyFrame(frame) {
  const raw = frame.supportedProtocolVersions;
  const runtimeProtocols = Array.isArray(raw) ? Array.from(new Set(raw.filter((v) => Number.isSafeInteger(v)))).sort(
    (a, b) => a - b
  ) : [];
  if (runtimeProtocols.length === 0) return null;
  return {
    runtimeProtocols,
    maxFrameBytes: parseLimit(frame.maxFrameBytes),
    maxReassembledFrameBytes: parseLimit(frame.maxReassembledFrameBytes)
  };
}
class OmpHandshake {
  state = "bootstrapping";
  /** Request id of the in-flight negotiate_protocol command. */
  negotiateId = null;
  outcome = null;
  failure = null;
  get currentState() {
    return this.state;
  }
  /** Settled outcome (state 'active'), or null while still opening. */
  get result() {
    return this.outcome;
  }
  /** Settled failure (state 'failed'), or null otherwise. */
  get error() {
    return this.failure;
  }
  /** The negotiated protocol once active; 1 while still opening. */
  get protocolVersion() {
    return this.outcome?.protocolVersion ?? 1;
  }
  /**
   * True while chunk frames must be rejected: the official client errors on
   * `rpc_chunk` arriving before negotiation completed, and so do we — a
   * chunk outside an active v2 session means the runtime is confused.
   */
  get chunksArmed() {
    return this.outcome?.protocolVersion === 2;
  }
  /**
   * Feed a parsed frame. Handshake frames are consumed; anything else is
   * left for normal processing (consumed === false).
   */
  handleFrame(frame, requestId) {
    switch (this.state) {
      case "bootstrapping":
        return this.bootstrap(frame, requestId);
      case "negotiating":
        return this.negotiating(frame);
      case "active":
      case "failed":
        return { consumed: false, actions: [] };
    }
  }
  bootstrap(frame, requestId) {
    if (frame.type !== "ready") {
      return this.activate({ profile: "legacy", protocolVersion: 1 }, false);
    }
    const ready = parseReadyFrame(frame);
    if (!ready) {
      this.state = "failed";
      this.failure = { message: "Oh My Pi sent a malformed RPC ready frame." };
      return { consumed: true, actions: [{ kind: "failed", failure: this.failure }] };
    }
    const common = GUI_SUPPORTED_PROTOCOLS.filter((v) => ready.runtimeProtocols.includes(v));
    if (common.length === 0) {
      this.state = "failed";
      this.failure = {
        message: "This version of Oh My Pi uses an RPC protocol that this version of OMP GUI does not support.",
        runtimeProtocols: ready.runtimeProtocols
      };
      return { consumed: true, actions: [{ kind: "failed", failure: this.failure }] };
    }
    const best = common[common.length - 1];
    const base = {
      maxFrameBytes: ready.maxFrameBytes,
      maxReassembledFrameBytes: ready.maxReassembledFrameBytes,
      runtimeProtocols: ready.runtimeProtocols
    };
    this.readyBase = base;
    if (best === 1) {
      return this.activate({ profile: "current", protocolVersion: 1, ...base }, true);
    }
    this.state = "negotiating";
    this.negotiateId = requestId();
    return {
      consumed: true,
      actions: [{ kind: "send_negotiate", protocolVersion: best }]
    };
  }
  negotiating(frame) {
    if (frame.type !== "response") return { consumed: false, actions: [] };
    if (typeof frame.id !== "string" || frame.id !== this.negotiateId) {
      return { consumed: false, actions: [] };
    }
    this.negotiateId = null;
    const data = isObject(frame.data) ? frame.data : void 0;
    if (frame.success === true && data?.protocolVersion === 2) {
      return this.activate(
        { profile: "current", protocolVersion: 2, ...this.pendingBase() },
        true
      );
    }
    return this.activate({ profile: "current", protocolVersion: 1, ...this.pendingBase() }, true);
  }
  /** The ready-frame facts captured before entering 'negotiating'. */
  readyBase = {};
  pendingBase() {
    return this.readyBase;
  }
  /**
   * Give up on an unanswered negotiation (timer lives in OmpSession): the
   * wire stays v1, which every ready-capable runtime still speaks.
   */
  negotiationTimedOut() {
    if (this.state !== "negotiating") return { consumed: false, actions: [] };
    this.negotiateId = null;
    return this.activate({ profile: "current", protocolVersion: 1, ...this.pendingBase() }, true);
  }
  activate(outcome, consumed) {
    this.state = "active";
    this.outcome = outcome;
    return { consumed, actions: [{ kind: "activated", outcome }] };
  }
}
function extractToolOutput(result) {
  if (result == null) return "";
  if (typeof result === "string") return result;
  if (typeof result === "object") {
    const content = result.content;
    if (Array.isArray(content)) {
      const text = content.map((c) => c && typeof c === "object" ? c.text : void 0).filter((t) => typeof t === "string").join("\n");
      if (text) return text;
    }
    try {
      return JSON.stringify(result, null, 2);
    } catch {
      return String(result);
    }
  }
  return String(result);
}
function systemMessage(sessionId, content) {
  return {
    kind: "event",
    event: { type: "message", sessionId, role: "system", content }
  };
}
function normalizeRpcFrame(payload, sessionId) {
  switch (payload.type) {
    case "response": {
      if (payload.success === false) {
        return {
          kind: "command_failed",
          id: typeof payload.id === "string" ? payload.id : void 0,
          command: typeof payload.command === "string" ? payload.command : void 0,
          message: String(payload.error ?? "Unknown RPC error"),
          code: typeof payload.code === "string" ? payload.code : void 0
        };
      }
      return { kind: "none" };
    }
    case "prompt_result":
      return {
        kind: "prompt_result",
        id: typeof payload.id === "string" ? payload.id : void 0,
        agentInvoked: payload.agentInvoked === true
      };
    case "command_output":
      return systemMessage(sessionId, String(payload.text ?? ""));
    case "message_update": {
      const ev = payload.assistantMessageEvent;
      if (ev?.type === "text_delta" && typeof ev.delta === "string") {
        return {
          kind: "event",
          event: { type: "message", sessionId, role: "assistant", content: ev.delta }
        };
      }
      if (ev?.type === "thinking_delta" && typeof ev.delta === "string") {
        return {
          kind: "event",
          event: { type: "thinking", sessionId, delta: ev.delta }
        };
      }
      return { kind: "none" };
    }
    case "message_end": {
      const msg = payload.message;
      if (msg?.role === "assistant" && msg.stopReason === "error" && msg.errorMessage) {
        return {
          kind: "event",
          event: {
            type: "error",
            sessionId,
            // First line only — provider errors often append a raw JSON body.
            message: msg.errorMessage.split("\n")[0].slice(0, 300)
          }
        };
      }
      return { kind: "none" };
    }
    case "tool_execution_start":
      return {
        kind: "event",
        event: {
          type: "tool_call",
          sessionId,
          id: typeof payload.toolCallId === "string" ? payload.toolCallId : void 0,
          tool: String(payload.toolName ?? "tool"),
          input: payload.args
        }
      };
    case "tool_execution_update":
      return { kind: "none" };
    case "tool_execution_end":
      return {
        kind: "event",
        event: {
          type: "tool_result",
          sessionId,
          id: typeof payload.toolCallId === "string" ? payload.toolCallId : void 0,
          tool: String(payload.toolName ?? "tool"),
          output: extractToolOutput(payload.result),
          isError: Boolean(payload.isError)
        }
      };
    case "extension_ui_request": {
      const method = String(payload.method ?? "");
      if (method === "cancel") {
        return typeof payload.targetId === "string" ? { kind: "extension_ui_cancel", targetId: payload.targetId } : { kind: "none" };
      }
      if (method === "open_url") {
        return typeof payload.url === "string" ? {
          kind: "open_url",
          url: payload.url,
          launchUrl: typeof payload.launchUrl === "string" ? payload.launchUrl : void 0,
          instructions: typeof payload.instructions === "string" ? payload.instructions : void 0
        } : { kind: "none" };
      }
      if (method === "notify") {
        return systemMessage(sessionId, String(payload.message ?? ""));
      }
      if (method === "select" || method === "confirm" || method === "input" || method === "editor") {
        return {
          kind: "extension_ui",
          id: String(payload.id ?? ""),
          method,
          title: String(payload.title ?? ""),
          message: typeof payload.message === "string" ? payload.message : void 0,
          options: Array.isArray(payload.options) ? payload.options.map((o) => String(o)) : void 0,
          placeholder: typeof payload.placeholder === "string" ? payload.placeholder : void 0,
          prefill: typeof payload.prefill === "string" ? payload.prefill : void 0,
          timeout: typeof payload.timeout === "number" ? payload.timeout : void 0
        };
      }
      return { kind: "none" };
    }
    case "extension_error":
      return {
        kind: "event",
        event: {
          type: "error",
          sessionId,
          message: `Extension error: ${String(payload.error ?? "unknown")}`
        }
      };
    case "agent_start":
      return {
        kind: "event",
        event: { type: "status", sessionId, status: "working" }
      };
    case "agent_end":
      return {
        kind: "event",
        event: {
          type: "status",
          sessionId,
          status: "idle",
          // Absent means terminal; only an explicit upstream false marks a
          // non-terminal end (async delivery will resume the session).
          isTerminal: payload.isTerminal === false ? false : true
        }
      };
    case "compaction_start":
    case "auto_compaction_start":
      return {
        kind: "event",
        event: { type: "compaction", sessionId, phase: "start" }
      };
    case "compaction_end":
    case "auto_compaction_end":
      return {
        kind: "event",
        event: { type: "compaction", sessionId, phase: "end" }
      };
    case "auto_retry_start": {
      const attempt = typeof payload.attempt === "number" ? payload.attempt : void 0;
      const max = typeof payload.maxAttempts === "number" ? payload.maxAttempts : void 0;
      const reason = typeof payload.errorMessage === "string" ? payload.errorMessage.split("\n")[0].slice(0, 200) : "";
      const progress = attempt !== void 0 && max !== void 0 ? ` (${attempt}/${max})` : "";
      return systemMessage(sessionId, `Retrying${progress}… ${reason}`.trim());
    }
    case "retry_fallback_applied":
      return systemMessage(
        sessionId,
        `Model fallback: ${String(payload.from ?? "?")} → ${String(payload.to ?? "?")}`
      );
    case "retry_fallback_succeeded":
    case "auto_retry_end":
      return { kind: "none" };
    case "thinking_level_changed":
      return {
        kind: "event",
        event: {
          type: "thinking_level_changed",
          sessionId,
          level: typeof payload.thinkingLevel === "string" ? payload.thinkingLevel : void 0
        }
      };
    case "model_changed":
      return { kind: "event", event: { type: "model_changed", sessionId } };
    case "notice":
      if (payload.level === "warning" || payload.level === "error") {
        return systemMessage(sessionId, String(payload.message ?? ""));
      }
      return { kind: "none" };
    case "subagent_lifecycle": {
      const p = asRecord(payload.payload);
      const id = asString(p.id);
      const status = normalizeSubagentStatus(p.status);
      if (!id || !status) return { kind: "none" };
      return {
        kind: "event",
        event: {
          type: "subagent",
          sessionId,
          id,
          agent: asString(p.agent) ?? "",
          agentSource: asAgentSource(p.agentSource) ?? "bundled",
          description: asString(p.description),
          status,
          phase: asLifecyclePhase(p.status),
          sessionFile: asString(p.sessionFile),
          parentToolCallId: asString(p.parentToolCallId),
          index: asNumber(p.index),
          detached: p.detached === true ? true : void 0
        }
      };
    }
    case "subagent_progress": {
      const p = asRecord(payload.payload);
      const progress = asRecord(p.progress);
      const id = asString(progress.id);
      const status = normalizeSubagentStatus(progress.status);
      if (!id || !status) return { kind: "none" };
      return {
        kind: "event",
        event: {
          type: "subagent",
          sessionId,
          id,
          agent: asString(p.agent) ?? "",
          agentSource: asAgentSource(p.agentSource) ?? "bundled",
          description: asString(progress.description),
          status,
          task: asString(p.task),
          assignment: asString(p.assignment),
          sessionFile: asString(p.sessionFile),
          parentToolCallId: asString(p.parentToolCallId),
          index: asNumber(p.index),
          detached: p.detached === true ? true : void 0,
          lastIntent: asString(progress.lastIntent),
          currentTool: asString(progress.currentTool),
          toolCount: asNumber(progress.toolCount),
          resolvedModel: asString(progress.resolvedModel),
          resolvedModelIsFallback: progress.resolvedModelIsFallback === true ? true : void 0,
          modelRole: asString(progress.modelRole),
          durationMs: asNumber(progress.durationMs),
          requests: asNumber(progress.requests),
          tokens: asNumber(progress.tokens),
          cost: asNumber(progress.cost),
          contextTokens: asNumber(progress.contextTokens),
          contextWindow: asNumber(progress.contextWindow),
          retryState: asRecord(progress.retryState),
          retryFailure: asRecord(progress.retryFailure),
          recentTools: Array.isArray(progress.recentTools) ? progress.recentTools : void 0
        }
      };
    }
    case "subagent_event":
      return { kind: "none" };
    default:
      return { kind: "none" };
  }
}
function asString(v) {
  return typeof v === "string" ? v : void 0;
}
function asNumber(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : void 0;
}
function asRecord(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}
function asAgentSource(v) {
  return v === "bundled" || v === "user" || v === "project" ? v : void 0;
}
function asLifecyclePhase(v) {
  return v === "started" || v === "completed" || v === "failed" || v === "aborted" ? v : void 0;
}
function normalizeSubagentStatus(raw) {
  switch (raw) {
    case "started":
      return "running";
    case "pending":
    case "running":
    case "completed":
    case "failed":
    case "aborted":
      return raw;
    default:
      return void 0;
  }
}
function extensionUiResponse(id, answer) {
  return JSON.stringify({ type: "extension_ui_response", id, ...answer }) + "\n";
}
class OmpSession {
  constructor(session, proc, options) {
    this.proc = proc;
    this.options = options;
    this.session = session;
    this.id = session.id;
    proc.stdout?.on("data", (chunk) => this.handleChunk(chunk));
    proc.stderr?.on("data", (chunk) => this.stderrRing.push(chunk));
    proc.on("error", (err) => this.handleProcessError(err));
    proc.on("exit", (code) => this.handleExit(code));
    this.state = "idle";
    this.emit({ type: "connected", sessionId: this.id });
  }
  session;
  id;
  state = "starting";
  pending = /* @__PURE__ */ new Map();
  /** Request ids of prompts whose ack we still expect. */
  pendingPrompts = /* @__PURE__ */ new Set();
  reader = new LineReader();
  decoder = new RpcFrameDecoder();
  handshake = new OmpHandshake();
  negotiateTimer = null;
  /** The id OmpHandshake minted for the in-flight negotiate command. */
  lastNegotiateId = null;
  stderrRing = new StderrRing();
  /** Assistant text of the in-flight turn, accumulated from text deltas. */
  draftText = "";
  /** Finalized assistant text of the last completed turn (for notifications). */
  assistantText = "";
  get runtimeState() {
    return this.state;
  }
  /** Settled handshake outcome (profile, protocol, limits), once known. */
  get handshakeOutcome() {
    return this.handshake.result;
  }
  /** Assistant text produced by the session's last completed turn ('' if none). */
  get lastAssistantText() {
    return this.assistantText;
  }
  get alive() {
    return this.state !== "closed" && this.state !== "failed";
  }
  emit(event) {
    this.options.onEvent(event);
  }
  /** Debug-only log channel (never carries user content). */
  debug(message) {
    this.options.onDebug?.(message);
  }
  // ---------------------------------------------------------------- stdin
  write(payload) {
    if (!this.alive) return false;
    this.proc.stdin?.write(serializeCommand(payload));
    return true;
  }
  /** Send a user prompt. */
  sendPrompt(text, images, streamingBehavior) {
    const id = crypto.randomUUID();
    const ok = this.write({
      id,
      type: "prompt",
      message: text,
      ...images?.length ? { images } : {},
      ...streamingBehavior ? { streamingBehavior } : {}
    });
    if (ok) this.pendingPrompts.add(id);
    return ok;
  }
  /** Ask the agent to abort the current turn; converges at agent_end/exit. */
  abort() {
    const ok = this.write({ id: crypto.randomUUID(), type: "abort" });
    if (ok && (this.state === "working" || this.state === "waiting_for_user")) {
      this.state = "aborting";
    }
    return ok;
  }
  /** Answer (or cancel) a pending interactive extension UI dialog. */
  respondExtensionUi(requestId, answer) {
    if (!this.alive) return false;
    this.proc.stdin?.write(extensionUiResponse(requestId, answer));
    if (this.state === "waiting_for_user") {
      this.state = "working";
    }
    return true;
  }
  /** Hot-switch the model via the RPC set_model command. */
  setModel(provider, modelId) {
    return this.write({ id: crypto.randomUUID(), type: "set_model", provider, modelId });
  }
  /** Enable/disable the subagent event subscription (current profile only). */
  async setSubagentSubscription(level) {
    const res = await this.query({ type: "set_subagent_subscription", level });
    return classifyRpcResponse(
      res,
      "set_subagent_subscription",
      (data) => data && typeof data === "object" ? data : null
    );
  }
  /** Fetch the live subagent roster (`get_subagents`). */
  async getSubagents() {
    const res = await this.query({ type: "get_subagents" });
    return classifyRpcResponse(res, "get_subagents", (data) => {
      const subagents = data?.subagents;
      return Array.isArray(subagents) ? subagents : null;
    });
  }
  /**
   * Incrementally read a child agent's transcript (`get_subagent_messages`).
   * `fromByte` supports cursor-based incremental reads; a missing session file
   * returns an empty result rather than throwing (upstream contract).
   */
  async getSubagentMessages(selector) {
    const res = await this.query({ type: "get_subagent_messages", ...selector });
    return classifyRpcResponse(
      res,
      "get_subagent_messages",
      (data) => data && typeof data === "object" ? data : null
    );
  }
  /**
   * Send an RPC command and await its response, matched by request id.
   * Resolves null on timeout, dead session, or process exit.
   */
  query(command, timeoutMs = 8e3) {
    if (!this.alive) return Promise.resolve(null);
    const id = crypto.randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(null);
      }, timeoutMs);
      this.pending.set(id, { resolve, timer, commandType: String(command.type ?? "") });
      this.proc.stdin?.write(serializeCommand({ id, ...command }));
    });
  }
  /** Kill the process and close the session (renderer-initiated; no events). */
  kill() {
    if (this.state === "closed") return;
    this.state = "closed";
    this.clearNegotiateTimer();
    this.resolvePending(null);
    try {
      this.proc.kill();
    } catch {
    }
    this.options.onGone?.();
  }
  // --------------------------------------------------------------- stdout
  handleChunk(chunk) {
    if (this.state === "closed") return;
    for (const event of this.reader.push(chunk)) {
      if (event.kind === "line") {
        this.handleLine(event.line);
      } else {
        this.emit({ type: "error", sessionId: this.id, message: event.message, recoverable: true });
      }
    }
  }
  handleLine(line) {
    let frame;
    try {
      frame = JSON.parse(line);
    } catch {
      this.handleEvent({ type: "message", sessionId: this.id, role: "assistant", content: line });
      return;
    }
    if (this.handshake.currentState !== "active" && this.handshake.currentState !== "failed") {
      const step = this.handshake.handleFrame(frame, () => {
        const id = crypto.randomUUID();
        this.lastNegotiateId = id;
        return id;
      });
      for (const action of step.actions) this.applyHandshakeAction(action);
      if (step.consumed) return;
    }
    let logical;
    if (frame.type === "rpc_chunk" && !this.handshake.chunksArmed) {
      this.debug("rpc_chunk received before protocol negotiation");
      this.emit({
        type: "error",
        sessionId: this.id,
        message: "RPC chunk received before protocol negotiation",
        recoverable: true
      });
      return;
    }
    try {
      const out = this.decoder.push(frame);
      if (out === void 0) return;
      logical = out;
    } catch (err) {
      if (err instanceof RpcFrameError) {
        this.debug(`rpc frame rejected (${err.code})`);
        this.emit({
          type: "error",
          sessionId: this.id,
          message: `RPC frame rejected: ${err.message}`,
          recoverable: true
        });
        return;
      }
      throw err;
    }
    if (logical.type === "response" && typeof logical.id === "string") {
      const query = this.pending.get(logical.id);
      if (query) {
        this.pending.delete(logical.id);
        clearTimeout(query.timer);
        query.resolve(logical);
        return;
      }
      if (this.pendingPrompts.delete(logical.id)) {
        this.handlePromptAck(logical);
        return;
      }
    }
    if (logical.type === "response" && logical.success === false && typeof logical.id !== "string") {
      const commandType = parseUnknownCommandError(logical.error);
      if (commandType) {
        const matches = [...this.pending.entries()].filter(([, q]) => q.commandType === commandType);
        if (matches.length === 1) {
          const [pendingId, q] = matches[0];
          this.pending.delete(pendingId);
          clearTimeout(q.timer);
          q.resolve(logical);
          return;
        }
      }
    }
    if (logical.type === "prompt_result") {
      this.handlePromptResult({ agentInvoked: logical.agentInvoked === true });
      return;
    }
    const result = normalizeRpcFrame(logical, this.id);
    this.applyParseResult(result);
  }
  applyParseResult(result) {
    switch (result.kind) {
      case "event":
        this.handleEvent(result.event);
        return;
      case "extension_ui":
        this.emit({
          type: "ui_request",
          sessionId: this.id,
          id: result.id,
          method: result.method,
          title: result.title,
          message: result.message,
          options: result.options,
          placeholder: result.placeholder,
          prefill: result.prefill,
          timeout: result.timeout
        });
        if (this.state === "working") {
          this.state = "waiting_for_user";
        }
        return;
      case "extension_ui_cancel":
        this.emit({ type: "ui_cancel", sessionId: this.id, id: result.targetId });
        if (this.state === "waiting_for_user") {
          this.state = "working";
        }
        return;
      case "open_url":
        this.options.onOpenUrl?.(result.url, result.launchUrl, result.instructions);
        return;
      case "prompt_result":
        this.handlePromptResult({ agentInvoked: result.agentInvoked });
        return;
      case "command_failed":
        this.debug(`rpc command failed (${result.command ?? "unknown"})`);
        this.emit({ type: "error", sessionId: this.id, message: result.message, recoverable: true });
        return;
      case "none":
        return;
    }
  }
  // ------------------------------------------------------------ handshake
  applyHandshakeAction(action) {
    if (action.kind === "send_negotiate" && typeof action.protocolVersion === "number") {
      const id = this.lastNegotiateId;
      this.write({ id, type: "negotiate_protocol", protocolVersion: action.protocolVersion });
      this.clearNegotiateTimer();
      this.negotiateTimer = setTimeout(() => {
        this.negotiateTimer = null;
        const step = this.handshake.negotiationTimedOut();
        for (const a of step.actions) this.applyHandshakeAction(a);
      }, NEGOTIATE_TIMEOUT_MS);
      return;
    }
    if (action.kind === "activated" && action.outcome) {
      this.clearNegotiateTimer();
      const outcome = action.outcome;
      this.debug(
        outcome.profile === "legacy" ? "rpc profile: legacy (no ready frame)" : `rpc profile: current, protocol v${outcome.protocolVersion}`
      );
      this.options.onHandshake?.(outcome);
      return;
    }
    if (action.kind === "failed" && action.failure) {
      this.clearNegotiateTimer();
      const runtime = action.failure.runtimeProtocols?.join(", ") || "unknown";
      const gui = GUI_SUPPORTED_PROTOCOLS.join(", ");
      this.emit({
        type: "error",
        sessionId: this.id,
        message: `${action.failure.message}
Runtime supported RPC versions: ${runtime}. GUI supported RPC versions: ${gui}.`,
        recoverable: false
      });
      this.state = "failed";
      this.resolvePending(null);
      try {
        this.proc.kill();
      } catch {
      }
      this.state = "closed";
      this.emit({ type: "closed", sessionId: this.id });
      this.options.onGone?.();
    }
  }
  clearNegotiateTimer() {
    if (this.negotiateTimer) {
      clearTimeout(this.negotiateTimer);
      this.negotiateTimer = null;
    }
  }
  // -------------------------------------------------------- prompt lifecycle
  /**
   * The prompt ack arrives immediately; success does NOT mean the turn
   * finished. `data.agentInvoked === false` marks a local-only completion
   * (slash command): no agent_start/agent_end will follow.
   */
  handlePromptAck(frame) {
    if (frame.success === false) {
      this.emit({
        type: "error",
        sessionId: this.id,
        message: String(frame.error ?? "Prompt rejected"),
        recoverable: true
      });
      this.settleLocalPrompt();
      return;
    }
    const data = frame.data;
    const agentInvoked = typeof data === "object" && data !== null ? data.agentInvoked !== false : true;
    if (!agentInvoked) this.settleLocalPrompt();
  }
  handlePromptResult(frame) {
    if (!frame.agentInvoked) this.settleLocalPrompt();
  }
  /**
   * A prompt that completed locally produces no agent events. When no real
   * turn is running, emit the idle transition the renderer is waiting for
   * (its optimistic busy would otherwise stick forever, stalling the queue).
   * Mid-turn local commands change nothing: the running turn keeps working.
   */
  settleLocalPrompt() {
    if (this.state === "idle") {
      this.emit({ type: "status", sessionId: this.id, status: "idle", isTerminal: true });
    }
  }
  // ---------------------------------------------------------------- events
  handleEvent(event) {
    if (event.type === "message" && event.role === "assistant") {
      this.draftText += event.content;
    }
    if (event.type === "status" && event.status === "working") {
      if (this.state !== "working") {
        this.state = "working";
        this.emit(event);
      }
      return;
    }
    if (event.type === "status" && event.status === "idle") {
      if (event.isTerminal === false) return;
      if (this.state !== "idle") {
        this.state = "idle";
        this.finalizeDraft();
        this.emit(event);
      }
      return;
    }
    if (event.type === "error" && event.recoverable !== true) {
      this.emit(event);
      this.finalizeDraft();
      if (this.state === "working" || this.state === "aborting" || this.state === "waiting_for_user") {
        this.state = "idle";
        this.emit({ type: "status", sessionId: this.id, status: "idle" });
      }
      return;
    }
    this.emit(event);
  }
  finalizeDraft() {
    this.assistantText = this.draftText;
    this.draftText = "";
  }
  // --------------------------------------------------------- process end
  resolvePending(value) {
    for (const query of this.pending.values()) {
      clearTimeout(query.timer);
      query.resolve(value);
    }
    this.pending.clear();
    this.pendingPrompts.clear();
  }
  /** Spawn failure (ENOENT, EACCES, …). */
  handleProcessError(err) {
    if (this.state === "closed") return;
    this.clearNegotiateTimer();
    this.resolvePending(null);
    this.state = "failed";
    this.emit({
      type: "error",
      sessionId: this.id,
      message: `Failed to start ${this.options.label ?? "omp"}: ${err.message}`,
      recoverable: false
    });
    this.state = "closed";
    this.emit({ type: "closed", sessionId: this.id });
    this.options.onGone?.();
  }
  handleExit(code) {
    if (this.state === "closed") return;
    this.clearNegotiateTimer();
    for (const event of this.reader.flush()) {
      if (event.kind === "line") this.handleLine(event.line);
    }
    this.decoder.reset();
    this.resolvePending(null);
    if (code !== 0 && code !== null) {
      this.state = "failed";
      const detail = this.stderrRing.tail(3);
      this.emit({
        type: "error",
        sessionId: this.id,
        message: `omp exited with code ${code}${detail ? `
${detail}` : ""}`,
        recoverable: false
      });
    }
    this.state = "closed";
    this.emit({ type: "closed", sessionId: this.id });
    this.options.onGone?.();
  }
}
const NEGOTIATE_TIMEOUT_MS = 5e3;
function classifyRpcResponse(res, command, parse) {
  if (res === null) return { kind: "unknown" };
  if (res.success === true) {
    const data = parse(res.data);
    if (data !== null) return { kind: "success", data };
    return { kind: "unknown", error: "malformed response" };
  }
  const error = typeof res.error === "string" ? res.error : `Unknown error (${command})`;
  const code = typeof res.code === "string" ? res.code : void 0;
  if (error.startsWith("Unknown command:")) {
    return { kind: "unsupported", error, code };
  }
  return { kind: "command-error", error, code };
}
const UNKNOWN_COMMAND_RE = /^Unknown command: ([A-Za-z_][A-Za-z0-9_]*)\s*$/;
function parseUnknownCommandError(error) {
  if (typeof error !== "string") return null;
  const match = UNKNOWN_COMMAND_RE.exec(error.trim());
  return match ? match[1] : null;
}
const sessions = /* @__PURE__ */ new Map();
function listSessions() {
  return Array.from(sessions.values()).map((s) => s.session);
}
function getSession(sessionId) {
  return sessions.get(sessionId)?.session;
}
function getLastAssistantText(sessionId) {
  return sessions.get(sessionId)?.lastAssistantText ?? "";
}
function createSession(cwd, onEvent, opts) {
  const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cli = detectCli();
  if (!cli.available) {
    const errorEvent = {
      type: "error",
      sessionId: id,
      message: "Oh My Pi (omp) or Pi CLI not found. Please install omp first: https://omp.sh"
    };
    setTimeout(() => onEvent(errorEvent), 0);
    return {
      id,
      cwd,
      title: "Uninitialized",
      createdAt: Date.now(),
      status: "error"
    };
  }
  const plan = planSpawn(id, cli, {
    permissionMode: getStore("permissionMode"),
    language: getStore("language"),
    resumeSessionPath: opts?.resumeSessionPath,
    modelSelector: opts?.modelSelector,
    thinkingLevel: opts?.thinkingLevel
  });
  if (!fs.existsSync(cwd)) {
    removeApprovalConfig(id);
    const errorEvent = {
      type: "error",
      sessionId: id,
      message: `Project folder does not exist: ${cwd}`,
      recoverable: false
    };
    setTimeout(() => onEvent(errorEvent), 0);
    return {
      id,
      cwd,
      title: "Missing folder",
      createdAt: Date.now(),
      status: "error"
    };
  }
  const proc = spawnProcess(plan, cwd);
  const session = {
    id,
    cwd,
    title: path.basename(cwd) || "New Chat",
    createdAt: Date.now(),
    status: "idle",
    ...opts?.resumeSessionPath ? { resumeFrom: opts.resumeSessionPath } : {}
  };
  sessions.set(
    id,
    new OmpSession(session, proc, {
      label: cli.command,
      onEvent,
      onGone: () => sessions.delete(id),
      onHandshake: (outcome) => {
        noteHandshake(outcome);
        if (outcome.profile === "current") {
          const entry = sessions.get(id);
          if (entry) void bootstrapSubagentBridge(entry);
        }
      },
      onOpenUrl: (url, launchUrl) => {
        const target = launchUrl ?? url;
        if (/^https?:\/\//i.test(target)) void electron.shell.openExternal(target);
      },
      onDebug: (message) => {
        if (!electron.app.isPackaged) console.debug(`[omp:${id.slice(-6)}]`, message);
      }
    })
  );
  rememberRecentProject(cwd);
  return session;
}
function sendMessage(sessionId, text, images, streamingBehavior) {
  return sessions.get(sessionId)?.sendPrompt(text, images, streamingBehavior) ?? false;
}
function killSession(sessionId) {
  const entry = sessions.get(sessionId);
  if (!entry) return false;
  entry.kill();
  removeApprovalConfig(sessionId);
  return true;
}
function abortSession(sessionId) {
  return sessions.get(sessionId)?.abort() ?? false;
}
function respondExtensionUi(sessionId, requestId, answer) {
  return sessions.get(sessionId)?.respondExtensionUi(requestId, answer) ?? false;
}
function setSessionModel(sessionId, provider, modelId) {
  return sessions.get(sessionId)?.setModel(provider, modelId) ?? false;
}
async function getSubagents(sessionId) {
  const outcome = await (sessions.get(sessionId)?.getSubagents() ?? Promise.resolve({ kind: "unknown" }));
  noteSubagentCapabilityOutcome("subagents", outcome);
  return outcome.kind === "success" ? outcome.data : null;
}
async function getSubagentMessages(sessionId, selector) {
  const outcome = await (sessions.get(sessionId)?.getSubagentMessages(selector) ?? Promise.resolve({ kind: "unknown" }));
  noteSubagentCapabilityOutcome("subagentMessages", outcome);
  return outcome.kind === "success" ? outcome.data : null;
}
async function bootstrapSubagentBridge(session) {
  const outcome = await session.setSubagentSubscription("progress");
  noteSubagentCapabilityOutcome("subagentProgress", outcome);
}
function querySession(sessionId, command, timeoutMs = 8e3) {
  return sessions.get(sessionId)?.query(command, timeoutMs) ?? Promise.resolve(null);
}
async function getSessionStats(sessionId) {
  const res = await querySession(sessionId, { type: "get_session_stats" });
  if (!res || res.success !== true || !res.data) return null;
  return res.data;
}
async function listSessionCommands(sessionId) {
  let res = await querySession(sessionId, { type: "get_available_commands" });
  if (!res || res.success !== true) {
    res = await querySession(sessionId, { type: "get_commands" });
  }
  if (!res || res.success !== true || !res.data) return [];
  const raw = res.data.commands;
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const c of raw) {
    const cmd = c;
    if (typeof cmd?.name !== "string") continue;
    out.push({
      name: cmd.name,
      description: typeof cmd.description === "string" ? cmd.description : void 0,
      source: cmd.source === "extension" || cmd.source === "skill" ? cmd.source : "prompt"
    });
  }
  return out;
}
async function compactSession(sessionId) {
  const res = await querySession(sessionId, { type: "compact" }, 12e4);
  return Boolean(res && res.success === true);
}
async function steer(sessionId, message, images) {
  const res = await querySession(sessionId, {
    type: "steer",
    message,
    ...images?.length ? { images } : {}
  });
  return Boolean(res && res.success === true);
}
async function followUp(sessionId, message, images) {
  const res = await querySession(sessionId, {
    type: "follow_up",
    message,
    ...images?.length ? { images } : {}
  });
  return Boolean(res && res.success === true);
}
async function setThinkingLevel(sessionId, level) {
  const res = await querySession(sessionId, { type: "set_thinking_level", level });
  return Boolean(res && res.success === true);
}
function updateApprovalConfig(sessionId, mode) {
  const entry = sessions.get(sessionId);
  if (!entry) return false;
  if (mode !== "ask" && mode !== "full") return false;
  const { approval } = resolvePermissionMode(mode);
  writeApprovalConfig(sessionId, approval);
  return true;
}
async function exportHtml(sessionId, outputPath) {
  const res = await querySession(
    sessionId,
    { type: "export_html", ...outputPath ? { outputPath } : {} },
    3e4
  );
  if (!res || res.success !== true || !res.data) return null;
  const saved = res.data.path;
  return typeof saved === "string" ? saved : null;
}
async function getSessionState(sessionId) {
  const res = await querySession(sessionId, { type: "get_state" });
  if (!res || res.success !== true || !res.data) return null;
  const state = res.data;
  noteSessionState();
  return state;
}
async function getSessionMessages(sessionId) {
  const res = await querySession(sessionId, { type: "get_messages" }, 15e3);
  if (!res || res.success !== true || !res.data) return [];
  const raw = res.data.messages;
  if (!Array.isArray(raw)) return [];
  return mapAgentMessages(raw);
}
async function setSessionName(sessionId, name) {
  const clean = name.replace(/[\r\n]+/g, " ").trim().slice(0, 60);
  if (!clean) return false;
  const res = await querySession(sessionId, { type: "set_session_name", name: clean });
  return Boolean(res && res.success === true);
}
async function resumeSession(cwd, onEvent, filePath) {
  if (!isSessionFilePath(filePath)) return null;
  const session = createSession(cwd, onEvent, { resumeSessionPath: filePath });
  if (session.status === "error") return null;
  const messages = await getSessionMessages(session.id);
  const metadata = await reconstructSessionMetadata(filePath);
  let metaIndex = 0;
  for (const message of messages) {
    if (message.role !== "user") continue;
    const meta = metadata[metaIndex++];
    if (!meta) break;
    if (meta.model !== void 0) message.runtimeModel = meta.model;
    if (meta.thinking !== void 0) message.runtimeThinking = meta.thinking;
  }
  const historicalAgents = await reconstructHistoricalAgents(filePath);
  return { session, messages, historicalAgents };
}
function classifySource(source) {
  if (source.startsWith("npm:")) return "npm";
  if (source.startsWith("git:")) return "git";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(source)) return "git";
  if (/^(git@|[^/\s]+@)[^/\s]+:/.test(source)) return "git";
  if (source.startsWith("/") || source.startsWith("./") || source.startsWith("../")) return "local";
  if (source.startsWith("~")) return "local";
  if (source.startsWith(".")) return "local";
  return "npm";
}
function isPinned(source, kind) {
  if (kind === "local") return false;
  if (kind === "npm") {
    const spec = source.replace(/^npm:/, "");
    const atCount = (spec.match(/@/g) || []).length;
    return spec.startsWith("@") ? atCount >= 2 : atCount >= 1;
  }
  const body = source.replace(/^git:/, "");
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(body)) {
    return /@[^/@]+$/.test(body);
  }
  return /@[^/@]+$/.test(body);
}
function entrySource(entry) {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry.source === "string") return entry.source;
  return null;
}
const RESOURCE_KEYS = ["extensions", "skills", "prompts", "themes"];
function packageEnabled(entry) {
  if (typeof entry === "string") return true;
  return !RESOURCE_KEYS.every(
    (key) => Array.isArray(entry[key]) && entry[key].length === 0
  );
}
function npmPackageName(source) {
  const spec = source.replace(/^npm:/, "");
  if (spec.startsWith("@")) {
    const secondAt = spec.indexOf("@", 1);
    return secondAt === -1 ? spec : spec.slice(0, secondAt);
  }
  const at = spec.indexOf("@");
  return at === -1 ? spec : spec.slice(0, at);
}
function gitRepoSlug(source) {
  let body = source.replace(/^git:/, "");
  body = body.replace(/@[^/@]+$/, "");
  body = body.replace(/\.git$/, "");
  const proto = body.match(/^[a-z][a-z0-9+.-]*:\/\//i);
  if (proto) {
    try {
      const url = new URL(body);
      return { host: url.hostname, repo: url.pathname.replace(/^\//, "") };
    } catch {
      return null;
    }
  }
  const scp = body.match(/^(?:git@)?([^:/]+):(.+)$/);
  if (scp) return { host: scp[1], repo: scp[2] };
  const slash = body.indexOf("/");
  if (slash > 0) return { host: body.slice(0, slash), repo: body.slice(slash + 1) };
  return null;
}
function resolvePackagePath(source, kind, piAgentDir) {
  if (kind === "npm") {
    return path.join(piAgentDir, "npm", "node_modules", npmPackageName(source));
  }
  if (kind === "git") {
    const slug = gitRepoSlug(source);
    if (!slug) return null;
    return path.join(piAgentDir, "git", slug.host, slug.repo);
  }
  let p = source;
  if (p.startsWith("~")) p = path.join(os.homedir(), p.slice(1));
  return path.resolve(piAgentDir, p);
}
function readManifest(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8"));
  } catch {
    return null;
  }
}
function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}
function resourceEntries(dir, manifest, key, convention) {
  const entries = /* @__PURE__ */ new Set();
  const root = path.resolve(dir);
  let rootReal = null;
  try {
    rootReal = fs.realpathSync(root);
  } catch {
    rootReal = root;
  }
  const add = (entry) => {
    const cleaned = entry.split(/[*!]/)[0].replace(/\/+$/, "").replace(/^\.(\/|$)/, "");
    if (!cleaned) return;
    const resolved = path.resolve(root, cleaned);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) return;
    let candidateReal;
    try {
      candidateReal = fs.realpathSync(resolved);
    } catch {
      return;
    }
    if (candidateReal !== rootReal && !candidateReal.startsWith(rootReal + path.sep)) return;
    entries.add(path.normalize(resolved));
  };
  add(convention);
  for (const entry of manifest?.pi?.[key] ?? []) {
    if (typeof entry === "string") add(entry);
  }
  return Array.from(entries);
}
function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}
function listResources(target) {
  const resources = [];
  let st;
  try {
    st = fs.statSync(target);
  } catch {
    return resources;
  }
  if (!st.isDirectory()) {
    resources.push({ type: "extension", name: path.basename(target).replace(/\.(ts|js)$/, "") });
    return resources;
  }
  const manifest = readManifest(target);
  for (const entry of resourceEntries(target, manifest, "extensions", "extensions")) {
    if (isFile(entry)) {
      if (/\.(ts|js)$/.test(entry)) {
        const base = path.basename(entry).replace(/\.(ts|js)$/, "");
        resources.push({ type: "extension", name: base === "index" ? manifest?.name ?? base : base });
      }
      continue;
    }
    for (const child of safeReaddir(entry)) {
      const full = path.join(entry, child);
      if (/\.(ts|js)$/.test(child)) {
        resources.push({ type: "extension", name: child.replace(/\.(ts|js)$/, "") });
      } else if (fs.existsSync(path.join(full, "index.ts")) || fs.existsSync(path.join(full, "index.js"))) {
        resources.push({ type: "extension", name: child });
      }
    }
  }
  for (const entry of resourceEntries(target, manifest, "skills", "skills")) {
    if (isFile(entry)) {
      if (entry.endsWith(".md")) {
        resources.push({ type: "skill", name: path.basename(entry).replace(/\.md$/, "") });
      }
      continue;
    }
    if (fs.existsSync(path.join(entry, "SKILL.md"))) {
      resources.push({ type: "skill", name: skillName(entry) ?? path.basename(entry) });
      continue;
    }
    for (const child of safeReaddir(entry)) {
      const full = path.join(entry, child);
      if (child.endsWith(".md")) {
        resources.push({ type: "skill", name: child.replace(/\.md$/, "") });
      } else if (fs.existsSync(path.join(full, "SKILL.md"))) {
        resources.push({ type: "skill", name: skillName(full) ?? child });
      }
    }
  }
  for (const entry of resourceEntries(target, manifest, "prompts", "prompts")) {
    if (isFile(entry)) {
      if (entry.endsWith(".md")) {
        resources.push({ type: "prompt", name: path.basename(entry).replace(/\.md$/, "") });
      }
      continue;
    }
    for (const child of safeReaddir(entry)) {
      if (child.endsWith(".md")) {
        resources.push({ type: "prompt", name: child.replace(/\.md$/, "") });
      }
    }
  }
  for (const entry of resourceEntries(target, manifest, "themes", "themes")) {
    if (isFile(entry)) {
      if (entry.endsWith(".json")) {
        resources.push({ type: "theme", name: path.basename(entry).replace(/\.json$/, "") });
      }
      continue;
    }
    for (const child of safeReaddir(entry)) {
      if (child.endsWith(".json")) {
        resources.push({ type: "theme", name: child.replace(/\.json$/, "") });
      }
    }
  }
  return resources;
}
function skillName(skillDir) {
  try {
    const head = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf-8").slice(0, 2e3);
    const match = head.match(/^name:\s*(.+)$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}
function parsePackages(settings, piAgentDir) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const entry of settings.packages ?? []) {
    const source = entrySource(entry);
    if (!source || seen.has(source)) continue;
    seen.add(source);
    const kind = classifySource(source);
    const target = resolvePackagePath(source, kind, piAgentDir);
    const onDisk = target ? fs.existsSync(target) : false;
    const manifest = onDisk && target && fs.statSync(target).isDirectory() ? readManifest(target) : null;
    out.push({
      source,
      kind,
      name: manifest?.displayName || manifest?.name || fallbackName(source, kind),
      description: manifest?.description,
      version: manifest?.version,
      enabled: packageEnabled(entry),
      path: onDisk && target ? target : void 0,
      resources: onDisk && target ? listResources(target) : [],
      pinned: isPinned(source, kind)
    });
  }
  return out;
}
function fallbackName(source, kind) {
  if (kind === "npm") return npmPackageName(source);
  if (kind === "git") return gitRepoSlug(source)?.repo.split("/").pop() ?? source;
  return path.basename(source);
}
function listPackages(piAgentDir = defaultPiAgentDir()) {
  return parsePackages(readPiSettings(piAgentDir), piAgentDir);
}
function setPackageEnabled(source, enabled, piAgentDir = defaultPiAgentDir()) {
  if (detectCli().command === "omp") {
    return {
      ok: false,
      log: "Package enable/disable uses the legacy Pi configuration and is not supported by this Oh My Pi version."
    };
  }
  const settings = readPiSettings(piAgentDir);
  const packages = settings.packages ?? [];
  const idx = packages.findIndex((entry) => entrySource(entry) === source);
  if (idx === -1) {
    return { ok: false, log: `package not found in settings: ${source}` };
  }
  packages[idx] = enabled ? source : { source, extensions: [], skills: [], prompts: [], themes: [] };
  settings.packages = packages;
  try {
    writePiSettings(piAgentDir, settings);
    return { ok: true, log: "" };
  } catch (err) {
    return { ok: false, log: err instanceof Error ? err.message : String(err) };
  }
}
const PI_COMMAND_TIMEOUT_MS = 5 * 60 * 1e3;
function runPi(args) {
  const cli = detectCli();
  if (!cli.available) {
    return Promise.resolve({ ok: false, log: "omp/pi CLI not found" });
  }
  return new Promise((resolve) => {
    const proc = node_child_process.spawn(cli.path ?? cli.command, args, {
      env: {
        ...process.env,
        PATH: executableSearchDirs().join(path.delimiter),
        HOME: os.homedir(),
        FORCE_COLOR: "0"
      }
    });
    let log = "";
    const append = (chunk) => {
      log += chunk.toString("utf-8");
      if (log.length > 2e4) log = log.slice(-2e4);
    };
    proc.stdout?.on("data", append);
    proc.stderr?.on("data", append);
    const timer = setTimeout(() => {
      proc.kill();
      resolve({ ok: false, log: log.trim() || "timed out" });
    }, PI_COMMAND_TIMEOUT_MS);
    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, log: err.message });
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, log: log.trim() });
    });
  });
}
function canonicalSourceForCommand(source, piAgentDir) {
  if (classifySource(source) !== "local") return source;
  return resolvePackagePath(source, "local", piAgentDir) ?? source;
}
function installPackage(source) {
  return runPi(["install", source]);
}
function removePackage(source) {
  return runPi(["remove", canonicalSourceForCommand(source, defaultPiAgentDir())]);
}
function updatePackage(source) {
  return runPi(["update", canonicalSourceForCommand(source, defaultPiAgentDir())]);
}
const CACHE_TTL_MS$1 = 3e4;
const QUERY_TIMEOUT_MS = 15e3;
let cache$1 = null;
let inFlight = null;
function invalidateModelCache() {
  cache$1 = null;
}
let catalogCache$1 = null;
async function listCatalogModels(provider) {
  if (!catalogCache$1) catalogCache$1 = await loadCatalog$1();
  return provider ? catalogCache$1.filter((m) => m.provider === provider) : catalogCache$1;
}
async function loadCatalog$1() {
  const file = findRegistryFile();
  if (!file) return [];
  try {
    const dynamicImport = new Function("u", "return import(u)");
    const mod = await dynamicImport(node_url.pathToFileURL(file).href);
    const registry = mod.MODELS;
    if (!registry || typeof registry !== "object") return [];
    const models = [];
    for (const byId of Object.values(registry)) {
      for (const m of Object.values(byId ?? {})) {
        const entry = m;
        if (typeof entry?.id !== "string" || typeof entry?.provider !== "string") continue;
        models.push({
          id: entry.id,
          name: typeof entry.name === "string" ? entry.name : entry.id,
          provider: entry.provider,
          reasoning: Boolean(entry.reasoning)
        });
      }
    }
    return models.sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}
function findRegistryFile() {
  const cli = detectCli();
  if (!cli.available || !cli.path) return null;
  const rel = path.join("node_modules", "@earendil-works", "pi-ai", "dist", "models.generated.js");
  try {
    let dir = path.dirname(fs.realpathSync(cli.path));
    for (let i = 0; i < 6; i++) {
      const candidate = path.join(dir, rel);
      if (fs.existsSync(candidate)) return candidate;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
  }
  return null;
}
async function listAvailableModels() {
  if (cache$1 && Date.now() - cache$1.at < CACHE_TTL_MS$1) return cache$1.models;
  if (inFlight) return inFlight;
  inFlight = queryModels().then((models) => {
    cache$1 = { at: Date.now(), models };
    return models;
  }).finally(() => {
    inFlight = null;
  });
  return inFlight;
}
function queryModels() {
  const cli = detectCli();
  if (!cli.available) return Promise.resolve([]);
  return new Promise((resolve) => {
    const proc = node_child_process.spawn(cli.path ?? cli.command, ["--mode", "rpc", "--no-extensions"], {
      env: {
        ...process.env,
        PATH: executableSearchDirs().join(":"),
        HOME: os.homedir(),
        FORCE_COLOR: "0"
      }
    });
    let buffer = "";
    let done = false;
    const finish = (models) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      proc.kill();
      resolve(models);
    };
    const timer = setTimeout(() => finish([]), QUERY_TIMEOUT_MS);
    proc.on("error", () => finish([]));
    proc.stdout?.on("data", (chunk) => {
      const { lines, rest } = drainLines(buffer, chunk.toString("utf-8"));
      buffer = rest;
      for (const line of lines) {
        try {
          const payload = JSON.parse(line);
          if (payload.type !== "response" || payload.command !== "get_available_models") continue;
          const raw = payload.data?.models ?? payload.data;
          if (!payload.success || !Array.isArray(raw)) {
            finish([]);
            return;
          }
          finish(
            raw.filter((m) => m && typeof m.id === "string" && typeof m.provider === "string").map((m) => ({
              id: m.id,
              name: typeof m.name === "string" ? m.name : m.id,
              provider: m.provider,
              reasoning: Boolean(m.reasoning)
            }))
          );
          return;
        } catch {
        }
      }
    });
    proc.on("exit", () => finish([]));
    proc.stdin?.write(JSON.stringify({ id: "models", type: "get_available_models" }) + "\n");
  });
}
const piModels = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  invalidateModelCache,
  listAvailableModels,
  listCatalogModels
}, Symbol.toStringTag, { value: "Module" }));
const INSTALL_SCRIPT_URL = "https://omp.sh/install";
const MAX_SCRIPT_BYTES = 1024 * 1024;
const TRUSTED_HOSTS = /* @__PURE__ */ new Set([
  "omp.sh",
  "www.omp.sh",
  "get.omp.sh",
  "github.com",
  "objects.githubusercontent.com",
  "github-releases.githubusercontent.com",
  "release-assets.githubusercontent.com",
  "raw.githubusercontent.com"
]);
function isTrustedUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return TRUSTED_HOSTS.has(host) || host.endsWith(".omp.sh") || host.endsWith(".github.com") || host.endsWith(".githubusercontent.com");
  } catch {
    return false;
  }
}
const INSTALLER_ENV_KEYS = [
  "PATH",
  "HOME",
  "SHELL",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "TERM",
  "USER",
  "LOGNAME",
  "NO_COLOR",
  "FORCE_COLOR"
];
function minimalInstallerEnv() {
  const out = {};
  for (const key of INSTALLER_ENV_KEYS) {
    if (process.env[key] !== void 0) out[key] = process.env[key];
  }
  out.PATH = "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:" + (process.env.PATH || "");
  return out;
}
async function installOmp(onStatus) {
  const platform = os.platform();
  if (platform === "win32") {
    onStatus({
      type: "error",
      message: "Windows auto-install is not yet supported. Please run: irm https://omp.sh/install.ps1 | iex"
    });
    return false;
  }
  onStatus({ type: "downloading", progress: 0, message: "Downloading installer..." });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-gui-install-"));
  const scriptPath = path.join(tmpDir, "install.sh");
  try {
    await downloadFile(INSTALL_SCRIPT_URL, scriptPath, (progress) => {
      onStatus({ type: "downloading", progress, message: `Downloading installer... ${progress.toFixed(0)}%` });
    });
    onStatus({ type: "installing", message: "Running installer (may require password)..." });
    return new Promise((resolve) => {
      const proc = node_child_process.spawn("sh", [scriptPath], {
        stdio: ["ignore", "pipe", "pipe"],
        env: minimalInstallerEnv()
      });
      let output = "";
      proc.stdout?.on("data", (chunk) => {
        const text = chunk.toString("utf-8");
        output += text;
        const lastLine = text.trim().split("\n").pop() || "";
        onStatus({ type: "installing", message: lastLine || "Installing..." });
      });
      proc.stderr?.on("data", (chunk) => {
        const text = chunk.toString("utf-8");
        output += text;
        const lastLine = text.trim().split("\n").pop() || "";
        onStatus({ type: "installing", message: lastLine || "Installing..." });
      });
      proc.on("close", (code) => {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
        }
        if (code === 0) {
          onStatus({ type: "success" });
          resolve(true);
        } else {
          onStatus({
            type: "error",
            message: `Install failed with code ${code}.
${output.slice(-500)}`
          });
          resolve(false);
        }
      });
    });
  } catch (err) {
    onStatus({
      type: "error",
      message: `Download failed: ${err instanceof Error ? err.message : String(err)}`
    });
    return false;
  }
}
function downloadFile(url, dest, onProgress, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    if (!isTrustedUrl(url)) {
      reject(new Error("Refusing to download from an untrusted host"));
      return;
    }
    const file = fs.createWriteStream(dest);
    let downloaded = 0;
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      file.destroy();
      try {
        fs.unlinkSync(dest);
      } catch {
      }
      reject(err);
    };
    https.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        file.destroy();
        try {
          fs.unlinkSync(dest);
        } catch {
        }
        if (redirectsLeft <= 0) {
          reject(new Error("Too many redirects"));
          return;
        }
        if (!isTrustedUrl(response.headers.location)) {
          reject(new Error("Refusing to follow a redirect to an untrusted host"));
          return;
        }
        resolve(
          downloadFile(response.headers.location, dest, onProgress, redirectsLeft - 1)
        );
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        fail(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const total = parseInt(response.headers["content-length"] || "0", 10);
      if (total > MAX_SCRIPT_BYTES) {
        response.resume();
        fail(new Error("Installer script exceeds the size limit"));
        return;
      }
      response.on("data", (chunk) => {
        downloaded += chunk.length;
        if (downloaded > MAX_SCRIPT_BYTES) {
          response.destroy();
          fail(new Error("Installer script exceeds the size limit"));
          return;
        }
        if (total > 0) {
          onProgress(downloaded / total * 100);
        }
      });
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    }).on("error", (err) => {
      fail(err);
    });
  });
}
const SEARCH_URL = "https://registry.npmjs.org/-/v1/search";
const TIMEOUT_MS = 1e4;
const CURATED_GIT_PACKAGES = [
  {
    name: "pi-web-access",
    repo: "nicobailon/pi-web-access",
    description: "Web search, URL fetching, GitHub cloning, PDF/YouTube extraction",
    category: "web"
  },
  {
    name: "pi-mcp-adapter",
    repo: "nicobailon/pi-mcp-adapter",
    description: "Token-efficient MCP (Model Context Protocol) adapter",
    category: "mcp"
  },
  {
    name: "pi-subagents",
    repo: "nicobailon/pi-subagents",
    description: "Async subagent delegation with truncation & artifacts",
    category: "agents"
  },
  {
    name: "pi-subagents",
    repo: "tintinweb/pi-subagents",
    description: "Claude Code-style subagents: parallel runs, live widget, mid-run steering",
    category: "agents"
  },
  {
    name: "pi-lens",
    repo: "apmantza/pi-lens",
    description: "Real-time code feedback: LSP, linters, formatters, type-checking",
    category: "quality"
  },
  {
    name: "context-mode",
    repo: "mksglu/context-mode",
    description: "Context-window saver: sandboxed execution + FTS5 knowledge base",
    category: "productivity"
  },
  {
    name: "pi-permission-system",
    repo: "gotgenes/pi-permission-system",
    description: "Permission enforcement extension",
    category: "safety"
  },
  {
    name: "cc-safety-net",
    repo: "kenryu42/cc-safety-net",
    description: "Blocks destructive git/fs commands and secret-file access",
    category: "safety"
  },
  {
    name: "rpiv-todo",
    repo: "juicesharp/rpiv-todo",
    description: "Model todo list rendered as a live overlay",
    category: "productivity"
  },
  {
    name: "rpiv-ask-user-question",
    repo: "juicesharp/rpiv-ask-user-question",
    description: "Structured typed questionnaires from the model",
    category: "productivity"
  },
  {
    name: "pi-background-tasks",
    repo: "ismailsaleekh/pi-background-tasks",
    description: "Durable background shell tasks via child pi processes",
    category: "productivity"
  }
];
async function searchCommunityPackages(query, curatedOnly = false) {
  if (curatedOnly) {
    return CURATED_GIT_PACKAGES.map((p) => ({
      name: p.name,
      description: p.description,
      version: "",
      repo: p.repo,
      category: p.category
    }));
  }
  const text = `keywords:pi-package ${query.trim()}`.trim();
  const url = `${SEARCH_URL}?text=${encodeURIComponent(text)}&size=20`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" }
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    const out = [];
    for (const o of data.objects ?? []) {
      const p = o.package;
      if (!p?.name) continue;
      out.push({
        name: p.name,
        description: typeof p.description === "string" ? p.description : "",
        version: typeof p.version === "string" ? p.version : ""
      });
    }
    return out;
  } catch {
    return [];
  }
}
const PACKAGE_NAME_PATTERN = /^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9-]*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const MAX_NAME_LENGTH = 214;
function isValidPackageName(name) {
  return name.length > 0 && name.length <= MAX_NAME_LENGTH && PACKAGE_NAME_PATTERN.test(name);
}
function isValidVersion(version) {
  return VERSION_PATTERN.test(version);
}
function unscopedName(name) {
  const slash = name.indexOf("/");
  return slash === -1 ? name : name.slice(slash + 1);
}
const TEMPLATES = ["blank", "command", "tool-guard"];
function validatePluginSpec(spec) {
  if (!isValidPackageName(spec.name)) return "invalid-name";
  if (!isValidVersion(spec.version)) return "invalid-version";
  if (typeof spec.description !== "string" || !spec.description.trim()) return "invalid-spec";
  if (!spec.extension && !spec.skill && !spec.prompt) return "no-resources";
  if (spec.extension && !TEMPLATES.includes(spec.template)) return "invalid-spec";
  if (typeof spec.parentDir !== "string" || !spec.parentDir.trim()) return "dir-missing";
  return null;
}
const PI_DOCS_URL = "https://badlogic-pi-mono.mintlify.app/coding-agent";
function renderPackageJson(spec) {
  const pi = {};
  const files = [];
  if (spec.extension) {
    pi.extensions = ["extensions/index.ts"];
    files.push("extensions");
  }
  if (spec.skill) {
    pi.skills = ["skills"];
    files.push("skills");
  }
  if (spec.prompt) {
    pi.prompts = ["prompts"];
    files.push("prompts");
  }
  const manifest = {
    name: spec.name,
    version: spec.version,
    description: spec.description.trim()
  };
  if (spec.displayName?.trim()) manifest.displayName = spec.displayName.trim();
  if (spec.author?.trim()) manifest.author = spec.author.trim();
  manifest.license = "MIT";
  manifest.keywords = ["pi-package"];
  if (spec.extension) {
    manifest.peerDependencies = { "@mariozechner/pi-coding-agent": "*" };
  }
  manifest.pi = pi;
  manifest.files = files;
  return JSON.stringify(manifest, null, 2) + "\n";
}
function extensionHeader(spec) {
  return `/**
 * ${spec.name} — a pi extension.
 *
 * pi loads extensions as plain TypeScript via jiti (no build step): this file
 * default-exports a function that receives pi's ExtensionAPI. The types come
 * from pi's core packages (peer-declared in package.json and resolved from
 * pi's own bundled copies at runtime).
 *
 * Docs: ${PI_DOCS_URL}/extensions
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
`;
}
function renderExtension(spec) {
  const header = extensionHeader(spec);
  if (spec.template === "command") {
    const command = unscopedName(spec.name);
    return `${header}
export default function (pi: ExtensionAPI) {
  // Registers the slash command /${command} — type it in any pi session.
  // registerCommand can also provide argument completions and more; see
  // ${PI_DOCS_URL}/extensions#custom-commands
  pi.registerCommand('${command}', {
    description: ${JSON.stringify(spec.description.trim())},
    handler: async (args, ctx) => {
      ctx.ui.notify('Hello ' + (args.trim() || 'world') + '!', 'info')
    }
  })
}
`;
  }
  if (spec.template === "tool-guard") {
    return `${header}
// Extend this list with whatever you consider dangerous.
const BLOCKED = [/\\brm\\s+-rf\\b/, /\\bgit\\s+push\\b.*--force/]

export default function (pi: ExtensionAPI) {
  // tool_call fires before a tool executes; returning { block, reason } vetoes it.
  pi.on('tool_call', async (event, ctx) => {
    if (event.toolName !== 'bash') return
    const command = typeof event.input?.command === 'string' ? event.input.command : ''
    if (!BLOCKED.some((pattern) => pattern.test(command))) return
    const ok = await ctx.ui.confirm('Dangerous command', 'Allow: ' + command + ' ?')
    if (!ok) return { block: true, reason: 'Blocked by ${spec.name}' }
  })
}
`;
  }
  return `${header}
export default function (pi: ExtensionAPI) {
  // Subscribe to events, register slash commands or tools here, e.g.:
  //
  // pi.on('session_start', async (_event, ctx) => {
  //   ctx.ui.notify('Hello from ${spec.name}', 'info')
  // })
  //
  // See ${PI_DOCS_URL}/extensions for the full ExtensionAPI surface.
  void pi
}
`;
}
function renderSkill(spec) {
  const skill = unscopedName(spec.name);
  const title = spec.displayName?.trim() || skill;
  return `---
name: ${skill}
description: ${spec.description.trim()}
---

# ${title}

Describe the workflow this skill teaches the agent.

## When to use

- TODO: the situations where the agent should reach for this skill.

## Instructions

1. TODO: step-by-step guidance for the agent.
`;
}
function renderPrompt(spec) {
  const prompt = unscopedName(spec.name);
  const title = spec.displayName?.trim() || prompt;
  return `# ${title}

${spec.description.trim()}

---

Write the prompt template body here. Installed prompt templates become
available as slash commands in pi; see ${PI_DOCS_URL}/pi-packages.
`;
}
function renderReadme(spec) {
  const title = spec.displayName?.trim() || spec.name;
  const contents = [];
  if (spec.extension) contents.push("- `extensions/index.ts` — pi extension (plain TypeScript, loaded via jiti)");
  if (spec.skill) contents.push(`- \`skills/${unscopedName(spec.name)}/SKILL.md\` — agent skill`);
  if (spec.prompt) contents.push(`- \`prompts/${unscopedName(spec.name)}.md\` — prompt template`);
  return `# ${title}

${spec.description.trim()}

## Install

From a local checkout:

\`\`\`sh
pi install /absolute/path/to/${spec.name}
\`\`\`

Or publish it and install from npm or git:

\`\`\`sh
npm publish                                   # then: pi install npm:${spec.name}
git tag v${spec.version} && git push --tags   # then: pi install git:github.com/<you>/${unscopedName(spec.name)}@v${spec.version}
\`\`\`

## Contents

${contents.join("\n")}

## Development

Package spec: ${PI_DOCS_URL}/pi-packages
Extension API: ${PI_DOCS_URL}/extensions
`;
}
function planPluginFiles(spec) {
  const base = unscopedName(spec.name);
  const files = [
    { relativePath: "package.json", content: renderPackageJson(spec) },
    { relativePath: "README.md", content: renderReadme(spec) }
  ];
  if (spec.extension) {
    files.push({ relativePath: "extensions/index.ts", content: renderExtension(spec) });
  }
  if (spec.skill) {
    files.push({ relativePath: `skills/${base}/SKILL.md`, content: renderSkill(spec) });
  }
  if (spec.prompt) {
    files.push({ relativePath: `prompts/${base}.md`, content: renderPrompt(spec) });
  }
  return files;
}
function scaffoldPlugin(spec) {
  const invalid = validatePluginSpec(spec);
  if (invalid) return { ok: false, error: invalid };
  const parentDir = path.resolve(spec.parentDir);
  try {
    if (!fs.statSync(parentDir).isDirectory()) return { ok: false, error: "dir-missing" };
  } catch {
    return { ok: false, error: "dir-missing" };
  }
  const dir = path.join(parentDir, ...spec.name.split("/"));
  try {
    if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
      return { ok: false, error: "dir-not-empty" };
    }
  } catch {
    return { ok: false, error: "dir-missing" };
  }
  const planned = planPluginFiles(spec);
  try {
    for (const file of planned) {
      const target = path.join(dir, ...file.relativePath.split("/"));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.content, "utf-8");
    }
  } catch (err) {
    return {
      ok: false,
      error: "write-failed",
      detail: err instanceof Error ? err.message : String(err)
    };
  }
  return { ok: true, dir, files: planned.map((f) => f.relativePath) };
}
class FsGuard {
  roots = /* @__PURE__ */ new Set();
  /** Lexical resolve + realpath when the path exists (falls back to lexical). */
  canonical(p) {
    const resolved = path.resolve(p);
    try {
      return fs.realpathSync(resolved);
    } catch {
      return resolved;
    }
  }
  addRoot(root) {
    this.roots.add(this.canonical(root));
  }
  removeRoot(root) {
    this.roots.delete(this.canonical(root));
  }
  isWithinRoots(real) {
    for (const root of this.roots) {
      if (real === root || real.startsWith(root + path.sep)) {
        return true;
      }
    }
    return false;
  }
  /**
   * Read/preview check. The target must exist: its real path (every symlink
   * component resolved) has to land inside a registered root. Nonexistent
   * paths and broken symlinks are denied — there is nothing to read, and
   * realpathSync failing must never crash the caller.
   */
  isAllowed(target) {
    let real;
    try {
      real = fs.realpathSync(path.resolve(target));
    } catch {
      return false;
    }
    return this.isWithinRoots(real);
  }
}
const execFileAsync$2 = node_util.promisify(node_child_process.execFile);
const CHECKPOINT_GIT_ENV = {
  GIT_AUTHOR_NAME: "OMP GUI",
  GIT_AUTHOR_EMAIL: "omp-gui@localhost",
  GIT_COMMITTER_NAME: "OMP GUI",
  GIT_COMMITTER_EMAIL: "omp-gui@localhost"
};
async function git$1(projectDir, args, env) {
  return execFileAsync$2("git", args, {
    cwd: projectDir,
    env: { ...process.env, ...env },
    maxBuffer: 64 * 1024 * 1024
  });
}
async function isGitRepo$1(projectDir) {
  try {
    const { stdout } = await git$1(projectDir, ["rev-parse", "--is-inside-work-tree"]);
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}
async function headSha(projectDir) {
  try {
    const { stdout } = await git$1(projectDir, ["rev-parse", "--verify", "HEAD"]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
async function listUntracked(projectDir) {
  const { stdout } = await git$1(projectDir, ["ls-files", "-o", "--exclude-standard", "-z"]);
  return stdout.split("\0").filter(Boolean);
}
async function createCheckpoint(projectDir) {
  if (!await isGitRepo$1(projectDir)) return null;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "omp-checkpoint-"));
  const indexEnv = { GIT_INDEX_FILE: path.join(tmp, "index") };
  try {
    const head = await headSha(projectDir);
    await git$1(projectDir, ["read-tree", ...head ? [head] : ["--empty"]], indexEnv);
    await git$1(projectDir, ["add", "-A"], indexEnv);
    const { stdout: tree } = await git$1(projectDir, ["write-tree"], indexEnv);
    const { stdout: sha } = await git$1(
      projectDir,
      ["commit-tree", tree.trim(), ...head ? ["-p", head] : [], "-m", "omp-checkpoint"],
      { ...indexEnv, ...CHECKPOINT_GIT_ENV }
    );
    const untracked = await listUntracked(projectDir);
    return { sha: sha.trim(), untracked };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
async function restoreCheckpoint(projectDir, sha, untrackedAtCheckpoint) {
  if (!await isGitRepo$1(projectDir)) {
    return { ok: false, log: "Not a git repository." };
  }
  const log = [];
  try {
    await git$1(projectDir, ["restore", `--source=${sha}`, "--worktree", "--", "."]);
    log.push("Restored tracked files from checkpoint.");
    const keep = new Set(untrackedAtCheckpoint);
    const created = (await listUntracked(projectDir)).filter((f) => !keep.has(f));
    for (const rel of created) {
      const abs = path.resolve(projectDir, rel);
      if (!abs.startsWith(path.resolve(projectDir) + path.sep)) continue;
      if (abs.split(path.sep).includes(".git")) continue;
      try {
        fs.unlinkSync(abs);
        log.push(`Deleted ${rel}`);
      } catch {
      }
      removeEmptyDirs(path.dirname(abs), projectDir);
    }
    return { ok: true, log: log.join("\n") };
  } catch (err) {
    return { ok: false, log: err instanceof Error ? err.message : String(err) };
  }
}
function removeEmptyDirs(dir, projectDir) {
  const root = path.resolve(projectDir);
  let current = dir;
  while (current.startsWith(root + path.sep)) {
    if (current.split(path.sep).includes(".git")) return;
    try {
      fs.rmdirSync(current);
    } catch {
      return;
    }
    current = path.dirname(current);
  }
}
function defaultStoreFile() {
  return path.join(electron.app.getPath("userData"), "checkpoints.json");
}
function readStore(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
function writeStore(file, entries) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(entries, null, 2));
}
function saveCheckpoint(entry, file) {
  const target = defaultStoreFile();
  writeStore(target, [...readStore(target), entry]);
}
function listCheckpoints(sessionId, file) {
  return readStore(defaultStoreFile()).filter((c) => c.sessionId === sessionId);
}
function getCheckpoint(id, file) {
  return readStore(defaultStoreFile()).find((c) => c.id === id) ?? null;
}
const execFileAsync$1 = node_util.promisify(node_child_process.execFile);
const MAX_DIFF_BYTES = 200 * 1024;
const MAX_NEW_FILE_LINES = 400;
async function git(projectDir, args) {
  const { stdout } = await execFileAsync$1("git", args, {
    cwd: projectDir,
    env: process.env,
    maxBuffer: 64 * 1024 * 1024
  });
  return stdout;
}
async function isGitRepo(projectDir) {
  try {
    return (await git(projectDir, ["rev-parse", "--is-inside-work-tree"])).trim() === "true";
  } catch {
    return false;
  }
}
async function hasHead(projectDir) {
  try {
    await git(projectDir, ["rev-parse", "--verify", "HEAD"]);
    return true;
  } catch {
    return false;
  }
}
async function currentBranch(projectDir) {
  const branch = (await git(projectDir, ["branch", "--show-current"])).trim();
  if (branch) return branch;
  try {
    return (await git(projectDir, ["rev-parse", "--short", "HEAD"])).trim();
  } catch {
    return "";
  }
}
function parsePorcelain(raw) {
  const entries = [];
  const parts = raw.split("\0").filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const x = part[0];
    const y = part[1];
    const file = part.slice(3);
    if (x === "?" && y === "?") {
      entries.push({ path: file, status: "untracked" });
      continue;
    }
    if (x === "R" || y === "R") {
      i++;
      entries.push({ path: file, status: "M" });
      continue;
    }
    const code = x !== " " ? x : y;
    entries.push({
      path: file,
      status: code === "A" ? "A" : code === "D" ? "D" : "M"
    });
  }
  return entries;
}
function parseNumstat(raw) {
  const map = /* @__PURE__ */ new Map();
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const [add, del, ...rest] = line.split("	");
    const file = rest.join("	");
    if (!file) continue;
    map.set(file, {
      additions: add === "-" ? null : Number(add),
      deletions: del === "-" ? null : Number(del)
    });
  }
  return map;
}
async function getGitInfo(projectDir) {
  if (!await isGitRepo(projectDir)) return null;
  const head = await hasHead(projectDir);
  const [branch, statusRaw, numstatRaw] = await Promise.all([
    currentBranch(projectDir),
    git(projectDir, ["status", "--porcelain", "-z"]),
    // Without HEAD nothing is committed; staged entries are the baseline diff.
    head ? git(projectDir, ["diff", "--numstat", "HEAD", "--"]) : git(projectDir, ["diff", "--numstat", "--cached", "--"])
  ]);
  const numstat = parseNumstat(numstatRaw);
  const files = [];
  const seen = /* @__PURE__ */ new Set();
  for (const entry of parsePorcelain(statusRaw)) {
    seen.add(entry.path);
    const counts = numstat.get(entry.path);
    const untrackedAdds = entry.status === "untracked" ? countFileLines(projectDir, entry.path) : null;
    files.push({
      path: entry.path,
      status: entry.status,
      additions: counts?.additions ?? untrackedAdds,
      deletions: counts?.deletions ?? (entry.status === "untracked" ? 0 : null)
    });
  }
  for (const [file, counts] of numstat) {
    if (!seen.has(file)) {
      files.push({ path: file, status: "M", ...counts });
    }
  }
  let totalAdditions = 0;
  let totalDeletions = 0;
  for (const f of files) {
    totalAdditions += f.additions ?? 0;
    totalDeletions += f.deletions ?? 0;
  }
  return { branch, files, totalAdditions, totalDeletions };
}
function safeReadablePath(projectDir, relPath) {
  const rootReal = safeReal(projectDir);
  if (!rootReal) return null;
  const abs = path.resolve(projectDir, relPath);
  const real = safeReal(abs);
  if (!real) return null;
  if (real !== rootReal && !real.startsWith(rootReal + path.sep)) return null;
  return real;
}
function safeReal(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}
function isSymlink(projectDir, relPath) {
  try {
    return fs.lstatSync(path.resolve(projectDir, relPath)).isSymbolicLink();
  } catch {
    return false;
  }
}
function countFileLines(projectDir, relPath) {
  const safe = safeReadablePath(projectDir, relPath);
  if (!safe) return null;
  try {
    const buf = fs.readFileSync(safe);
    if (buf.length > 2 * 1024 * 1024) return null;
    if (buf.includes(0)) return null;
    let n = 0;
    for (const b of buf) if (b === 10) n++;
    return buf.length > 0 && buf[buf.length - 1] !== 10 ? n + 1 : n;
  } catch {
    return null;
  }
}
function resolveInside(projectDir, filePath) {
  const root = path.resolve(projectDir);
  const abs = path.resolve(root, filePath);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}
async function getFileDiff(projectDir, filePath) {
  const abs = resolveInside(projectDir, filePath);
  if (!abs) return null;
  if (!await isGitRepo(projectDir)) return null;
  const rel = path.relative(path.resolve(projectDir), abs);
  const status = await git(projectDir, ["status", "--porcelain", "-z", "--", rel]);
  let diff;
  if (status.startsWith("??")) {
    diff = synthesizeNewFileDiff(projectDir, rel);
  } else {
    const head = await hasHead(projectDir);
    diff = head ? await git(projectDir, ["diff", "HEAD", "--", rel]) : await git(projectDir, ["diff", "--cached", "--", rel]);
  }
  if (diff.length > MAX_DIFF_BYTES) {
    diff = diff.slice(0, MAX_DIFF_BYTES) + `
... (diff truncated, showing first ${Math.round(MAX_DIFF_BYTES / 1024)} KB)`;
  }
  return diff;
}
function synthesizeNewFileDiff(projectDir, rel) {
  if (isSymlink(projectDir, rel)) {
    const target = safeReal(path.resolve(projectDir, rel));
    const targetText = target && (target === safeReal(projectDir) || target.startsWith((safeReal(projectDir) ?? "") + path.sep)) ? target : "outside workspace";
    return [
      `diff --git a/${rel} b/${rel}`,
      "new file mode 120000",
      "--- /dev/null",
      `+++ b/${rel}`,
      `+symlink → ${targetText}`
    ].join("\n");
  }
  const safe = safeReadablePath(projectDir, rel);
  if (!safe) {
    return `diff --git a/${rel} b/${rel}
new file mode 100644
--- /dev/null
+++ b/${rel}
+(unreadable file)
`;
  }
  let lines;
  try {
    lines = fs.readFileSync(safe, "utf-8").split("\n");
  } catch {
    lines = [];
  }
  const truncated = lines.length > MAX_NEW_FILE_LINES;
  const body = lines.slice(0, MAX_NEW_FILE_LINES);
  const header = [
    `diff --git a/${rel} b/${rel}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${rel}`
  ];
  const content = body.map((l) => `+${l}`);
  if (truncated) {
    content.push(`+... (file truncated, showing first ${MAX_NEW_FILE_LINES} lines)`);
  }
  return [...header, ...content].join("\n");
}
const BOARD_LIMITS = {
  maxBoards: 50,
  maxColumns: 20,
  maxCardsPerColumn: 500,
  maxNameLength: 200,
  maxColumnTitleLength: 200,
  maxCardTitleLength: 500,
  maxNoteLength: 5e3,
  maxIdLength: 100,
  maxTemplateLength: 50
};
const CONTROL_RE$2 = /[\x00-\x1f\x7f]/;
function isValidId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= BOARD_LIMITS.maxIdLength && !CONTROL_RE$2.test(value);
}
function isValidTimestamp(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function validateCard(raw) {
  if (!raw || typeof raw !== "object") return null;
  const c = raw;
  if (!isValidId(c.id)) return null;
  if (typeof c.title !== "string" || !c.title.trim() || c.title.length > BOARD_LIMITS.maxCardTitleLength) {
    return null;
  }
  if (c.note !== void 0 && (typeof c.note !== "string" || c.note.length > BOARD_LIMITS.maxNoteLength)) {
    return null;
  }
  if (!isValidTimestamp(c.createdAt)) return null;
  const card = { id: c.id, title: c.title, createdAt: c.createdAt };
  if (typeof c.note === "string" && c.note.length > 0) card.note = c.note;
  return card;
}
function validateColumn(raw) {
  if (!raw || typeof raw !== "object") return null;
  const c = raw;
  if (!isValidId(c.id)) return null;
  if (typeof c.title !== "string" || !c.title.trim() || c.title.length > BOARD_LIMITS.maxColumnTitleLength) {
    return null;
  }
  if (!Array.isArray(c.cards) || c.cards.length > BOARD_LIMITS.maxCardsPerColumn) return null;
  const cards = [];
  const seen = /* @__PURE__ */ new Set();
  for (const rawCard of c.cards) {
    const card = validateCard(rawCard);
    if (!card || seen.has(card.id)) return null;
    seen.add(card.id);
    cards.push(card);
  }
  return { id: c.id, title: c.title, cards };
}
function validateBoard(raw) {
  if (!raw || typeof raw !== "object") return null;
  const b = raw;
  if (!isValidId(b.id)) return null;
  if (typeof b.name !== "string" || !b.name.trim() || b.name.length > BOARD_LIMITS.maxNameLength) {
    return null;
  }
  if (typeof b.template !== "string" || b.template.length > BOARD_LIMITS.maxTemplateLength || CONTROL_RE$2.test(b.template)) {
    return null;
  }
  if (!Array.isArray(b.columns) || b.columns.length === 0 || b.columns.length > BOARD_LIMITS.maxColumns) {
    return null;
  }
  if (!isValidTimestamp(b.createdAt) || !isValidTimestamp(b.updatedAt)) return null;
  const columns = [];
  const columnIds = /* @__PURE__ */ new Set();
  const cardIds = /* @__PURE__ */ new Set();
  for (const rawColumn of b.columns) {
    const column = validateColumn(rawColumn);
    if (!column || columnIds.has(column.id)) return null;
    for (const card of column.cards) {
      if (cardIds.has(card.id)) return null;
      cardIds.add(card.id);
    }
    columnIds.add(column.id);
    columns.push(column);
  }
  return {
    id: b.id,
    name: b.name,
    template: b.template,
    columns,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt
  };
}
function defaultBoardsFile() {
  return path.join(electron.app.getPath("userData"), "kanban-boards.json");
}
function readBoards(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (!Array.isArray(raw)) return [];
    const boards = [];
    for (const entry of raw) {
      const board = validateBoard(entry);
      if (board) boards.push(board);
    }
    return boards;
  } catch {
    return [];
  }
}
function writeBoards(file, boards) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(boards, null, 2) + "\n", "utf-8");
  fs.renameSync(tmp, file);
}
function listBoards(file = defaultBoardsFile()) {
  return readBoards(file);
}
function saveBoard(raw, file = defaultBoardsFile()) {
  const board = validateBoard(raw);
  if (!board) return { ok: false, error: "invalid-board" };
  const boards = readBoards(file);
  const index = boards.findIndex((b) => b.id === board.id);
  if (index === -1 && boards.length >= BOARD_LIMITS.maxBoards) {
    return { ok: false, error: "board-limit" };
  }
  if (index === -1) boards.push(board);
  else boards[index] = board;
  try {
    writeBoards(file, boards);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
function deleteBoard(id, file = defaultBoardsFile()) {
  if (typeof id !== "string" || !id || id.length > BOARD_LIMITS.maxIdLength) {
    return { ok: false, error: "invalid-board" };
  }
  const boards = readBoards(file);
  const next = boards.filter((b) => b.id !== id);
  if (next.length === boards.length) return { ok: true };
  try {
    writeBoards(file, next);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
function defaultExportFileName(sessionTitle, sessionId, now = /* @__PURE__ */ new Date()) {
  const slug = (sessionTitle ?? "").trim().replace(/[\s/\\:*?"<>|]+/g, "-").slice(0, 40).replace(/^-+|-+$/g, "");
  const base = slug || sessionId.slice(0, 8) || "session";
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `omp-${base}-${stamp}.html`;
}
const execFileAsync = node_util.promisify(node_child_process.execFile);
const MAX_FILES = 5e3;
const CACHE_TTL_MS = 3e4;
const SKIP_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  "dist",
  "dist-electron",
  "release",
  "build",
  "coverage",
  ".next",
  ".cache",
  ".turbo"
]);
const cache = /* @__PURE__ */ new Map();
async function listProjectFiles(projectDir) {
  const cached = cache.get(projectDir);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.files;
  const files = (await gitFiles(projectDir) ?? await walkFiles(projectDir)).sort().slice(0, MAX_FILES);
  cache.set(projectDir, { files, at: Date.now() });
  return files;
}
async function gitFiles(projectDir) {
  try {
    const { stdout } = await execFileAsync("git", ["ls-files", "-co", "--exclude-standard"], {
      cwd: projectDir,
      env: process.env,
      maxBuffer: 64 * 1024 * 1024
    });
    return stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  } catch {
    return null;
  }
}
async function walkFiles(projectDir) {
  const out = [];
  async function walk(dir) {
    if (out.length >= MAX_FILES) return;
    let entries;
    try {
      entries = await fs$1.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= MAX_FILES) return;
      if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile()) {
        out.push(path.relative(projectDir, abs));
      }
    }
  }
  await walk(projectDir);
  return out;
}
function maybeNotifyTurnFinished(event) {
  if (event.type !== "status" || event.status !== "idle") return;
  if (getStore("notifications") === false) return;
  const win = electron.BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed() && win.isFocused()) return;
  const title = getSession(event.sessionId)?.title || "OMP GUI";
  const text = getLastAssistantText(event.sessionId).trim();
  const body = getStore("notificationPreviews") === true && text ? text.slice(0, 120) : "Agent turn finished.";
  const notification = new electron.Notification({ title, body, silent: false });
  notification.on("click", () => {
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
      win.webContents.send(IPC_CHANNELS.NOTIFY_SELECT_SESSION, event.sessionId);
    }
  });
  notification.show();
}
function maybeNotifyUiRequest(event) {
  if (event.type !== "ui_request") return;
  if (getStore("notifications") === false) return;
  const win = electron.BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed() && win.isFocused()) return;
  const zh = getStore("language") !== "en";
  const title = getSession(event.sessionId)?.title || "OMP GUI";
  const detail = (event.title || "").slice(0, 100);
  const body = zh ? `等待你的操作：${detail || "插件请求"}` : `Waiting for input: ${detail || "plugin request"}`;
  const notification = new electron.Notification({ title, body, silent: false });
  notification.on("click", () => {
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
      win.webContents.send(IPC_CHANNELS.NOTIFY_SELECT_SESSION, event.sessionId);
    }
  });
  notification.show();
}
let currentStatus = { status: "idle" };
let initialized = false;
function setStatus(status) {
  currentStatus = status;
  for (const win of electron.BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.UPDATER_STATUS, status);
    }
  }
}
function getUpdaterStatus() {
  return currentStatus;
}
function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}
function initUpdater() {
  if (initialized || !electron.app.isPackaged) return;
  initialized = true;
  electronUpdater.autoUpdater.autoDownload = false;
  electronUpdater.autoUpdater.on("checking-for-update", () => setStatus({ status: "checking" }));
  electronUpdater.autoUpdater.on(
    "update-available",
    (info) => setStatus({ status: "available", version: info.version })
  );
  electronUpdater.autoUpdater.on("update-not-available", () => setStatus({ status: "none" }));
  electronUpdater.autoUpdater.on(
    "download-progress",
    (progress) => setStatus({ status: "progress", percent: Math.round(progress.percent * 10) / 10 })
  );
  electronUpdater.autoUpdater.on(
    "update-downloaded",
    (info) => setStatus({ status: "downloaded", version: info.version })
  );
  electronUpdater.autoUpdater.on("error", (err) => setStatus({ status: "error", message: errorMessage(err) }));
  setTimeout(() => {
    electronUpdater.autoUpdater.checkForUpdates().catch(() => {
    });
  }, 1e4);
}
async function updaterCheck() {
  if (!electron.app.isPackaged) return { status: "dev" };
  try {
    await electronUpdater.autoUpdater.checkForUpdates();
  } catch (err) {
    setStatus({ status: "error", message: errorMessage(err) });
  }
  return currentStatus;
}
async function updaterDownload() {
  if (!electron.app.isPackaged) return { status: "dev" };
  setStatus({ status: "downloading" });
  try {
    await electronUpdater.autoUpdater.downloadUpdate();
  } catch (err) {
    setStatus({ status: "error", message: errorMessage(err) });
  }
  return currentStatus;
}
function updaterQuitAndInstall() {
  if (!electron.app.isPackaged) return;
  electronUpdater.autoUpdater.quitAndInstall();
}
async function updaterOpenReleasePage() {
  await electron.shell.openExternal("https://github.com/taotao135791-bit/omp-gui/releases/latest");
}
const DEFAULT_TIMEOUT_MS = 1e4;
function makeExecRunner(executable, options = {}) {
  const { env, envMode = "inherit", timeoutMs = DEFAULT_TIMEOUT_MS } = typeof options === "number" ? { timeoutMs: options } : options;
  return (args) => new Promise((resolve) => {
    node_child_process.execFile(
      executable,
      args,
      {
        timeout: timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
        env: resolveSubprocessEnv(envMode, env ?? {})
      },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          stdout: typeof stdout === "string" ? stdout : "",
          stderr: typeof stderr === "string" ? stderr : ""
        });
      }
    );
  });
}
function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function configGet(run, key) {
  const res = await run(["config", "get", key, "--json"]);
  if (!res.ok) return null;
  const parsed = parseJson(res.stdout);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const e = parsed;
  return {
    key: typeof e.key === "string" ? e.key : key,
    value: "value" in e ? e.value : void 0,
    type: typeof e.type === "string" ? e.type : void 0,
    description: typeof e.description === "string" ? e.description : void 0
  };
}
async function configSet(run, key, value) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value ?? null);
  const res = await run(["config", "set", key, serialized, "--json"]);
  return res.ok;
}
async function configReset(run, key) {
  const res = await run(["config", "reset", key, "--json"]);
  return res.ok;
}
async function authBrokerLogout(run, providerId) {
  const res = await run(["auth-broker", "logout", providerId]);
  return res.ok;
}
const BOOTSTRAP_PROVIDER_ID = "deepseek";
const BOOTSTRAP_ENV_KEY = "DEEPSEEK_API_KEY";
const BOOTSTRAP_ENV_VALUE = "omp-gui-bootstrap-placeholder";
class RuntimeRpcClient {
  constructor(session) {
    this.session = session;
  }
  /**
   * Spawn and verify the runtime answers a get_state probe.
   * Resolves null when the process is unusable (won't start / no models).
   */
  static async spawn(cli, opts = {}, events = {}) {
    if (!cli.available) return null;
    const proc = node_child_process.spawn(cli.path ?? cli.command, ["--mode", "rpc", ...opts.args ?? []], {
      cwd: opts.cwd ?? os.homedir(),
      env: resolveSubprocessEnv(opts.envMode ?? "inherit", {
        PATH: executableSearchDirs().join(path.delimiter),
        HOME: os.homedir(),
        FORCE_COLOR: "0",
        ...opts.env ?? {}
      })
    });
    const stderr = { text: "" };
    proc.stderr?.on("data", (c) => {
      stderr.text = (stderr.text + c.toString("utf8")).slice(-2e3);
    });
    const session = new OmpSession(
      {
        id: `probe-${Date.now()}`,
        cwd: opts.cwd ?? os.homedir(),
        title: "probe",
        createdAt: Date.now(),
        status: "idle"
      },
      proc,
      {
        label: cli.command,
        onEvent: (e) => events.onEvent?.(e),
        onOpenUrl: events.onOpenUrl
      }
    );
    const client = new RuntimeRpcClient(session);
    proc.on("exit", (code) => events.onExit?.(code, stderr.text.trim().split("\n").pop() ?? ""));
    const probe = await session.query({ type: "get_state" }, 1e4);
    if (!probe || probe.success !== true) {
      client.kill();
      return null;
    }
    return client;
  }
  /** Spawn, retrying with the zero-auth bootstrap env when the runtime has no models. */
  static async spawnWithBootstrap(cli, opts = {}, events = {}) {
    const plain = await RuntimeRpcClient.spawn(cli, opts, events);
    if (plain) return { client: plain, bootstrap: false };
    const boot = await RuntimeRpcClient.spawn(
      cli,
      {
        ...opts,
        env: { [BOOTSTRAP_ENV_KEY]: BOOTSTRAP_ENV_VALUE, ...opts.env ?? {} }
      },
      events
    );
    return boot ? { client: boot, bootstrap: true } : null;
  }
  query(command, timeoutMs = 1e4) {
    return this.session.query(command, timeoutMs);
  }
  /** Respond to an interactive extension UI request (login prompts). */
  respond(requestId, answer) {
    return this.session.respondExtensionUi(requestId, answer);
  }
  kill() {
    this.session.kill();
  }
}
const REGISTRY_TTL_MS = 15e3;
function parseLoginProviders(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const out = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry;
    if (typeof e.id !== "string" || !e.id) continue;
    out.push({ id: e.id, name: typeof e.name === "string" && e.name ? e.name : e.id });
  }
  return out;
}
class ProviderRegistry {
  constructor(ttlMs = REGISTRY_TTL_MS) {
    this.ttlMs = ttlMs;
  }
  cache = null;
  invalidate() {
    this.cache = null;
  }
  /**
   * Registered login providers, or null when the CLI call failed / returned
   * an unparseable payload (→ capability 'unknown', never 'unsupported').
   */
  async list(run) {
    if (this.cache && Date.now() - this.cache.at < this.ttlMs) {
      return this.cache.providers;
    }
    const res = await run(["auth-broker", "list", "--json"]);
    const providers = res.ok ? parseLoginProviders(res.stdout) : null;
    this.cache = { at: Date.now(), providers };
    return providers;
  }
}
const MAX_SELECTOR_LENGTH = 300;
function isValidModelSelector(selector) {
  if (typeof selector !== "string") return false;
  if (selector.length === 0 || selector.length > MAX_SELECTOR_LENGTH) return false;
  if (selector.startsWith("-")) return false;
  if (selector.includes(" ")) return false;
  if (/[\x00-\x1f\x7f]/.test(selector)) return false;
  return true;
}
function splitModelSelector(selector) {
  if (!isValidModelSelector(selector)) return null;
  const slash = selector.indexOf("/");
  if (slash === -1) return null;
  const provider = selector.slice(0, slash);
  const modelId = selector.slice(slash + 1);
  if (!provider || !modelId) return null;
  return { provider, modelId };
}
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const THINKING_SUFFIX_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max"
];
function parseModelSelector(selector) {
  if (typeof selector !== "string" || selector.length === 0) return null;
  const match = selector.match(/^(.+):([a-z0-9]+)$/);
  if (match && THINKING_SUFFIX_LEVELS.includes(match[2]) && match[1].includes("/")) {
    return { modelSelector: match[1], thinkingOverride: match[2] };
  }
  return { modelSelector: selector };
}
function formatModelSelector(parts) {
  return parts.thinkingOverride ? `${parts.modelSelector}:${parts.thinkingOverride}` : parts.modelSelector;
}
function switchModelSelector(previous, next) {
  const nextParts = parseModelSelector(next);
  if (nextParts?.thinkingOverride) return next;
  const prevParts = parseModelSelector(previous);
  if (prevParts?.thinkingOverride) {
    return formatModelSelector({
      modelSelector: next,
      thinkingOverride: prevParts.thinkingOverride
    });
  }
  return next;
}
const CONFIG_MODEL_ROLES = "modelRoles";
const CONFIG_DEFAULT_THINKING = "defaultThinkingLevel";
const CONFIG_MACHINE_SKILLS = "skills.enableAgentsUser";
const OVERVIEW_TTL_MS = 15e3;
function currentCapabilities(patch = {}) {
  return {
    providers: "unknown",
    nativeLogin: "unknown",
    logout: "unknown",
    modelCatalog: "unknown",
    defaultModelConfig: "unknown",
    defaultThinkingConfig: "unknown",
    machineSkillsConfig: "unknown",
    ...patch
  };
}
function machineSkillsStateOf(entry) {
  if (!entry) return "unknown";
  if (entry.value === true) return "enabled";
  if (entry.value === false) return "disabled";
  return "unknown";
}
function defaultModelOf(entry) {
  const value = entry?.value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const def = value.default;
    if (typeof def === "string" && def.length > 0) return { selector: def, explicit: true };
  }
  return { selector: "", explicit: false };
}
class RuntimeSettings {
  overviewCache = null;
  modelsCache = null;
  cli;
  run;
  spawnProbe;
  registry;
  constructor(deps = {}) {
    this.cli = deps.cli ?? detectCli();
    this.run = deps.runner ?? makeExecRunner(this.cli.path ?? this.cli.command, { env: deps.env });
    this.spawnProbe = deps.spawnProbe ?? RuntimeRpcClient.spawnWithBootstrap;
    this.registry = deps.registry ?? new ProviderRegistry();
    if (deps.env && !deps.spawnProbe) {
      this.spawnProbe = (cli, opts, events) => RuntimeRpcClient.spawnWithBootstrap(cli, { ...opts, env: { ...opts?.env ?? {}, ...deps.env } }, events);
    }
  }
  get profile() {
    return this.cli.command === "omp" ? "current" : "legacy";
  }
  /** Drop every cache (login/logout/writes/external changes/redetect). */
  invalidate() {
    this.overviewCache = null;
    this.modelsCache = null;
    this.registry.invalidate();
  }
  // ------------------------------------------------------------- overview
  async getOverview(force = false) {
    if (!force && this.overviewCache && Date.now() - this.overviewCache.at < OVERVIEW_TTL_MS) {
      return this.overviewCache.overview;
    }
    const overview = this.profile === "current" ? await this.currentOverview() : this.legacyOverview();
    this.overviewCache = { at: Date.now(), overview };
    return overview;
  }
  async currentOverview() {
    const capabilities = currentCapabilities();
    const [registry, spawned] = await Promise.all([
      this.registry.list(this.run),
      this.spawnProbe(this.cli, { args: ["--no-extensions"] })
    ]);
    capabilities.providers = registry ? "supported" : "unknown";
    let probeProviders = null;
    let bootstrap = false;
    if (spawned) {
      const res = await spawned.client.query({ type: "get_login_providers" }, 1e4);
      spawned.client.kill();
      if (res?.success === true && res.data && typeof res.data === "object") {
        capabilities.nativeLogin = "supported";
        const raw = res.data.providers;
        if (Array.isArray(raw)) {
          probeProviders = raw.map((p) => {
            const o = p;
            return {
              id: typeof o.id === "string" ? o.id : "",
              name: typeof o.name === "string" ? o.name : "",
              available: o.available !== false,
              authenticated: o.authenticated === true
            };
          }).filter((p) => p.id);
        }
        bootstrap = spawned.bootstrap;
      }
    }
    const probeById = new Map((probeProviders ?? []).map((p) => [p.id, p]));
    let providers = (registry ?? []).map((r) => {
      const probed = probeById.get(r.id);
      return {
        id: r.id,
        name: r.name,
        available: probed?.available ?? true,
        authenticated: probed?.authenticated === true
      };
    });
    if (probeProviders) {
      const known = new Set(providers.map((p) => p.id));
      for (const p of probeProviders) {
        if (!known.has(p.id)) providers.push(p);
      }
    }
    if (bootstrap) {
      providers = providers.map(
        (p) => p.id === BOOTSTRAP_PROVIDER_ID ? { ...p, authenticated: false } : p
      );
    }
    if (!probeProviders && providers.length > 0) {
      const withModels = new Set((await this.listModels()).map((m) => m.provider));
      providers = providers.map(
        (p) => withModels.has(p.id) ? { ...p, authenticated: true } : p
      );
    }
    const [modelRoles, defaultThinking, machineSkills] = await Promise.all([
      configGet(this.run, CONFIG_MODEL_ROLES),
      configGet(this.run, CONFIG_DEFAULT_THINKING),
      configGet(this.run, CONFIG_MACHINE_SKILLS)
    ]);
    const { selector: defaultModel, explicit: defaultModelExplicit } = defaultModelOf(modelRoles);
    const modelState = {
      defaultModel,
      defaultModelExplicit,
      defaultThinkingLevel: typeof defaultThinking?.value === "string" ? defaultThinking.value : ""
    };
    capabilities.defaultModelConfig = modelRoles ? "supported" : "unsupported";
    capabilities.defaultThinkingConfig = defaultThinking ? "supported" : "unsupported";
    capabilities.machineSkillsConfig = machineSkills ? "supported" : "unsupported";
    capabilities.modelCatalog = "supported";
    return {
      profile: "current",
      capabilities,
      providers,
      modelState,
      machineSkillsState: machineSkillsStateOf(machineSkills)
    };
  }
  legacyOverview() {
    return {
      profile: "legacy",
      capabilities: {
        providers: "supported",
        nativeLogin: "unsupported",
        logout: "supported",
        modelCatalog: "supported",
        defaultModelConfig: "supported",
        defaultThinkingConfig: "supported",
        machineSkillsConfig: "supported"
      },
      providers: [],
      modelState: { defaultModel: "", defaultModelExplicit: false, defaultThinkingLevel: "" },
      // Legacy has no runtime-reported machine-skills state; present it as
      // unknown so the current-profile toggle logic cannot fake an ON state.
      machineSkillsState: "unknown"
    };
  }
  // --------------------------------------------------------------- models
  /** Runtime model catalog (credential-filtered by the runtime itself). */
  async listModels() {
    if (this.modelsCache && Date.now() - this.modelsCache.at < OVERVIEW_TTL_MS) {
      return this.modelsCache.models;
    }
    if (this.profile !== "current") {
      const { listAvailableModels: listAvailableModels2 } = await Promise.resolve().then(() => piModels);
      const models2 = (await listAvailableModels2()).map((m) => ({
        provider: m.provider,
        id: m.id,
        selector: `${m.provider}/${m.id}`,
        name: m.name,
        reasoning: m.reasoning,
        thinking: []
      }));
      this.modelsCache = { at: Date.now(), models: models2 };
      return models2;
    }
    const res = await this.run(["models", "--json"]);
    let models = [];
    if (res.ok) {
      try {
        const parsed = JSON.parse(res.stdout);
        const raw = Array.isArray(parsed.models) ? parsed.models : [];
        models = raw.map((m) => {
          const o = m;
          const provider = typeof o.provider === "string" ? o.provider : "";
          const id = typeof o.id === "string" ? o.id : "";
          return {
            provider,
            id,
            selector: typeof o.selector === "string" ? o.selector : provider && id ? `${provider}/${id}` : "",
            name: typeof o.name === "string" ? o.name : id,
            contextWindow: typeof o.contextWindow === "number" ? o.contextWindow : void 0,
            maxTokens: typeof o.maxTokens === "number" ? o.maxTokens : void 0,
            reasoning: o.reasoning === true,
            thinking: Array.isArray(o.thinking) ? o.thinking.filter((t) => typeof t === "string") : []
          };
        }).filter((m) => m.provider && m.id);
      } catch {
        models = [];
      }
    }
    this.modelsCache = { at: Date.now(), models };
    return models;
  }
  // ---------------------------------------------------------------- writes
  // Every write is read-after-write verified against the runtime, and all
  // mutations are serialized: rapid A→B changes cannot interleave their
  // write/read-back pairs, and a slow first write can never overwrite the
  // second one's confirmation.
  /** Serialize mutations through one chain so write+verify pairs never race. */
  mutationChain = Promise.resolve();
  enqueue(fn) {
    const next = this.mutationChain.then(fn, fn);
    this.mutationChain = next.catch(() => {
    });
    return next;
  }
  /**
   * Set the new-session default model via `modelRoles.default` — never
   * `enabledModels`. A target-field mutation preserves the other roles
   * (smol/slow/…) and the `enabledModels` allow-list untouched.
   */
  async setDefaultModel(selector) {
    if (this.profile !== "current") return { ok: false, error: "legacy-profile" };
    if (selector && !isValidModelSelector(selector)) {
      return { ok: false, error: "invalid model selector" };
    }
    return this.enqueue(async () => {
      if (selector) {
        const before2 = await configGet(this.run, CONFIG_MODEL_ROLES);
        const currentDefault = this.modelRolesRecord(before2).default ?? "";
        const effective = switchModelSelector(currentDefault, selector);
        const merged = { ...this.modelRolesRecord(before2), default: effective };
        if (!await configSet(this.run, CONFIG_MODEL_ROLES, merged)) {
          return { ok: false, error: "omp config set failed" };
        }
        const verify2 = await configGet(this.run, CONFIG_MODEL_ROLES);
        this.invalidate();
        const actual = this.modelRolesRecord(verify2).default;
        if (actual !== effective) {
          return {
            ok: false,
            error: `runtime did not confirm the change (got "${actual || "unset"}")`
          };
        }
        return { ok: true };
      }
      const before = await configGet(this.run, CONFIG_MODEL_ROLES);
      const { default: _drop, ...rest } = this.modelRolesRecord(before);
      if (!await configSet(this.run, CONFIG_MODEL_ROLES, rest)) {
        return { ok: false, error: "omp config reset failed" };
      }
      const verify = await configGet(this.run, CONFIG_MODEL_ROLES);
      this.invalidate();
      if (this.modelRolesRecord(verify).default !== void 0) {
        return { ok: false, error: "runtime did not confirm the reset" };
      }
      return { ok: true };
    });
  }
  async setDefaultThinking(level) {
    if (this.profile !== "current") return { ok: false, error: "legacy-profile" };
    return this.enqueue(async () => {
      if (level) {
        if (!await configSet(this.run, CONFIG_DEFAULT_THINKING, level)) {
          return { ok: false, error: "omp config set failed" };
        }
        const verify2 = await configGet(this.run, CONFIG_DEFAULT_THINKING);
        const actual = verify2?.value;
        this.invalidate();
        if (actual !== level) {
          return {
            ok: false,
            error: `runtime did not confirm the change (got "${typeof actual === "string" ? actual : "unset"}")`
          };
        }
        return { ok: true };
      }
      if (!await configReset(this.run, CONFIG_DEFAULT_THINKING)) {
        return { ok: false, error: "omp config reset failed" };
      }
      const verify = await configGet(this.run, CONFIG_DEFAULT_THINKING);
      this.invalidate();
      if (typeof verify?.value !== "string") {
        return { ok: false, error: "runtime did not confirm the reset" };
      }
      return { ok: true };
    });
  }
  async setMachineSkills(enabled) {
    if (this.profile !== "current") return { ok: false, error: "legacy-profile" };
    return this.enqueue(async () => {
      if (!await configSet(this.run, CONFIG_MACHINE_SKILLS, enabled)) {
        return { ok: false, error: "omp config set failed" };
      }
      const verify = await configGet(this.run, CONFIG_MACHINE_SKILLS);
      this.invalidate();
      if (verify?.value !== enabled) {
        return { ok: false, error: "runtime did not confirm the change" };
      }
      return { ok: true };
    });
  }
  async logout(providerId) {
    if (this.profile !== "current") return { ok: false, error: "legacy-profile" };
    if (!PROVIDER_ID_PATTERN.test(providerId)) {
      return { ok: false, error: "invalid provider id" };
    }
    return this.enqueue(async () => {
      if (!await authBrokerLogout(this.run, providerId)) {
        return { ok: false, error: "omp auth-broker logout failed" };
      }
      this.invalidate();
      const overview = await this.getOverview(true);
      const still = overview.providers.find((p) => p.id === providerId);
      if (still?.authenticated) {
        return { ok: false, error: "credential still present (e.g. also set as an environment variable)" };
      }
      return { ok: true };
    });
  }
  /** Coerce a modelRoles entry to a plain record (never throw on bad shape). */
  modelRolesRecord(entry) {
    const value = entry?.value;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  }
}
const LOGIN_RESPONSE_TIMEOUT_MS = 12 * 6e4;
class OmpLoginFlow {
  constructor(opts) {
    this.opts = opts;
  }
  client = null;
  providerId = "";
  finished = false;
  /** When set, the first `input` prompt is auto-answered with this key. */
  autoKey = null;
  setState(state) {
    this.currentState = state;
    this.opts.onState(state);
  }
  get active() {
    return !this.finished;
  }
  /**
   * Set an API key for a provider and resolve when the flow settles.
   * Reuses the exact `login` flow + read-after-write verification, but
   * auto-answers the runtime's "paste API key" prompt with `key`.
   */
  async setApiKey(providerId, key) {
    this.autoKey = key;
    try {
      await this.start(providerId);
      return this.currentState;
    } finally {
      this.autoKey = null;
    }
  }
  async start(providerId) {
    this.providerId = providerId;
    this.setState({ status: "starting", providerId });
    const spawn = this.opts.spawnProbe ?? RuntimeRpcClient.spawnWithBootstrap;
    const spawned = await spawn(
      this.opts.cli,
      { args: ["--no-extensions"] },
      {
        onEvent: (event) => this.handleEvent(event),
        // Do NOT auto-open a browser here: key-based providers (DeepSeek,
        // OpenRouter, xAI, …) emit `open_url` just to point at the API-key
        // dashboard before showing the paste-key input. Opening a browser
        // unprompted turns every such provider into a browser-login and
        // confuses key entry. The URL is stashed in state and opened only
        // when the user explicitly clicks.
        onOpenUrl: (url, launchUrl) => {
          this.setState({
            status: "waiting_for_browser",
            providerId,
            url,
            launchUrl
          });
        },
        onExit: () => {
          if (!this.finished) {
            this.finish({ status: "failed", providerId, message: "Oh My Pi exited during login." });
          }
        }
      }
    );
    if (!spawned) {
      this.finish({ status: "failed", providerId, message: "Oh My Pi could not start for login." });
      return;
    }
    this.client = spawned.client;
    const res = await this.client.query(
      { type: "login", providerId },
      LOGIN_RESPONSE_TIMEOUT_MS
    );
    if (this.finished) return;
    this.client.kill();
    this.client = null;
    if (res && res.success === true) {
      await this.verify(providerId);
    } else {
      const message = typeof res?.error === "string" ? res.error : "Oh My Pi did not answer the login request.";
      this.finish({ status: "failed", providerId, message });
    }
  }
  /**
   * Read-after-write: a `success` from the login command is not proof the
   * credential works. Re-query the runtime's provider list and only report
   * Connected when the runtime itself confirms authentication.
   */
  async verify(providerId) {
    this.setState({ status: "verifying", providerId });
    const spawn = this.opts.spawnProbe ?? RuntimeRpcClient.spawnWithBootstrap;
    const spawned = await spawn(this.opts.cli, { args: ["--no-extensions"] }, {});
    if (!spawned) {
      this.finish({
        status: "failed",
        providerId,
        message: "Login finished, but verification could not start."
      });
      return;
    }
    try {
      const res = await spawned.client.query({ type: "get_login_providers" }, 1e4);
      const data = res?.data;
      const me = Array.isArray(data?.providers) ? data.providers.find((p) => p.id === providerId) : void 0;
      if (me?.authenticated === true) {
        this.finish({ status: "connected", providerId });
      } else {
        this.finish({
          status: "failed",
          providerId,
          message: "Oh My Pi did not confirm the new credential."
        });
      }
    } finally {
      spawned.client.kill();
    }
  }
  handleEvent(event) {
    if (this.finished) return;
    if (event.type === "ui_request") {
      const requestId = String(event.id ?? "");
      const timeoutMs = typeof event.timeout === "number" ? event.timeout : void 0;
      switch (event.method) {
        case "input":
          if (this.autoKey !== null && this.client) {
            this.client.respond(requestId, { value: this.autoKey });
            return;
          }
          this.setState({
            status: "waiting_for_input",
            providerId: this.providerId,
            requestId,
            title: String(event.title ?? ""),
            placeholder: typeof event.placeholder === "string" ? event.placeholder : void 0,
            timeoutMs
          });
          return;
        case "select":
          this.setState({
            status: "waiting_for_select",
            providerId: this.providerId,
            requestId,
            title: String(event.title ?? ""),
            options: Array.isArray(event.options) ? event.options : [],
            timeoutMs
          });
          return;
        case "confirm":
          this.setState({
            status: "waiting_for_confirm",
            providerId: this.providerId,
            requestId,
            title: String(event.title ?? ""),
            message: typeof event.message === "string" ? event.message : void 0,
            timeoutMs
          });
          return;
      }
      return;
    }
    if (event.type === "ui_cancel") {
      return;
    }
    if (event.type === "message" && event.role === "system") {
      this.setState({
        status: "verifying",
        providerId: this.providerId,
        message: String(event.content ?? "")
      });
    }
  }
  /** Answer the pending prompt; returns false when the flow is gone. */
  answer(answer) {
    if (this.finished || !this.client) return false;
    if ("cancelled" in answer) {
      this.cancel();
      return true;
    }
    const state = this.currentState;
    const requestId = "requestId" in state ? state.requestId : "";
    if (!requestId) return false;
    return this.client.respond(requestId, answer);
  }
  currentState = { status: "idle" };
  cancel() {
    if (this.finished) return;
    this.finish({ status: "cancelled", providerId: this.providerId });
  }
  finish(state) {
    this.finished = true;
    this.setState(state);
    this.client?.kill();
    this.client = null;
  }
}
const CATALOG_URL = "https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/catalog/src/models.json";
let catalogCache = null;
function refreshedCatalogFile(userDataDir) {
  const dir = userDataDir ?? electron.app?.getPath("userData");
  return dir ? path.join(dir, "pi-catalog-models.json") : null;
}
function bundledCatalogFile(appPath) {
  const base = appPath ?? electron.app?.getAppPath();
  return base ? path.join(base, "resources", "pi-catalog", "models.json") : null;
}
function findCatalogFile() {
  const cli = detectCli();
  if (!cli.available || !cli.path) return null;
  const rel = path.join("node_modules", "@oh-my-pi", "pi-catalog", "src", "models.json");
  try {
    let dir = path.dirname(fs.realpathSync(cli.path));
    for (let i = 0; i < 8; i++) {
      const candidate = path.join(dir, rel);
      if (fs.existsSync(candidate)) return candidate;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
  }
  return null;
}
function catalogLayers(extra = {}) {
  const layers = [];
  const installed = findCatalogFile();
  if (installed) layers.push({ origin: "install", path: installed });
  const refreshed = refreshedCatalogFile(extra.userDataDir);
  if (refreshed) layers.push({ origin: "refreshed", path: refreshed });
  const bundled = bundledCatalogFile(extra.appPath);
  if (bundled) layers.push({ origin: "bundled", path: bundled });
  return layers;
}
async function listOmpModelCatalog(providerId, extra = {}) {
  const models = Object.keys(extra).length === 0 ? catalogCache ??= loadCatalog(catalogLayers()) : loadCatalog(catalogLayers(extra));
  return providerId ? models.filter((m) => m.provider === providerId) : models;
}
function loadCatalog(layers) {
  for (const layer of layers) {
    const models = parseCatalogFile(layer.path);
    if (models) return models;
  }
  return [];
}
function parseCatalogFile(file) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const models = [];
  for (const providerId of Object.keys(parsed)) {
    const byProvider = parsed[providerId];
    if (!byProvider || typeof byProvider !== "object") continue;
    for (const entry of Object.values(byProvider)) {
      const e = entry;
      if (!e || typeof e.id !== "string") continue;
      const provider = typeof e.provider === "string" ? e.provider : providerId;
      const selector = e.id.includes("/") ? e.id : `${provider}/${e.id}`;
      const efforts = e.thinking && typeof e.thinking === "object" ? e.thinking.efforts ?? [] : [];
      models.push({
        provider,
        id: e.id.slice(e.id.lastIndexOf("/") + 1),
        selector,
        name: typeof e.name === "string" ? e.name : e.id,
        reasoning: e.reasoning === true,
        thinking: Array.isArray(efforts) ? efforts.filter((t) => typeof t === "string") : []
      });
    }
  }
  if (models.length === 0) return null;
  return models.sort(
    (a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name)
  );
}
async function refreshModelCatalog(extra = {}, fetchImpl = fetch) {
  const target = refreshedCatalogFile(extra.userDataDir);
  if (!target) return { ok: false, error: "no userData dir" };
  let text;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3e4);
    const res = await fetchImpl(CATALOG_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, error: `download failed (${res.status})` };
    text = await res.text();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "downloaded file is not JSON" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).length < 10) {
    return { ok: false, error: "downloaded catalog looks wrong" };
  }
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const tmp = `${target}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, text, "utf-8");
    fs.renameSync(tmp, target);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  catalogCache = null;
  return { ok: true, providers: Object.keys(parsed).length };
}
const CUSTOM_PROVIDER_APIS = [
  "openai-completions",
  "openai-responses",
  "anthropic-messages"
];
const MAX_BASE_URL_LENGTH = 500;
const MAX_API_KEY_LENGTH = 1e3;
const MAX_MODELS = 100;
const MAX_MODEL_FIELD = 300;
const CONTROL_RE$1 = /[\x00-\x1f\x7f]/;
function isValidBaseUrl(url) {
  if (url.length === 0 || url.length > MAX_BASE_URL_LENGTH) return false;
  if (/\s/.test(url) || CONTROL_RE$1.test(url)) return false;
  if (/^https:\/\/[^\s/?#]+/.test(url)) return true;
  if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?([/?#]|$)/i.test(url)) return true;
  return false;
}
function defaultModelsFile() {
  return path.join(defaultPiAgentDir(), "models.yml");
}
function defaultRunner() {
  const cli = detectCli();
  if (!cli.available) return null;
  return makeExecRunner(cli.path ?? cli.command, { timeoutMs: 3e4 });
}
function readModelsFile(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf-8");
  } catch (err) {
    if (err.code === "ENOENT") {
      return { ok: true, raw: null, doc: { providers: {} } };
    }
    return { ok: false, error: "read", detail: err instanceof Error ? err.message : String(err) };
  }
  let parsed;
  try {
    parsed = YAML.parse(raw);
  } catch (err) {
    return { ok: false, error: "parse", detail: err instanceof Error ? err.message : String(err) };
  }
  if (parsed === null || parsed === void 0) {
    return { ok: true, raw, doc: { providers: {} } };
  }
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "parse", detail: "models.yml root must be a mapping" };
  }
  const keys = Object.keys(parsed);
  if (keys.some((k) => k !== "providers")) {
    return { ok: false, error: "parse", detail: `models.yml may only have the root key "providers" (found: ${keys.join(", ")})` };
  }
  const providers = parsed.providers;
  if (providers === null || providers === void 0) {
    return { ok: true, raw, doc: { providers: {} } };
  }
  if (typeof providers !== "object" || Array.isArray(providers)) {
    return { ok: false, error: "parse", detail: 'models.yml "providers" must be a mapping' };
  }
  return { ok: true, raw, doc: { providers } };
}
function writeModelsFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content, "utf-8");
  fs.renameSync(tmp, file);
}
function restoreModelsFile(file, raw) {
  try {
    if (raw === null) {
      fs.unlinkSync(file);
    } else {
      writeModelsFile(file, raw);
    }
  } catch {
  }
}
function sanitizeCustomProviderSpec(raw) {
  if (!raw || typeof raw !== "object") return null;
  const s = raw;
  if (typeof s.id !== "string" || typeof s.baseUrl !== "string") return null;
  if (!CUSTOM_PROVIDER_APIS.includes(s.api)) return null;
  const models = [];
  if (Array.isArray(s.models)) {
    for (const m of s.models.slice(0, MAX_MODELS)) {
      if (!m || typeof m !== "object") return null;
      const o = m;
      if (typeof o.id !== "string") return null;
      if (o.name !== void 0 && typeof o.name !== "string") return null;
      const entry = {
        id: o.id,
        name: typeof o.name === "string" ? o.name : ""
      };
      if (o.contextWindow !== void 0) {
        if (typeof o.contextWindow !== "number" || !Number.isFinite(o.contextWindow)) return null;
        entry.contextWindow = o.contextWindow;
      }
      if (o.maxTokens !== void 0) {
        if (typeof o.maxTokens !== "number" || !Number.isFinite(o.maxTokens)) return null;
        entry.maxTokens = o.maxTokens;
      }
      models.push(entry);
    }
  }
  return {
    id: s.id,
    baseUrl: s.baseUrl,
    api: s.api,
    apiKey: typeof s.apiKey === "string" ? s.apiKey : void 0,
    authNone: s.authNone === true,
    discovery: s.discovery === true,
    models
  };
}
function validateSpec(spec, hasExistingKey) {
  if (!PROVIDER_ID_PATTERN.test(spec.id)) return "invalid-id";
  if (!isValidBaseUrl(spec.baseUrl)) return "invalid-base-url";
  if (!CUSTOM_PROVIDER_APIS.includes(spec.api)) return "invalid-api";
  if (spec.apiKey !== void 0) {
    const key = spec.apiKey.trim();
    if (!key || key.length > MAX_API_KEY_LENGTH || CONTROL_RE$1.test(key)) return "invalid-api-key";
  }
  if (!spec.authNone && spec.apiKey === void 0 && !hasExistingKey) return "invalid-api-key";
  if (spec.discovery && spec.models.length > 0) return "invalid-models";
  if (!spec.discovery) {
    if (spec.models.length === 0) return "invalid-models";
    for (const m of spec.models) {
      if (!m.id.trim() || m.id.length > MAX_MODEL_FIELD || CONTROL_RE$1.test(m.id)) return "invalid-models";
      if (m.name.length > MAX_MODEL_FIELD) return "invalid-models";
      if (m.contextWindow !== void 0 && (!Number.isInteger(m.contextWindow) || m.contextWindow <= 0)) {
        return "invalid-models";
      }
      if (m.maxTokens !== void 0 && (!Number.isInteger(m.maxTokens) || m.maxTokens <= 0)) {
        return "invalid-models";
      }
    }
  }
  return null;
}
function buildEntry(spec, existingKey) {
  const entry = {
    baseUrl: spec.baseUrl.trim(),
    api: spec.api
  };
  if (spec.authNone) {
    entry.auth = "none";
  } else {
    entry.apiKey = spec.apiKey !== void 0 ? spec.apiKey.trim() : existingKey;
  }
  if (spec.discovery) {
    entry.discovery = { type: "openai-models-list" };
  } else {
    entry.models = spec.models.map((m) => {
      const out = {
        id: m.id.trim(),
        name: m.name.trim() || m.id.trim(),
        reasoning: false,
        input: ["text"]
      };
      if (m.contextWindow !== void 0) out.contextWindow = m.contextWindow;
      if (m.maxTokens !== void 0) out.maxTokens = m.maxTokens;
      return out;
    });
  }
  return entry;
}
async function verifyWithRuntime(run, providerId) {
  const res = await run(["models", "--json"]);
  if (!res.ok) return null;
  try {
    const parsed = JSON.parse(res.stdout);
    const models = Array.isArray(parsed.models) ? parsed.models : [];
    return models.some(
      (m) => m && typeof m === "object" && m.provider === providerId
    );
  } catch {
    return null;
  }
}
let mutationChain = Promise.resolve();
function enqueue(fn) {
  const next = mutationChain.then(fn, fn);
  mutationChain = next.catch(() => {
  });
  return next;
}
function listCustomProviders(deps = {}) {
  const file = deps.modelsFile ?? defaultModelsFile();
  const read = readModelsFile(file);
  if (!read.ok) return { ok: false, error: read.error, detail: read.detail };
  const providers = [];
  for (const [id, value] of Object.entries(read.doc.providers)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const e = value;
    const discovery = e.discovery !== void 0 && e.discovery !== null;
    const rawModels = Array.isArray(e.models) ? e.models : [];
    providers.push({
      id,
      baseUrl: typeof e.baseUrl === "string" ? e.baseUrl : "",
      api: typeof e.api === "string" ? e.api : "",
      hasKey: typeof e.apiKey === "string" && e.apiKey.length > 0,
      authNone: e.auth === "none",
      discovery,
      models: rawModels.filter((m) => Boolean(m) && typeof m === "object").map((m) => ({
        id: typeof m.id === "string" ? m.id : "",
        name: typeof m.name === "string" ? m.name : "",
        ...typeof m.contextWindow === "number" ? { contextWindow: m.contextWindow } : {},
        ...typeof m.maxTokens === "number" ? { maxTokens: m.maxTokens } : {}
      })).filter((m) => m.id),
      source: "custom"
    });
  }
  return { ok: true, providers };
}
function saveCustomProvider(rawSpec, deps = {}) {
  return enqueue(async () => {
    const file = deps.modelsFile ?? defaultModelsFile();
    const read = readModelsFile(file);
    if (!read.ok) return { ok: false, error: read.error, detail: read.detail };
    const existing = read.doc.providers[rawSpec.id];
    const existingKey = existing && typeof existing === "object" && !Array.isArray(existing) ? typeof existing.apiKey === "string" ? existing.apiKey : void 0 : void 0;
    const invalid = validateSpec(rawSpec, existingKey !== void 0);
    if (invalid) return { ok: false, error: invalid };
    const next = {
      providers: { ...read.doc.providers, [rawSpec.id]: buildEntry(rawSpec, existingKey) }
    };
    let content;
    try {
      content = YAML.stringify({ providers: next.providers });
    } catch (err) {
      return { ok: false, error: "write-failed", detail: err instanceof Error ? err.message : String(err) };
    }
    try {
      writeModelsFile(file, content);
    } catch (err) {
      return { ok: false, error: "write-failed", detail: err instanceof Error ? err.message : String(err) };
    }
    const run = deps.runner === null ? null : deps.runner ?? defaultRunner();
    if (!run) return { ok: true, verified: false };
    const verified = await verifyWithRuntime(run, rawSpec.id);
    if (verified === null) return { ok: true, verified: false };
    if (!verified) {
      restoreModelsFile(file, read.raw);
      return { ok: false, error: "verify-failed" };
    }
    return { ok: true, verified: true };
  });
}
function deleteCustomProvider(id, deps = {}) {
  return enqueue(async () => {
    if (!PROVIDER_ID_PATTERN.test(id)) return { ok: false };
    const file = deps.modelsFile ?? defaultModelsFile();
    if (!fs.existsSync(file)) return { ok: true };
    const read = readModelsFile(file);
    if (!read.ok) return { ok: false, error: read.error };
    if (!(id in read.doc.providers)) return { ok: true };
    const providers = { ...read.doc.providers };
    delete providers[id];
    try {
      writeModelsFile(file, YAML.stringify({ providers }));
      return { ok: true };
    } catch {
      return { ok: false, error: "write-failed" };
    }
  });
}
const MAX_IMAGE_BYTES$1 = 10 * 1024 * 1024;
const MAX_IMAGE_COUNT = 4;
const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = /* @__PURE__ */ new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
function base64DecodedBytes(data) {
  const clean = data.includes(",") ? data.slice(data.indexOf(",") + 1) : data;
  const pad = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor(clean.length * 3 / 4) - pad;
}
function sanitizeImages(images) {
  if (!Array.isArray(images)) return void 0;
  const out = [];
  let total = 0;
  for (const img of images) {
    if (!img || typeof img.data !== "string" || typeof img.mimeType !== "string") continue;
    if (out.length >= MAX_IMAGE_COUNT) break;
    if (!ALLOWED_IMAGE_MIME.has(img.mimeType)) continue;
    const clean = img.data.includes(",") ? img.data.slice(img.data.indexOf(",") + 1) : img.data;
    if (!BASE64_RE.test(clean) || clean.length % 4 !== 0) continue;
    const bytes = base64DecodedBytes(img.data);
    if (bytes <= 0 || bytes > MAX_IMAGE_BYTES$1) continue;
    if (total + bytes > MAX_TOTAL_IMAGE_BYTES) break;
    total += bytes;
    out.push({ type: "image", data: img.data, mimeType: img.mimeType });
  }
  return out.length ? out : void 0;
}
function recentWorkspaceId(realPath) {
  return `recent-${crypto$1.createHash("sha256").update(realPath).digest("hex").slice(0, 24)}`;
}
function workspaceName(displayPath) {
  const name = path.basename(displayPath);
  return name && name !== path.parse(displayPath).root ? name : void 0;
}
class RecentWorkspaceRegistry {
  constructor(grants, opts) {
    this.grants = grants;
    this.opts = opts;
  }
  async list() {
    const descriptors = [];
    const canonicalPaths = [];
    const seen = /* @__PURE__ */ new Set();
    for (const persistedPath of this.opts.readPaths()) {
      if (typeof persistedPath !== "string" || !persistedPath.trim()) continue;
      const realPath = await this.validateDirectory(persistedPath);
      if (!realPath || seen.has(realPath)) continue;
      seen.add(realPath);
      canonicalPaths.push(realPath);
      descriptors.push({
        id: recentWorkspaceId(realPath),
        displayPath: realPath,
        name: workspaceName(realPath)
      });
    }
    const current = this.opts.readPaths();
    if (current.length !== canonicalPaths.length || current.some((value, i) => value !== canonicalPaths[i])) {
      this.opts.writePaths(canonicalPaths);
    }
    return descriptors;
  }
  async activate(id) {
    if (typeof id !== "string" || !id.trim()) return null;
    const descriptor = (await this.list()).find((entry) => entry.id === id);
    if (!descriptor) return null;
    return this.grants.createGrant(descriptor.displayPath, "recent-project");
  }
  async clear() {
    this.opts.writePaths([]);
  }
  async remove(displayPath) {
    if (typeof displayPath !== "string" || !displayPath.trim()) return false;
    const descriptors = await this.list();
    if (!descriptors.some((entry) => entry.displayPath === displayPath)) return false;
    this.opts.writePaths(descriptors.filter((entry) => entry.displayPath !== displayPath).map((entry) => entry.displayPath));
    return true;
  }
  async validateDirectory(candidate) {
    try {
      const normalized = path.resolve(candidate);
      const stat = await fs.promises.stat(normalized);
      if (!stat.isDirectory()) return null;
      return await fs.promises.realpath(normalized);
    } catch {
      return null;
    }
  }
}
class WorkspaceGrantManager {
  grants = /* @__PURE__ */ new Map();
  fsGuard;
  constructor(opts) {
    this.fsGuard = opts.fsGuard;
  }
  /** Create a grant from a trusted source. Returns null if the path is invalid. */
  async createGrant(displayPath, source) {
    const normalized = path.resolve(displayPath);
    let realPath;
    try {
      const st = await fs.promises.stat(normalized);
      if (!st.isDirectory()) return null;
      realPath = fs.realpathSync(normalized);
    } catch {
      return null;
    }
    const existing = this.findByRealPath(realPath);
    if (existing) {
      const refreshed = {
        ...existing,
        displayPath,
        source
      };
      this.grants.set(existing.id, refreshed);
      return refreshed;
    }
    const grant = {
      id: `grant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      realPath,
      displayPath,
      source,
      createdAt: Date.now()
    };
    this.grants.set(grant.id, grant);
    this.fsGuard.addRoot(realPath);
    return grant;
  }
  /** Look up a grant by id. */
  get(id) {
    return this.grants.get(id);
  }
  /** All active grants. */
  list() {
    return Array.from(this.grants.values());
  }
  /** Remove a grant and its FsGuard root. */
  revoke(id) {
    const grant = this.grants.get(id);
    if (!grant) return false;
    this.grants.delete(id);
    this.fsGuard.removeRoot(grant.realPath);
    return true;
  }
  findByRealPath(realPath) {
    for (const g of this.grants.values()) {
      if (g.realPath === realPath) return g;
    }
    return void 0;
  }
}
const fsGuard = new FsGuard();
const grantManager = new WorkspaceGrantManager({ fsGuard });
const recentWorkspaceRegistry = new RecentWorkspaceRegistry(grantManager, {
  readPaths: () => getStore("recentProjects"),
  writePaths: (paths) => setStore("recentProjects", paths)
});
let runtimeSettings = new RuntimeSettings();
let loginFlow = null;
function broadcastLoginState(state) {
  const win = electron.BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_CHANNELS.AUTH_LOGIN_STATE, state);
  }
}
const MAX_READ_FILE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_MIME_BY_EXT = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp"
};
function broadcastSessionEvent(event) {
  const wins = electron.BrowserWindow.getAllWindows();
  for (const win of wins) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.OMP_SESSION_EVENT, event);
    }
  }
  maybeNotifyTurnFinished(event);
  maybeNotifyUiRequest(event);
}
function sanitizeStreamingBehavior(value) {
  return value === "steer" || value === "followUp" ? value : void 0;
}
function sanitizeSubagentSelector(value) {
  const out = {};
  if (value && typeof value === "object") {
    const v = value;
    if (typeof v.subagentId === "string" && isSafeId(v.subagentId)) out.subagentId = v.subagentId;
    if (typeof v.sessionFile === "string" && v.sessionFile.length <= 4096 && !hasControl(v.sessionFile)) {
      out.sessionFile = v.sessionFile;
    }
    if (typeof v.fromByte === "number" && Number.isFinite(v.fromByte) && v.fromByte >= 0) {
      out.fromByte = Math.trunc(v.fromByte);
    }
  }
  return out;
}
function isSafeId(id) {
  return id.length > 0 && id.length <= 512 && !hasControl(id);
}
const CONTROL_RE = /[\x00-\x1f\x7f]/;
function hasControl(s) {
  return CONTROL_RE.test(s);
}
function sanitizeDialogFilters(value) {
  const fallback = [{ name: "Extensions", extensions: ["ts", "js"] }];
  if (!Array.isArray(value)) return fallback;
  const out = [];
  for (const f of value) {
    if (f && typeof f.name === "string" && Array.isArray(f.extensions) && f.extensions.every((e) => typeof e === "string")) {
      out.push({ name: f.name, extensions: f.extensions });
    }
  }
  return out.length ? out : fallback;
}
const SESSION_LEVELS = SESSION_THINKING_LEVELS;
const DEFAULT_LEVELS = DEFAULT_THINKING_LEVELS;
const PERMISSION_MODES = ["full", "no-bash", "readonly", "ask"];
function requireGrant(id) {
  if (typeof id !== "string" || !id.trim()) return null;
  const grant = grantManager.get(id);
  if (!grant) return null;
  return { grant, realPath: grant.realPath };
}
function registerIpc() {
  electron.ipcMain.handle(IPC_CHANNELS.OMP_DETECT, async (_event, force) => {
    if (force) {
      invalidateCliCache();
      runtimeSettings = new RuntimeSettings();
    }
    return detectCli();
  });
  electron.ipcMain.handle(IPC_CHANNELS.OMP_CAPABILITIES, async () => {
    return getCapabilities();
  });
  electron.ipcMain.handle(
    IPC_CHANNELS.OMP_LIST_SESSIONS,
    async () => listSessions()
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.OMP_CREATE_SESSION,
    async (_event, grantId, overrides) => {
      const resolved = requireGrant(grantId);
      if (!resolved) {
        throw new Error("createSession requires a valid WorkspaceGrant id");
      }
      const { realPath } = resolved;
      const modelSelector = typeof overrides?.modelSelector === "string" && isValidModelSelector(overrides.modelSelector) && splitModelSelector(overrides.modelSelector) ? overrides.modelSelector : void 0;
      const thinkingLevel = SESSION_LEVELS.includes(overrides?.thinkingLevel) ? overrides?.thinkingLevel : void 0;
      return createSession(realPath, broadcastSessionEvent, {
        ...modelSelector ? { modelSelector } : {},
        ...thinkingLevel ? { thinkingLevel } : {}
      });
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.OMP_SEND_MESSAGE,
    async (_event, sessionId, text, images, streamingBehavior) => {
      return sendMessage(
        sessionId,
        text,
        sanitizeImages(images),
        sanitizeStreamingBehavior(streamingBehavior)
      );
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.OMP_KILL_SESSION,
    async (_event, sessionId) => {
      return killSession(sessionId);
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.OMP_ABORT_SESSION,
    async (_event, sessionId) => {
      return abortSession(sessionId);
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.OMP_RESPOND_UI,
    async (_event, sessionId, requestId, answer) => {
      if (typeof requestId !== "string" || !requestId) return false;
      if (typeof answer !== "object" || answer === null || !("cancelled" in answer || "value" in answer || "confirmed" in answer)) {
        return false;
      }
      return respondExtensionUi(sessionId, requestId, answer);
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.OMP_SET_MODEL,
    async (_event, sessionId, provider, modelId) => {
      if (typeof provider !== "string" || typeof modelId !== "string") return false;
      const selector = `${provider}/${modelId}`;
      if (!splitModelSelector(selector)) return false;
      return setSessionModel(sessionId, provider, modelId);
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.PACKAGES_SEARCH,
    async (_event, query, curatedOnly) => {
      return searchCommunityPackages(typeof query === "string" ? query : "", curatedOnly === true);
    }
  );
  electron.ipcMain.handle(IPC_CHANNELS.PI_LIST_MODELS, async () => {
    return listAvailableModels();
  });
  electron.ipcMain.handle(
    IPC_CHANNELS.OMP_SESSION_STATS,
    async (_event, sessionId) => {
      if (typeof sessionId !== "string" || !sessionId) return null;
      return getSessionStats(sessionId);
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.OMP_LIST_COMMANDS,
    async (_event, sessionId) => {
      if (typeof sessionId !== "string" || !sessionId) return [];
      return listSessionCommands(sessionId);
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.OMP_COMPACT,
    async (_event, sessionId) => {
      if (typeof sessionId !== "string" || !sessionId) return false;
      return compactSession(sessionId);
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.OMP_STEER,
    async (_event, sessionId, message, images) => {
      if (typeof sessionId !== "string" || !sessionId || typeof message !== "string") return false;
      return steer(sessionId, message, sanitizeImages(images));
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.OMP_FOLLOW_UP,
    async (_event, sessionId, message, images) => {
      if (typeof sessionId !== "string" || !sessionId || typeof message !== "string") return false;
      return followUp(sessionId, message, sanitizeImages(images));
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.OMP_SET_THINKING,
    async (_event, sessionId, level) => {
      if (typeof sessionId !== "string" || !sessionId) return false;
      if (!SESSION_LEVELS.includes(level)) return false;
      return setThinkingLevel(sessionId, level);
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.OMP_UPDATE_APPROVAL_CONFIG,
    async (_event, sessionId, mode) => {
      if (typeof sessionId !== "string" || !sessionId) return false;
      if (!PERMISSION_MODES.includes(mode)) return false;
      return updateApprovalConfig(sessionId, mode);
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.OMP_EXPORT_HTML,
    async (_event, sessionId) => {
      if (typeof sessionId !== "string" || !sessionId) return null;
      const target = path.join(
        electron.app.getPath("downloads"),
        defaultExportFileName(getSession(sessionId)?.title, sessionId)
      );
      const saved = await exportHtml(sessionId, target);
      if (saved) electron.shell.showItemInFolder(saved);
      return saved;
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.OMP_SESSION_STATE,
    async (_event, sessionId) => {
      if (typeof sessionId !== "string" || !sessionId) return null;
      return getSessionState(sessionId);
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.OMP_LIST_SESSION_HISTORY,
    async (_event, grantId) => {
      const resolved = requireGrant(grantId);
      if (!resolved) return [];
      return listSessionHistory(resolved.realPath);
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.OMP_RESUME_SESSION,
    async (_event, grantId, filePath) => {
      const resolved = requireGrant(grantId);
      if (!resolved) return null;
      if (typeof filePath !== "string" || !filePath.trim()) return null;
      return resumeSession(resolved.realPath, broadcastSessionEvent, filePath);
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.OMP_DELETE_SESSION_FILE,
    async (_event, filePath) => {
      if (typeof filePath !== "string" || !filePath.trim()) return false;
      return deleteSessionFile(filePath);
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.OMP_SET_SESSION_NAME,
    async (_event, sessionId, name) => {
      if (typeof sessionId !== "string" || !sessionId || typeof name !== "string") return false;
      return setSessionName(sessionId, name);
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.OMP_GET_SUBAGENTS,
    async (_event, sessionId) => {
      if (typeof sessionId !== "string" || !sessionId) return null;
      return getSubagents(sessionId);
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.OMP_GET_SUBAGENT_MESSAGES,
    async (_event, sessionId, selector) => {
      if (typeof sessionId !== "string" || !sessionId) return null;
      return getSubagentMessages(sessionId, sanitizeSubagentSelector(selector));
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.CHECKPOINT_CREATE,
    async (_event, sessionId, msgIndex, promptPreview) => {
      if (typeof sessionId !== "string" || !sessionId) return null;
      const session = getSession(sessionId);
      if (!session) return null;
      const snapshot = await createCheckpoint(session.cwd);
      if (!snapshot) return null;
      const info = {
        id: crypto.randomUUID(),
        sessionId,
        sha: snapshot.sha,
        untracked: snapshot.untracked,
        promptPreview: typeof promptPreview === "string" ? promptPreview.slice(0, 80) : "",
        msgIndex: typeof msgIndex === "number" ? msgIndex : 0,
        createdAt: Date.now()
      };
      saveCheckpoint(info);
      return info;
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.CHECKPOINT_LIST,
    async (_event, sessionId) => {
      if (typeof sessionId !== "string" || !sessionId) return [];
      return listCheckpoints(sessionId);
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.CHECKPOINT_RESTORE,
    async (_event, id) => {
      if (typeof id !== "string" || !id) return { ok: false, log: "invalid checkpoint id" };
      const checkpoint = getCheckpoint(id);
      if (!checkpoint) return { ok: false, log: "Checkpoint not found." };
      const session = getSession(checkpoint.sessionId);
      if (!session) return { ok: false, log: "Session is no longer running." };
      return restoreCheckpoint(session.cwd, checkpoint.sha, checkpoint.untracked);
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.GIT_INFO,
    async (_event, grantId) => {
      const resolved = requireGrant(grantId);
      if (!resolved) return null;
      return getGitInfo(resolved.realPath);
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.GIT_FILE_DIFF,
    async (_event, grantId, filePath) => {
      const resolved = requireGrant(grantId);
      if (!resolved) return null;
      if (typeof filePath !== "string" || !filePath.trim()) return null;
      return getFileDiff(resolved.realPath, filePath);
    }
  );
  electron.ipcMain.handle(IPC_CHANNELS.UPDATER_GET_STATUS, async () => {
    return getUpdaterStatus();
  });
  electron.ipcMain.handle(IPC_CHANNELS.UPDATER_CHECK, async () => {
    return updaterCheck();
  });
  electron.ipcMain.handle(IPC_CHANNELS.UPDATER_DOWNLOAD, async () => {
    return updaterDownload();
  });
  electron.ipcMain.handle(IPC_CHANNELS.UPDATER_QUIT_INSTALL, async () => {
    updaterQuitAndInstall();
  });
  electron.ipcMain.handle(IPC_CHANNELS.UPDATER_OPEN_PAGE, async () => {
    await updaterOpenReleasePage();
  });
  electron.ipcMain.handle(
    IPC_CHANNELS.PI_SET_MACHINE_SKILLS,
    async (_event, enabled) => {
      const on = enabled === true;
      setStore("machineSkills", on);
      const excluded = syncMachineSkills(on);
      return { enabled: on, excluded, available: listMachineSkillNames() };
    }
  );
  electron.ipcMain.handle(IPC_CHANNELS.PI_LIST_MACHINE_SKILLS, async () => {
    return listMachineSkillNames();
  });
  electron.ipcMain.handle(IPC_CHANNELS.PI_LIST_CATALOG_MODELS, async () => {
    return listCatalogModels();
  });
  electron.ipcMain.handle(IPC_CHANNELS.PI_GET_MODEL_CONFIG, async () => {
    return getModelConfig();
  });
  electron.ipcMain.handle(
    IPC_CHANNELS.PI_SET_MODEL_CONFIG,
    async (_event, patch) => {
      if (typeof patch !== "object" || patch === null) {
        return { ok: false, log: "invalid model config" };
      }
      return setModelConfig(patch);
    }
  );
  electron.ipcMain.handle(IPC_CHANNELS.PI_SET_API_KEY, async (_event, provider, key) => {
    if (typeof key !== "string") return { ok: false, log: "invalid api key" };
    const result = setApiKey(String(provider ?? ""), key);
    if (result.ok) invalidateModelCache();
    return result;
  });
  electron.ipcMain.handle(IPC_CHANNELS.PI_CLEAR_API_KEY, async (_event, provider) => {
    const result = clearApiKey(String(provider ?? ""));
    if (result.ok) invalidateModelCache();
    return result;
  });
  electron.ipcMain.handle(IPC_CHANNELS.RUNTIME_OVERVIEW, async (_event, force) => {
    return runtimeSettings.getOverview(force === true);
  });
  electron.ipcMain.handle(IPC_CHANNELS.RUNTIME_LIST_MODELS, async () => {
    return runtimeSettings.listModels();
  });
  electron.ipcMain.handle(IPC_CHANNELS.RUNTIME_LIST_MODEL_CATALOG, async () => {
    return listOmpModelCatalog();
  });
  electron.ipcMain.handle(IPC_CHANNELS.RUNTIME_REFRESH_MODEL_CATALOG, async () => {
    return refreshModelCatalog();
  });
  electron.ipcMain.handle(
    IPC_CHANNELS.RUNTIME_SET_DEFAULT_MODEL,
    async (_event, selector) => {
      if (typeof selector !== "string" || selector !== "" && !isValidModelSelector(selector)) {
        return { ok: false, error: "invalid model selector" };
      }
      return runtimeSettings.setDefaultModel(selector);
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.RUNTIME_SET_DEFAULT_THINKING,
    async (_event, level) => {
      if (typeof level !== "string" || level !== "" && !DEFAULT_LEVELS.includes(level)) {
        return { ok: false, error: "invalid thinking level" };
      }
      return runtimeSettings.setDefaultThinking(level);
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.RUNTIME_SET_MACHINE_SKILLS,
    async (_event, enabled) => {
      return runtimeSettings.setMachineSkills(enabled === true);
    }
  );
  electron.ipcMain.handle(IPC_CHANNELS.CUSTOM_PROVIDERS_LIST, async () => {
    return listCustomProviders();
  });
  electron.ipcMain.handle(
    IPC_CHANNELS.CUSTOM_PROVIDERS_SAVE,
    async (_event, raw) => {
      const spec = sanitizeCustomProviderSpec(raw);
      if (!spec) return { ok: false, error: "invalid-spec" };
      return saveCustomProvider(spec);
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.CUSTOM_PROVIDERS_DELETE,
    async (_event, id) => {
      if (typeof id !== "string" || !PROVIDER_ID_PATTERN.test(id)) return { ok: false };
      return deleteCustomProvider(id);
    }
  );
  electron.ipcMain.handle(IPC_CHANNELS.AUTH_START_LOGIN, async (_event, providerId) => {
    if (typeof providerId !== "string" || !PROVIDER_ID_PATTERN.test(providerId)) {
      return { ok: false, error: "invalid provider id" };
    }
    if (loginFlow?.active) {
      return { ok: false, error: "a login flow is already running" };
    }
    const cli = detectCli();
    const flow = new OmpLoginFlow({
      cli,
      onState: broadcastLoginState,
      // No auto-open: key-based providers (DeepSeek, OpenRouter, xAI, …)
      // emit open_url just to point at the API-key dashboard before showing
      // the paste-key input. The URL is stashed in loginState and opened only
      // on explicit user action via AUTH_OPEN_LOGIN_URL.
      onOpenUrl: () => {
      }
    });
    loginFlow = flow;
    void flow.start(providerId).finally(() => {
      runtimeSettings.invalidate();
      if (loginFlow === flow) loginFlow = null;
    });
    return { ok: true };
  });
  electron.ipcMain.handle(IPC_CHANNELS.AUTH_ANSWER_LOGIN, async (_event, answer) => {
    if (!loginFlow?.active) return { ok: false, error: "no active login flow" };
    if (typeof answer !== "object" || answer === null || !("cancelled" in answer || "value" in answer || "confirmed" in answer)) {
      return { ok: false, error: "invalid answer" };
    }
    if ("value" in answer && typeof answer.value !== "string") {
      return { ok: false, error: "invalid answer" };
    }
    return { ok: loginFlow.answer(answer) };
  });
  electron.ipcMain.handle(
    IPC_CHANNELS.AUTH_SET_API_KEY,
    async (_event, providerId, key) => {
      if (typeof providerId !== "string" || !PROVIDER_ID_PATTERN.test(providerId)) {
        return { ok: false, error: "invalid provider id" };
      }
      if (typeof key !== "string" || !key.trim()) {
        return { ok: false, error: "invalid api key" };
      }
      if (loginFlow?.active) {
        return { ok: false, error: "a login flow is already running" };
      }
      const cli = detectCli();
      const flow = new OmpLoginFlow({
        cli,
        onState: broadcastLoginState,
        onOpenUrl: () => {
        }
      });
      loginFlow = flow;
      try {
        const state = await flow.setApiKey(providerId, key.trim());
        runtimeSettings.invalidate();
        return state.status === "connected" ? { ok: true } : { ok: false, error: "message" in state ? state.message : "failed" };
      } finally {
        if (loginFlow === flow) loginFlow = null;
      }
    }
  );
  electron.ipcMain.handle(IPC_CHANNELS.AUTH_CANCEL_LOGIN, async () => {
    loginFlow?.cancel();
    return { ok: true };
  });
  electron.ipcMain.handle(IPC_CHANNELS.AUTH_OPEN_LOGIN_URL, async (_event, url) => {
    if (typeof url !== "string") return { ok: false, error: "invalid url" };
    if (!/^https:\/\//i.test(url) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(url)) {
      return { ok: false, error: "invalid url" };
    }
    await electron.shell.openExternal(url);
    return { ok: true };
  });
  electron.ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async (_event, providerId) => {
    if (typeof providerId !== "string" || !PROVIDER_ID_PATTERN.test(providerId)) {
      return { ok: false, error: "invalid provider id" };
    }
    return runtimeSettings.logout(providerId);
  });
  electron.ipcMain.handle(IPC_CHANNELS.APP_VERSION, async () => {
    return electron.app.getVersion();
  });
  electron.ipcMain.handle(IPC_CHANNELS.OMP_INSTALL, async (event) => {
    const sender = event.sender;
    const success = await installOmp((status) => {
      if (!sender.isDestroyed()) {
        sender.send(IPC_CHANNELS.OMP_INSTALL_STATUS, status);
      }
    });
    if (success) {
      invalidateCliCache();
    }
    return success;
  });
  electron.ipcMain.handle(IPC_CHANNELS.WORKSPACE_SELECT, async () => {
    const result = await electron.dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled || !result.filePaths[0]) return null;
    const grant = await grantManager.createGrant(result.filePaths[0], "dialog");
    if (grant) rememberRecentProject(grant.realPath);
    return grant;
  });
  electron.ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_ACTIVATE_RECENT,
    async (_event, recentId) => {
      return recentWorkspaceRegistry.activate(recentId);
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_LIST_RECENT,
    async () => recentWorkspaceRegistry.list()
  );
  electron.ipcMain.handle(IPC_CHANNELS.WORKSPACE_CLEAR_RECENT, async () => {
    await recentWorkspaceRegistry.clear();
    return true;
  });
  electron.ipcMain.handle(IPC_CHANNELS.WORKSPACE_REMOVE_RECENT, async (_event, displayPath) => {
    return recentWorkspaceRegistry.remove(displayPath);
  });
  electron.ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_ACTIVATE,
    async (_event, grantId) => {
      if (typeof grantId !== "string" || !grantId.trim()) return null;
      const grant = grantManager.get(grantId);
      if (!grant) return null;
      try {
        const st = await fs.promises.stat(grant.realPath);
        if (!st.isDirectory()) {
          grantManager.revoke(grantId);
          return null;
        }
      } catch {
        grantManager.revoke(grantId);
        return null;
      }
      return grant;
    }
  );
  electron.ipcMain.handle(IPC_CHANNELS.WORKSPACE_REVOKE, async (_event, grantId) => {
    if (typeof grantId !== "string" || !grantId.trim()) return false;
    return grantManager.revoke(grantId);
  });
  electron.ipcMain.handle(IPC_CHANNELS.WORKSPACE_LIST, async () => {
    return grantManager.list();
  });
  electron.ipcMain.handle(IPC_CHANNELS.FS_SET_ROOT, async () => false);
  electron.ipcMain.handle(
    IPC_CHANNELS.FS_LIST_DIR,
    async (_event, grantId, relativePath) => {
      const resolved = requireGrant(grantId);
      if (!resolved) return [];
      const dirPath = path.resolve(resolved.realPath, typeof relativePath === "string" ? relativePath : ".");
      if (!fsGuard.isAllowed(dirPath)) return [];
      const fsp = await import("node:fs/promises");
      try {
        const entries = await fsp.readdir(dirPath, { withFileTypes: true });
        return entries.map((e) => ({
          name: e.name,
          isDirectory: e.isDirectory(),
          path: path.join(typeof relativePath === "string" ? relativePath : "", e.name).replace(/\\/g, "/")
        }));
      } catch {
        return [];
      }
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.FS_LIST_PROJECT_FILES,
    async (_event, grantId) => {
      const resolved = requireGrant(grantId);
      if (!resolved) return [];
      return listProjectFiles(resolved.realPath);
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.FS_READ_FILE,
    async (_event, grantId, relativePath) => {
      const resolved = requireGrant(grantId);
      if (!resolved) {
        return { ok: false, error: "Access denied: invalid workspace grant." };
      }
      const filePath = path.resolve(resolved.realPath, relativePath);
      if (!fsGuard.isAllowed(filePath)) {
        return { ok: false, error: "Access denied: path is outside the allowed project folders." };
      }
      const fs2 = await import("node:fs/promises");
      try {
        const stat = await fs2.stat(filePath);
        if (!stat.isFile()) {
          return { ok: false, error: "Not a regular file." };
        }
        if (stat.size > MAX_READ_FILE_BYTES) {
          return {
            ok: false,
            error: `File too large to preview (${(stat.size / 1024 / 1024).toFixed(1)} MB, limit 2 MB).`
          };
        }
        const buf = await fs2.readFile(filePath);
        if (buf.subarray(0, 8192).includes(0)) {
          return { ok: false, error: "Binary file cannot be previewed." };
        }
        return { ok: true, content: buf.toString("utf-8") };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );
  electron.ipcMain.handle(IPC_CHANNELS.PACKAGES_LIST, async () => {
    return listPackages();
  });
  function validSource(source) {
    return typeof source === "string" && source.trim().length > 0 && source.trim().length < 500 && !source.trim().startsWith("-");
  }
  electron.ipcMain.handle(IPC_CHANNELS.PACKAGES_INSTALL, async (_event, source) => {
    if (!validSource(source)) return { ok: false, log: "invalid package source" };
    return installPackage(source.trim());
  });
  electron.ipcMain.handle(IPC_CHANNELS.PACKAGES_REMOVE, async (_event, source) => {
    if (!validSource(source)) return { ok: false, log: "invalid package source" };
    return removePackage(source.trim());
  });
  electron.ipcMain.handle(IPC_CHANNELS.PACKAGES_UPDATE, async (_event, source) => {
    if (!validSource(source)) return { ok: false, log: "invalid package source" };
    return updatePackage(source.trim());
  });
  electron.ipcMain.handle(
    IPC_CHANNELS.PACKAGES_SET_ENABLED,
    async (_event, source, enabled) => {
      if (!validSource(source)) return { ok: false, log: "invalid package source" };
      return setPackageEnabled(source.trim(), Boolean(enabled));
    }
  );
  function sanitizeScaffoldSpec(raw) {
    if (!raw || typeof raw !== "object") return null;
    const s = raw;
    if (typeof s.name !== "string" || typeof s.parentDir !== "string") return null;
    if (s.name.length > 250 || s.parentDir.length > 1e3) return null;
    const opt = (v) => typeof v === "string" && v.trim().length > 0 && v.length <= 500 ? v.trim() : void 0;
    return {
      name: s.name.trim(),
      displayName: opt(s.displayName),
      description: typeof s.description === "string" ? s.description.slice(0, 2e3) : "",
      version: typeof s.version === "string" && s.version.trim() ? s.version.trim() : "0.1.0",
      author: opt(s.author),
      parentDir: s.parentDir,
      extension: s.extension === true,
      skill: s.skill === true,
      prompt: s.prompt === true,
      template: s.template === "command" || s.template === "tool-guard" ? s.template : "blank"
    };
  }
  electron.ipcMain.handle(IPC_CHANNELS.PLUGINS_SCAFFOLD, async (_event, raw) => {
    const spec = sanitizeScaffoldSpec(raw);
    if (!spec) return { ok: false, error: "invalid-spec" };
    return scaffoldPlugin(spec);
  });
  electron.ipcMain.handle(IPC_CHANNELS.PLUGINS_REVEAL, async (_event, target) => {
    if (typeof target !== "string" || !target.trim() || target.length > 1e3) return false;
    electron.shell.showItemInFolder(target);
    return true;
  });
  electron.ipcMain.handle(IPC_CHANNELS.SHELL_SHOW_CLI_SETTINGS, async () => {
    const settingsFile2 = path.join(defaultPiAgentDir(), "settings.json");
    electron.shell.showItemInFolder(settingsFile2);
    return true;
  });
  electron.ipcMain.handle(IPC_CHANNELS.STORE_GET, async (_event, key) => {
    return getStore(key);
  });
  electron.ipcMain.handle(IPC_CHANNELS.STORE_SET, async (_event, key, value) => {
    if (key === "recentProjects") return false;
    setStore(key, value);
    if (key === "toolAccess" && (value === "full" || value === "no-bash" || value === "readonly")) {
      setStore("permissionMode", value);
    }
    return true;
  });
  electron.ipcMain.handle(IPC_CHANNELS.BOARDS_LIST, async () => {
    return listBoards();
  });
  electron.ipcMain.handle(IPC_CHANNELS.BOARDS_SAVE, async (_event, board) => {
    return saveBoard(board);
  });
  electron.ipcMain.handle(IPC_CHANNELS.BOARDS_DELETE, async (_event, id) => {
    return deleteBoard(id);
  });
  electron.ipcMain.handle(IPC_CHANNELS.DIALOG_SELECT_FOLDER, async () => {
    const result = await electron.dialog.showOpenDialog({
      properties: ["openDirectory"]
    });
    return result.canceled ? null : result.filePaths[0];
  });
  electron.ipcMain.handle(IPC_CHANNELS.DIALOG_SELECT_FILE, async (_event, filters) => {
    const result = await electron.dialog.showOpenDialog({
      properties: ["openFile"],
      filters: sanitizeDialogFilters(filters)
    });
    return result.canceled ? null : result.filePaths[0];
  });
  electron.ipcMain.handle(IPC_CHANNELS.DIALOG_SELECT_IMAGE, async () => {
    const result = await electron.dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: Object.keys(IMAGE_MIME_BY_EXT) }]
    });
    const filePath = result.canceled ? void 0 : result.filePaths[0];
    if (!filePath) return null;
    const mimeType = IMAGE_MIME_BY_EXT[path.extname(filePath).slice(1).toLowerCase()];
    if (!mimeType) return { ok: false, error: "notImage" };
    const fs2 = await import("node:fs/promises");
    try {
      const stat = await fs2.stat(filePath);
      if (stat.size > MAX_IMAGE_BYTES) return { ok: false, error: "tooLarge" };
      const buf = await fs2.readFile(filePath);
      return { ok: true, name: path.basename(filePath), data: buf.toString("base64"), mimeType };
    } catch {
      return { ok: false, error: "readFailed" };
    }
  });
}
const isDev = process.env.NODE_ENV === "development" || !electron.app.isPackaged;
function cleanStaleApprovalConfigs() {
  try {
    const dir = electron.app.getPath("userData");
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith("omp-approval-config-") && name.endsWith(".json")) {
        fs.unlinkSync(path.join(dir, name));
      }
    }
  } catch {
  }
}
function createWindow() {
  const width = Math.max(900, Math.min(getStore("windowWidth") || 1280, 5120));
  const height = Math.max(600, Math.min(getStore("windowHeight") || 800, 5120));
  const win = new electron.BrowserWindow({
    width,
    height,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.on("resize", () => {
    const [w, h] = win.getSize();
    setStore("windowWidth", w);
    setStore("windowHeight", h);
  });
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  return win;
}
electron.app.whenReady().then(() => {
  registerIpc();
  applyFirstRunDefaults();
  if (detectCli().command !== "omp") {
    syncMachineSkills(getStore("machineSkills"));
  }
  cleanStaleApprovalConfigs();
  createWindow();
  initUpdater();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
