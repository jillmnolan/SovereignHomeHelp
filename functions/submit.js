export const onRequestPost = async (context) => {
  const { request, env } = context;
  const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
  const ua = request.headers.get("User-Agent") || "";
  const formData = await request.formData();

  // Basic honeypot
  if (formData.get("_hp")) {
    return new Response("OK", { status: 200 });
  }

  // hCaptcha server-side verify
  const token = formData.get("h-captcha-response");
  if (!token || !env.HCAPTCHA_SECRET) {
    return new Response("Captcha required", { status: 400 });
  }

  const verifyRes = await fetch("https://hcaptcha.com/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret: env.HCAPTCHA_SECRET, response: token, remoteip: ip })
  });
  const verify = await verifyRes.json().catch(() => ({}));
  if (!verify.success) {
    return new Response("Captcha failed", { status: 400 });
  }

  // Basic KV rate limiting: 5 submissions per IP per hour
  const key = `rl:${ip}`;
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const limit = 5;

  let state = { hits: [] };
  try {
    const raw = await env.RL_KV.get(key);
    if (raw) state = JSON.parse(raw);
  } catch (e) {}

  // filter to current window
  state.hits = (state.hits || []).filter(ts => now - ts < windowMs);
  if (state.hits.length >= limit) {
    return new Response("Rate limit exceeded. Please try again later.", { status: 429 });
  }
  state.hits.push(now);
  await env.RL_KV.put(key, JSON.stringify(state), { expirationTtl: 60 * 60 * 2 });

  // Forward to Formspree
  if (!env.FORMSPREE_ID) {
    return new Response("Server not configured (Formspree ID missing).", { status: 500 });
  }
  const fsRes = await fetch(`https://formspree.io/f/${env.FORMSPREE_ID}`, {
    method: "POST",
    headers: { "Accept": "application/json" },
    body: formData
  });

  // Optional: forward to Zapier webhook
  if (env.ZAPIER_HOOK) {
    try {
      const json = {};
      for (const [k, v] of formData.entries()) { json[k] = v; }
      json.ip = ip; json.ua = ua; json.when = new Date().toISOString();
      await fetch(env.ZAPIER_HOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json)});
    } catch (e) { /* ignore */ }
  }

  if (fsRes.ok) {
    return new Response("OK", { status: 200 });
  } else {
    const t = await fsRes.text();
    return new Response(t || "Upstream error", { status: 502 });
  }
};
