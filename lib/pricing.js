/**
 * Pricing engine for onroadnow — Jamaican exports
 * Markup: 5-10% on landed cost for foreign orders
 * Shipping: EMS baseline (verified rates below)
 */

const FX = {
  JMD_to_USD: 0.0064,
  JMD_to_CAD: 0.0087,
  JMD_to_GBP: 0.0050,
};

// EMS shipping from Jamaica (verified Apr 2026)
const SHIPPING_PER_KG = {
  US:  3500, // JMD equivalent of $21.37/kg
  CA:  3500, // $21.37/kg
  UK:  5800, // $35.62/kg
  JM:  800,  // local
};

// De minimis + tax (2026)
const DUTY_TABLE = {
  US: { dutyPct: 0,  taxPct: 0  },  // <$800 exempt (Section 321)
  CA: { dutyPct: 0,  taxPct: 5  },  // GST 5%, C$20/40 thresholds
  UK: { dutyPct: 0,  taxPct: 20 },  // VAT 20%, £135 point-of-sale
  JM: { dutyPct: 20, taxPct: 15 },  // GCT 15%
};

function computePrice(product, destination, markupPct = 0.07) {
  const dest = destination.toUpperCase();
  const weight = product.weight_kg || 0.5;

  const baseJMD = product.baseCostJMD;
  const packJMD = product.packagingJMD || 80;
  const localJMD = product.localDeliveryJMD || 200;
  const shipJMD = (SHIPPING_PER_KG[dest] || 3500) * weight;

  const landedJMD = baseJMD + packJMD + localJMD + shipJMD;
  const duty = DUTY_TABLE[dest] || DUTY_TABLE.US;
  const dutyJMD = landedJMD * (duty.dutyPct / 100);
  const taxJMD = (landedJMD + dutyJMD) * (duty.taxPct / 100);

  const markupJMD = landedJMD * markupPct;
  const stripeFee = (landedJMD + markupJMD) * 0.029;

  const totalJMD = landedJMD + dutyJMD + taxJMD + markupJMD + stripeFee;

  let totalLocal, currency;
  if (dest === 'US') { totalLocal = totalJMD * FX.JMD_to_USD; currency = 'USD'; }
  else if (dest === 'CA') { totalLocal = totalJMD * FX.JMD_to_CAD; currency = 'CAD'; }
  else if (dest === 'UK') { totalLocal = totalJMD * FX.JMD_to_GBP; currency = 'GBP'; }
  else { totalLocal = totalJMD; currency = 'JMD'; }

  return {
    landedJMD: Math.round(landedJMD),
    shippingJMD: Math.round(shipJMD),
    dutyJMD: Math.round(dutyJMD),
    taxJMD: Math.round(taxJMD),
    markupJMD: Math.round(markupJMD),
    totalJMD: Math.round(totalJMD),
    totalLocal: Math.round(totalLocal * 100) / 100,
    currency,
    markupPct,
  };
}

module.exports = { computePrice, FX, SHIPPING_PER_KG, DUTY_TABLE };
