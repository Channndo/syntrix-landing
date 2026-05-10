#!/usr/bin/env node
/**
 * Run: npm run deploy:help
 * Prints how production deploy works and why `netlify deploy` may return 403 Forbidden.
 */

var t = process.env.NETLIFY_AUTH_TOKEN;
if (t && t.length) {
  console.error(
    '\n[WARNING] NETLIFY_AUTH_TOKEN is set in your environment (' +
      t.length +
      ' chars).\n' +
      'The Netlify CLI uses this token instead of `netlify login`.\n' +
      'If the token is old, from another account, or read-only, you get JSONHTTPError: Forbidden.\n' +
      'Fix:  unset NETLIFY_AUTH_TOKEN\n' +
      '      npx netlify logout && npx netlify login\n' +
      'Or create a new token at: https://app.netlify.com/user/applications#personal-access-tokens\n' +
      '(must be the same Netlify user that owns this site / has deploy rights).\n'
  );
} else {
  console.log('\n[INFO] NETLIFY_AUTH_TOKEN is not set — CLI will use netlify login session.\n');
}

console.log(
  [
    '--- Production deploy for syntrix.solutions (no CLI required) ---',
    'This repo is connected to Netlify. Pushing main triggers a build:',
    '',
    '  cd /path/to/syntrix-landing',
    '  git add -A && git commit -m "Your message" && git push origin main',
    '',
    'Then open Netlify → your site → Deploys and wait for "Published".',
    '',
    'CLI manual deploy (only if you have deploy rights on the site):',
    '  npx netlify deploy --prod',
    '',
  ].join('\n')
);
