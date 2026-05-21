import { Client } from "@notionhq/client";
import { log } from "./log.mjs";

const NOTION_TEXT_BLOCK_LIMIT = 1900;
const DEFAULT_AI_ENDPOINT = "https://models.github.ai/inference/chat/completions";

export function createNotionClient() {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN env var is required");
  return new Client({ auth: token, notionVersion: "2025-09-03" });
}

function chunkText(text, limit = NOTION_TEXT_BLOCK_LIMIT) {
  const out = [];
  let remaining = text ?? "";
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf("\n", limit);
    if (cut < limit / 2) cut = limit;
    out.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  if (remaining.length > 0) out.push(remaining);
  return out;
}

function paragraphBlocks(text) {
  return chunkText(text).map((chunk) => ({
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: [{ type: "text", text: { content: chunk } }] },
  }));
}

function bulletBlock(text) {
  return chunkText(text).map((chunk) => ({
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: { rich_text: [{ type: "text", text: { content: chunk } }] },
  }));
}

function calloutBlock({ icon = "🔔", title, color = "blue_background" }) {
  return {
    object: "block",
    type: "callout",
    callout: {
      icon: { type: "emoji", emoji: icon },
      color,
      rich_text: [{ type: "text", text: { content: title.slice(0, NOTION_TEXT_BLOCK_LIMIT) } }],
    },
  };
}

function dividerBlock() {
  return { object: "block", type: "divider", divider: {} };
}

function headingBlock(text, level = 2) {
  const type = `heading_${level}`;
  return {
    object: "block",
    type,
    [type]: { rich_text: [{ type: "text", text: { content: text.slice(0, NOTION_TEXT_BLOCK_LIMIT) } }] },
  };
}

export async function appendChangeReport(notion, pageId, report) {
  const { displayName, awsUrl, dateIso, summary, bullets, fullDiff } = report;
  const date = dateIso.slice(0, 10);
  const children = [
    dividerBlock(),
    calloutBlock({
      icon: "🔄",
      title: `AWS docs update detected — ${displayName} — ${date}`,
      color: "blue_background",
    }),
    paragraphBlocks(`Source: ${awsUrl}`)[0],
    headingBlock("Summary of changes", 3),
    ...paragraphBlocks(summary || "(no summary)"),
  ];
  if (Array.isArray(bullets) && bullets.length > 0) {
    children.push(headingBlock("Key updates", 3));
    for (const b of bullets) {
      children.push(...bulletBlock(b));
    }
  }
  if (fullDiff && fullDiff.length > 0) {
    children.push(headingBlock("Diff excerpt", 3));
    const codeChunks = chunkText(fullDiff, NOTION_TEXT_BLOCK_LIMIT);
    for (const chunk of codeChunks) {
      children.push({
        object: "block",
        type: "code",
        code: {
          language: "diff",
          rich_text: [{ type: "text", text: { content: chunk } }],
        },
      });
    }
  }
  const MAX_BLOCKS_PER_REQUEST = 80;
  for (let i = 0; i < children.length; i += MAX_BLOCKS_PER_REQUEST) {
    const slice = children.slice(i, i + MAX_BLOCKS_PER_REQUEST);
    await notion.blocks.children.append({ block_id: pageId, children: slice });
  }
  log.info("Appended change report to Notion", { pageId, blocks: children.length, displayName });
}

export async function generateMergeReport({ displayName, awsUrl, prevMarkdown, nextMarkdown, settings }) {
  const model = settings?.ai?.model ?? "openai/gpt-4o";
  const maxTokens = settings?.ai?.maxOutputTokens ?? 4000;
  const strategy = settings?.ai?.mergeStrategy ?? "preserve-user-notes";
  const endpoint = process.env.AI_ENDPOINT ?? DEFAULT_AI_ENDPOINT;
  const token = process.env.AI_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("AI_TOKEN or GITHUB_TOKEN env var is required to call the AI model");
  }

  const maxInputChars = Math.max(2_000, Math.min(60_000, settings?.ai?.maxInputCharsPerVersion ?? 12_000));
  const truncate = (s, n) => (typeof s === "string" && s.length > n ? s.slice(0, n) + "\n…[truncated]…" : (s ?? ""));
  const prevTrim = truncate(prevMarkdown, maxInputChars);
  const nextTrim = truncate(nextMarkdown, maxInputChars);

  const sys = [
    "You are a technical writer assisting an AWS learner who keeps personal study notes in Notion.",
    "You will receive the previous and current versions of an AWS documentation page.",
    `Strategy: ${strategy}.`,
    "Produce a STRICT JSON object with shape: {\"summary\": string, \"bullets\": string[], \"diff_excerpt\": string}.",
    "- summary: 2-4 sentences explaining what materially changed in plain English.",
    "- bullets: 3-8 short, action-oriented bullets the learner should reflect in their notes.",
    "- diff_excerpt: a unified-diff-style excerpt of the most important added/removed lines, max 60 lines.",
    "Do not output anything outside the JSON object. Do not wrap in code fences.",
  ].join(" ");

  const user = [
    `Doc title: ${displayName}`,
    `Doc URL: ${awsUrl}`,
    "",
    "=== PREVIOUS VERSION (markdown) ===",
    prevTrim,
    "",
    "=== CURRENT VERSION (markdown) ===",
    nextTrim,
  ].join("\n");

  const body = {
    model,
    temperature: 0.0,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`AI model request failed: ${res.status} ${res.statusText} ${errText.slice(0, 300)}`);
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("AI response missing message content");
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("AI did not return valid JSON: " + content.slice(0, 200));
  }
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    bullets: Array.isArray(parsed.bullets) ? parsed.bullets.filter((b) => typeof b === "string").slice(0, 12) : [],
    fullDiff: typeof parsed.diff_excerpt === "string" ? parsed.diff_excerpt : "",
  };
}
