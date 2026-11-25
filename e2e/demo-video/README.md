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

Needs the Playwright Chromium (`npx playwright install chromium`). The `.webm` is made by Playwright; turning it into
an MP4 uses Playwright's own ffmpeg to cut it into PNG frames and `encode.swift` (AVFoundation, macOS) to encode H.264, so no ffmpeg
install is needed. Without `swiftc`, the `.webm` is still written and plays in any browser.
