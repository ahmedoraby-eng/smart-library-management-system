/** The pages the demo video draws itself: title and closing cards, the two-window race page, the caption banner. */

const FONT = `-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif`;

/** Injected in every page and frame: a visible mouse cursor with a click ripple, the __spot highlight, and (top frame only) the caption banner. */
export function captionScript(): string {
  return `(() => {
  const FONT = ${JSON.stringify(FONT)};
  const mk = (css, tag) => { const e = document.createElement(tag || "div"); e.style.cssText = css; return e; };
  const boot = () => {
    if (document.getElementById("__demo")) return;
    const root = mk("position:fixed;inset:0;pointer-events:none;z-index:2147483647", "div");
    root.id = "__demo";
    const cur = mk("position:absolute;left:-40px;top:-40px;width:22px;height:22px;margin:-4px 0 0 -4px;border-radius:50%;" +
      "background:rgba(79,70,229,.85);border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);transition:transform .08s");
    root.appendChild(cur);
    document.addEventListener("mousemove", (e) => { cur.style.left = e.clientX + "px"; cur.style.top = e.clientY + "px"; }, true);
    document.addEventListener("mousedown", (e) => {
      cur.style.transform = "scale(.7)";
      const r = mk("position:absolute;left:" + e.clientX + "px;top:" + e.clientY + "px;width:12px;height:12px;margin:-6px;border-radius:50%;" +
        "border:3px solid #4f46e5;opacity:.9;transition:all .5s ease-out");
      root.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = "scale(4)"; r.style.opacity = "0"; });
      setTimeout(() => r.remove(), 600);
    }, true);
    document.addEventListener("mouseup", () => { cur.style.transform = ""; }, true);
    // __spot(el, {zoom, ms}): points at a key moment. The page zooms (about 1.3x) around the element's centre, so the
    // element and the cursor on it stay put, a soft ring lights it while the rest dims a little, then all eases back.
    window.__spot = (el, o) => {
      o = o || {}; const zoom = o.zoom || 1, ms = o.ms || 2000, b = document.body;
      const r0 = el.getBoundingClientRect();
      const cx = r0.left + r0.width / 2 + scrollX, cy = r0.top + r0.height / 2 + scrollY;
      const ease = "cubic-bezier(.22,.7,.2,1)";
      if (zoom > 1) {
        b.style.transformOrigin = cx + "px " + cy + "px";
        b.style.transition = "transform .6s " + ease;
        requestAnimationFrame(() => { b.style.transform = "scale(" + zoom + ")"; });
      }
      const ring = mk("position:absolute;border-radius:12px;border:3px solid #f59e0b;opacity:0;" +
        "box-shadow:0 0 0 4px rgba(245,158,11,.25),0 0 24px rgba(245,158,11,.55),0 0 0 9999px rgba(15,20,48,.22);" +
        "transition:opacity .35s ease,transform .35s " + ease + ";transform:scale(1.08)");
      root.insertBefore(ring, cur);
      setTimeout(() => {
        const r = el.getBoundingClientRect(), pad = 8;
        ring.style.left = (r.left - pad) + "px"; ring.style.top = (r.top - pad) + "px";
        ring.style.width = (r.width + 2 * pad) + "px"; ring.style.height = (r.height + 2 * pad) + "px";
        ring.style.opacity = "1"; ring.style.transform = "scale(1)";
      }, zoom > 1 ? 620 : 0);
      setTimeout(() => { ring.style.opacity = "0"; if (zoom > 1) b.style.transform = ""; }, ms);
      setTimeout(() => { ring.remove(); b.style.transition = ""; b.style.transformOrigin = ""; }, ms + 700);
    };
    if (window.top === window) {
      const bar = mk("position:absolute;left:0;right:0;bottom:0;padding:22px 48px 26px;color:#fff;font-family:" + FONT + ";" +
        "background:linear-gradient(0deg,rgba(15,20,48,.97) 0%,rgba(15,20,48,.93) 80%,rgba(15,20,48,0) 100%);transition:opacity .25s");
      const chip = mk("display:inline-block;font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#a5b4fc;margin-bottom:6px");
      const t = mk("font-size:30px;font-weight:650;line-height:1.2");
      const s = mk("font-size:19px;line-height:1.35;color:#c7d2fe;margin-top:6px;max-width:1400px");
      bar.append(chip, t, s);
      root.appendChild(bar);
      const draw = (c) => {
        chip.textContent = c.n || ""; t.textContent = c.t || ""; s.textContent = c.s || "";
        bar.style.opacity = c.t ? "1" : "0";
      };
      window.__cap = (t, s, n) => { const c = { t, s, n }; try { sessionStorage.setItem("__cap", JSON.stringify(c)); } catch {} draw(c); };
      // A title card starts clean; any other page keeps the caption of the page before it.
      if (location.pathname.startsWith("/card/")) window.__cap("", "", "");
      else try { draw(JSON.parse(sessionStorage.getItem("__cap") || "{}")); } catch { draw({}); }
    }
    document.documentElement.appendChild(root);
  };
  if (document.documentElement) boot(); else document.addEventListener("DOMContentLoaded", boot);
  document.addEventListener("DOMContentLoaded", boot);
})();`;
}

const shell = (body: string) => `<!doctype html><meta charset="utf-8"><title>Smart Library demo</title>
<style>
  html,body{margin:0;height:100%;font-family:${FONT};color:#fff}
  body{background:radial-gradient(1200px 700px at 15% 10%,#4338ca 0%,#1e1b4b 45%,#0f1430 100%);display:flex;align-items:center}
  .wrap{padding:0 120px;max-width:1360px}
  .brand{font-size:20px;letter-spacing:.14em;text-transform:uppercase;color:#a5b4fc;font-weight:600;margin-bottom:28px}
  h1{font-size:76px;line-height:1.05;margin:0 0 28px;font-weight:700;letter-spacing:-.02em}
  p{font-size:28px;line-height:1.45;color:#c7d2fe;margin:0 0 14px;max-width:1100px}
  ul{list-style:none;padding:0;margin:26px 0 0;display:grid;gap:14px}
  li{font-size:26px;color:#e0e7ff;padding-left:34px;position:relative}
  li:before{content:"";position:absolute;left:0;top:13px;width:14px;height:14px;border-radius:50%;background:#818cf8}
  code{font-family:ui-monospace,Menlo,monospace;background:rgba(255,255,255,.12);padding:2px 10px;border-radius:8px;color:#fff}
</style><div class="wrap">${body}</div>`;

export function cardPage(id: string): string {
  if (id === "close")
    return shell(`<div class="brand">Smart Library</div><h1>Built, tested and live</h1>
<ul>
<li>Live at <code>smart-library.ahmedoraby.workers.dev</code></li>
<li>Code on GitHub: <code>github.com/ahmedoraby-eng/smart-library-management-system</code></li>
<li>Deployed on Cloudflare Workers, with PostgreSQL on Neon. Every merge to <code>main</code> deploys.</li>
<li>CI gates on every pull request: hygiene, tests with a 90% coverage gate, E2E, migrations gate, AI guardrails, Jira status.</li>
<li>How it was built, with a team of AI agents: <code>docs/ai-team.md</code></li>
<li>How it works, end to end: <code>docs/how-it-works.md</code></li>
<li>Architecture, AI search and every decision: <code>docs/architecture.md</code>, <code>docs/ai.md</code>, <code>docs/decisions.md</code></li>
</ul>`);
  return shell(`<div class="brand">Smart Library — demo</div><h1>Run a library from one screen</h1>
<p>A staff-facing app: catalogue, members, Borrow Book and Return Book, loan history, search, a dashboard, and AI-assisted discovery.</p>
<ul>
<li>Used by library staff: librarians, admins and read-only supervisors</li>
<li>Members have no login: the librarian borrows and returns for them</li>
<li>Live at <code>smart-library.ahmedoraby.workers.dev</code></li>
</ul>`);
}

/** Two windows side by side (two sessions of the demo librarian account, one book with a single copy left). */
export function racePage(app: string): string {
  const pane = (name: string, label: string) =>
    `<div class="pane"><div class="lab">${label}</div><iframe id="${name}" name="${name}" src="${app}/circulation/borrow"></iframe></div>`;
  return `<!doctype html><meta charset="utf-8"><title>Two librarians</title>
<style>
  html,body{margin:0;height:100%;background:#0f1430;font-family:${FONT}}
  .row{display:flex;gap:16px;padding:0 8px}
  .pane{width:792px;height:772px;overflow:hidden;border-radius:10px;background:#fff;position:relative}
  .lab{height:44px;line-height:44px;background:#312e81;color:#fff;font-size:20px;font-weight:600;padding-left:18px}
  iframe{border:0;width:1000px;height:910px;transform:scale(.792);transform-origin:0 0}
</style><div style="height:10px"></div><div class="row">${pane("a", "Librarian A")}${pane("b", "Librarian B")}</div>`;
}

/** The pane's picture area (CSS px) and the viewport of each live window streamed into it (scale .792). */
export const PANE = { w: 792, h: 728, viewW: 1000, viewH: 919 };

/**
 * Two windows side by side for the live recording: each pane is an <img> that `record-live.ts` fills with the
 * screencast frames of a separate browser context (its own staff session), so the two sessions really are apart.
 */
export function pairPage(left: string, right: string): string {
  const pane = (name: string, label: string) =>
    `<div class="pane"><div class="lab">${label}</div><img id="${name}" alt=""></div>`;
  return `<!doctype html><meta charset="utf-8"><title>Two desks</title>
<style>
  html,body{margin:0;height:100%;background:#0f1430;font-family:${FONT}}
  .row{display:flex;gap:16px;padding:0 8px}
  .pane{width:${PANE.w}px;height:${PANE.h + 44}px;overflow:hidden;border-radius:10px;background:#fff;position:relative}
  .lab{height:44px;line-height:44px;background:#312e81;color:#fff;font-size:20px;font-weight:600;padding-left:18px}
  img{display:block;width:${PANE.w}px;height:${PANE.h}px}
</style><div style="height:10px"></div><div class="row">${pane("a", left)}${pane("b", right)}</div>`;
}
