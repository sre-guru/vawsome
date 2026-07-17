// Host-based routing: one Worker serves both sites.
//   vawsome.com        -> assets at repo root (company page)
//   vinay.vawsome.com  -> assets under /vinay (personal page)
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = (request.headers.get("host") || url.hostname).toLowerCase();

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
