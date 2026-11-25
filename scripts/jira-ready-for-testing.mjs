/**
 * In Testing when the PR opens (ADR-0185).
 *
 * When a PR opens, reopens or leaves draft, each SLM issue it closes (a «Closes» / «Fixes» / «Resolves» line of its
 * description; «Refs», the title and the branch move nothing) that is still "In Development" moves to "In Testing" and
 * is assigned to QA (the testing queue), with a comment linking the PR. QA then tests the PR and, when it passes,
 * moves the issue to "Ready for Release", which turns the "Jira status" check green (jira-status-check.mjs). Nothing
 * else moves: an issue in any other status is left as it is, so this never moves an issue backwards and never skips
 * QA. A draft PR moves nothing.
 *
 *   node scripts/jira-ready-for-testing.mjs --pr <number> [--dry-run]
 *
 * GitHub is read with GITHUB_TOKEN (pull-requests: read). Jira is written with ATL_TOKEN, the scoped token jira-close
 * already uses, of the account whose email is in ATL_EMAIL. The workflow runs this file from `main`, never the PR's
 * code, and the PR's title, branch and description are only ever data: matched against key patterns, never run.
 * Ported from the same workflow on another repository of the owner.
 * Overrides for tests: GITHUB_API_URL, JIRA_API_URL, JIRA_CLOUD_ID, JIRA_STATUS_RULES.
 */
import { Buffer } from "node:buffer";
import { appendFileSync, readFileSync } from "node:fs";
import { URL, fileURLToPath } from "node:url";
import { fromFork, keysIn, loadRules } from "./jira-status-check.mjs";

const USAGE = "usage: node scripts/jira-ready-for-testing.mjs --pr <number> [--dry-run]";
const RULES_FILE = fileURLToPath(new URL("../.github/jira-status.json", import.meta.url));
const DEFAULT_CLOUD_ID = "67176086-263c-46b2-8f6d-167a10620df4";
/** The only move this makes: In Development → In Testing (the SLM board, ADR-0051 and ADR-0185). */
export const PROJECT = "SLM";
export const FROM = "In Development";
export const TO = "In Testing";
/** QA's Jira account: the testing queue is QA's, so the move assigns it. An account id, not a secret. */
export const QA_ACCOUNT = "712020:a11d40c9-5c21-4caf-8743-b118b75cd9d2";

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

/**
 * The SLM keys the PR closes: only those on a «Closes» / «Fixes» / «Resolves» line of its description. A «Refs»
 * line, the title or the branch name work in progress, not the PR that completes the issue, so they move nothing.
 */
const CLOSING_LINE = /^[\s>*_\-+]*(?:closes|fixes|resolves)\b[*_]*[:\s]/i;
export function closedKeys(rules, pr) {
  const closing = String(pr.body || "")
    .split(/\r?\n/)
    .filter((line) => CLOSING_LINE.test(line))
    .join("\n");
  return keysIn(rules, closing, "").filter((key) => key.startsWith(`${PROJECT}-`));
}

/** What to do with one issue in `status`: move it, or leave it and say why. */
export function plan(key, status) {
  if (status.toLowerCase() === FROM.toLowerCase()) return { key, move: true, why: `${FROM} → ${TO}` };
  return { key, move: false, why: `${status}: left as it is (only ${FROM} moves)` };
}

async function github(path) {
  const response = await globalThis.fetch(`${env("GITHUB_API_URL", "https://api.github.com")}${path}`, {
    headers: {
      Authorization: `Bearer ${env("GITHUB_TOKEN")}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: globalThis.AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GitHub GET ${path}: HTTP ${response.status}`);
  return response.json();
}

function jira() {
  const token = env("ATL_TOKEN");
  if (!token) throw new Error("ATL_TOKEN is not set");
  const email = env("ATL_EMAIL");
  if (!email) throw new Error("ATL_EMAIL is not set");
  const auth = `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
  const base = env("JIRA_API_URL", `https://api.atlassian.com/ex/jira/${env("JIRA_CLOUD_ID", DEFAULT_CLOUD_ID)}`);
  return async (method, path, body) => {
    const response = await globalThis.fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: auth,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: globalThis.AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Jira ${method} ${path.split("?")[0]}: HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  };
}

/** A Jira comment in Atlassian document format: one paragraph, the PR as a link. */
export function comment(pr) {
  return {
    body: {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: `${TO}: PR #${pr.number} opened for review, ` },
            { type: "text", text: pr.html_url, marks: [{ type: "link", attrs: { href: pr.html_url } }] },
            {
              type: "text",
              text: " (automatic). QA tests the PR; when it passes, QA moves this issue to Ready for Release.",
            },
          ],
        },
      ],
    },
  };
}

async function main(argv) {
  const opts = { pr: "", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--pr" && argv[i + 1] !== undefined) opts.pr = argv[++i];
    else if (arg === "--dry-run") opts.dryRun = true;
    else {
      console.error(`jira-ready-for-testing: unknown argument ${arg}\n${USAGE}`);
      return 2;
    }
  }
  if (!/^[1-9][0-9]{0,8}$/.test(opts.pr)) {
    console.error(USAGE);
    return 2;
  }
  const repo = env("GITHUB_REPOSITORY");
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo)) {
    console.error("jira-ready-for-testing: GITHUB_REPOSITORY is not owner/name");
    return 2;
  }
  const rules = loadRules(readFileSync(env("JIRA_STATUS_RULES", RULES_FILE), "utf8"));
  const pr = await github(`/repos/${repo}/pulls/${opts.pr}`);
  const lines = [];
  let failed = 0;
  if (pr.state !== "open" || pr.draft) {
    lines.push(`#${pr.number}: ${pr.draft ? "draft" : "not open"}, nothing moved`);
  } else if (fromFork(repo, pr)) {
    // Public repository: a fork PR never moves an issue (Yousef, F1 on #34). The workflow skips forks too.
    lines.push(`#${pr.number}: from a fork, nothing moved`);
  } else {
    const keys = closedKeys(rules, pr);
    if (!keys.length)
      lines.push(`#${pr.number}: closes no ${PROJECT} issue (no Closes/Fixes/Resolves line), nothing moved`);
    const call = keys.length ? jira() : null;
    for (const key of keys) {
      try {
        const issue = await call("GET", `/rest/api/3/issue/${encodeURIComponent(key)}?fields=status`);
        const step = plan(key, issue?.fields?.status?.name ?? "");
        if (!step.move || opts.dryRun) {
          lines.push(`${key}: ${step.why}${step.move ? " (dry run, not moved)" : ""}`);
          continue;
        }
        const { transitions = [] } = await call("GET", `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`);
        const to = transitions.find((t) => t.to?.name?.toLowerCase() === TO.toLowerCase());
        if (!to) throw new Error(`no transition to ${TO}`);
        await call("POST", `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, {
          transition: { id: to.id },
        });
        try {
          await call("PUT", `/rest/api/3/issue/${encodeURIComponent(key)}/assignee`, {
            accountId: QA_ACCOUNT,
          });
        } catch (error) {
          throw new Error(`moved to ${TO}, but not assigned to QA: ${error.message}`);
        }
        await call("POST", `/rest/api/3/issue/${encodeURIComponent(key)}/comment`, comment(pr));
        lines.push(`${key}: ${step.why}, assigned to QA`);
      } catch (error) {
        failed++;
        lines.push(`${key}: not moved: ${error.message}`);
      }
    }
  }
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${TO}\n\n${lines.map((l) => `- ${l}`).join("\n")}\n`);
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(`jira-ready-for-testing: ${error.message}`);
      process.exit(1);
    },
  );
}
