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

Both custom domains are declared in the `routes` block of `wrangler.jsonc`; deploying attaches them (and Cloudflare creates the DNS records) automatically.

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

Note: `wrangler dev` ignores the incoming `Host` header and simulates the first domain in `routes` — use `--host` to test the subdomain. Changes to `wrangler.jsonc` or `.assetsignore` require a dev-server restart.

## Deploying

The repo is git-integrated with Cloudflare: **pushing `main` deploys to production.**
