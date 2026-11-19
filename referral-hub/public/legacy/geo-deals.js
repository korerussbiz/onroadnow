(function () {
  const SOVRN_KEY = "d59119770da93c1f534d4d47b5dbe708";
  const ADSTERRA_LINKS = [
    "https://profitableratecpmnetwork.com",
    "https://profitableratecpmnetwork.com",
    "https://profitableratecpmnetwork.com"
  ];
  const PAYPAL_FEATURED = "https://paypal.me";
  const EVM_TIP = "0xc2a49710d26e023f129c429f6494f2db04809464";

  function vig(url) {
    return `https://viglink.com{SOVRN_KEY}&u=${encodeURIComponent(url)}`;
  }

  const REGIONAL_CATALOG = {
    JM: {
      label: "Montego Bay & Jamaica Local Deals",
      currency: "JMD",
      items: [
        { title: "MoBay Wholesale Produce & Tomato Deals", desc: "Daily low-price vegetables, ground provisions & market bundles in Montego Bay.", price: "From J$350/lb", url: "/market/" },
        { title: "AliExpress Global-to-Jamaica Budget Finds", desc: "Low-cost electronics, phone accessories & household items shipped to Jamaica.", price: "Up to 70% Off", url: "https://sovrn.co" },
        { title: "Temu Top Weekly Bargains", desc: "Flash deals on kitchenware, gadgets & everyday essentials.", price: "Under $10 USD", url: "https://sovrn.co" }
      ]
    },
    US: {
      label: "United States Food & Retail Deals",
      currency: "USD",
      items: [
        { title: "Walmart Everyday Grocery & Rollback Deals", desc: "Discounted pantry staples, appliances & bulk household packs.", price: "Save up to 40%", url: vig("https://walmart.com") },
        { title: "Amazon Daily Lightning Food & Tech Deals", desc: "Top-rated kitchen appliances, snacks & electronics with fast Prime shipping.", price: "Today's Deals", url: "https://sovrn.co" },
        { title: "Bruges Belgian Waffles 6-Pack", desc: "Authentic hand-made Liege waffles shipped fresh nationwide.", price: "$32.99", url: vig("https://brugeswaffles.com") }
      ]
    },
    GB: {
      label: "United Kingdom Food & Shopping Deals",
      currency: "GBP",
      items: [
        { title: "Amazon UK Daily Grocery & Home Bargains", desc: "Discounted pantry bundles, coffee, snacks & smart home gear.", price: "Up to 50% Off", url: vig("https://amazon.co.uk") },
        { title: "eBay UK Refurbished & Clearance Deals", desc: "Top-rated tech, homeware & bulk bargains across the UK.", price: "Clearance Prices", url: "https://sovrn.co" },
        { title: "AliExpress UK Flash Deals", desc: "Factory-direct gadgets & accessories with fast UK delivery.", price: "From £1.99", url: "https://sovrn.co" }
      ]
    },
    DEFAULT: {
      label: "Worldwide Food, Wholesale & Tech Deals",
      currency: "USD",
      items: [
        { title: "Temu Worldwide Flash Bargains", desc: "Budget home, kitchen & everyday essentials shipped globally.", price: "Up to 80% Off", url: "https://sovrn.co" },
        { title: "AliExpress Global Wholesale & Retail Deals", desc: "Direct manufacturer discounts on electronics, tools & fashion.", price: "Global Shipping", url: "https://sovrn.co" },
        { title: "Alibaba Bulk Food & Product Sourcing", desc: "Wholesale pricing for local resellers and small businesses worldwide.", price: "Factory Direct", url: "https://sovrn.co" }
      ]
    }
  };

  function renderDeals(city, countryCode, countryName) {
    const box = document.getElementById("geo-deals-container");
    if (!box) return;
    const pack = REGIONAL_CATALOG[countryCode] || REGIONAL_CATALOG.DEFAULT;
    const locTitle = city ? `${city}, ${countryName}` : (countryName || "Your Area");
    const adUrl = ADSTERRA_LINKS[Math.floor(Math.random() * ADSTERRA_LINKS.length)];

    let html = `
      <div style="background:#151922;border:1px solid #2a3142;border-radius:12px;padding:1.25rem;margin:1rem 0;font-family:system-ui,sans-serif;color:#f3f4f6">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;margin-bottom:.75rem">
          <div>
            <span style="font-size:.8rem;color:#34d399;font-weight:700;text-transform:uppercase">📍 Live Deals Near ${locTitle}</span>
            <h2 style="margin:.2rem 0 0;font-size:1.25rem">${pack.label}</h2>
          </div>
          <a href="${adUrl}" target="_blank" rel="noopener" style="background:#f59e0b;color:#111;padding:.45rem .85rem;border-radius:8px;font-weight:700;text-decoration:none;font-size:.85rem">🔥 Sponsored Offer</a>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.75rem">
    `;

    for (const item of pack.items) {
      html += `
        <div style="background:#0f1117;border:1px solid #262c3a;border-radius:10px;padding:1rem;display:flex;flex-direction:column;justify-content:space-between">
          <div>
            <div style="font-weight:700;font-size:1rem;margin-bottom:.35rem">${item.title}</div>
            <p style="font-size:.85rem;color:#9ca3af;margin:0 0 .65rem">${item.desc}</p>
          </div>
          <div>
            <div style="color:#34d399;font-weight:700;font-size:.9rem;margin-bottom:.5rem">${item.price}</div>
            <a href="${item.url}" target="_blank" rel="noopener" style="display:block;text-align:center;background:#2563eb;color:#fff;padding:.55rem;border-radius:8px;text-decoration:none;font-weight:600;font-size:.88rem">Claim Deal →</a>
          </div>
        </div>
      `;
    }

    html += `
        </div>
        <div style="margin-top:1rem;padding-top:.85rem;border-top:1px solid #262c3a;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:.5rem;font-size:.85rem;color:#9ca3af">
          <span>Sell food or items in <strong>${locTitle}</strong>? <a href="https://wa.me{encodeURIComponent("Hi KorerussBiz, I want to list a deal in " + locTitle)}" target="_blank" style="color:#60a5fa">Post Free on WhatsApp</a> or <a href="${PAYPAL_FEATURED}" target="_blank" style="color:#34d399">Feature Top Spot ($5 PayPal)</a></span>
          <span>Crypto Tip: <code>${EVM_TIP}</code></span>
        </div>
      </div>
    `;
    box.innerHTML = html;

    // Auto-select visitor currency in calculator if present
    const currSel = document.getElementById("curr");
    if (currSel && pack.currency) {
      for (let i = 0; i < currSel.options.length; i++) {
        if (currSel.options[i].value === pack.currency) {
          currSel.selectedIndex = i;
          if (typeof setDefaultRate === "function") setDefaultRate();
          if (typeof calc === "function") calc();
          break;
        }
      }
    }
  }

  fetch("https://ipwho.is")
    .then(r => r.json())
    .then(d => {
      if (d && d.success) {
        renderDeals(d.city, d.country_code, d.country);
      } else {
        renderDeals("", "DEFAULT", "Worldwide");
      }
    })
    .catch(() => renderDeals("", "DEFAULT", "Worldwide"));
})();
