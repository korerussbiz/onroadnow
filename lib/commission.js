/**
 * Commission tracking for 3rd-party Jamaican brands.
 * Verified programs (April 2026):
 *   Cookies Jamaica — 10%, unique link, 60-second signup, bank/cash payout
 *   BoadHaus        — 10% store, 25% recurring Premium, $25 threshold, 30-day cookie
 *   Sekkle          — affiliate partnership (terms on request)
 */

const AFFILIATE_PROGRAMS = {
  'cookies-jm': {
    name: 'Cookies Jamaica',
    commissionPct: 10,
    recurring: false,
    payoutMethod: 'bank_transfer',
    cookieDays: 30,
    signupUrl: 'https://www.cookiesjamaica.com/partner/',
  },
  boadhaus: {
    name: 'BoadHaus',
    commissionPct: 10,
    recurring: true,
    recurringPct: 25,
    payoutMethod: 'bank_transfer',
    cookieDays: 30,
    thresholdUSD: 25,
    signupUrl: 'https://boadhaus.com/store/',
  },
  sekkle: {
    name: 'Sekkle',
    commissionPct: 10,
    recurring: false,
    payoutMethod: 'bank_transfer',
    cookieDays: 30,
    signupUrl: 'https://sekkle.com',
  },
};

function computeCommission(programId, saleAmount, isRecurring = false) {
  const prog = AFFILIATE_PROGRAMS[programId];
  if (!prog) throw new Error(`Unknown program: ${programId}`);
  const pct = isRecurring && prog.recurring ? prog.recurringPct : prog.commissionPct;
  return Math.round(saleAmount * (pct / 100) * 100) / 100;
}

module.exports = { AFFILIATE_PROGRAMS, computeCommission };
