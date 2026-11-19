(function () {
  const LINKS = [
    { href: "/", label: "🏠 Home & Overview" },
    { href: "/market/", label: "🛒 MoBay Local Market" },
    { href: "/calculator.html", label: "💱 Global Fee Calculator" },
    { href: "/customer-service/", label: "🎧 Telemarketing & Jobs" },
    { href: "/tools/", label: "🧰 Crypto & Dev Tools" },
    { href: "/music/", label: "🎵 Koreruss Music" },
    { href: "/about/", label: "ℹ️ About KorerussBiz" }
  ];
  const css = `
    body{margin:0;background:#0b0e14;color:#f3f4f6;font-family:system-ui,-apple-system,sans-serif;display:flex;min-height:100vh}
    #kb-side{width:240px;background:#11151f;border-right:1px solid #262c3a;padding:1.25rem 1rem;flex-shrink:0;display:flex;flex-direction:column;justify-content:space-between}
    #kb-side a{display:block;color:#cbd5e1;text-decoration:none;padding:.6rem .75rem;border-radius:8px;margin-bottom:.3rem;font-size:.92rem;font-weight:600}
    #kb-side a:hover,#kb-side a.active{background:#1e293b;color:#34d399}
    #kb-main{flex:1;padding:1.5rem;max-width:960px;overflow-x:hidden}
    #kb-toggle{display:none;position:fixed;top:.75rem;right:.75rem;z-index:99;background:#2563eb;color:#fff;border:0;padding:.5rem .8rem;border-radius:8px;font-weight:700}
    @media(max-width:768px){
      #kb-side{position:fixed;left:-260px;top:0;bottom:0;z-index:98;transition:left .2s}
      #kb-side.open{left:0}
      #kb-toggle{display:block}
      #kb-main{padding:3.2rem 1rem 1.5rem}
    }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const btn = document.createElement("button");
  btn.id = "kb-toggle";
  btn.textContent = "☰ Menu";
  btn.onclick = () => document.getElementById("kb-side").classList.toggle("open");
  document.body.prepend(btn);

  const nav = document.createElement("aside");
  nav.id = "kb-side";
  const cur = location.pathname;
  nav.innerHTML = `
    <div>
      <div style="font-size:1.15rem;font-weight:800;color:#fff;margin-bottom:1rem;padding:0 .5rem">KorerussBiz</div>
      ${LINKS.map(l => `<a href="${l.href}" class="${cur === l.href ? 'active' : ''}">${l.label}</a>`).join("")}
    </div>
    <div style="font-size:.78rem;color:#9ca3af;padding:.5rem;border-top:1px solid #262c3a">
      <div>Montego Bay, Jamaica</div>
      <a href="https://paypal.me" target="_blank" style="color:#fbbf24;padding:0;margin-top:.4rem">PayPal.Me Support →</a>
    </div>
  `;
  document.body.prepend(nav);
})();
