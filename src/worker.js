/**
 * Balter Brewing — Logistics Daily Handover
 * Cloudflare Worker: single entry point for the whole site.
 *
 * Responsibilities, in order, for every incoming request:
 *   1. /login and /logout are always reachable (no auth required) so
 *      people can actually get in.
 *   2. Everything else requires a valid signed session cookie. No cookie,
 *      an expired one, or a tampered one → redirected to /login (or, for
 *      /api/* calls, a 401 JSON response).
 *   3. /api/sync is a server-side proxy to JSONBin.io — the real JSONBin
 *      API key lives only in this Worker's secrets and is never sent to
 *      the browser.
 *   4. Anything else that passes auth is served from the static files in
 *      public/ via the ASSETS binding.
 *
 * Because wrangler.jsonc sets "run_worker_first": true, ALL requests hit
 * this script first — including requests for index.html, app.js, style.css,
 * etc. — so step 2 genuinely gates the whole site, not just page routes.
 */

const COOKIE_NAME = "balter_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const JSONBIN_BASE = "https://api.jsonbin.io/v3/b";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/login") {
        return request.method === "POST" ? handleLoginPost(request, env, url) : handleLoginPage(url);
      }
      if (path === "/logout" && request.method === "POST") {
        return new Response(null, {
          status: 302,
          headers: { Location: "/login", "Set-Cookie": clearSessionCookie() }
        });
      }

      const authed = await isAuthenticated(request, env);
      if (!authed) {
        if (path.startsWith("/api/")) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
        return Response.redirect(new URL("/login", url.origin).toString(), 302);
      }

      if (path === "/api/sync") return handleSyncProxy(request, env);

      // Authenticated — hand off to the static files in public/.
      return env.ASSETS.fetch(request);
    } catch (err) {
      return jsonResponse({ ok: false, error: "server_error", message: String(err && err.message || err) }, 500);
    }
  }
};

/* ---------------------------------------------------------
   AUTH: password check, signed session cookie
--------------------------------------------------------- */

async function handleLoginPage(url) {
  const hasError = url.searchParams.get("error") === "1";
  return new Response(loginPageHtml(hasError), {
    headers: { "Content-Type": "text/html; charset=UTF-8" }
  });
}

async function handleLoginPost(request, env, url) {
  if (!env.SITE_PASSWORD || !env.SESSION_SECRET) {
    return new Response("Site is misconfigured: SITE_PASSWORD / SESSION_SECRET secrets are not set.", { status: 500 });
  }
  const form = await request.formData();
  const submitted = String(form.get("password") || "");

  if (!safeEqual(submitted, String(env.SITE_PASSWORD))) {
    return Response.redirect(new URL("/login?error=1", url.origin).toString(), 302);
  }

  const cookie = await createSessionCookie(env);
  return new Response(null, {
    status: 302,
    headers: { Location: "/", "Set-Cookie": cookie }
  });
}

async function isAuthenticated(request, env) {
  if (!env.SESSION_SECRET) return false;
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return false;

  const dot = token.indexOf(".");
  if (dot === -1) return false;
  const expiryStr = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expiry = parseInt(expiryStr, 10);
  if (!expiry || Math.floor(Date.now() / 1000) > expiry) return false;

  try {
    return await verifySignature(env.SESSION_SECRET, expiryStr, signature);
  } catch (err) {
    return false;
  }
}

async function createSessionCookie(env) {
  const expiry = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const signature = await signValue(env.SESSION_SECRET, String(expiry));
  const token = expiry + "." + signature;
  return COOKIE_NAME + "=" + token + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + SESSION_MAX_AGE_SECONDS;
}

function clearSessionCookie() {
  return COOKIE_NAME + "=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const parts = header.split(";");
  for (var i = 0; i < parts.length; i++) {
    var kv = parts[i].trim().split("=");
    if (kv[0] === name) return decodeURIComponent(kv.slice(1).join("="));
  }
  return null;
}

// Constant-time-ish string compare — avoids the most obvious short-circuit
// timing leak from a naive `a === b` on a password check.
function safeEqual(a, b) {
  const maxLen = Math.max(a.length, b.length, 1);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < maxLen; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

/* ---------------------------------------------------------
   HMAC-SHA256 signing (Web Crypto — built into the Workers runtime)
--------------------------------------------------------- */

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signValue(secret, value) {
  const key = await importHmacKey(secret);
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bufToBase64Url(sigBuf);
}

async function verifySignature(secret, value, signatureB64Url) {
  const key = await importHmacKey(secret);
  const sigBuf = base64UrlToBuf(signatureB64Url);
  return crypto.subtle.verify("HMAC", key, sigBuf, new TextEncoder().encode(value));
}

function bufToBase64Url(buf) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBuf(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/* ---------------------------------------------------------
   JSONBin proxy — the real API key stays server-side
--------------------------------------------------------- */

async function handleSyncProxy(request, env) {
  const binId = env.JSONBIN_BIN_ID;
  const apiKey = env.JSONBIN_API_KEY;
  if (!binId || !apiKey) {
    return jsonResponse({ ok: false, error: "not_configured" }, 501);
  }

  if (request.method === "GET") {
    const res = await fetch(JSONBIN_BASE + "/" + binId + "/latest", {
      headers: { "X-Master-Key": apiKey }
    });
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { "Content-Type": "application/json" } });
  }

  if (request.method === "PUT") {
    const body = await request.text();
    const res = await fetch(JSONBIN_BASE + "/" + binId, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Master-Key": apiKey, "X-Bin-Versioning": "false" },
      body
    });
    const text = await res.text();
    return new Response(text, { status: res.status, headers: { "Content-Type": "application/json" } });
  }

  return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json" }
  });
}

/* ---------------------------------------------------------
   LOGIN PAGE (kept dependency-free, matches site branding)
--------------------------------------------------------- */

function loginPageHtml(hasError) {
  return '<!DOCTYPE html>' +
'<html lang="en">' +
'<head>' +
'<meta charset="UTF-8">' +
'<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'<title>Balter Brewing — Logistics Daily Handover</title>' +
'<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">' +
'<style>' +
'  :root{ --mint:#47D7AC; --ink:#14161a; }' +
'  *{box-sizing:border-box;}' +
'  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#fff;font-family:"Inter",ui-sans-serif,sans-serif;color:var(--ink);padding:20px;}' +
'  .card{width:100%;max-width:360px;padding:32px 28px;border:1px solid rgba(0,0,0,.08);border-radius:18px;box-shadow:0 8px 24px -12px rgba(20,22,26,.15);}' +
'  .logo{width:40px;height:40px;color:#0d6a4d;margin-bottom:14px;}' +
'  h1{font-family:"Space Grotesk",ui-sans-serif,sans-serif;font-size:19px;margin:0 0 4px;}' +
'  p.sub{font-size:13px;color:#666;margin:0 0 22px;line-height:1.5;}' +
'  input[type=password]{width:100%;padding:11px 13px;border:1.5px solid rgba(0,0,0,.12);border-radius:8px;font-size:15px;margin-bottom:14px;}' +
'  input[type=password]:focus{outline:none;border-color:var(--mint);box-shadow:0 0 0 3px rgba(71,215,172,.25);}' +
'  button{width:100%;padding:11px;border:none;border-radius:999px;background:var(--ink);color:#fff;font-weight:600;font-size:14px;cursor:pointer;}' +
'  button:hover{background:#26282d;}' +
'  .error{background:#fdeceb;color:#a8362a;font-size:13px;padding:9px 12px;border-radius:8px;margin-bottom:14px;}' +
'</style>' +
'</head>' +
'<body>' +
'  <form class="card" method="POST" action="/login">' +
'    <svg class="logo" viewBox="0 0 161 161" fill="currentColor" aria-hidden="true"><path d="M136.3,70.4l-9.4-9.4c-1.6-1.6-4.3-1.6-6,0-1.6,1.6-1.6,4.3,0,6l2.3,2.3c-9.6,13.2-25.2,21.7-42.7,21.7s-33.1-8.6-42.7-21.8l2.3-2.3c1.6-1.6,1.6-4.3,0-6-1.6-1.6-4.3-1.6-6,0l-9.4,9.4c-1.6,1.6-1.6,4.3,0,6,.8.8,1.9,1.2,3,1.2s2.2-.4,3-1.2l1.1-1.1c11.2,14.7,28.9,24.2,48.7,24.2s37.5-9.5,48.7-24.2l1.1,1.1c.8.8,1.9,1.2,3,1.2s2.2-.4,3-1.2c1.6-1.6,1.6-4.3,0-6"/><path d="M152.5,8.5v144H8.5V8.5h144M161,0H0v161h161V0h0Z"/></svg>' +
'    <h1>Logistics Daily Handover</h1>' +
'    <p class="sub">Balter Brewing — enter the site password to continue.</p>' +
(hasError ? '    <div class="error">Wrong password — try again.</div>' : '') +
'    <input type="password" name="password" placeholder="Password" autofocus required>' +
'    <button type="submit">Enter</button>' +
'  </form>' +
'</body>' +
'</html>';
}
