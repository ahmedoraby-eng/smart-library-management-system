// @vitest-environment node
/**
 * ADR-0185: when a PR opens or leaves draft, each SLM issue it closes that is In Development moves
 * to In Testing and is assigned to QA, with a comment linking the PR; nothing else moves. Run as a script against a
 * local fake GitHub and Jira, so nothing reaches either.
 */
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { URL, fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { listenLocal } from "./helpers/listen-local";

const SCRIPT = fileURLToPath(new URL("../jira-ready-for-testing.mjs", import.meta.url));

type Call = { method: string; path: string; body: string; auth: string };
type Pr = { number: number; title: string; ref: string; body?: string; draft?: boolean; state?: string };

const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    await new Promise((done) => {
      server.close(done);
    });
  }
});

async function fake(opts: {
  pr: Pr;
  jira: Record<string, string | number>;
  /** Transitions Jira offers from each issue's status (default: the SLM board's, to In Testing). */
  transitions?: Record<string, { id: string; to: { name: string } }[]>;
  /** The assignee PUT is refused (403). */
  assignFails?: boolean;
}): Promise<{
  url: string;
  calls: Call[];
  jira: Record<string, string | number>;
  assigned: Record<string, string>;
}> {
  const calls: Call[] = [];
  const jira = { ...opts.jira };
  const assigned: Record<string, string> = {};
  const answer = (method: string, path: string, body: string): [number, unknown] => {
    if (path === `/gh/repos/o/r/pulls/${opts.pr.number}`)
      return [
        200,
        {
          number: opts.pr.number,
          title: opts.pr.title,
          body: opts.pr.body ?? "",
          draft: opts.pr.draft ?? false,
          state: opts.pr.state ?? "open",
          html_url: `https://github.com/o/r/pull/${opts.pr.number}`,
          head: { ref: opts.pr.ref },
        },
      ];
    const issue = /^\/jira\/rest\/api\/3\/issue\/([A-Z]+-\d+)(\/transitions|\/comment|\/assignee)?$/.exec(path);
    if (issue) {
      const key = issue[1] ?? "";
      const status = jira[key];
      if (typeof status === "number") return [status, {}];
      if (!status) return [404, {}];
      if (!issue[2]) return [200, { fields: { status: { name: status } } }];
      if (issue[2] === "/transitions" && method === "GET")
        return [
          200,
          {
            transitions: opts.transitions?.[key] ?? [
              { id: "3", to: { name: "In Testing" } },
              { id: "11", to: { name: "Refinement" } },
            ],
          },
        ];
      if (issue[2] === "/transitions" && method === "POST") {
        const id = (JSON.parse(body) as { transition: { id: string } }).transition.id;
        if (id === "3") jira[key] = "In Testing";
        return [204, null];
      }
      if (issue[2] === "/comment" && method === "POST") return [201, {}];
      if (issue[2] === "/assignee" && method === "PUT") {
        if (opts.assignFails) return [403, {}];
        assigned[key] = (JSON.parse(body) as { accountId: string }).accountId;
        return [204, null];
      }
    }
    return [404, {}];
  };
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      const path = (req.url ?? "").split("?")[0] ?? "";
      const method = req.method ?? "";
      calls.push({ method, path, body, auth: req.headers.authorization ?? "" });
      const [status, data] = answer(method, path, body);
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(status === 204 ? undefined : JSON.stringify(data));
    });
  });
  servers.push(server);
  const port = await listenLocal(server);
  return { url: `http://127.0.0.1:${port}`, calls, jira, assigned };
}

function run(base: string, args: string[], env: Record<string, string> = {}) {
  return new Promise<{ code: number; out: string }>((done) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      env: {
        PATH: process.env.PATH ?? "",
        GITHUB_API_URL: `${base}/gh`,
        JIRA_API_URL: `${base}/jira`,
        GITHUB_REPOSITORY: "o/r",
        GITHUB_TOKEN: "gh-test-token",
        ATL_TOKEN: "atl-test-token",
        ATL_EMAIL: "jira-bot@example.com",
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

const writes = (calls: Call[]) => calls.filter((c) => c.method === "POST").map((c) => c.path);

describe("In Testing when the PR opens (ADR-0185)", () => {
  it("moves a SLM issue In Development to In Testing and comments the PR link", async () => {
    const f = await fake({
      pr: { number: 7, title: "SLM-12: feeding plan", ref: "feat/SLM-12-plan", body: "Closes SLM-12" },
      jira: { "SLM-12": "In Development" },
    });
    const r = await run(f.url, ["--pr", "7"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("SLM-12: In Development → In Testing");
    expect(f.jira["SLM-12"]).toBe("In Testing");
    expect(writes(f.calls)).toEqual([
      "/jira/rest/api/3/issue/SLM-12/transitions",
      "/jira/rest/api/3/issue/SLM-12/comment",
    ]);
    // The order of every write: move, assign, then comment.
    expect(f.calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.path.split("/").pop()}`)).toEqual([
      "POST transitions",
      "PUT assignee",
      "POST comment",
    ]);
    // The testing queue is QA's: the move assigns QA.
    expect(f.assigned["SLM-12"]).toBe("712020:a11d40c9-5c21-4caf-8743-b118b75cd9d2");
    expect(r.out).toContain("SLM-12: In Development → In Testing, assigned to QA");
    const comment = f.calls.find((c) => c.path.endsWith("/comment"))?.body ?? "";
    expect(comment).toContain("https://github.com/o/r/pull/7");
    expect(JSON.parse(f.calls.find((c) => c.path.endsWith("/transitions") && c.method === "POST")!.body)).toEqual({
      transition: { id: "3" },
    });
  });

  it("writes to Jira as the ATL_EMAIL account with ATL_TOKEN", async () => {
    const f = await fake({
      pr: { number: 7, title: "SLM-12", ref: "b", body: "Closes SLM-12" },
      jira: { "SLM-12": "In Development" },
    });
    await run(f.url, ["--pr", "7"]);
    const expected = `Basic ${Buffer.from("jira-bot@example.com:atl-test-token").toString("base64")}`;
    const jiraCalls = f.calls.filter((c) => c.path.startsWith("/jira/"));
    expect(jiraCalls.length).toBeGreaterThan(0);
    for (const c of jiraCalls) expect(c.auth).toBe(expected);
  });

  it("never moves an issue in any other status: no backwards move, no skipped QA", async () => {
    for (const status of ["Refinement", "In Testing", "Ready for Release", "Released"]) {
      const f = await fake({
        pr: { number: 7, title: "SLM-12", ref: "b", body: "Closes SLM-12" },
        jira: { "SLM-12": status },
      });
      const r = await run(f.url, ["--pr", "7"]);
      expect(r.code, status).toBe(0);
      expect(r.out, status).toContain(`SLM-12: ${status}: left as it is`);
      expect(writes(f.calls), status).toEqual([]);
    }
  });

  it("moves only the keys on a «Closes» / «Fixes» / «Resolves» line", async () => {
    const f = await fake({
      pr: {
        number: 8,
        title: "Integration SLM-1",
        ref: "integration/SLM-2",
        body: "Closes SLM-3\n- Refs SLM-4\n**Fixes** SLM-6\nresolves: SLM-7\nFollows SLM-5\nCloses ABC-17",
      },
      jira: {
        "SLM-1": "In Development",
        "SLM-2": "In Development",
        "SLM-3": "In Development",
        "SLM-4": "In Development",
        "SLM-5": "In Development",
        "SLM-6": "In Development",
        "SLM-7": "In Development",
        "ABC-17": "In Progress",
      },
    });
    const r = await run(f.url, ["--pr", "8"]);
    expect(r.code).toBe(0);
    expect(f.jira).toMatchObject({
      // Closing lines move.
      "SLM-3": "In Testing",
      "SLM-6": "In Testing",
      "SLM-7": "In Testing",
      // The title, the branch, a Refs line and a passing mention don't.
      "SLM-1": "In Development",
      "SLM-2": "In Development",
      "SLM-4": "In Development",
      "SLM-5": "In Development",
      // Only SLM issues move.
      "ABC-17": "In Progress",
    });
    expect(f.calls.some((c) => /SLM-[1245]\b|ABC-17/.test(c.path))).toBe(false);
  });

  it("moves nothing for a PR that only refers to its issue (an intermediate PR)", async () => {
    const f = await fake({
      pr: { number: 9, title: "SLM-12: step 1", ref: "eng/SLM-12-step-1", body: "Refs SLM-12" },
      jira: { "SLM-12": "In Development" },
    });
    const r = await run(f.url, ["--pr", "9"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("closes no SLM issue");
    expect(f.jira["SLM-12"]).toBe("In Development");
    expect(f.calls.some((c) => c.path.startsWith("/jira/"))).toBe(false);
  });

  it("moves nothing for a draft PR, a closed PR or a PR with no SLM issue", async () => {
    for (const pr of [
      { number: 7, title: "SLM-12", ref: "b", body: "Closes SLM-12", draft: true },
      { number: 7, title: "SLM-12", ref: "b", body: "Closes SLM-12", state: "closed" },
      { number: 7, title: "Tidy the README", ref: "chore/readme" },
    ]) {
      const f = await fake({ pr, jira: { "SLM-12": "In Development" } });
      const r = await run(f.url, ["--pr", "7"]);
      expect(r.code).toBe(0);
      expect(writes(f.calls)).toEqual([]);
      expect(f.calls.some((c) => c.path.startsWith("/jira/"))).toBe(false);
    }
  });

  it("fails, saying it moved, when QA cannot be assigned; no comment then", async () => {
    const f = await fake({
      pr: { number: 7, title: "SLM-12", ref: "b", body: "Closes SLM-12" },
      jira: { "SLM-12": "In Development" },
      assignFails: true,
    });
    const r = await run(f.url, ["--pr", "7"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("SLM-12: not moved: moved to In Testing, but not assigned to QA");
    expect(f.calls.some((c) => c.path.endsWith("/comment"))).toBe(false);
  });

  it("never assigns an issue it does not move", async () => {
    const f = await fake({
      pr: { number: 7, title: "SLM-12", ref: "b", body: "Closes SLM-12" },
      jira: { "SLM-12": "In Testing" },
    });
    await run(f.url, ["--pr", "7"]);
    expect(f.calls.some((c) => c.path.endsWith("/assignee"))).toBe(false);
  });

  it("--dry-run reads but moves nothing", async () => {
    const f = await fake({
      pr: { number: 7, title: "SLM-12", ref: "b", body: "Closes SLM-12" },
      jira: { "SLM-12": "In Development" },
    });
    const r = await run(f.url, ["--pr", "7", "--dry-run"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("(dry run, not moved)");
    expect(writes(f.calls)).toEqual([]);
  });

  it("fails, without a comment, when Jira offers no move to In Testing", async () => {
    const f = await fake({
      pr: { number: 7, title: "SLM-12", ref: "b", body: "Closes SLM-12" },
      jira: { "SLM-12": "In Development" },
      transitions: { "SLM-12": [{ id: "11", to: { name: "Refinement" } }] },
    });
    const r = await run(f.url, ["--pr", "7"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("SLM-12: not moved: no transition to In Testing");
    expect(writes(f.calls)).toEqual([]);
  });

  it("fails clearly without ATL_TOKEN or ATL_EMAIL, and refuses bad arguments with exit 2", async () => {
    const f = await fake({
      pr: { number: 7, title: "SLM-12", ref: "b", body: "Closes SLM-12" },
      jira: { "SLM-12": "In Development" },
    });
    const r = await run(f.url, ["--pr", "7"], { ATL_TOKEN: "" });
    expect(r.code).toBe(1);
    expect(r.out).toContain("ATL_TOKEN is not set");
    const e = await run(f.url, ["--pr", "7"], { ATL_EMAIL: "" });
    expect(e.code).toBe(1);
    expect(e.out).toContain("ATL_EMAIL is not set");
    expect(writes(f.calls)).toEqual([]);
    expect((await run(f.url, [])).code).toBe(2);
    expect((await run(f.url, ["--pr", "x"])).code).toBe(2);
    expect((await run(f.url, ["--nope"])).code).toBe(2);
  });
});
