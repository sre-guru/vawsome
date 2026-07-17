# Vawsome

Two sites, one repo, one Cloudflare Worker.

| Site | Content | Voice | Served from |
|---|---|---|---|
| [vawsome.com](https://vawsome.com) | Company page — services, process, track record, a short founder teaser | "we" | repo root |
| [vinay.vawsome.com](https://vinay.vawsome.com) | Founder page — Who Am I, achievements, skills, full career log, résumé | "I" | `vinay/` |

Company copy never says "I"/"my"; personal copy never says "we" about itself. Anything biographical or career-history belongs on `vinay.vawsome.com` only — the company page should read as a team, not a solo act, even though one Worker and one person runs the whole thing.

## Architecture

### One Worker, host-based routing

`worker.js` fronts every request (`run_worker_first: true` in `wrangler.jsonc`) and branches on the `Host` header:

- **`vawsome.com`** (and `www`) → served straight from root static assets.
- **`vinay.vawsome.com`** → the request path is internally prefixed with `/vinay` and served from the same asset bundle, so `vinay.vawsome.com/resume` transparently serves `vinay/resume.html`. The Worker also rewrites the assets router's redirect `Location` headers to strip that internal `/vinay` prefix, so the subdomain's public URL space stays clean (no visitor ever sees `/vinay/...` in a URL).
- **`vawsome.com/vinay/*`** → 301-redirected to the equivalent path on `vinay.vawsome.com`, so the personal site has exactly one canonical public address.
- **`POST /api/contact`** (any host) → handled by the Worker directly (see [Contact form](#contact-form) below), not passed to static assets.

`.assetsignore` keeps `worker.js`, `wrangler.jsonc`, `scripts/`, and `.wrangler/` out of the published assets — none of that should ever be web-reachable.

### Repo layout

```
index.html              company page (vawsome.com)
Vinay_Nair_Resume.pdf   résumé PDF, kept at root so legacy links keep working
worker.js               host-routing Worker + contact-form handler
wrangler.jsonc          Worker config: assets binding, run_worker_first, send_email binding
.assetsignore           files excluded from published static assets
.gitignore              local-only files (.wrangler/ dev cache, .DS_Store)
vinay/
  index.html            personal page (vinay.vawsome.com)
  resume.html           résumé SOURCE OF TRUTH — print-optimized A4 HTML
  Vinay_Nair_Resume.pdf  résumé PDF served on the subdomain
scripts/
  build-resume.sh       regenerates both PDF copies from vinay/resume.html
```

## Domains & DNS

**Custom Domains, not Routes.** Every hostname this Worker answers for (`vawsome.com`, `www.vawsome.com`, `vinay.vawsome.com`) should be attached as a Cloudflare **Custom Domain** (Workers & Pages → vawsome → **Domains & Routes** → **Add Domain**), never as a **Route**. A Custom Domain creates and fully owns a special DNS record (shows as type **Worker** in DNS → Records) with no origin server behind it — 100% of traffic for that host goes to the Worker, full stop. A Route instead attaches to *whatever DNS record already exists* for that pattern, and if the pattern doesn't match cleanly (see incident below) or the underlying record still points somewhere else, traffic can silently fall through to a real origin instead of your Worker.

Domain attachments are managed **only in the dashboard**, deliberately **not** in `wrangler.jsonc`. Do not add a `routes` block to this repo's Worker config — see the incident below for why.

### Incident, 2026-07-17: the apex outage, and why

**Symptom:** `vawsome.com` intermittently served a plain `404 Not Found — nginx/1.18.0 (Ubuntu)` page — not a Cloudflare error page, not this Worker's own asset-404, a real nginx origin's default error page. `www.vawsome.com` and `vinay.vawsome.com` worked fine throughout.

**Root cause:** the zone had a leftover plain **A record** for the bare apex (`46.30.211.38`, proxied) pointing at a real nginx server from however the site was originally stood up, with a Workers **Route** (pattern `vawsome.com`, no wildcard) layered on top trying to intercept requests before they reached that origin. The exact-match Route pattern silently failed to match real requests, so traffic fell straight through Cloudflare's proxy to the live nginx origin — which had nothing configured for that host, hence the generic nginx 404. `www` was unaffected because it matched a *separate* wildcard Route (`*.vawsome.com/*`). `vinay.vawsome.com` was unaffected because it had been set up as a Custom Domain from the start — no origin fallback was even possible.

**Fix:** delete the apex A record entirely, delete the broken Route, add `vawsome.com` as a Custom Domain instead. This converts its DNS record to the same Worker-owned type `vinay.vawsome.com` already had, and there's no longer any real origin server to fall through to.

**Two things worth remembering:**
1. **When debugging "it works for me / it doesn't for you," verify with a real browser navigation, not `curl` alone.** During this incident, `curl` and a real browser eventually agreed (both saw the nginx 404), but there was real confusion in between about whether it was a testing artifact — a fresh browser navigation was what actually settled it. Don't trust a single test method, and don't trust a cached page either (hard-refresh / cache-bust with a throwaway query string).
2. **Sequence domain migrations as add-new → confirm-working → remove-old, never remove-then-add.** Mid-fix, deleting the broken Route *before* the new Custom Domain was confirmed working caused a real, if brief, total outage on the apex (no Route and no Custom Domain = nothing intercepting at all).

If you ever need to attach a *new* hostname to this Worker, use Add Domain (Custom Domain), and if you're moving an *existing* hostname off a Route and onto a Custom Domain, add the Custom Domain and confirm it serves the site correctly before touching the old Route or any A/CNAME record underneath it.

## Contact form

The form on `vawsome.com` posts to `/api/contact` (handled in `worker.js`), which sends the message via Cloudflare **Email Routing** — the `send_email` binding declared in `wrangler.jsonc` — straight to `risingvinay@gmail.com`. No third-party email API, no API key to manage or rotate. The email's `Reply-To` is set to the visitor's address, so hitting reply in your inbox goes directly to them, not back through the form. A hidden honeypot field (`website`) silently no-ops on bot submissions — filled in, it returns a fake success without sending anything.

Confirmed working end-to-end 2026-07-17: a real `POST` to `https://vawsome.com/api/contact` returned `{"ok":true}` and delivered.

### One-time dashboard setup (already completed, documented for future reference / re-setup)

1. **Email → Email Routing** on the `vawsome.com` zone → **Enable**. This adds Cloudflare's three MX records (`routeN.mx.cloudflare.net`, priorities 37/45/69) to the zone.
   - **Gotcha hit during setup:** activation failed with *"Existing non-Cloudflare MX records conflict."* The zone had a `0 .` MX record — an [RFC 7505 "null MX"](https://www.rfc-editor.org/rfc/rfc7505) explicitly declaring "this domain accepts no mail," which reads as "nothing configured" to a human but still counts as a conflicting MX record to Cloudflare's wizard. Fix: delete that null-MX record under DNS → Records first, then retry.
2. Add `risingvinay@gmail.com` as a **destination address** (Email → Email Routing → Destination addresses) and click the verification link Cloudflare emails to it. The `send_email` binding can only deliver to a verified destination — sends to an unverified one fail.
3. No routing/forwarding rule is needed — the Worker sends directly via the binding API, it doesn't route through a forwarding rule. The `From:` address (`contact@vawsome.com`) doesn't need to be a real mailbox; Cloudflare DKIM-signs it because Email Routing is enabled on this zone.

### Testing

The `send_email` binding **cannot be exercised in local `wrangler dev`** — it always hits the graceful-failure path locally (a real `SEND_EMAIL.send()` call needs live Email Routing + a verified destination), which is expected and fine. What local dev *can* verify:

```sh
# Empty/invalid fields -> 400
curl -s -X POST http://localhost:8787/api/contact -H 'Content-Type: application/json' -d '{}'

# Honeypot filled -> fake 200 success, nothing sent
curl -s -X POST http://localhost:8787/api/contact -H 'Content-Type: application/json' \
  -d '{"name":"Bot","email":"bot@spam.com","message":"x","website":"http://spam.com"}'

# Valid payload, binding not live locally -> graceful 502 with mailto fallback message
curl -s -X POST http://localhost:8787/api/contact -H 'Content-Type: application/json' \
  -d '{"name":"Test","email":"test@example.com","message":"hello"}'
```

To test a real send, hit it on the live domain instead:

```sh
curl -s -X POST https://vawsome.com/api/contact -H 'Content-Type: application/json' \
  -d '{"name":"Test","email":"you@example.com","message":"end-to-end check"}'
# {"ok":true} means it was actually handed to Cloudflare for delivery
```

## Editing the résumé

`vinay/resume.html` is the single source of truth — **never edit either PDF directly**, they're build artifacts.

1. Edit `vinay/resume.html`. Keep facts in sync with the career log in `vinay/index.html` — if one changes (a new role, a reworded achievement), check whether the other needs the same edit.
2. Rebuild both PDF copies (renders via headless Chrome; macOS path is hardcoded in the script):

   ```sh
   ./scripts/build-resume.sh
   ```

   This overwrites `Vinay_Nair_Resume.pdf` at the repo root *and* `vinay/Vinay_Nair_Resume.pdf` from the same source, so both served copies (legacy root link and the subdomain) always match.
3. Check the output is still exactly **2 pages** before committing — if it spilled to 3, tighten bullets or the print CSS rather than shipping a longer résumé.

There's also a `rebuild-resume` Claude Code skill (`.claude/skills/rebuild-resume/` at the parent `Desktop/git` level) that automates this whole flow on request.

## Local development

```sh
npx wrangler dev                            # simulates vawsome.com
npx wrangler dev --host vinay.vawsome.com   # simulates the subdomain
```

- `wrangler dev` **ignores the incoming `Host` header** on plain requests and defaults to the company site — you must pass `--host vinay.vawsome.com` explicitly to simulate the subdomain; sending a `Host:` header via curl to a plain `wrangler dev` instance does *not* work the way it does in production.
- Changes to `wrangler.jsonc` or `.assetsignore` require a dev-server restart to take effect.
- Local `wrangler` is **not authenticated** (`wrangler login` has never been run in this environment) — `wrangler dev` and asset serving work fine unauthenticated, but anything requiring the Cloudflare API (deploying manually, listing zones, inspecting live bindings) needs `wrangler login` first, or must be done from the dashboard instead.

## Deploying

The repo is git-integrated with Cloudflare Workers Builds: **pushing to `main` deploys to production automatically.** There is no separate staging step — treat every push to `main` as a live publish.

Build status can be checked per-commit via the public GitHub commit-status API:

```sh
curl -s "https://api.github.com/repos/sre-guru/vawsome/commits/<sha>/status"
```

This has been observed to stay stuck on `"pending"` indefinitely for commits where Cloudflare's build/deploy actually completed fine — treat it as informative, not authoritative. If in doubt, verify the live site directly with a real browser navigation (see the incident note above for why that matters more than it sounds).
