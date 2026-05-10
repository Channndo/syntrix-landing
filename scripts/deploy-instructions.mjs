#!/usr/bin/env node
/**
 * Run: npm run deploy:help
 */

var t = process.env.NETLIFY_AUTH_TOKEN;
if (t && t.length) {
  console.error(
    '\n[WARNING] NETLIFY_AUTH_TOKEN is set (' +
      t.length +
      ' chars). The CLI uses this *instead* of browser login.\n' +
      'Wrong / stale token ⇒ JSONHTTPError: Forbidden (even right after "authorizing").\n' +
      '  unset NETLIFY_AUTH_TOKEN\n' +
      '  npx netlify logout && npx netlify login\n' +
      'Also check ~/.zshrc and Cursor env for NETLIFY_AUTH_TOKEN exports.\n'
  );
} else {
  console.log('\n[INFO] NETLIFY_AUTH_TOKEN is not set — CLI uses netlify login session.\n');
}

console.log(
  [
    '--- Git: why "Everything up-to-date" ---',
    'That only means your *current branch* has nothing new vs origin. It does NOT deploy by itself.',
    'If our commits "never appear", you may need:  git pull origin main',
    'If you edit scanner/ or the parent `syntrix` repo, that is NOT syntrix-landing — push that repo separately.',
    'Landing site changes must be committed inside this folder:  syntrix/landing  (repo: Channndo/syntrix-landing)',
    '',
    '--- Deploy prod without CLI (recommended) ---',
    '  git add -A && git status',
    '  git commit -m "message" && git push origin main',
    '  → Netlify build triggers from GitHub. Check app.netlify.com → Deploys.',
    '',
    '--- Netlify CLI: recover from Forbidden (do in order) ---',
    '1) From your Mac terminal (same terminal you use for deploy), NOT only in Cursor if env differs:',
    '     unset NETLIFY_AUTH_TOKEN',
    '     npx netlify logout',
    '',
    '2) Remove local link cache (safe — will re-link):',
    '     cd /path/to/syntrix/landing',
    '     rm -rf .netlify',
    '',
    '3) Login as the Netlify user who OWNS or can deploy `syntrixaisolutions`:',
    '     npx netlify login',
    '   Use a private/incognito window if Chrome is logged into the wrong Google/GitHub account.',
    '',
    '4) Verify the CLI sees the right person:',
    '     npx netlify status',
    '',
    '5) Re-link this folder and deploy:',
    '     npx netlify link   # pick syntrixaisolutions / syntrix.solutions',
    '     npx netlify deploy --prod',
    '',
    '--- If Forbidden on `deploy --prod` but `status` works (debug shows createSiteDeploy): ---',
    'That API = "manual deploy / upload from CLI". Some teams restrict it even for the same user.',
    'Use Git-triggered build instead (no local upload — same as Netlify "Trigger deploy" button):',
    '     git push origin main',
    '     npx netlify deploy --trigger',
    'Requires the site to be linked to GitHub and branch (e.g. main) to have your commits.',
    '',
    '--- If still Forbidden: Personal Access Token (same account as site owner) ---',
    '  Open: https://app.netlify.com/user/applications#personal-access-tokens',
    '  Create token, then run in the same shell (one deploy):',
    '     export NETLIFY_AUTH_TOKEN="paste-token-here"',
    '     cd .../landing && npx netlify deploy --prod',
    '     unset NETLIFY_AUTH_TOKEN',
    '',
    'Team SSO: org may block PATs or CLI — ask team Owner to confirm your seat can deploy.',
    '',
  ].join('\n')
);
