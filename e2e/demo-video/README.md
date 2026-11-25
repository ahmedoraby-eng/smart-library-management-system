# Demo video

`npm run demo:video` records the product walkthrough with Playwright: title card, the librarian journey, a forbidden
action (403), AI discovery and its keyword fallback, the last-copy race with two windows, and a closing card. Every
scene carries an on-screen caption. The result is `test-results/demo-video/smart-library-demo.mp4` (and the raw
`.webm`).

It runs on a throwaway local stack like `npm run e2e` (embedded PostgreSQL 16, `wrangler dev`, the fake AI, random
secrets), plus a second Worker on the same database **without** the AI binding, to show the fallback. Nothing talks to
production and no production setting is read or changed. Demo passwords are generated for the run and never printed.

```bash
npm run demo:video                 # record and encode
npm run demo:video -- --out ~/video  # copy the .mp4 there as well
```

## The final video: the live site with narration

`npm run demo:video:live` records the eight scenes of the video script on the deployed site and lays the narration
over them, one clip per scene (`scene-1.m4a` … `scene-8.m4a`, recorded in Voice Memos):

```bash
export SLM_ADMIN_EMAIL=… SLM_ADMIN_PASSWORD=… SLM_LIBRARIAN_EMAIL=… SLM_LIBRARIAN_PASSWORD=…
npm run demo:video:live -- --audio ~/voice --out ~/video
```

- The demo accounts come from the environment only; the script never prints them (every message it writes is
  redacted).
- Off camera, the admin resets the demo data and rebuilds the search index first, and resets again at the end (also
  after a failed run), so the site is left as a reviewer expects it.
- Each scene waits out its clip while recording, and `assemble.swift` (AVFoundation) then fits each scene's screen time
  to its clip exactly: it holds the last frame when the clip is longer, or plays the scene a little faster. A missing
  clip leaves its scene silent at a default length, so `say` clips work for a test run.
- Scene 5 (the last copy) runs two separate browser contexts, the admin and the librarian, each with its own
  session, and streams both into one side-by-side page.
- Scene 7 uses the real AI; if it is unavailable, the badge and the caption say the keyword fallback answered.
- `DEMO_GOOGLE=1` adds a short shot of the Google button in scene 2 (once Google sign-in is live); `DEMO_CAPTIONS=0`
  hides the caption banner.

Output: `test-results/demo-video/smart-library-demo-live.mp4`, plus `scenes.json` (where each scene starts and ends).

### The Google sign-in shot (scene 2)

The script cannot sign in with Google (no Google account, and it never types a password), so the shot is recorded by
hand: a 10–15 s macOS screen recording (Cmd+Shift+5, "Record Selected Portion" around the browser) of "Sign in with
Google" → the account chooser → the dashboard as Admin. Then:

```bash
npm run demo:video:live -- --audio ~/Desktop --google-clip ~/Desktop --out ~/video
```

- `--google-clip` takes the file, or a folder (the newest `Screen Recording*.mov` in it).
- `google-clip.swift` finds every email address in the clip with on-device text recognition (Vision) and blurs it,
  in the account chooser and the avatar menu alike. It then reads the result again: if any address is still readable,
  the run stops before the live site is touched. `--google-args "--cover x,y,w,h"` blurs a box by hand (fractions of the
  frame from the top left), `--trim from,to` and `--crop x,y,w,h` cut it down.
- The clip goes at the end of scene 2, from where the narration's last sentence starts ("Staff can also sign in with
  their Google account."), found from the pause before it. Only `scene-2.m4a` is heard; the clip's own sound is dropped.
- `--reuse` skips the recording and lays the narration and the clip over the last recorded run again, so a new clip or
  voice take needs no new live run.
- `--cues <cues.json>`: when each on-screen step happens, in seconds of the scene's narration (from the voice edit), so
  the screen follows the words; without it, fixed shares of each scene. In scene 2, cues `clipFrom`/`clipTo` place
  the Google clip under the sentences about it.
- `google-clip.swift --keep from-to:seconds` (repeatable) cuts a long hand recording down and fits each range to the
  narration; `--cover x,y,w,h@from-to` blurs a box by hand (e.g. while a dialog animates in). Already prepared clips
  go in with `--google-prepared <file.mp4>`.
- `--extras` also films extra scenes 9–11 after scene 5 (delete a book safely, ISBN look-up, the desk rules, as the
  demo admin). Until their clips exist they stay out of the main cut and go to `extras-preview.mp4`.
- Output is 1920×1080 (H.264, AAC): the scenes are filmed at 1600×900 and scaled, with a short dip to black between
  scenes.
- Nothing the run produces is committed: the clip, the voice files and the video stay in `test-results/` and the folders
  you pass.

## Requirements

Needs the Playwright Chromium (`npx playwright install chromium`). The `.webm` is made by Playwright; turning it into
an MP4 uses Playwright's own ffmpeg to cut it into PNG frames and `encode.swift` (AVFoundation, macOS) to encode H.264, so no ffmpeg
install is needed. Without `swiftc`, the `.webm` is still written and plays in any browser.
