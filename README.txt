Sovereign Home Help — Secure Static Site (Cloudflare Pages + Functions)
====================================================================

What’s included
---------------
- index.html             — Landing page with hCaptcha widgets and Fetch POST to /submit
- privacy.html           — Privacy Policy
- fair-housing.html      — Equal Housing & Accessibility
- functions/submit.js    — Pages Function: hCaptcha verify, KV rate limiting (5/hour/IP), Formspree forward, optional Zapier webhook
- favicon.svg/png        — Minimal seal for livery
- _headers               — Sensible security headers

Cloudflare configuration
------------------------
1) Create a **Pages** project → **Upload assets** (upload the entire ZIP contents).
2) In **Pages → Settings → Functions → KV bindings**, create a KV namespace (e.g., RL_KV) and bind it as `RL_KV`.
3) In **Pages → Settings → Environment variables**, set:
   - HCAPTCHA_SECRET = your hCaptcha secret key
   - FORMSPREE_ID   = your Formspree form ID (e.g., abcdwxyz)
   - ZAPIER_HOOK    = (optional) your Zapier Catch Hook URL for CRM automations
4) In **hCaptcha**, create a site and get the **site key**; edit index.html and set `data-sitekey="YOUR_HCAPTCHA_SITE_KEY"` in both widgets.
5) Deploy. Test a submission. You should get Formspree email and, if set, a Zapier payload.

Zapier hint (optional)
----------------------
- Use a Zapier **Catch Hook** trigger.
- Steps: Parse payload → Add to Airtable/HubSpot/Notion → Send SMS/Email (Twilio, Gmail).

Notes
-----
- Rate limit is conservative (5/hour/IP). Adjust in functions/submit.js as needed.
- If you prefer Cloudflare Turnstile instead of hCaptcha, we can swap it seamlessly.
- All content is WCAG-conscious and Equal Housing noted.

— Prepared for ScholarCore · 2025
