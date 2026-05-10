#!/usr/bin/env node
/**
 * Triggers a Netlify build from your connected Git repo (same as UI "Trigger deploy").
 * Does NOT use `netlify deploy` / createSiteDeploy — works when CLI returns Forbidden.
 *
 * 1) Netlify → your site → Configuration → Build & deploy → Build hooks → Add build hook (branch: main)
 * 2) Copy the hook URL (keep secret — anyone with the URL can trigger builds)
 * 3) Run:
 *    export NETLIFY_BUILD_HOOK_URL='https://api.netlify.com/build_hooks/...'
 *    npm run trigger:build
 *
 * Push commits to GitHub first; the hook tells Netlify to pull and build that branch.
 */

const u = process.env.NETLIFY_BUILD_HOOK_URL;
if (!u || typeof u !== 'string' || !u.startsWith('http')) {
  console.error(`
Set NETLIFY_BUILD_HOOK_URL to the URL from:
  Netlify → Site → Site configuration → Build & deploy → Build hooks → Add build hook

Example:
  export NETLIFY_BUILD_HOOK_URL='https://api.netlify.com/build_hooks/xxxxxxxx'
  npm run trigger:build
`);
  process.exit(1);
}

const res = await fetch(u, { method: 'POST' });
const text = await res.text().catch(() => '');
if (res.ok) {
  console.log('OK — Netlify accepted the build hook. Open Deploys in the Netlify UI to watch the build.');
  if (text) console.log(text);
} else {
  console.error('Request failed:', res.status, res.statusText, text);
  process.exit(1);
}
