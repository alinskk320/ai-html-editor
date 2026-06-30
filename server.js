const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT_DIR = __dirname;
loadDotEnv(path.join(ROOT_DIR, ".env"));

const PORT = Number(process.env.PORT || 6199);
const HOST = process.env.HOST || "0.0.0.0";
const OUTPUTS_DIR = path.join(ROOT_DIR, "outputs");
const INDEX_FILE = path.join(OUTPUTS_DIR, "html-editor.html");

const PROVIDER_PRESETS = {
  openai: {
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4.1-mini"
  },
  deepseek: {
    endpoint: "https://api.deepseek.com/chat/completions",
    model: "deepseek-v4-flash"
  },
  qwen: {
    endpoint: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions",
    model: "qwen-plus"
  },
  custom: {
    endpoint: "",
    model: ""
  }
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      writeCorsHeaders(res);
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === "/health") {
      writeJson(res, 200, { ok: true, port: PORT });
      return;
    }

    if (req.method === "POST" && req.url === "/api/ai/rewrite") {
      const payload = await readJsonBody(req);
      const result = await handleAiRewrite(payload);
      writeJson(res, 200, result);
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      await serveStatic(req, res);
      return;
    }

    writeJson(res, 405, { error: { message: "Method Not Allowed" } });
  } catch (error) {
    writeJson(res, error.statusCode || 500, {
      error: {
        message: error.message || "Internal Server Error"
      }
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`HTML editor server running at http://localhost:${PORT}`);
});

async function handleAiRewrite(payload) {
  const {
    provider = "openai",
    endpoint,
    model,
    apiKey,
    instruction,
    selectedTag,
    selectedHtml,
    selectedContext,
    pageSummary,
    thread = []
  } = payload || {};

  if (!instruction) {
    createHttpError(400, "Missing instruction");
  }
  if (!selectedHtml) {
    createHttpError(400, "Missing selectedHtml");
  }

  const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.custom;
  const providerName = String(provider || "custom").toUpperCase();
  const upstreamEndpoint = (endpoint || process.env[`${providerName}_ENDPOINT`] || preset.endpoint || "").trim();
  const upstreamModel = (model || process.env[`${providerName}_MODEL`] || preset.model || "").trim();
  const upstreamApiKey = (apiKey || process.env[`${providerName}_API_KEY`] || process.env.AI_API_KEY || "").trim();

  if (!upstreamEndpoint) {
    createHttpError(
      400,
      `Missing upstream endpoint. Fill it in the UI or configure ${providerName}_ENDPOINT in .env.`
    );
  }
  if (!upstreamModel) {
    createHttpError(
      400,
      `Missing model. Fill it in the UI or configure ${providerName}_MODEL in .env.`
    );
  }
  if (!upstreamApiKey) {
    createHttpError(
      400,
      `Missing API key. Fill it in the UI or configure ${providerName}_API_KEY / AI_API_KEY in .env.`
    );
  }
  if (provider === "qwen" && upstreamEndpoint.includes("{WorkspaceId}")) {
    createHttpError(
      400,
      "Qwen endpoint still contains {WorkspaceId}. Replace it with your real workspace id in the UI or .env."
    );
  }

  const upstreamPayload = {
    model: upstreamModel,
    temperature: 0.7,
    messages: buildAiMessages(thread, {
      selectedTag,
      selectedHtml,
      selectedContext,
      pageSummary,
      instruction
    })
  };

  const response = await fetch(upstreamEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${upstreamApiKey}`
    },
    body: JSON.stringify(upstreamPayload)
  });

  const rawText = await response.text();
  const data = safeJsonParse(rawText);
  if (!response.ok) {
    const message = buildUpstreamErrorMessage({
      provider,
      endpoint: upstreamEndpoint,
      status: response.status,
      data,
      rawText
    });
    createHttpError(response.status, message);
  }

  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    createHttpError(502, "Model returned empty content");
  }

  return parseAiRewriteResponse(content);
}

function buildAiMessages(thread, context) {
  const messages = [
    {
      role: "system",
      content:
        [
          "你是一个资深前端设计与 HTML 编辑助手。",
          "你只能返回一个 JSON 对象，格式必须是 {\"reply\":\"给用户的简短回复\",\"html\":\"重写后的单个组件HTML\"}。",
          "不能返回 Markdown 代码块，不能返回整页 HTML。",
          "你只允许修改当前选中的单个组件，不要改写其它组件。",
          "优先做保守微调，非必要不要新增或删除节点。",
          "尽量保留原有类名、语义结构、内容层级和可复用样式。",
          "你会收到当前组件、局部上下文和页面摘要，请结合上下文让改动更贴合整页风格。"
        ].join(" ")
    }
  ];

  const safeThread = Array.isArray(thread) ? thread : [];
  safeThread.forEach((message, index) => {
    if (!message || typeof message.content !== "string") return;
    const isLastUser = index === safeThread.length - 1 && message.role === "user";
    if (!isLastUser) {
      messages.push({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content
      });
      return;
    }

    messages.push({
      role: "user",
      content: [
        message.content,
        "",
        "当前组件标签：",
        context.selectedTag || "div",
        "",
        "当前组件 HTML：",
        context.selectedHtml,
        "",
        "局部上下文：",
        formatSelectedContext(context.selectedContext),
        "",
        "页面摘要：",
        context.pageSummary || "无",
        "",
        "本轮要求：",
        context.instruction,
        "",
        "请只返回 JSON：{\"reply\":\"...\",\"html\":\"...\"}"
      ].join("\n")
    });
  });

  if (messages.length === 1) {
    messages.push({
      role: "user",
      content: [
        context.instruction,
        "",
        "当前组件标签：",
        context.selectedTag || "div",
        "",
        "当前组件 HTML：",
        context.selectedHtml,
        "",
        "局部上下文：",
        formatSelectedContext(context.selectedContext),
        "",
        "页面摘要：",
        context.pageSummary || "无",
        "",
        "请只返回 JSON：{\"reply\":\"...\",\"html\":\"...\"}"
      ].join("\n")
    });
  }

  return messages;
}

function formatSelectedContext(selectedContext) {
  if (!selectedContext || typeof selectedContext !== "object") return "无";
  const parentHtml = selectedContext.parentHtml || "无";
  const siblingsBefore = Array.isArray(selectedContext.siblingsBefore) && selectedContext.siblingsBefore.length
    ? selectedContext.siblingsBefore.join("\n---\n")
    : "无";
  const siblingsAfter = Array.isArray(selectedContext.siblingsAfter) && selectedContext.siblingsAfter.length
    ? selectedContext.siblingsAfter.join("\n---\n")
    : "无";
  return [
    "父级容器：",
    parentHtml,
    "",
    "前置兄弟组件：",
    siblingsBefore,
    "",
    "后置兄弟组件：",
    siblingsAfter
  ].join("\n");
}

function parseAiRewriteResponse(content) {
  const cleaned = stripCodeFence(content);
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed.html === "string" && parsed.html.trim()) {
      return {
        reply: parsed.reply || "",
        html: parsed.html.trim()
      };
    }
  } catch (_error) {
    // Fall through to HTML-only mode.
  }

  if (cleaned.startsWith("<")) {
    return {
      reply: "已根据你的要求完成重写。",
      html: cleaned
    };
  }

  createHttpError(502, "Model returned an unsupported format");
}

function stripCodeFence(content) {
  return String(content)
    .replace(/^```html\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function safeJsonParse(rawText) {
  if (!rawText) return {};
  try {
    return JSON.parse(rawText);
  } catch (_error) {
    return {};
  }
}

function buildUpstreamErrorMessage({ provider, endpoint, status, data, rawText }) {
  const upstreamMessage =
    data?.error?.message ||
    data?.message ||
    extractReadableUpstreamText(rawText);

  const base = `AI upstream request failed for provider "${provider}" with status ${status}.`;

  if (status === 401 || status === 403) {
    return `${base} Check whether the API key is valid and matches the selected provider. ${upstreamMessage}`.trim();
  }

  if (status === 404) {
    return `${base} The endpoint may be incorrect or the provider route does not exist: \`${endpoint}\`. ${upstreamMessage}`.trim();
  }

  if (status === 429) {
    return `${base} The upstream service is rate limiting this request. ${upstreamMessage}`.trim();
  }

  if (status >= 500) {
    return `${base} The upstream service is currently unavailable. ${upstreamMessage}`.trim();
  }

  return `${base} ${upstreamMessage || "Check endpoint, model, and request format."}`.trim();
}

function extractReadableUpstreamText(rawText) {
  const text = String(rawText || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.slice(0, 200);
}

async function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let filePath;

  if (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html") {
    filePath = INDEX_FILE;
  } else {
    const normalizedPath = path.normalize(decodeURIComponent(requestUrl.pathname)).replace(/^(\.\.[/\\])+/, "");
    filePath = path.join(ROOT_DIR, normalizedPath);
  }

  if (!filePath.startsWith(ROOT_DIR)) {
    createHttpError(403, "Forbidden");
  }

  const stats = await fs.promises.stat(filePath).catch(() => null);
  if (!stats || !stats.isFile()) {
    createHttpError(404, "File Not Found");
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const fileBuffer = await fs.promises.readFile(filePath);
  writeCorsHeaders(res);
  res.writeHead(200, { "Content-Type": contentType });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(fileBuffer);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (_error) {
    createHttpError(400, "Invalid JSON body");
  }
}

function writeJson(res, statusCode, payload) {
  writeCorsHeaders(res);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

function writeCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function loadDotEnv(filePath) {
  const raw = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  if (!raw) return;

  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] != null) return;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  });
}
