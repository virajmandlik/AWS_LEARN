# AWS Docs to Notion Sync

A bi-weekly GitHub Actions workflow that watches AWS documentation, detects real content changes, and posts AI-generated update reports straight into your Notion learning notes.

---

## Why

You keep AWS study notes in Notion. AWS documentation changes. This workflow:

- Polls a list of AWS doc URLs on the 1st and 15th of every month at 06:00 UTC.
- Fetches each doc directly from `docs.aws.amazon.com` (CloudFront-cached, no auth, no WAF) and converts the HTML to markdown. The AWS Knowledge MCP server is also supported (set `settings.fetcher: "mcp"`) but is gated by an AWS WAF that blocks most CI runner IPs.
- Hashes the normalized content and compares against the previous snapshot.
- If changed, calls GitHub Models (`gpt-4o-mini`, free) to generate a structured summary, key bullets, and a diff excerpt.
- Appends a dated callout block to the linked Notion page. Your original notes are never overwritten.
- Commits the new snapshot and manifest back to the repo so the next run has a baseline.

**Total cost: $0.** Uses only the free tiers of GitHub Actions, GitHub Models, AWS Knowledge MCP, and the Notion API.

---

## Architecture

```text
GitHub Actions (cron: 1st & 15th of month)
        |
        v
scripts/sync.mjs
        |
        +--> AWS Knowledge MCP   (Streamable HTTP, no auth)   [fetch doc]
        +--> normalize + sha256  (vs .cache/manifest.json)    [change detect]
        +--> GitHub Models API   (Bearer GITHUB_TOKEN)        [AI summary]
        +--> Notion API          (Bearer NOTION_TOKEN)        [append blocks]
        +--> commit manifest + snapshots/<id>.md back to main [persist state]
```

---

## File layout

```text
docs.config.json            # tracked docs + AI/diff settings (you edit this)
docs.config.schema.json     # JSON Schema used for validation
.cache/manifest.json        # hash + lastChecked + lastChanged per doc (auto)
snapshots/<id>.md           # last fetched markdown per doc (auto, committed)
scripts/
  sync.mjs                  # main entry point
  lib/aws-mcp.mjs           # AWS Knowledge MCP client wrapper
  lib/notion-ai.mjs         # Notion REST API + GitHub Models AI merge
  lib/log.mjs               # structured JSON logger with secret redaction
.github/workflows/sync-aws-docs.yml
package.json
README.md
```

---

## Setup (one-time)

### Step 1: Create a Notion integration

1. Open <https://www.notion.so/profile/integrations> and click **New integration**.
2. Name it (for example `aws-docs-sync`), pick your workspace, set capability to **Update content** and **Insert content**. **Read content** is recommended.
3. Save and copy the integration token. It starts with `ntn_` or `secret_`.

### Step 2: Connect the integration to your Notion pages

1. Open the parent page that holds your AWS notes (for example "AWS Learning").
2. Click the **...** menu (top right) -> **Connections** -> **Connect to** -> select `aws-docs-sync`.
3. Subpages inherit access automatically. You only need to connect once at the root.

### Step 3: Get each Notion page ID

Open the page and look at the URL:

```
https://www.notion.so/My-IAM-Notes-1234567890abcdef1234567890abcdef
                                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                  this 32-char hex is the page ID
```

Both the 32-char hex form and the hyphen form (`12345678-90ab-cdef-1234-567890abcdef`) are accepted by the config validator.

### Step 4: Edit `docs.config.json`

Replace the placeholder `notionPageId` values with the IDs from step 3. Add or remove entries as needed.

```json
{
  "tracked": [
    {
      "id": "iam-introduction",
      "displayName": "IAM - Introduction",
      "awsUrl": "https://docs.aws.amazon.com/IAM/latest/UserGuide/introduction.html",
      "notionPageId": "1234567890abcdef1234567890abcdef",
      "tags": ["iam", "security"]
    }
  ]
}
```

URLs must come from the AWS docs allow-list:

- `docs.aws.amazon.com`
- `aws.amazon.com`
- `docs.amplify.aws`
- `repost.aws/knowledge-center`

### Step 5: Push to GitHub and add the secret

```bash
git init
git add .
git commit -m "init: aws docs to notion sync"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

In GitHub: **Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret**.

| Name           | Value                                            |
| -------------- | ------------------------------------------------ |
| `NOTION_TOKEN` | the integration token from step 1                |

`GITHUB_TOKEN` is provided automatically by Actions and is used for the GitHub Models call.

### Step 6: Trigger the first run

- Go to **Actions** -> **sync-aws-docs** -> **Run workflow** to run immediately.
- Or wait for the next scheduled run (1st or 15th at 06:00 UTC).
- The first run on a given doc creates the baseline snapshot. Nothing is posted to Notion until the second run sees a real change.

---

## Local development

```bash
npm ci

# PowerShell
$env:NOTION_TOKEN = "ntn_..."
$env:GITHUB_TOKEN = "ghp_..."

# bash / zsh
export NOTION_TOKEN=ntn_...
export GITHUB_TOKEN=ghp_...

npm run sync:dry   # fetch + hash + AI; SKIPS Notion writes
npm run sync       # full live run
```

---

## How change detection works

1. Fetch the full AWS doc markdown. If the response is truncated, paginate via `start_index` until the doc is complete or the 400 KB cap is reached.
2. Normalize the text. Strip trailing whitespace and drop lines matching `settings.diff.ignoreLineRegex` (defaults exclude blank lines and `Last updated:` boilerplate).
3. SHA-256 the normalized text.
4. Compare against `manifest.entries[id].hash`. If different, the doc is "changed".

Tune `ignoreLineRegex` if a doc has timestamps or build IDs that change every poll without real content drift.

---

## What gets posted to Notion

For each changed doc the workflow appends to the linked page:

- a divider
- a callout block: `AWS docs update detected - <Title> - YYYY-MM-DD`
- the source URL as a paragraph
- a `Summary of changes` heading + 2 to 4 sentence AI summary
- a `Key updates` heading + 3 to 8 AI bullets
- a `Diff excerpt` heading + a `diff`-language code block

Default merge strategy is `preserve-user-notes`. To change it, edit `settings.ai.mergeStrategy` in `docs.config.json`:

| Strategy              | Behavior                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `preserve-user-notes` | Append a structured update report. Never deletes or edits your existing blocks. Recommended.   |
| `append-only`         | Same as above (alias).                                                                         |
| `overwrite`           | Not implemented on purpose. Destroying user notes is bad.                                      |

---

## Cost summary

| Service                 | Usage per cycle             | Free tier headroom              |
| ----------------------- | --------------------------- | ------------------------------- |
| GitHub Actions (Linux)  | ~5 minutes                  | 2000 min/month (private repos)  |
| GitHub Models           | ~1 call per changed doc     | Generous free tier              |
| AWS Knowledge MCP       | N read calls (no auth)      | Public, unmetered for fair use  |
| Notion API              | ~1 append call per change   | 3 req/sec rate limit, free      |

---

## Troubleshooting

- **HTTP 403 "Access denied" from `knowledge-mcp.global.api.aws`** - the public AWS Knowledge MCP endpoint has a WAF that rejects most CI runner IP ranges (including GitHub Actions). The default `settings.fetcher` is `"http"` for exactly this reason - it fetches docs directly from CloudFront-cached `docs.aws.amazon.com`, which has no WAF and no rate limit. Only switch to `"mcp"` if you are running the workflow from a network the AWS WAF allows.
- **"Could not find page"** - you forgot to connect your Notion integration to the page (Setup step 2).
- **`NOTION_TOKEN secret is missing`** - add the secret to the repo (Setup step 5) or run with `dry_run=true`.
- **AI returns invalid JSON** - bump `settings.ai.maxOutputTokens`, or switch to `openai/gpt-4o` in `docs.config.json`.
- **Doc keeps reporting changes every run** - add the noisy line pattern to `settings.diff.ignoreLineRegex`.
- **Hit a rate limit** - lower `settings.fetchConcurrency` (default `3`).
- **Workflow can't push the manifest commit** - in **Settings** -> **Actions** -> **General** -> **Workflow permissions**, set to **Read and write**.

---

## Security notes

- All secrets are env-var driven. Nothing is hardcoded.
- The structured logger redacts `Bearer` headers and any value matching common token prefixes (`ntn_`, `secret_`, `ghp_`, `gho_`, `ghs_`, `sk-`, etc.).
- AWS doc URLs are validated against an allow-list of trusted hosts before being passed to the MCP client.
- Notion page IDs in config are validated against the canonical 32-hex / UUID formats.
- The workflow runs with the minimum permissions it needs (`contents: write`, `models: read`).
- A concurrency group prevents overlapping runs from racing on the manifest commit.
- All MCP calls use timeouts and retries with exponential backoff plus jitter.

---

## Extending

- **Slack / email notifications**: add a step after `Run sync` that uses `steps.sync.outputs.changed` to gate a notification action.
- **Track recommended new pages**: the AWS Knowledge MCP `recommend` tool returns a `New` category. Wire `awsClient.recommend(url)` into `sync.mjs` for entries with `watchRecommendations: true` and turn results into new tracked entries via a PR.
- **Different cron cadence**: edit the `cron:` line in the workflow.

| Cadence              | Cron expression  |
| -------------------- | ---------------- |
| Bi-weekly (default)  | `0 6 1,15 * *`   |
| Weekly Monday 06:00  | `0 6 * * 1`      |
| Daily 06:00          | `0 6 * * *`      |
#   A W S _ L E A R N  
 "# AWS_LEARN" 
