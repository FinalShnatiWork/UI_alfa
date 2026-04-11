/**
 * One-off / maintenance: ensure body has data-title-i18n and back buttons have aria.
 * (Script name is legacy; i18n-apply.js was removed — translations use src/js/lib/i18n.js only.)
 */
import { readFileSync, writeFileSync } from 'fs';
import { readdirSync } from 'fs';

const titleByFile = {
  'landing.html': 'titles.landing',
  'login.html': 'titles.login',
  'register.html': 'titles.register',
  'dashboard.html': 'titles.dashboard',
  'positions.html': 'titles.positions',
  'charts.html': 'titles.charts',
  'trading.html': 'titles.trading',
  'finance.html': 'titles.finance',
  'history.html': 'titles.history',
  'account.html': 'titles.account',
  'settings.html': 'titles.settings',
  'broker.html': 'titles.broker',
};

const dir = 'src/pages';
for (const name of readdirSync(dir)) {
  if (!name.endsWith('.html')) continue;
  const key = titleByFile[name];
  if (!key) continue;
  const p = `${dir}/${name}`;
  let html = readFileSync(p, 'utf8');
  html = html.replace('<body>', `<body data-title-i18n="${key}">`);
  html = html.replace(
    /class="btn btn-outline header-back">/g,
    'class="btn btn-outline header-back" data-i18n-aria-label="common.back">'
  );
  writeFileSync(p, html);
  console.log('patched', p);
}
