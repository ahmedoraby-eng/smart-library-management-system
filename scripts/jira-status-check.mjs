/**
 * Jira status check: a PR merges only after QA passed (ADR-0185).
 *
 * Each SLM key named in the PR's title, branch or a «Closes» / «Refs» line of its description must be in one of the
 * statuses `.github/jira-status.json` lists for its project (`projects`): for SLM, only "Ready for Release", which QA
 * sets when the PR passed. Only the status counts, never who the issue is assigned to. The result is a commit status
 * named `context` ("Jira status") on the PR's head commit:
 *   - success: every key is in an allowed status, or the owner added the waiver label (`waiver_label`; the label
 *     counts only if `owner` added it). A Released issue passes only for a PR that changes test files only
 *     (`released_ok_paths` / `released_ok_suffixes`): new product code needs a new issue;
 *   - failure: a key is in another status, the PR names no key, or the waiver label was added by someone else;
 *   - error: Jira or GitHub could not be read, or the Jira token is not set.
 *
 *   node scripts/jira-status-check.mjs --pr <number> | --open   [--dry-run]
 *   node scripts/jira-status-check.mjs --decide < input.json
 *
 * `--pr` checks one PR, `--open` every open PR (the scheduled run, so a status follows the issue when it moves in
 * Jira). `--dry-run` prints what it would post. `--decide` reads {title, branch, body, labels, waiverBy, statuses,
 * files} as JSON and prints the decision, with no network: it is for the tests.
 *
 * Reads only: Jira with JIRA_READ_EMAIL and JIRA_READ_TOKEN (only GET requests are made), GitHub with GITHUB_TOKEN,
 * which also posts the status (statuses: write). The workflow runs this file from `main`, never the PR's code, and
 * the PR's title, branch and description are only ever data: matched against key patterns, never run.
 * Ported from the same check on another repository of the owner. Overrides for tests: GITHUB_API_URL, JIRA_API_URL,
 * JIRA_CLOUD_ID, JIRA_STATUS_RULES.
 */
import { Buffer } from "node:buffer";
import { appendFileSync, readFileSync } from "node:fs";
import { URL, fileURLToPath } from "node:url";

const USAGE = "usage: node scripts/jira-status-check.mjs --pr <number> | --open [--dry-run] | --decide";
const RULES_FILE = fileURLToPath(new URL("../.github/jira-status.json", import.meta.url));
const DEFAULT_CLOUD_ID = "67176086-263c-46b2-8f6d-167a10620df4";
const MAX_DESCRIPTION = 140; // GitHub's limit for a commit status description

export function loadRules(text) {
  const rules = JSON.parse(text);
  if (!rules || typeof rules.context !== "string" || typeof rules.waiver_label !== "string") {
    throw new Error("jira-status.json has no valid context and waiver_label");
  }
  if (!rules.projects || typeof rules.projects !== "object" || !Object.keys(rules.projects).length) {
    throw new Error("jira-status.json: projects is empty");
  }
  // Each project: one status name or a list of them.
  const projects = {};
  for (const [project, value] of Object.entries(rules.projects)) {
    const allowed = Array.isArray(value) ? value : [value];
    if (!allowed.length || !allowed.every((name) => typeof name === "string" && name.trim())) {
      throw new Error(`jira-status.json: projects.${project} names no status`);
    }
    projects[project] = allowed.map((name) => name.trim());
  }
  if (typeof rules.owner !== "string" || !rules.owner) throw new Error("jira-status.json has no owner");
  const list = (name) => {
    const value = rules[name] ?? [];
    if (!Array.isArray(value) || !value.every((p) => typeof p === "string" && p.trim())) {
      throw new Error(`jira-status.json: ${name} must be a list of strings`);
    }
    return value;
  };
  return {
    ...rules,
    projects,
    releasedPaths: list("released_ok_paths"),
    releasedSuffixes: list("released_ok_suffixes"),
  };
}

/**
 * The lines of a PR description that name the issues it works on: «Closes KEY» or «Refs KEY» (also
 * «Fixes» / «Resolves»), at the start of a line, after any list marker or emphasis. Only
 * these lines count, so a key mentioned in passing ("follows SLM-12") is not checked.
 */
const ISSUE_LINE = /^[\s>*_\-+]*(?:closes|refs|fixes|resolves)\b[*_]*[:\s]/i;
export function issueLines(body) {
  return String(body || "")
    .split(/\r?\n/)
    .filter((line) => ISSUE_LINE.test(line))
    .join("\n");
}

/**
 * The issue keys named in the title, the branch and the description's «Closes» / «Refs» lines, in order, without
 * duplicates. Only keys of the projects in the rules count: any other XXX-123 (UTF-8, ISO-9001) is not a key.
 */
export function keysIn(rules, title, branch, body = "") {
  const projects = Object.keys(rules.projects);
  const pattern = new RegExp(`(?<![A-Za-z0-9])(${projects.join("|")})-([0-9]+)(?![0-9])`, "gi");
  const keys = [];
  for (const text of [title || "", branch || "", issueLines(body)]) {
    for (const match of text.matchAll(pattern)) {
      const key = `${match[1].toUpperCase()}-${Number(match[2])}`;
      if (!keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

function shorten(text) {
  return text.length <= MAX_DESCRIPTION ? text : `${text.slice(0, MAX_DESCRIPTION - 1)}…`;
}

/**
 * The decision for one PR. `statuses` maps each checked key to its Jira status name, or to {error}. `files`: the
 * PR's changed paths, or null when they could not be read; only a PR on a Released issue needs them.
 * Returns {state, description, keys}; `description` fits a commit status.
 */
export function decide(rules, { title, branch, body = "", labels = [], waiverBy = "", statuses = {}, files = null }) {
  const keys = keysIn(rules, title, branch, body);
  const waived = labels.includes(rules.waiver_label);
  if (waived && waiverBy && waiverBy.toLowerCase() === rules.owner.toLowerCase()) {
    return {
      state: "success",
      description: shorten(`Waived by ${rules.owner} ('${rules.waiver_label}' label)`),
      keys,
    };
  }
  // A waiver label someone else added is ignored; a red result says why it didn't count.
  const note = waived ? `'${rules.waiver_label}' not added by ${rules.owner}, ignored. ` : "";
  const result = (state, description) => ({
    state,
    description: shorten(state === "success" ? description : note + description),
    keys,
  });
  const checked = keys.filter((key) => key.split("-")[0] in rules.projects);
  const names = Object.keys(rules.projects).join(" or ");
  if (!checked.length) {
    return result("failure", `No ${names} issue key in the title, branch or a Closes/Refs line`);
  }
  const unread = checked.filter((key) => typeof statuses[key] !== "string");
  if (unread.length) {
    const why = statuses[unread[0]]?.error || "not read";
    return result("error", `Jira could not be read for ${unread.join(", ")}: ${why}`);
  }
  const allowed = (key) => rules.projects[key.split("-")[0]];
  const waiting = checked.filter(
    (key) => !allowed(key).some((name) => name.toLowerCase() === statuses[key].toLowerCase()),
  );
  // A Released issue (it comes after Ready for Release) passes only for a test-only PR: new product code on a released
  // issue would skip QA, so it goes to a new issue. Renames count by both paths.
  const released = waiting.filter((key) => statuses[key].toLowerCase() === "released");
  if (released.length && released.length === waiting.length) {
    if (!Array.isArray(files)) {
      return result("failure", `${released.join(", ")} is Released, but the PR's files could not be read`);
    }
    const isTest = (f) =>
      (rules.releasedPaths || []).some((p) => f.startsWith(p)) ||
      (rules.releasedSuffixes || []).some((suffix) => f.endsWith(suffix));
    const product = files.filter((f) => !isTest(f));
    if (product.length) {
      return result(
        "failure",
        `${released.join(", ")} is Released: open a new issue for product changes (${product[0]}${product.length > 1 ? ` and ${product.length - 1} more` : ""})`,
      );
    }
    return result(
      "success",
      `${checked.join(", ")}: ${[...new Set(checked.map((key) => statuses[key]))].join(", ")}, test files only`,
    );
  }
  if (waiting.length) {
    const parts = waiting.map((key) => `${key} is ${statuses[key]}, needs ${allowed(key).join(" or ")}`);
    return result("failure", parts.join("; "));
  }
  return result("success", `${checked.join(", ")}: ${[...new Set(checked.map((key) => statuses[key]))].join(", ")}`);
}

// ---- reading GitHub and Jira, and posting the status ----

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

async function github(method, path, body) {
  const response = await globalThis.fetch(`${env("GITHUB_API_URL", "https://api.github.com")}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env("GITHUB_TOKEN")}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: globalThis.AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GitHub ${method} ${path.split("?")[0]}: HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}

async function githubAll(path) {
  const items = [];
  for (let page = 1; page <= 20; page++) {
    const batch = await github("GET", `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return items;
}

async function jiraStatus(key) {
  const email = env("JIRA_READ_EMAIL");
  const token = env("JIRA_READ_TOKEN");
  if (!email || !token) return { error: "JIRA_READ_EMAIL or JIRA_READ_TOKEN is not set" };
  const base = env("JIRA_API_URL", `https://api.atlassian.com/ex/jira/${env("JIRA_CLOUD_ID", DEFAULT_CLOUD_ID)}`);
  try {
    const response = await globalThis.fetch(`${base}/rest/api/3/issue/${encodeURIComponent(key)}?fields=status`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`,
        Accept: "application/json",
      },
      signal: globalThis.AbortSignal.timeout(30_000),
    });
    if (response.status === 404) return { error: `${key} not found, or not visible to the token's account` };
    if (!response.ok) return { error: `HTTP ${response.status}` };
    const name = (await response.json())?.fields?.status?.name;
    return typeof name === "string" ? name : { error: "no status in Jira's answer" };
  } catch (error) {
    return { error: error.name === "TimeoutError" ? "timed out" : "request failed" };
  }
}

async function waiverAddedBy(repo, number, label) {
  const events = await githubAll(`/repos/${repo}/issues/${number}/events`);
  const added = events.filter((event) => event.event === "labeled" && event.label?.name === label);
  return added.length ? added[added.length - 1].actor?.login || "" : "";
}

async function checkPr(rules, repo, pr, { dryRun }) {
  const labels = (pr.labels || []).map((label) => label.name);
  const waiverBy = labels.includes(rules.waiver_label) ? await waiverAddedBy(repo, pr.number, rules.waiver_label) : "";
  const statuses = {};
  for (const key of keysIn(rules, pr.title, pr.head?.ref, pr.body)) {
    if (key.split("-")[0] in rules.projects) statuses[key] = await jiraStatus(key);
  }
  let files = null;
  const releasedKey = Object.values(statuses).some((v) => typeof v === "string" && v.toLowerCase() === "released");
  if (releasedKey) {
    try {
      // A renamed file counts by both paths: moving a source file into a test folder is still a product change.
      files = (await githubAll(`/repos/${repo}/pulls/${pr.number}/files`)).flatMap((f) =>
        f.previous_filename ? [f.filename, f.previous_filename] : [f.filename],
      );
    } catch {
      files = null;
    }
  }
  const decision = decide(rules, {
    title: pr.title,
    branch: pr.head?.ref,
    body: pr.body || "",
    labels,
    waiverBy,
    statuses,
    files,
  });
  const sha = pr.head?.sha;
  if (!/^[0-9a-f]{40}$/.test(sha || "")) throw new Error(`PR #${pr.number} has no head commit`);
  const line = `#${pr.number} ${sha.slice(0, 7)}: ${decision.state}: ${decision.description}`;
  if (dryRun) return `${line} (dry run, not posted)`;
  // The same state and description as the latest status for this commit: nothing new to post.
  const current = (await github("GET", `/repos/${repo}/commits/${sha}/statuses?per_page=100`)).find(
    (status) => status.context === rules.context,
  );
  if (current && current.state === decision.state && current.description === decision.description) {
    return `${line} (unchanged)`;
  }
  const server = env("GITHUB_SERVER_URL", "https://github.com");
  const run = env("GITHUB_RUN_ID");
  await github("POST", `/repos/${repo}/statuses/${sha}`, {
    state: decision.state,
    context: rules.context,
    description: decision.description,
    ...(run ? { target_url: `${server}/${repo}/actions/runs/${run}` } : {}),
  });
  return line;
}

async function main(argv) {
  const opts = { pr: "", open: false, dryRun: false, decide: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--pr" && argv[i + 1] !== undefined) opts.pr = argv[++i];
    else if (arg === "--open") opts.open = true;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--decide") opts.decide = true;
    else {
      console.error(`jira-status-check: unknown argument ${arg}\n${USAGE}`);
      return 2;
    }
  }
  const rules = loadRules(readFileSync(env("JIRA_STATUS_RULES", RULES_FILE), "utf8"));
  if (opts.decide) {
    console.log(JSON.stringify(decide(rules, JSON.parse(readFileSync(0, "utf8")))));
    return 0;
  }
  if (opts.pr ? opts.open || !/^[1-9][0-9]{0,8}$/.test(opts.pr) : !opts.open) {
    console.error(USAGE);
    return 2;
  }
  const repo = env("GITHUB_REPOSITORY");
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo)) {
    console.error("jira-status-check: GITHUB_REPOSITORY is not owner/name");
    return 2;
  }
  const prs = opts.pr
    ? [await github("GET", `/repos/${repo}/pulls/${opts.pr}`)]
    : await githubAll(`/repos/${repo}/pulls?state=open`);
  const lines = [];
  let failed = 0;
  for (const pr of prs) {
    if (pr.state !== "open") {
      lines.push(`#${pr.number}: not open, nothing posted`);
      continue;
    }
    try {
      lines.push(await checkPr(rules, repo, pr, opts));
    } catch (error) {
      failed++;
      lines.push(`#${pr.number}: could not be checked: ${error.message}`);
    }
  }
  if (!prs.length) lines.push("No open PRs.");
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### ${rules.context}\n\n${lines.map((l) => `- ${l}`).join("\n")}\n`,
    );
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(`jira-status-check: ${error.message}`);
      process.exit(1);
    },
  );
}
