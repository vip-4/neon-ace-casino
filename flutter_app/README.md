# Neon Ace — Flutter Web edition

A standalone Flutter Web project that demonstrates **Firebase AI Logic** (`firebase_ai`) alongside a small playable blackjack game. It is deployed independently from the main static Neon Ace site.

Live: https://neon-ace-flutter.web.app/ · Firebase project: `boto3-firebase-1101012838` · Hosting site: `neon-ace-flutter`

## Structure

- `lib/main.dart` — blackjack game UI + optional Gemini rules refresher via `FirebaseAI.googleAI().generativeModel(...)`.
- `lib/firebase_options.dart` — generated from the Firebase Web app `neon-ai-flutter` config (public client identifiers).
- `web/index.html` — full meta tags, canonical, Open Graph, Twitter Card, JSON-LD graph, and a semantic `<noscript>` fallback for crawlers and AI readers.
- `web/robots.txt`, `sitemap.xml`, `llms.txt`, `404.html`, `manifest.json` — crawler/GEO and PWA surfaces.
- `firebase.json` — Hosting config with a Flutter-friendly CSP (WASM, inline styles, Firebase AI endpoints).

## Build and deploy

Flutter SDK 3.50.0 is installed at `%LOCALAPPDATA%\FlutterSDK\flutter`.

```powershell
flutter pub get
flutter build web --release
firebase deploy --only hosting --project boto3-firebase-1101012838
```

In this environment the deployment was done with the Firebase Hosting REST API from `build/web/` (no Node/firebase-tools required): `versions.create` -> `versions.populateFiles` (SHA256 of gzipped bytes) -> byte-exact upload -> `versions.patch` FINALIZED -> `releases.create`.

## SEO / GEO caveat

Flutter Web is client-rendered: the interactive game is not readable from raw HTML. This project therefore keeps complete metadata, structured data and a semantic HTML fallback in `web/index.html`, plus `robots.txt`, `sitemap.xml` and `llms.txt`. The **canonical, fully indexable** edition with the complete rules, basic-strategy guide and FAQ remains the static site at https://neon-ace.web.app/.
