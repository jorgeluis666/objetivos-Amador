#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const DIST_HTML = path.join(DIST_DIR, 'index.html');

function readFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

// El acceso lo controla Apache (HTTP Basic Auth), no el navegador. HTPASSWD_PATH es la ruta absoluta
// del archivo de claves en el servidor (la que crea cPanel > Privacidad de directorios). Si falta,
// se deja un marcador: Apache responde 500 en vez de servir el tablero sin clave.
function writeHtaccess(html) {
  const htpasswdPath = (process.env.HTPASSWD_PATH || '').trim();
  if (!htpasswdPath) console.warn('[build] falta HTPASSWD_PATH; dist/.htaccess queda con un marcador y el sitio no abrira');
  // CSP con el hash de cada <script> inline, porque el build mete todo el JS dentro del HTML.
  const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map(match => `'sha256-${crypto.createHash('sha256').update(match[1], 'utf8').digest('base64')}'`);
  const csp = [
    "default-src 'self'",
    `script-src 'self' https://cdnjs.cloudflare.com ${hashes.join(' ')}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' data: https:",
    "connect-src 'self' https://docs.google.com https://script.google.com https://script.googleusercontent.com",
    'frame-src https://drive.google.com https://docs.google.com',
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  const template = readFile('deploy/.htaccess');
  for (const token of ['__HTPASSWD_PATH__', '__CSP__']) {
    if (template.split(token).length !== 2) throw new Error(`deploy/.htaccess debe contener ${token} exactamente una vez`);
  }
  const output = template
    .replace('__HTPASSWD_PATH__', htpasswdPath || '/RUTA/NO/CONFIGURADA/.htpasswd')
    .replace('__CSP__', csp);
  fs.writeFileSync(path.join(DIST_DIR, '.htaccess'), output, 'utf8');
}

function main() {
  let html = readFile('index.html');
  const css = readFile('css/dashboard.css');
  const app = readFile('js/objectives.js');
  const reservationGoals = readFile('js/reservation-goals.js');
  const messagesCalculator = readFile('js/messages-calculator.js');
  const navigation = readFile('js/navigation.js');
  const sidebar = readFile('js/sidebar.js');
  const reportsArchive = readFile('js/reports-archive.js');
  const projections = readFile('js/projections.js');
  const data = readFile('data/amador-ads-2026.json').replace(/</g, '\\u003c');
  const juneData = readFile('data/amador-june-sheet-2026.json').replace(/</g, '\\u003c');
  const julyData = readFile('data/amador-july-sheet-2026.json').replace(/</g, '\\u003c');
  const septemberData = readFile('data/amador-september-sheet-2026.json').replace(/</g, '\\u003c');
  const augustData = readFile('data/amador-august-sheet-2026.json').replace(/</g, '\\u003c');
  const driveReports = readFile('data/amador-drive-reports.json').replace(/</g, '\\u003c');

  html = html.replace(
    new RegExp('<link rel=\"stylesheet\" href=\"css/dashboard\\.css(?:\\?v=[^\"]+)?\">'),
    `<style>${css}</style>`
  );
  html = html.replace(
    new RegExp('<script src=\"js/objectives\\.js(?:\\?v=[^\"]+)?\"><\\/script>'),
    `<script>${app}</script>`
  );
  html = html.replace(
    new RegExp('<script src="js\\/reservation-goals\\.js(?:\\?v=[^"]+)?"><\\/script>'),
    `<script>${reservationGoals}</script>`
  );
  html = html.replace(
    new RegExp('<script src="js\\/messages-calculator\\.js(?:\\?v=[^"]+)?"><\\/script>'),
    `<script>${messagesCalculator}</script>`
  );
  html = html.replace(
    new RegExp('<script src="js\\/navigation\\.js(?:\\?v=[^"]+)?"><\\/script>'),
    `<script>${navigation}</script>`
  );
  html = html.replace(
    new RegExp('<script src="js\\/sidebar\\.js(?:\\?v=[^"]+)?"><\\/script>'),
    `<script>${sidebar}</script>`
  );
  html = html.replace(
    new RegExp('<script src="js\\/projections\\.js(?:\\?v=[^"]+)?"><\\/script>'),
    `<script>${projections}</script>`
  );
  html = html.replace(
    new RegExp('<script src="js\\/reports-archive\\.js(?:\\?v=[^"]+)?"><\\/script>'),
    `<script>${reportsArchive}</script>`
  );
  html = html.replace(
    '</head>',
    `<script>window.AMADOR_ADS_DATA = ${data};window.AMADOR_JUNE_DATA = ${juneData};window.AMADOR_JULY_DATA = ${julyData};window.AMADOR_AUGUST_DATA = ${augustData};window.AMADOR_SEPTEMBER_DATA = ${septemberData};window.AMADOR_DRIVE_REPORTS = ${driveReports};</script></head>`
  );

  // El navegador convierte CRLF en LF antes de calcular el hash CSP de cada <script>; si el HTML
  // conserva CRLF (archivos editados en Windows) los hashes no coinciden y el tablero no carga.
  html = html.replace(/\r\n?/g, '\n');

  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(DIST_DIR, 'data'), { recursive: true });
  fs.writeFileSync(DIST_HTML, html, 'utf8');
  // Los datos ya van incrustados en el HTML. Solo se publica el JSON que "Validar sincronizacion"
  // vuelve a pedir en vivo (reports-archive.js); nada de data/csv-backups ni de otros JSON.
  fs.copyFileSync(
    path.join(ROOT, 'data', 'amador-drive-reports.json'),
    path.join(DIST_DIR, 'data', 'amador-drive-reports.json')
  );

  fs.cpSync(path.join(ROOT, 'assets'), path.join(DIST_DIR, 'assets'), { recursive: true });
  writeHtaccess(html);

  console.log(`[build] escrito dist/index.html (${(fs.statSync(DIST_HTML).size / 1024).toFixed(1)} KB)`);
}

try {
  main();
} catch (error) {
  console.error('[build] error:', error.message);
  process.exit(1);
}
