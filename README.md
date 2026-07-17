# Vawsome

Two sites, one repo, one Cloudflare Worker:

| Site | Content | Served from |
|---|---|---|
| [vawsome.com](https://vawsome.com) | Company page — services, process, track record ("we" voice) | repo root |
| [vinay.vawsome.com](https://vinay.vawsome.com) | Founder page — Who Am I, career log, skills, résumé ("I" voice) | `vinay/` |

## How it works

A single Worker (`worker.js`) fronts all requests (`run_worker_first: true` in `wrangler.jsonc`) and routes by hostname:

- **`vinay.vawsome.com`** → the request path is prefixed with `/vinay` and served from static assets, so `vinay.vawsome.com/resume` serves `vinay/resume.html`. The worker also rewrites the assets router's redirect `Location` headers to strip the internal `/vinay` prefix, keeping the subdomain's public URL space clean.
- **`vawsome.com`** → served straight from root assets. Requests to `vawsome.com/vinay/*` are 301-redirected to the subdomain, so the personal site has exactly one public address.

Custom domains (`vawsome.com`, `www.vawsome.com`, `vinay.vawsome.com`) are attached to the Worker in the Cloudflare dashboard (Worker → Settings → Domains &amp; Routes) — deliberately **not** in `wrangler.jsonc`, because a `routes` block makes every deploy re-reconcile domain attachments and can detach a live domain.

`.assetsignore` keeps `worker.js`, `wrangler.jsonc`, and `scripts/` out of the published assets.

## Repo layout

```
index.html              company page (vawsome.com)
Vinay_Nair_Resume.pdf   résumé PDF (kept at root so legacy links keep working)
worker.js               host-routing Worker
wrangler.jsonc          Worker config: assets, run_worker_first, custom domains
.assetsignore           files excluded from published assets
vinay/
  index.html            personal page (vinay.vawsome.com)
  resume.html           résumé SOURCE OF TRUTH (print-optimized A4 HTML)
  Vinay_Nair_Resume.pdf résumé PDF served on the subdomain
scripts/
  build-resume.sh       regenerates both PDFs from vinay/resume.html
```

## Editing the résumé

`vinay/resume.html` is the single source of truth — never edit the PDFs directly.

1. Edit `vinay/resume.html` (keep facts in sync with the career log in `vinay/index.html`).
2. Rebuild both PDF copies (renders via headless Chrome, macOS path):

   ```sh
   ./scripts/build-resume.sh
   ```

3. Check the output is still exactly **2 pages** before committing.

## Local development

```sh
npx wrangler dev                            # simulates vawsome.com
npx wrangler dev --host vinay.vawsome.com   # simulates the subdomain
```

Note: `wrangler dev` ignores the incoming `Host` header on plain requests and defaults to the company site — use `--host vinay.vawsome.com` to simulate the subdomain. Changes to `wrangler.jsonc` or `.assetsignore` require a dev-server restart.

## Contact form

The form on `vawsome.com` posts to `/api/contact`, handled in `worker.js`, which sends the message via Cloudflare **Email Routing** (the `send_email` binding in `wrangler.jsonc`) straight to risingvinay@gmail.com — no third-party API, no key to manage. The email's `Reply-To` is set to the visitor's address, so replying goes directly to them. A hidden honeypot field (`website`) silently no-ops on bot submissions instead of sending them.

**One-time setup required in the Cloudflare dashboard** before this works (the code is already deployed and will 502 with a mailto fallback until this is done):

1. **Email → Email Routing** on the `vawsome.com` zone → **Enable**. This replaces the current null MX record with Cloudflare's routing MX/TXT records — nothing else uses email on this domain today, so there's no conflict.
2. Add `risingvinay@gmail.com` as a **destination address** and click the verification link Cloudflare emails to it. The `send_email` binding can only deliver to a verified destination.
3. No routing rule is needed — the Worker sends directly via the binding, not through a forwarding rule. The `From:` address (`contact@vawsome.com`) doesn't need to be a real mailbox; Cloudflare signs it because the zone has Email Routing enabled.

The binding can't be exercised in local `wrangler dev` until step 1–2 are done live — locally it will always hit the graceful-failure path.

## Deploying

The repo is git-integrated with Cloudflare: **pushing `main` deploys to production.**
