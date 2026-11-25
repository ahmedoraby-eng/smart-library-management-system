// @vitest-environment node
/**
 * ADR-0185: the Jira status check, run as a script. The decisions go through `--decide` (no network);
 * the GitHub and Jira calls go to a local fake server, so nothing reaches GitHub or Jira.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { URL, fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { listenLocal } from "./helpers/listen-local";

const SCRIPT = fileURLToPath(new URL("../jira-status-check.mjs", import.meta.url));
const SHA = "a".repeat(40);

type Decision = { state: string; description: string; keys: string[] };

function decide(input: Record<string, unknown>, env: Record<string, string> = {}): Decision {
  const r = spawnSync(process.execPath, [SCRIPT, "--decide"], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout) as Decision;
}

describe("the decision", () => {
  it("is green when the SLM issue is Ready for Release", () => {
    const d = decide({
      title: "SLM-12: feeding plan",
      branch: "eng/SLM-12-plan",
      statuses: { "SLM-12": "Ready for Release" },
    });
    expect(d.state).toBe("success");
    expect(d.description).toBe("SLM-12: Ready for Release");
  });

  it("is red while the issue is in another status, and names it", () => {
    for (const status of ["Refinement", "In Development", "In Testing"]) {
      const d = decide({ title: "SLM-12: x", branch: "b", statuses: { "SLM-12": status } });
      expect(d.state).toBe("failure");
      expect(d.description).toBe(`SLM-12 is ${status}, needs Ready for Release`);
    }
  });

  it("is green for a Released SLM issue when every file is a test file (renames by both paths)", () => {
    const d = decide({
      title: "SLM-12: x",
      branch: "b",
      statuses: { "SLM-12": "Released" },
      files: ["e2e/1-librarian.e2e.ts", "api/test/a.test.ts", "web/src/a/b.test.tsx"],
    });
    expect(d.state).toBe("success");
  });

  it("is red for a Released SLM issue when the PR changes a product file, and says to open a new issue", () => {
    const d = decide({
      title: "SLM-12: x",
      branch: "b",
      statuses: { "SLM-12": "Released" },
      files: ["e2e/1-librarian.e2e.ts", "api/src/feed.ts"],
    });
    expect(d.state).toBe("failure");
    expect(d.description).toContain("SLM-12 is Released: open a new issue for product changes (api/src/feed.ts)");
    const renamed = decide({
      title: "SLM-12: x",
      branch: "b",
      statuses: { "SLM-12": "Released" },
      files: ["api/test/x.test.ts", "api/src/old.ts"],
    });
    expect(renamed.state).toBe("failure");
  });

  it("is red for a Released SLM issue when the files could not be read", () => {
    const d = decide({ title: "SLM-12: x", branch: "b", statuses: { "SLM-12": "Released" } });
    expect(d.state).toBe("failure");
    expect(d.description).toContain("files could not be read");
  });

  it("checks any project the rules list, with its own status", () => {
    const rules = join(mkdtempSync(join(tmpdir(), "jira-status-")), "rules.json");
    writeFileSync(
      rules,
      JSON.stringify({
        owner: "ahmedoraby-eng",
        context: "Jira status",
        projects: { SLM: "Ready for Release", ABC: "In Review" },
        waiver_label: "w",
      }),
    );
    const env = { JIRA_STATUS_RULES: rules };
    expect(decide({ title: "ABC-3", branch: "b", statuses: { "ABC-3": "In Review" } }, env).state).toBe("success");
    expect(decide({ title: "ABC-3", branch: "b", statuses: { "ABC-3": "Done" } }, env).description).toBe(
      "ABC-3 is Done, needs In Review",
    );
  });

  it("accepts any status of a project's list, and refuses a rule that names none", () => {
    const write = (projects: unknown) => {
      const file = join(mkdtempSync(join(tmpdir(), "jira-status-")), "rules.json");
      writeFileSync(
        file,
        JSON.stringify({
          owner: "ahmedoraby-eng",
          context: "Jira status",
          projects,
          waiver_label: "w",
        }),
      );
      return { JIRA_STATUS_RULES: file };
    };
    const env = write({ ABC: ["In Progress", "In Review"] });
    expect(decide({ title: "ABC-3", branch: "b", statuses: { "ABC-3": "in review" } }, env).state).toBe("success");
    expect(decide({ title: "ABC-3", branch: "b", statuses: { "ABC-3": "To Do" } }, env).description).toBe(
      "ABC-3 is To Do, needs In Progress or In Review",
    );
    for (const projects of [{ ABC: [] }, { ABC: [""] }, { ABC: 3 }]) {
      const r = spawnSync(process.execPath, [SCRIPT, "--decide"], {
        input: JSON.stringify({ title: "ABC-3", branch: "b" }),
        encoding: "utf8",
        env: { ...process.env, ...write(projects) },
      });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("names no status");
    }
  });

  it("never reads who an issue is assigned to: only its status counts", () => {
    expect(readFileSync(SCRIPT, "utf8")).not.toMatch(/assignee/i);
  });

  it("is red with no issue key", () => {
    const d = decide({ title: "Fix the header", branch: "fix-header" });
    expect(d.state).toBe("failure");
    expect(d.description).toBe("No SLM issue key in the title, branch or a Closes/Refs line");
  });

  it("checks the SLM key when another project's key is named too", () => {
    const d = decide({
      title: "OPS-1: x",
      branch: "b",
      body: "Refs SLM-12",
      statuses: { "SLM-12": "In Development" },
    });
    expect(d.state).toBe("failure");
    expect(d.description).toBe("SLM-12 is In Development, needs Ready for Release");
  });

  it("does not take other XXX-123 words for keys", () => {
    const d = decide({ title: "Read UTF-8 and ISO-9001 files", branch: "x" });
    expect(d.keys).toEqual([]);
  });

  it("reads keys from the title and the branch, in any case, without duplicates", () => {
    const d = decide({
      title: "SLM-12: plan",
      branch: "eng/slm-012-plan-and-SLM-13",
      statuses: { "SLM-12": "Ready for Release", "SLM-13": "Ready for Release" },
    });
    expect(d.keys).toEqual(["SLM-12", "SLM-13"]);
    expect(d.state).toBe("success");
  });

  it("is red when one of several keys is not ready", () => {
    const d = decide({
      title: "SLM-12 and SLM-13",
      branch: "b",
      statuses: { "SLM-12": "Ready for Release", "SLM-13": "In Development" },
    });
    expect(d.state).toBe("failure");
    expect(d.description).toContain("SLM-13 is In Development");
    expect(d.description).not.toContain("SLM-12 is");
  });

  it("matches the status name in any case", () => {
    expect(decide({ title: "SLM-12", branch: "b", statuses: { "SLM-12": "READY FOR RELEASE" } }).state).toBe("success");
  });

  it("is green with the owner's waiver label, whatever Jira says", () => {
    const d = decide({
      title: "Fix",
      branch: "b",
      labels: ["jira-status-waived"],
      waiverBy: "ahmedoraby-eng",
    });
    expect(d.state).toBe("success");
    expect(d.description).toBe("Waived by ahmedoraby-eng ('jira-status-waived' label)");
  });

  it("ignores a waiver label someone else added, and says so when red", () => {
    const red = decide({
      title: "SLM-12",
      branch: "b",
      labels: ["jira-status-waived"],
      waiverBy: "some-bot[bot]",
      statuses: { "SLM-12": "In Development" },
    });
    expect(red.state).toBe("failure");
    expect(red.description).toMatch(
      /^'jira-status-waived' not added by ahmedoraby-eng, ignored\. SLM-12 is In Development/,
    );
    const green = decide({
      title: "SLM-12",
      branch: "b",
      labels: ["jira-status-waived"],
      waiverBy: "some-bot[bot]",
      statuses: { "SLM-12": "Ready for Release" },
    });
    expect(green.state).toBe("success");
  });

  it("is an error, not green, when Jira could not be read", () => {
    const d = decide({ title: "SLM-12", branch: "b", statuses: { "SLM-12": { error: "HTTP 401" } } });
    expect(d.state).toBe("error");
    expect(d.description).toBe("Jira could not be read for SLM-12: HTTP 401");
  });

  it("keeps the description within GitHub's 140 characters", () => {
    const statuses: Record<string, string> = {};
    const keys = Array.from({ length: 12 }, (_, i) => `SLM-${100 + i}`);
    for (const key of keys) statuses[key] = "In Development";
    const d = decide({ title: keys.join(" "), branch: "b", statuses });
    expect(d.description.length).toBeLessThanOrEqual(140);
  });
});

describe("keys from the description", () => {
  it("reads «Closes» and «Refs» lines, after list markers or emphasis, in any case", () => {
    const d = decide({
      title: "chore: integration",
      branch: "integration/wave-3",
      body: "## What\n- Closes SLM-12\n**Refs** SLM-17, SLM-13\nfixes: SLM-14\n> resolves SLM-15",
      statuses: {
        "SLM-12": "Ready for Release",
        "SLM-17": "Ready for Release",
        "SLM-13": "Ready for Release",
        "SLM-14": "Ready for Release",
        "SLM-15": "Ready for Release",
      },
    });
    expect(d.keys).toEqual(["SLM-12", "SLM-17", "SLM-13", "SLM-14", "SLM-15"]);
    expect(d.state).toBe("success");
  });

  it("checks a key named only in the description: an integration PR is red until it is ready", () => {
    const d = decide({
      title: "Wave 3 integration",
      branch: "integration/wave-3",
      body: "Closes SLM-12\nCloses SLM-13",
      statuses: { "SLM-12": "Ready for Release", "SLM-13": "In Development" },
    });
    expect(d.state).toBe("failure");
    expect(d.description).toBe("SLM-13 is In Development, needs Ready for Release");
  });

  it("ignores a key mentioned in passing, and the template's placeholders", () => {
    const d = decide({
      title: "x",
      branch: "b",
      body: "Follows SLM-9 (see SLM-10).\nRefs <KEY>\nCloses <KEY>\nRefsSLM-11",
      statuses: {},
    });
    expect(d.keys).toEqual([]);
    expect(d.description).toBe("No SLM issue key in the title, branch or a Closes/Refs line");
  });
});

// ---- the network part, against a fake GitHub and Jira ----

type Call = { method: string; url: string; body: string; auth: string };
type Pr = {
  number: number;
  title: string;
  ref: string;
  body?: string;
  state?: string;
  labels?: string[];
  sha?: string;
  fork?: boolean;
};

const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    await new Promise((done) => {
      server.close(done);
    });
  }
});

async function fake(opts: {
  prs: Pr[];
  jira: Record<string, string | number>;
  statuses?: Record<string, { context: string; state: string; description: string }[]>;
  events?: { event: string; label: { name: string }; actor: { login: string } }[];
  /** The PR's changed files; undefined makes the files read fail (500). */
  files?: (string | [string, string])[];
}): Promise<{ url: string; calls: Call[] }> {
  const calls: Call[] = [];
  const pr = (p: Pr) => ({
    number: p.number,
    title: p.title,
    body: p.body ?? "",
    state: p.state ?? "open",
    head: { ref: p.ref, sha: p.sha ?? SHA, repo: { full_name: p.fork ? "someone/r" : "o/r" } },
    labels: (p.labels ?? []).map((name) => ({ name })),
  });
  // One answer per path: [HTTP status, JSON body].
  const answer = (method: string, path: string): [number, unknown] => {
    const one = /^\/gh\/repos\/o\/r\/pulls\/(\d+)$/.exec(path);
    if (one) {
      const found = opts.prs.find((p) => p.number === Number(one[1]));
      return found ? [200, pr(found)] : [404, {}];
    }
    if (path === "/gh/repos/o/r/pulls") return [200, opts.prs.filter((p) => (p.state ?? "open") === "open").map(pr)];
    if (/^\/gh\/repos\/o\/r\/issues\/\d+\/events$/.test(path)) return [200, opts.events ?? []];
    if (/^\/gh\/repos\/o\/r\/pulls\/\d+\/files$/.test(path))
      return opts.files === undefined
        ? [500, {}]
        : [
            200,
            opts.files.map((f) =>
              Array.isArray(f) ? { filename: f[0], previous_filename: f[1], status: "renamed" } : { filename: f },
            ),
          ];
    const commit = /^\/gh\/repos\/o\/r\/commits\/([0-9a-f]{40})\/statuses$/.exec(path);
    if (commit) return [200, opts.statuses?.[commit[1] ?? ""] ?? []];
    if (/^\/gh\/repos\/o\/r\/statuses\/[0-9a-f]{40}$/.test(path) && method === "POST") return [201, {}];
    const issue = /^\/jira\/rest\/api\/3\/issue\/([A-Z]+-\d+)$/.exec(path);
    if (issue) {
      const status = opts.jira[issue[1] ?? ""];
      if (typeof status === "number") return [status, {}];
      return status ? [200, { fields: { status: { name: status } } }] : [404, {}];
    }
    return [404, {}];
  };
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      const url = req.url ?? "";
      const method = req.method ?? "";
      calls.push({ method, url, body, auth: req.headers.authorization ?? "" });
      const [status, data] = answer(method, url.split("?")[0] ?? "");
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    });
  });
  servers.push(server);
  const port = await listenLocal(server);
  return { url: `http://127.0.0.1:${port}`, calls };
}

function run(base: string, args: string[], env: Record<string, string> = {}): Promise<{ code: number; out: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      env: {
        PATH: process.env.PATH ?? "",
        GITHUB_API_URL: `${base}/gh`,
        JIRA_API_URL: `${base}/jira`,
        GITHUB_REPOSITORY: "o/r",
        GITHUB_TOKEN: "gh-test-token",
        JIRA_READ_EMAIL: "reader@example.com",
        JIRA_READ_TOKEN: "jira-test-token",
        ...env,
      },
    });
    let out = "";
    const collect = (chunk: Buffer) => {
      out += chunk.toString();
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("close", (code) => {
      done({ code: code ?? 1, out });
    });
  });
}

type Posted = { url: string; state?: string; context?: string; description?: string };
const posted = (calls: Call[]): Posted[] =>
  calls.filter((c) => c.method === "POST").map((c) => ({ url: c.url, ...(JSON.parse(c.body) as Omit<Posted, "url">) }));

describe("the check against GitHub and Jira", () => {
  it("posts a red 'Jira status' on the PR's head commit while the issue is not ready", async () => {
    const f = await fake({
      prs: [{ number: 7, title: "SLM-12: x", ref: "eng/SLM-12-x" }],
      jira: { "SLM-12": "In Development" },
    });
    const r = await run(f.url, ["--pr", "7"]);
    expect(r.code).toBe(0);
    expect(posted(f.calls)).toEqual([
      {
        url: `/gh/repos/o/r/statuses/${SHA}`,
        state: "failure",
        context: "Jira status",
        description: "SLM-12 is In Development, needs Ready for Release",
      },
    ]);
  });

  it("checks the keys of the PR's description too", async () => {
    const { url, calls } = await fake({
      prs: [{ number: 9, title: "Integration", ref: "integration/x", body: "Closes SLM-12" }],
      jira: { "SLM-12": "In Testing" },
    });
    const r = await run(url, ["--pr", "9"]);
    expect(r.code).toBe(0);
    expect(posted(calls)).toEqual([
      expect.objectContaining({
        state: "failure",
        description: "SLM-12 is In Testing, needs Ready for Release",
      }),
    ]);
  });

  it("does not read the files of a PR that names an SLM key", async () => {
    const { url, calls } = await fake({
      prs: [{ number: 14, title: "SLM-12: x", ref: "b" }],
      jira: { "SLM-12": "Ready for Release" },
    });
    await run(url, ["--pr", "14"]);
    expect(calls.some((c) => c.url.includes("/files"))).toBe(false);
  });

  it("posts red for a PR from a fork and never reads Jira, even in the scheduled run (F1 on #34)", async () => {
    const f = await fake({
      prs: [{ number: 7, title: "SLM-12: x", ref: "b", fork: true }],
      jira: { "SLM-12": "Ready for Release" },
    });
    for (const args of [["--pr", "7"], ["--open"]]) {
      const r = await run(f.url, args);
      expect(r.code).toBe(0);
    }
    // One post per run (--pr, then --open), both red with the same reason.
    const fork = ["failure", "From a fork: not checked against Jira. Open the PR from a branch of this repository"];
    expect(posted(f.calls).map((p) => [p.state, p.description])).toEqual([fork, fork]);
    expect(f.calls.some((c) => c.url.startsWith("/jira/"))).toBe(false);
  });

  it("posts green once the issue is Ready for Release", async () => {
    const f = await fake({
      prs: [{ number: 7, title: "SLM-12: x", ref: "b" }],
      jira: { "SLM-12": "Ready for Release" },
    });
    await run(f.url, ["--pr", "7"]);
    expect(posted(f.calls).map((p) => p.state)).toEqual(["success"]);
  });

  it("only reads the issue's status from Jira, with the read token", async () => {
    const f = await fake({
      prs: [{ number: 7, title: "SLM-12: x", ref: "b" }],
      jira: { "SLM-12": "Ready for Release" },
    });
    await run(f.url, ["--pr", "7"]);
    const jira = f.calls.filter((c) => c.url.startsWith("/jira/"));
    expect(jira.map((c) => c.method)).toEqual(["GET"]);
    expect(jira.at(0)?.url).toBe("/jira/rest/api/3/issue/SLM-12?fields=status");
    expect(jira.at(0)?.auth).toBe(`Basic ${Buffer.from("reader@example.com:jira-test-token").toString("base64")}`);
  });

  it("posts an error, and reads nothing from Jira, without the Jira token", async () => {
    const f = await fake({
      prs: [{ number: 7, title: "SLM-12: x", ref: "b" }],
      jira: { "SLM-12": "Ready for Release" },
    });
    await run(f.url, ["--pr", "7"], { JIRA_READ_TOKEN: "" });
    expect(posted(f.calls).map((p) => p.state)).toEqual(["error"]);
    expect(posted(f.calls).at(0)?.description).toContain("JIRA_READ_TOKEN");
    expect(f.calls.some((c) => c.url.startsWith("/jira/"))).toBe(false);
  });

  it("posts an error when Jira refuses the token", async () => {
    const f = await fake({ prs: [{ number: 7, title: "SLM-12: x", ref: "b" }], jira: { "SLM-12": 401 } });
    await run(f.url, ["--pr", "7"]);
    expect(posted(f.calls).at(0)).toMatchObject({
      state: "error",
      description: "Jira could not be read for SLM-12: HTTP 401",
    });
  });

  it("goes green with the owner's waiver label, read from the label events", async () => {
    const f = await fake({
      prs: [{ number: 7, title: "Fix", ref: "b", labels: ["jira-status-waived"] }],
      jira: {},
      events: [
        { event: "labeled", label: { name: "jira-status-waived" }, actor: { login: "some-bot[bot]" } },
        { event: "labeled", label: { name: "jira-status-waived" }, actor: { login: "ahmedoraby-eng" } },
      ],
    });
    await run(f.url, ["--pr", "7"]);
    expect(posted(f.calls).map((p) => p.state)).toEqual(["success"]);
    expect(posted(f.calls).at(0)?.description).toContain("Waived by ahmedoraby-eng");
  });

  it("counts only the last time the waiver label was added", async () => {
    const f = await fake({
      prs: [{ number: 7, title: "Fix", ref: "b", labels: ["jira-status-waived"] }],
      jira: {},
      events: [
        { event: "labeled", label: { name: "jira-status-waived" }, actor: { login: "ahmedoraby-eng" } },
        { event: "labeled", label: { name: "jira-status-waived" }, actor: { login: "some-bot[bot]" } },
      ],
    });
    await run(f.url, ["--pr", "7"]);
    expect(posted(f.calls).map((p) => p.state)).toEqual(["failure"]);
  });

  it("--open checks every open PR, and posts nothing when the status is unchanged", async () => {
    const other = "b".repeat(40);
    const f = await fake({
      prs: [
        { number: 7, title: "SLM-12: x", ref: "b" },
        { number: 8, title: "SLM-13: y", ref: "c", sha: other },
        { number: 9, title: "SLM-14: z", ref: "d", state: "closed" },
      ],
      jira: { "SLM-12": "Ready for Release", "SLM-13": "In Development" },
      statuses: {
        [other]: [
          {
            context: "Jira status",
            state: "failure",
            description: "SLM-13 is In Development, needs Ready for Release",
          },
        ],
      },
    });
    const r = await run(f.url, ["--open"]);
    expect(r.code).toBe(0);
    expect(posted(f.calls)).toEqual([
      expect.objectContaining({ url: `/gh/repos/o/r/statuses/${SHA}`, state: "success" }),
    ]);
    expect(r.out).toContain("#8 bbbbbbb: failure: SLM-13 is In Development");
    expect(r.out).toContain("(unchanged)");
    expect(r.out).not.toContain("#9");
  });

  it("--dry-run posts nothing", async () => {
    const f = await fake({
      prs: [{ number: 7, title: "SLM-12: x", ref: "b" }],
      jira: { "SLM-12": "In Development" },
    });
    const r = await run(f.url, ["--pr", "7", "--dry-run"]);
    expect(posted(f.calls)).toEqual([]);
    expect(r.out).toContain("#7 aaaaaaa: failure");
  });

  it("refuses bad arguments with exit 2", async () => {
    const f = await fake({ prs: [], jira: {} });
    for (const args of [[], ["--pr", "7; rm -rf /"], ["--pr", "0"], ["--pr", "7", "--open"], ["--bogus"]]) {
      expect((await run(f.url, args)).code).toBe(2);
    }
    expect(f.calls).toEqual([]);
  });
});
