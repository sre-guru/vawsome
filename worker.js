import { EmailMessage } from "cloudflare:email";

// Host-based routing: one Worker serves both sites.
//   vawsome.com        -> assets at repo root (company page)
//   vinay.vawsome.com  -> assets under /vinay (personal page)
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = (request.headers.get("host") || url.hostname).toLowerCase();

    if (url.pathname === "/api/contact" && request.method === "POST") {
      return handleContact(request, env);
    }

    if (host === "vinay.vawsome.com" || host.startsWith("vinay.")) {
      const rewritten = new URL(url);
      rewritten.pathname = "/vinay" + url.pathname;
      const resp = await env.ASSETS.fetch(new Request(rewritten, request));

      // The assets router redirects with the internal /vinay prefix
      // (e.g. /vinay/resume.html -> /vinay/resume); strip it so the
      // public URL space of the subdomain stays clean.
      const loc = resp.headers.get("location");
      if (loc) {
        const target = new URL(loc, url);
        if (target.pathname === "/vinay" || target.pathname.startsWith("/vinay/")) {
          const headers = new Headers(resp.headers);
          headers.set(
            "location",
            target.pathname.replace(/^\/vinay\/?/, "/") + target.search
          );
          return new Response(resp.body, {
            status: resp.status,
            statusText: resp.statusText,
            headers,
          });
        }
      }
      return resp;
    }

    // The personal site lives only on the subdomain — redirect direct /vinay hits.
    if (url.pathname === "/vinay" || url.pathname.startsWith("/vinay/")) {
      const target = new URL(url);
      target.hostname = "vinay.vawsome.com";
      target.pathname = url.pathname.replace(/^\/vinay\/?/, "/");
      return Response.redirect(target.toString(), 301);
    }

    return env.ASSETS.fetch(request);
  },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function handleContact(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Malformed request." }, 400);
  }

  const name = String(body.name || "").trim().slice(0, 200);
  const email = String(body.email || "").trim().slice(0, 200);
  const message = String(body.message || "").trim().slice(0, 5000);
  const honeypot = String(body.website || "").trim();

  // Bots fill every field, including this hidden one — pretend success
  // and drop the message rather than tipping them off.
  if (honeypot) {
    return json({ ok: true });
  }

  if (!name || !email || !message || !EMAIL_RE.test(email)) {
    return json({ ok: false, error: "Please fill in a valid name, email, and message." }, 400);
  }

  const subject = `Vawsome inquiry from ${name}`;
  const raw = [
    `From: Vawsome Contact Form <contact@vawsome.com>`,
    `To: risingvinay@gmail.com`,
    `Reply-To: ${email}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    ``,
    `${message}`,
    ``,
    `— ${name} (${email})`,
  ].join("\r\n");

  try {
    const msg = new EmailMessage("contact@vawsome.com", "risingvinay@gmail.com", raw);
    await env.SEND_EMAIL.send(msg);
  } catch (err) {
    return json({ ok: false, error: "Couldn't send right now — email risingvinay@gmail.com directly instead." }, 502);
  }

  return json({ ok: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
