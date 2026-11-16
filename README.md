# Neon Ace

A production-ready, single-page blackjack game built with plain HTML, CSS and JavaScript. No frameworks, no build tooling, no remote fonts, no analytics and no real-money wagering. The critical path is roughly **29 KB gzipped**.

**Live production sites:** <https://neon-ace.pages.dev/> (Cloudflare Pages), <https://vip-4.github.io/neon-ace/> (GitHub Pages) and <https://neon-ace-tg.pages.dev/> (Telegram Mini App endpoint).

---

## What is included

- Six-deck shoe (312 cards), shuffled locally with the Web Crypto API and Fisher-Yates.
- Dealer stands on all 17s (S17), blackjack pays 3:2, double after split, up to four hands.
- Split aces receive one card each and cannot be resplit; split 21 pays 1:1.
- Virtual bankroll, bet selection, sound toggle and session stats persisted in `localStorage`.
- Keyboard shortcuts (`H`, `S`, `D`, `P`, `N`, `M`), visible focus, live status announcements, labelled cards and reduced-motion support.
- Complete on-page rules, basic-strategy reference, FAQ, accessibility notes and source transparency.
- SEO/GEO layer: canonical, Open Graph, Twitter Card, robots, sitemap, `llms.txt`, and a single JSON-LD graph with Organization, WebSite, WebPage, VideoGame, HowTo, FAQPage and BreadcrumbList entities.
- Generated social card (1200x630) and install icons.
- Production headers with a strict Content Security Policy and immutable asset caching.
- Build-time validation of metadata, structured data, internal links, sitemap, manifest, icon dimensions and CSP.

## Canvas slot reel demo

`site/slots.html` is a separate, indexable technical page hosting a runnable **3×5 HTML5 Canvas slot machine** prototype written in vanilla JS (`assets/slot-machine.js`):

- **Reels** — cubic ease-in acceleration to 19 symbols/s, constant-speed scroll, then sequential stops 0.17 s apart using `easeOutBack` (overshoot + settle = the mechanical latch feel). Eight symbols are rasterised once into an offscreen sprite atlas.
- **Big Win** — full-screen dim, three parabolic coin-burst waves (gravity 1500 px/s²), `easeOutCubic` count-up number, and a Web Audio arpeggio unlocked on first gesture.
- **DPR / deltaTime** — backing store scaled by `devicePixelRatio` (capped at 2.5) with `setTransform(dpr*scale, …)`, a single clamped `requestAnimationFrame` loop (`dt ≤ 0.05 s`), fixed 1/120 s physics steps, and a reset of the time base on `visibilitychange` to kill the tab-restore jump.
- **Performance** — 200-slot coin object pool (zero allocations in the loop), `setTransform` instead of per-particle `save/restore`, `IntersectionObserver` skips offscreen drawing, and `offset` is normalised on settle to avoid float drift.
- **Security boundary** — the client never computes RNG or payout. `DemoOutcomeProvider` replays a fixed script of outcomes; the commented `ServerOutcomeProvider` shows the production `POST /api/spin` shape with a signed result.

Canvas content is invisible to crawlers, so the page carries complete meta tags, a JSON-LD graph (WebPage / VideoGame / HowTo / FAQPage / BreadcrumbList) and a long-form semantic explanation of all three features. It is linked from the homepage nav, `sitemap.xml` and `llms.txt`.

## Baccarat (Punto Banco) demo

`site/baccarat.html` is a lightweight, indexable **browser baccarat (Punto Banco)** page with virtual chips and Canvas-rendered hands (`assets/baccarat.js`, `assets/baccarat-demo.css`):

- **Ruleset** — 8-deck shoe, Player/Banker/Tie bets, naturals 8/9, standard third-card tableau applied automatically, payouts 1:1 (Player), 0.95:1 after 5% commission (Banker), 8:1 Tie (demo); Player/Banker push on Tie.
- **Rendering & loop** — native HTML5 Canvas 2D, DPR-aware resize (`devicePixelRatio` capped), fixed-timestep `requestAnimationFrame` loop with clamped `deltaTime` and `visibilitychange` reset to avoid tab-return jumps.
- **State & UX** — finite-state flow (betting → dealing/draw → reveal/settle), virtual bankroll/stats/sound in `localStorage`, touch-sized controls, `aria-live` status, visible focus and `prefers-reduced-motion` support.
- **Security boundary** — local Web Crypto shuffle for entertainment only; real-money/ranked/redeemable products must use server-authoritative RNG, payouts and signed results (client renders verified outcomes only).

The page ships complete SEO/GEO (title/description/keywords/OG/Twitter/canonical/robots/sitemap), semantic/indexable rules, third-card chart and FAQ, plus JSON-LD (WebSite/WebPage/VideoGame/HowTo/FAQPage/BreadcrumbList), and is linked from site navigation, `sitemap.xml` and `llms.txt`.

## Sic Bo (骰寶) demo

`site/sicbo.html` is a lightweight, indexable **browser Sic Bo dice game** with virtual chips and Canvas-rendered three-dice rolls (`assets/sicbo.js`, `assets/sicbo-demo.css`):

- **Bets/payouts (demo)** — Small 4–10 (1:1), Big 11–17 (1:1), Odd/Even (1:1) with triples losing on these bets in this demo rule; Any Triple (30:1); Specific Triple (180:1, selectable 1-1-1 to 6-6-6). Full casino tables include additional totals/doubles/combinations.
- **Rendering & loop** — native HTML5 Canvas 2D, DPR-aware resize (`devicePixelRatio` capped), fixed-timestep `requestAnimationFrame` loop with clamped `deltaTime` and `visibilitychange` reset, animated roll presentation.
- **State & UX** — finite-state flow (betting → rolling → reveal/settle), virtual bankroll/stats/sound in `localStorage`, touch-sized controls, `aria-live` status, visible focus and `prefers-reduced-motion` support.
- **Security boundary** — local Web Crypto dice RNG for entertainment only; real-money/ranked/redeemable products must use server-authoritative RNG, payouts and signed results.

The page ships complete SEO/GEO (title/description/keywords/OG/Twitter/canonical/robots/sitemap), semantic/indexable rules, payout table and FAQ, plus JSON-LD (WebSite/WebPage/VideoGame/HowTo/FAQPage/BreadcrumbList), and is linked from site navigation, `sitemap.xml` and `llms.txt`.

## European Roulette (輪盤) demo

`site/roulette.html` is a lightweight, indexable **browser European roulette** page with virtual chips and a Canvas-rendered single-zero wheel (`assets/roulette.js`, `assets/roulette-demo.css`):

- **Bets/payouts (demo)** — Straight-up 0–36 (35:1), Red/Black (1:1), Odd/Even (1:1), Low 1–18 / High 19–36 (1:1), Dozens (2:1), Columns (2:1). Advanced split/corner/line bets omitted to keep the layout lightweight.
- **Rendering & loop** — native HTML5 Canvas 2D wheel/ball animation, DPR-aware resize (`devicePixelRatio` capped), fixed-timestep `requestAnimationFrame` loop with clamped `deltaTime` and `visibilitychange` reset.
- **State & UX** — finite-state flow (betting → spinning → reveal/settle), virtual bankroll/stats/sound in `localStorage`, semantic bet grid with touch-sized controls, `aria-live` status, visible focus and `prefers-reduced-motion` support.
- **Security boundary** — local Web Crypto RNG for entertainment only; real-money/ranked/redeemable products must use server-authoritative RNG, payouts and signed results.

The page ships complete SEO/GEO (title/description/keywords/OG/Twitter/canonical/robots/sitemap), semantic/indexable bet layout, rules/payout table and FAQ, plus JSON-LD (WebSite/WebPage/VideoGame/HowTo/FAQPage/BreadcrumbList), and is linked from site navigation, `sitemap.xml` and `llms.txt`.

## Video Poker (Jacks or Better) demo

`site/videopoker.html` is a lightweight, indexable **browser video poker** page (Jacks or Better, 9/6 demo paytable) with virtual credits and Canvas-rendered cards (`assets/videopoker.js`, `assets/videopoker-demo.css`):

- **Gameplay** — deal 5 cards from a shuffled 52-card deck, hold any cards (buttons or canvas tap), draw once, evaluate hand and pay per table (Royal Flush 250× down to Jacks or Better 1×).
- **Rendering & loop** — native HTML5 Canvas 2D, DPR-aware resize (`devicePixelRatio` capped), fixed-timestep `requestAnimationFrame` loop with clamped `deltaTime` and `visibilitychange` reset.
- **State & UX** — finite-state flow (betting → deal → hold → draw → reveal/settle), virtual credits/stats/sound in `localStorage`, touch-sized controls, `aria-live` status, visible focus and `prefers-reduced-motion` support.
- **Security boundary** — local Web Crypto shuffle for entertainment only; real-money/ranked/redeemable products must use server-authoritative RNG, payouts and signed results.

The page ships complete SEO/GEO (title/description/keywords/OG/Twitter/canonical/robots/sitemap), semantic/indexable rules/paytable/FAQ, plus JSON-LD (WebSite/WebPage/VideoGame/HowTo/FAQPage/BreadcrumbList), and is linked from site navigation, `sitemap.xml` and `llms.txt`.

## Project structure

```
.
├── site/                       # source, deployable as-is if placeholders are acceptable
│   ├── index.html              # game, rules, strategy, FAQ, JSON-LD
│   ├── slots.html              # Canvas slot reel demo + SEO/GEO technical article
│   ├── baccarat.html           # Baccarat (Punto Banco) demo + SEO/GEO rules/FAQ
│   ├── sicbo.html              # Sic Bo dice demo + SEO/GEO rules/FAQ
│   ├── roulette.html           # European roulette demo + SEO/GEO rules/FAQ
│   ├── videopoker.html         # Video poker (Jacks or Better) demo + SEO/GEO
│   ├── 404.html
│   ├── assets/
│   │   ├── app.js              # game engine and render layer
│   │   ├── slot-machine.js     # Canvas slot reels, Big Win FX, DPR/deltaTime
│   │   ├── baccarat.js         # Baccarat FSM, third-card rules, Canvas render
│   │   ├── sicbo.js            # Sic Bo FSM, dice RNG, Canvas render
│   │   ├── roulette.js         # Roulette FSM, wheel render, bet settlement
│   │   ├── videopoker.js       # Video poker FSM, hand eval, Canvas render
│   │   ├── styles.css          # design system and responsive layout
│   │   ├── slot-demo.css       # standalone demo page styles
│   │   ├── baccarat-demo.css   # baccarat demo page styles
│   │   ├── sicbo-demo.css      # sic bo demo page styles
│   │   ├── roulette-demo.css   # roulette demo page styles
│   │   ├── videopoker-demo.css # video poker demo page styles
│   │   ├── favicon.svg
│   │   ├── og-cover.png
│   │   ├── icon-192.png
│   │   ├── icon-512.png
│   │   └── apple-touch-icon.png
│   ├── manifest.webmanifest
│   ├── robots.txt
│   ├── sitemap.xml
│   ├── llms.txt
│   └── _headers              # Netlify / Cloudflare Pages header rules
├── scripts/
│   ├── build.ps1             # copy, inject, validate, size report
│   ├── generate-assets.ps1   # regenerate PNG social card and icons
│   └── serve.ps1             # local static server with production headers
├── dist/                     # generated output (build artifact, safe to upload)
├── netlify.toml
├── vercel.json
└── .github/workflows/pages.yml
```

## Requirements

- Windows PowerShell 5.1 or PowerShell 7+ (the build also runs in `pwsh` on Linux CI).
- No Node.js, npm, Python or external packages.

## Build

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build.ps1
```

Optional parameters:

| Parameter | Default | Purpose |
| --- | --- | --- |
| `-SiteUrl` | `https://neonace.example` | Absolute site URL without a trailing slash. Injected into canonical, OG, Twitter, sitemap, robots and `llms.txt`. |
| `-OutDir` | `dist` | Output directory. Must not be the project root or `site/`. |
| `-BuildId` | UTC timestamp | Cache-busting token appended to CSS and JS URLs. |

Examples:

```powershell
# Production domain
powershell -ExecutionPolicy Bypass -File scripts/build.ps1 -SiteUrl https://neonace.com

# Staging preview
powershell -ExecutionPolicy Bypass -File scripts/build.ps1 -SiteUrl https://staging.neonace.com -OutDir preview
```

The build fails if any of the following are wrong:

- unresolved `__PLACEHOLDER__` tokens
- missing required files
- broken internal links or anchors
- invalid JSON-LD, manifest or sitemap
- missing required metadata
- wrong social-card or icon dimensions
- `unsafe-inline` / `unsafe-eval` in the CSP

### Placeholders

| Token | Example |
| --- | --- |
| `__SITE_URL__` | `https://neonace.com` |
| `__BUILD_DATE__` | `2026-11-15` |
| `__BUILD_DATE_PRETTY__` | `November 15, 2026` |
| `__BUILD_ID__` | `20261115123930` |

## Local preview

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/serve.ps1 -Root dist
```

Open <http://localhost:8080/>. The server sends the same security and cache headers as production, maps missing paths to `404.html`, and refuses path traversal. Stop it with `Ctrl+C`.

To preview the source rather than a build:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/serve.ps1
```

## Regenerate images

```powershell
powershell -ExecutionPolicy Bypass -File scripts/generate-assets.ps1
```

This redraws the 1200x630 social card, the 512/192 icons and the Apple touch icon using `System.Drawing`. The script is intentionally ASCII-only so Windows PowerShell 5.1 reads it correctly without a BOM.

## Deployment

The site is a pure static artifact. Always run the build with your real domain first, then upload `dist/`.

### Current production deployment

| Setting | Value |
| --- | --- |
| Platform | Cloudflare Pages (Direct Upload) |
| Project | `neon-ace` |
| Production URL | <https://neon-ace.pages.dev/> |
| Production branch | `main` |
| Build artifact | `dist/` |

Build for this origin before every upload:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build.ps1 -SiteUrl https://neon-ace.pages.dev
```

When deploying through the Direct Upload REST API rather than Wrangler, the following details are required:

- Manifest keys are root-relative, for example `/index.html` and `/assets/app.js`.
- Asset keys are BLAKE3 hashes of `base64(file bytes) + extension-without-dot`, truncated to 32 hex characters.
- `_headers` is excluded from the asset manifest and sent as a separate multipart file part on the deployment request.
- Include `branch=main` so the deployment becomes the production alias.

Production verification: all asset routes return 200, missing paths return the custom `404.html`, Brotli compression is active, the strict CSP/security headers are applied, cache-busted assets are immutable, and W3C Nu HTML validation reports 0 messages. Cloudflare automatically adds `X-Robots-Tag: noindex` to versioned deployment URLs and redirects HTTP to HTTPS.

Both production endpoints are built from the same final source. Rebuild with each platform's `-SiteUrl` (plus `-BasePath` for GitHub Pages project sites) before redeploying: Cloudflare Pages and GitHub Pages must not share a built `dist/` directory.

### Netlify

1. Set the publish directory to `dist` (already configured in `netlify.toml`).
2. Drag `dist/` into the Netlify dashboard, or connect the repository and deploy the prebuilt directory.
3. Netlify reads `dist/_headers` automatically for CSP, security headers and cache policy.
4. Add the custom domain and enable HTTPS.

Netlify does not run the PowerShell build unless you add a compatible build image. Keep `dist/` current in the repository, or build it in CI before deploy.

### Vercel

1. Import the repository.
2. Vercel uses `vercel.json`, which points at `dist/` and repeats the security headers.
3. Add the custom domain and enable HTTPS.

### Cloudflare Pages

The live site is the Direct Upload project `neon-ace` at <https://neon-ace.pages.dev/> (production branch `main`). See [Current production deployment](#current-production-deployment) for the API requirements.

1. Rebuild with `scripts/build.ps1 -SiteUrl https://neon-ace.pages.dev`.
2. Upload `dist/` as a direct-upload project, or connect the repository.
3. Set the output directory to `dist`.
4. Cloudflare Pages parses `_headers` from the output root; the file is not served as a static asset.

### GitHub Pages

The live site is the public repository `vip-4/neon-ace`, deployed by the **Deploy Neon Ace to GitHub Pages** workflow at <https://vip-4.github.io/neon-ace/>.

| Setting | Value |
| --- | --- |
| Repository | `vip-4/neon-ace` |
| Production URL | <https://vip-4.github.io/neon-ace/> |
| Pages build type | GitHub Actions |
| Workflow | `.github/workflows/pages.yml` |
| Repository variables | `SITE_URL=https://vip-4.github.io/neon-ace`, `BASE_PATH=/neon-ace` |

1. Push to `main`; the workflow builds with `pwsh`, validates, uploads `dist/` as a Pages artifact and deploys.
2. Set `SITE_URL` to the production origin without a trailing slash and `BASE_PATH` to the repository path. Use an empty `BASE_PATH` for a user/organization site served from the domain root.
3. `BASE_PATH` is injected into `<base href="...">` in `404.html`, so custom 404 pages served under a project sub-path still resolve assets correctly.

> **Project-site limits:** `robots.txt`, `sitemap.xml` and `llms.txt` live at `/neon-ace/` rather than the host root; the root-level files belong to the existing `vip-4.github.io` user site. GitHub Pages cannot send custom response headers, so `_headers` is served as a plain file there instead of being applied. Use Cloudflare Pages, Netlify, Vercel or a proxied custom domain when you need the strict CSP and security headers.

### Telegram Mini App

The game is also published as a Telegram Mini App. A dedicated endpoint is used because Telegram Web renders Mini Apps inside an `https://web.telegram.org` iframe, which the main sites' `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'` would block.

| Setting | Value |
| --- | --- |
| Mini App endpoint | <https://neon-ace-tg.pages.dev/> |
| Bot | `@VIP865bot` |
| Menu button | `Play Neon Ace` (default, applies to all users) |
| Cloudflare Pages project | `neon-ace-tg` |
| Build script | `scripts/build-telegram.ps1` -> `dist-tg/` |
| Canonical | `https://neon-ace.pages.dev/` (SEO signals stay on the main site) |

Build and deploy with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-telegram.ps1
```

Then upload `dist-tg/` to the `neon-ace-tg` Pages project with Direct Upload (see [Current production deployment](#current-production-deployment)). The variant adds:

- `https://telegram.org/js/telegram-web-app.js` (deferred) plus a same-origin, build-versioned `assets/telegram.js` bridge that calls `ready()`, `expand()` and matches Telegram's header/background colors on supported clients.
- Headers that allow framing (`frame-ancestors *`), permit the Telegram script (`script-src ... https://telegram.org`), omit `X-Frame-Options`/COOP, and send `X-Robots-Tag: noindex` so the duplicate endpoint is not indexed.
- The same HTML, CSS, game engine, JSON-LD, canonical URL, metadata and accessibility features as the main build.

The bot is configured through the Bot API: `setChatMenuButton` with a `MenuButtonWebApp` object (omit `chat_id` to set the default button for all users). **No bot token is stored in this repository**; rotate any token that has been exposed in a chat. `@VIP863Bot` and `@VIP860Bot` were left unconfigured and can be pointed at the same URL with one `setChatMenuButton` call.

> **BotFather-only features:** a Main Mini App with a profile **Launch app** button and direct links such as `https://t.me/VIP865bot?startapp` must be enabled manually with @BotFather (`/mybots > Bot Settings > Configure Mini App`, or `/newapp`). These cannot be set through the Bot API.

Open `@VIP865bot` in Telegram and tap the **Play Neon Ace** menu button.

### Firebase Hosting

**Live:** <https://neon-ace.web.app/> — a dedicated Hosting site `neon-ace` inside the existing Firebase project `boto3-firebase-1101012838`. A separate site was created so the project's default site and its other 20+ sites are untouched.

`firebase.json` configures Hosting to serve `dist/` with the same strict security headers, immutable asset caching, clean URLs and automatic `404.html` handling as the other hosts. Rebuild for this origin before deploying:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build.ps1 -SiteUrl https://neon-ace.web.app
firebase deploy --only hosting --project boto3-firebase-1101012838
```

The production deployment was done with the **Firebase Hosting REST API** (no Node/firebase-tools needed), using `-OutDir dist-firebase` so the Cloudflare artifact stays intact: `versions.create` -> `versions.populateFiles` (SHA256 of gzipped bytes) -> byte-exact upload -> `versions.patch` (`FINALIZED`) -> `releases.create`. Release `1794761220780000`, version `sites/neon-ace/versions/0f4f68611bb31adf`.

Authentication used the Google Cloud SDK 593.0.0 installed at `%LOCALAPPDATA%\GoogleCloudSDK\google-cloud-sdk`:

```powershell
gcloud auth application-default login --scopes=https://www.googleapis.com/auth/webmasters,https://www.googleapis.com/auth/cloud-platform
```

This is an interactive browser OAuth flow and must be completed by a human. ADC is stored at `%APPDATA%\gcloud\application_default_credentials.json`; the quota project was set with `gcloud auth application-default set-quota-project boto3-firebase-1101012838` and the `X-Goog-User-Project` header is required for Search Console calls.

> **Search Console:** the `webmasters` scope allowed registering `https://neon-ace.web.app/` (currently `siteUnverifiedUser`), but sitemap submission requires ownership verification. Obtaining an HTML verification token needs the separate `siteverification` scope (not granted) or a DNS TXT record. Add `<meta name="google-site-verification" content="...">` to `site/index.html`, rebuild, redeploy and verify in Search Console, then submit `https://neon-ace.web.app/sitemap.xml`.

### Flutter Web + Firebase AI Logic

**Live:** <https://neon-ace-flutter.web.app/> — a standalone Flutter Web project (`flutter_app/`) deployed to its own Hosting site `neon-ace-flutter` in the existing Firebase project. It does not touch any other site in that project.

Built with **Flutter SDK 3.50.0 / Dart 3.14.0** (installed at `%LOCALAPPDATA%\FlutterSDK\flutter`):

```powershell
cd flutter_app
flutter pub get
flutter build web --release --no-web-resources-cdn
```

`--no-web-resources-cdn` keeps CanvasKit/WASM on the same origin, which is required for the CSP and avoids a third-party runtime dependency. Deployment again used the Firebase Hosting REST API from `build/web/`; release `1794764043946000`, version `sites/neon-ace-flutter/versions/1481d819a78d19f1`.

The app is a small playable blackjack game with an optional **"Ask Firebase AI for a rule refresher"** button built with `firebase_ai` (`FirebaseAI.googleAI().generativeModel(...)`), initialized with the Firebase Web app `neon-ai-flutter`. `lib/firebase_options.dart` holds Firebase Web client identifiers, which are public by design but should still be restricted to the project's domains in the Firebase console.

> **Firebase AI Logic requires billing on the GCP project.** The `generativelanguage` / `firebasevertexai` APIs are enabled, but calls return `403 This API method requires billing to be enabled` until a billing account is attached. The in-app AI button therefore degrades gracefully to a built-in rules hint; the game is fully playable without it.

SEO / GEO for a client-rendered app: `flutter_app/web/index.html` carries complete meta tags (title, description, keywords, canonical, 11 Open Graph and 6 Twitter Card tags), a JSON-LD graph, and a semantic `<noscript>` fallback so raw-HTML crawlers and generative answer engines can still index and cite the page. `robots.txt`, `sitemap.xml`, `llms.txt`, `manifest.json` and a custom `404.html` are deployed alongside. Flutter Web is client-rendered, so the **canonical, fully indexable** edition with the complete rules, basic-strategy guide and FAQ remains the static site at <https://neon-ace.web.app/>.

CSP note: FlutterFire Web injects a runtime inline bootstrap script, so this one site allows `'unsafe-inline'` and `'wasm-unsafe-eval'` in `script-src` (plus `www.gstatic.com`). The four static/Telegram endpoints keep their stricter, non-embeddable CSP.

### Source mirrors

The full source — `site/`, `scripts/`, `flutter_app/`, hosting configs and the CI workflow — is mirrored to three public repositories:

| Platform | Repository |
| --- | --- |
| GitHub | <https://github.com/vip-4/neon-ace> |
| Gitee | <https://gitee.com/vip882/neon-ace> |
| AtomGit | <https://atomgit.com/zzw1208/neon-ace> |

All three contain the same source files. Generated artifacts (`dist/`, `dist-github/`, `dist-tg/`) are excluded; regenerate them with `scripts/build.ps1` or `scripts/build-telegram.ps1` before deploying. Static production hosting is provided by Cloudflare Pages, GitHub Pages and the Telegram Mini App endpoint described above — Gitee and AtomGit are source mirrors only.

### Any static host

Upload the contents of `dist/` to the web root. Serve `index.html` at `/`, use `404.html` for missing paths, and enable gzip or Brotli. If the host does not read `_headers`, translate the rules in that file into the host's header configuration.

## SEO and GEO checklist

- One canonical URL, one `h1`, semantic landmarks and indexable rules/strategy/FAQ copy.
- Open Graph and Twitter Card metadata with a 1200x630 image.
- `robots.txt` explicitly allows major search and AI crawlers and points to the sitemap.
- `sitemap.xml` includes the page and social image.
- `llms.txt` provides a compact, citation-friendly summary, quick facts, FAQ, sources and citation line.
- JSON-LD `@graph` covers the organization, site, page, game, how-to steps, FAQ and breadcrumb.
- `speakable` selectors identify the quick answer and FAQ for voice/answer engines.

After deploying, verify with:

- Google Rich Results Test
- Schema Markup Validator
- Facebook Sharing Debugger and X Card Validator
- `https://neon-ace.pages.dev/robots.txt` and `https://vip-4.github.io/neon-ace/robots.txt`, plus `/sitemap.xml` and `/llms.txt` on each (or the equivalents on your own domain)
- Lighthouse SEO, Accessibility and Best Practices

## Headers and privacy

- CSP: `default-src 'self'`, no inline scripts, no inline styles, no third-party origins.
- `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and `Cross-Origin-Opener-Policy`.
- `assets/*` is cached for one year and is safe because URLs carry `?v=__BUILD_ID__`.
- HTML is revalidated on every request.
- The game sets no cookies, makes no network requests after load, and stores only bankroll, bet, sound and stats in `localStorage`.
- GitHub Pages serves `_headers` as a plain file rather than applying it. That deployment relies on the same-origin-only, no-inline-script design and `<meta name="referrer">` instead of response headers.
- The Telegram Mini App endpoint is the deliberate exception: it allows framing, loads `telegram.org/js/telegram-web-app.js` and is `noindex`. The two public web endpoints keep their strict, non-embeddable headers.

## Accessibility

Target: WCAG 2.2 AA. Implemented:

- keyboard shortcuts and a focusable table group
- native buttons, radios and dialog
- visible `:focus-visible` rings
- screen-reader labels on every card and score
- polite live-region announcements for each action and result
- reduced-motion handling in both CSS and the dealer animation delays
- touch-sized controls, responsive layout and no time limits
- no flashing content

## Manual test notes

The game has been exercised in Chromium at 390, 768, 1024, 1280, 1440 and 1936 CSS pixels, covering:

- deal, hit, stand, double, split, resplit and four-hand layouts
- split aces (one card each, 1:1 payout)
- double after split
- natural blackjack at 3:2, dealer natural and both-natural push
- dealer draw and bust, settlement and bankroll/stat persistence
- out-of-chips state and reset confirmation
- sound toggle, keyboard shortcuts and reduced motion
- no horizontal overflow at any tested width

## License

MIT. See [LICENSE](LICENSE).

The game is an original implementation. Reference projects used during concept screening, including `ChrisZieba/blackjack` (MIT), are credited on the page and in `llms.txt`; no third-party code or assets are bundled.

## Disclaimer

Neon Ace is a free entertainment and practice game. Chips are virtual, have no cash value and cannot be deposited or withdrawn. It is not a gambling service and does not accept payments. If gambling is affecting your life, support is available at [BeGambleAware.org](https://www.begambleaware.org/).
