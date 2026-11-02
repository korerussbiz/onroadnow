// lib/cloudflare.js
// Minimal Cloudflare API v4 client. All credentials come from env vars.
// Nothing here is hardcoded — rotate the token by editing .referral-hub.env.

const CF_BASE = "https://api.cloudflare.com/client/v4";

function creds() {
  const token = process.env.CF_API_TOKEN;
  const accountId = process.env.CF_ACCOUNT_ID;
  if (!token) throw new Error("CF_API_TOKEN is not set");
  return { token, accountId };
}

async function cf(path, { method = "GET", body } = {}) {
  const { token } = creds();
  const res = await fetch(CF_BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: json.success === true, data: json };
}

// --- Specific endpoints we care about ---

export async function verifyToken() {
  return cf("/user/tokens/verify");
}

export async function listTunnels() {
  const { accountId } = creds();
  return cf(`/accounts/${accountId}/cfd_tunnel?is_deleted=false`);
}

export async function getTunnel(uuid) {
  const { accountId } = creds();
  return cf(`/accounts/${accountId}/cfd_tunnel/${uuid}`);
}

export async function listZones() {
  return cf("/zones");
}

export async function listDnsRecords(zoneId) {
  return cf(`/zones/${zoneId}/dns_records`);
}

export async function createDnsRecord(zoneId, { type, name, content, proxied = true, ttl = 1 }) {
  return cf(`/zones/${zoneId}/dns_records`, {
    method: "POST",
    body: { type, name, content, proxied, ttl },
  });
}
