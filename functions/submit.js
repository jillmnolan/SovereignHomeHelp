// /functions/submit.js (Cloudflare Pages Functions or Workers)
export const onRequestPost = async (context) => {
  const { request, env } = context;
  const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
  const ua = request.headers.get("User-Agent") || "";
  let formData;

  try {
    formData = await request.formData();
  } catch {
    return new Response("Invalid form submission.", { status: 400 });
  }

  // 1) Honeypot (quiet pass)
  if (formData.get("_hp")) {
    return new Response("OK", { status: 200 });
  }

  // 2) hCaptcha server verify
  const token = String(formData.get("h-captcha-response") || "").trim();
  const secret = env.HCAPTCHA_SECRET;

  if (!secret) {
    // Misconfiguration: no secret on server
    return new Response("Server not configured (captcha secret).", { status: 500 });
  }
  if (!token) {
    return new Response("Captcha required", { status: 400 });
  }

  // NB: official endpoint is https://hcaptcha.com/siteverify
  // Use x-www-form-urlencoded
  const params = new URLSearchParams({
    secret,
    response: token,
    remoteip: ip
  });

  let verify;
  try {
    const verifyRes = await fetch("https://hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params
    });
    verify = await verifyRes.json();
  } catch {
    return new Response("Captcha verification unreachable.", { status: 502 });
  }

  if (!verify?.success) {
    // Surface error codes so you can fix configuration quickly during testing.
    // In production you might swap this for a generic line.
    const codes = Array.isArray(verify?.["error-codes"]) ? verify["error-codes"].join(", ") : "unknown";
    return new Response(`Captcha failed (${codes})`, { status: 400 });
  }

  // 3) Simple per-IP rate limit via KV
  // Make sure RL_KV is bound in your project settings.
  const key = `rl:${ip}`;
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1h
  const limit = 5;

  try {
    const raw = await env.RL_KV.get(key);
    const state = raw ? JSON.parse(raw) : { hits: [] };
    const hits = (state.hits || []).filter((ts) => now - ts < windowMs);
    if (hits.length >= limit) {
      return new Response("Rate limit exceeded. Please try again later.", { status: 429 });
    }
    hits.push(now);
    await env.RL_KV.put(key, JSON.stringify({ hits }), { expirationTtl: 2 * 60 * 60 }); // 2h
  } catch {
    // If KV hiccups, do not block the user—just proceed.
  }

  // 4) Forward to Formspree
  const formspreeId = env.FORMSPREE_ID;
  if (!formspreeId) {
    return new Response("Server not configured (Formspree ID missing).", { status: 500 });
  }

  let fsRes;
  try {
    fsRes = await fetch(`https://formspree.io/f/${formspreeId}`, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: formData
    });
  } catch {
    return new Response("Upstream error", { status: 502 });
  }

  // 5) Optional: Zapier webhook (best-effort, non-blocking)
  if (env.ZAPIER_HOOK) {
    (async () => {
      try {
        const json = {};
        for (const [k, v] of formData.entries()) json[k] = v;
        json.ip = ip;
        json.ua = ua;
        json.when = new Date().toISOString();
        await fetch(env.ZAPIER_HOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(json)
        });
      } catch {}
    })();
  }

  if (fsRes.ok) {
    return new Response("OK", { status: 200 });
  } else {
    const t = await fsRes.text().catch(() => "");
    return new Response(t || "Upstream error", { status: 502 });
  }
};
