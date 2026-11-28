export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";
  const url = new URL(context.request.url);

  // Skip non-HTML assets and avoid duplicating on /athol/ itself
  if (!contentType.includes("text/html") || url.pathname.startsWith("/athol")) {
    return response;
  }

  const banner = `
  <div id="athol-global-promo" style="background:linear-gradient(90deg,#090d16,#131b2e,#090d16);border-bottom:2px solid #00f5d4;color:#f8fafc;padding:12px 16px;text-align:center;font-family:system-ui,sans-serif;font-size:14px;position:relative;z-index:9999;">
    <strong style="color:#ffcd4b;">🎬 @thol — Crypto Thriller Film:</strong>
    <span>Help fund the AI feature &amp; pitch to Hollywood!</span>
    <a href="/athol/" style="display:inline-block;margin:4px 6px;padding:5px 12px;background:#00f5d4;color:#04060b;font-weight:800;border-radius:6px;text-decoration:none;">Watch &amp; Read Story</a>
    <a href="https://youtube.com" target="_blank" rel="noopener" style="display:inline-block;margin:4px 6px;padding:5px 12px;background:#dc2626;color:#fff;font-weight:700;border-radius:6px;text-decoration:none;">YouTube Film</a>
    <a href="https://t.me" target="_blank" rel="noopener" style="display:inline-block;margin:4px 6px;padding:5px 12px;background:#0284c7;color:#fff;font-weight:700;border-radius:6px;text-decoration:none;">Live Stream</a>
    <a href="https://paypal.me" target="_blank" rel="noopener" style="display:inline-block;margin:4px 6px;padding:5px 12px;background:#0070ba;color:#fff;font-weight:800;border-radius:6px;text-decoration:none;">Back via PayPal</a>
  </div>`;

  return new HTMLRewriter()
    .on("body", {
      element(el) {
        el.prepend(banner, { html: true });
      }
    })
    .transform(response);
}
