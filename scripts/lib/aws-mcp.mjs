import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { log } from "./log.mjs";

const AWS_KNOWLEDGE_MCP_URL = "https://knowledge-mcp.global.api.aws/mcp";
const ALLOWED_HOST_PREFIXES = [
  "https://docs.aws.amazon.com/",
  "https://aws.amazon.com/",
  "https://docs.amplify.aws/",
  "https://repost.aws/knowledge-center/",
];

function assertSafeUrl(url) {
  if (typeof url !== "string" || url.length > 2048) {
    throw new Error("Invalid AWS docs URL");
  }
  const ok = ALLOWED_HOST_PREFIXES.some((p) => url.startsWith(p));
  if (!ok) {
    throw new Error(`URL not in AWS docs allow-list: ${url}`);
  }
}

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry(fn, { attempts = 3, baseMs = 800, label = "op" } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const delay = baseMs * Math.pow(2, i) + Math.floor(Math.random() * 200);
      log.warn(`${label} failed, retrying`, { attempt: i + 1, attempts, delayMs: delay, error: String(err?.message ?? err) });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export async function createAwsKnowledgeClient() {
  const transport = new StreamableHTTPClientTransport(new URL(AWS_KNOWLEDGE_MCP_URL));
  const client = new Client(
    { name: "aws-docs-notion-sync", version: "1.0.0" },
    { capabilities: {} },
  );
  await withTimeout(client.connect(transport), 20_000, "MCP connect");
  log.info("Connected to AWS Knowledge MCP", { url: AWS_KNOWLEDGE_MCP_URL });
  return {
    async readDocumentation(url, { maxLength = 40_000, startIndex = 0 } = {}) {
      assertSafeUrl(url);
      const result = await withRetry(
        () =>
          withTimeout(
            client.callTool({
              name: "aws___read_documentation",
              arguments: { requests: [{ url, max_length: maxLength, start_index: startIndex }] },
            }),
            45_000,
            "aws___read_documentation",
          ),
        { label: `read ${url}` },
      );
      return parseToolResult(result);
    },
    async recommend(url) {
      assertSafeUrl(url);
      const result = await withRetry(
        () =>
          withTimeout(
            client.callTool({ name: "aws___recommend", arguments: { url } }),
            30_000,
            "aws___recommend",
          ),
        { label: `recommend ${url}` },
      );
      return parseToolResult(result);
    },
    async close() {
      try {
        await client.close();
      } catch (err) {
        log.warn("MCP client close failed", { error: String(err?.message ?? err) });
      }
    },
  };
}

function parseToolResult(result) {
  if (!result || !Array.isArray(result.content)) {
    throw new Error("Unexpected MCP tool response shape");
  }
  if (result.isError) {
    const text = result.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
    throw new Error(`MCP tool error: ${text.slice(0, 500)}`);
  }
  const textBlocks = result.content
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text);
  if (textBlocks.length === 0) {
    return { raw: "", json: null };
  }
  const joined = textBlocks.join("\n");
  let json = null;
  try {
    json = JSON.parse(joined);
  } catch {
    /* not JSON, that's fine */
  }
  return { raw: joined, json };
}
