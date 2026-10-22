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

// Barrido de Meta (scripts/meta-drive-sync.gs). Con DATA_ENDPOINT se baja del Web App y se guarda como copia local
// (data/amador-meta.json, fuera de git); sin el, se usa esa copia si existe. Sin barrido el tablero muestra la hoja.
const META_FILE = 'data/amador-meta.json';
const DATA_ENDPOINT_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;
async function fetchMeta(endpoint) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(`${endpoint}?action=data`, { redirect: 'follow', signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload.ok || !Array.isArray(payload.months)) throw new Error(payload.error || 'respuesta sin meses');
      return payload;
    } catch (error) {
      console.warn(`[build] intento ${attempt}: no se pudo leer el barrido de Meta (${error.message})`);
    }
  }
  return null;
}
async function loadMeta() {
  const endpoint = (process.env.DATA_ENDPOINT || '').trim();
  if (endpoint && !DATA_ENDPOINT_RE.test(endpoint)) throw new Error('DATA_ENDPOINT no es una URL /exec de script.google.com');
  const local = path.join(ROOT, META_FILE);
  if (endpoint) {
    const fresh = await fetchMeta(endpoint);
    if (fresh) {
      fs.writeFileSync(local, JSON.stringify(fresh), 'utf8');
      return { endpoint, meta: fresh };
    }
    // En GitHub Actions no se publica sin datos de Meta: Pages conserva el deploy anterior.
    if (process.env.CI) throw new Error('no se pudo leer el barrido de Meta');
  } else {
    console.warn('[build] sin DATA_ENDPOINT: el modulo Gasto publicitario usa la copia local de Meta o solo la hoja');
  }
  const meta = fs.existsSync(local) ? JSON.parse(fs.readFileSync(local, 'utf8')) : null;
  return { endpoint, meta };
}

async function main() {
  const { endpoint, meta } = await loadMeta();
  const metaData = JSON.stringify(meta).replace(/</g, '\\u003c');
  let html = readFile('index.html');
  const css = readFile('css/dashboard.css');
  const data = readFile('data/amador-ads-2026.json').replace(/</g, '\\u003c');
  const driveReports = readFile('data/amador-drive-reports.json').replace(/</g, '\\u003c');
  const inlineJson = file => JSON.stringify(JSON.parse(readFile(file))).replace(/</g, '\\u003c');
  const bitacoraData = inlineJson('data/amador-bitacora-2026.json');
  // Copias de las pestanas mensuales de la hoja (data/amador-<mes en ingles>-sheet-<año>.json): se incrustan todas,
  // en orden de año y mes, cada una con su año.
  const MONTH_FILES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const SHEET_FILE_RE = new RegExp(`^amador-(${MONTH_FILES.join('|')})-sheet-(\\d{4})\\.json$`);
  const sheetMonths = fs.readdirSync(path.join(ROOT, 'data'))
    .map(file => file.match(SHEET_FILE_RE))
    .filter(Boolean)
    .map(([file, month, year]) => ({ file: `data/${file}`, year: Number(year), index: MONTH_FILES.indexOf(month) }))
    .sort((a, b) => (a.year - b.year) || (a.index - b.index))
    .map(({ file, year }) => JSON.stringify({ year, ...JSON.parse(readFile(file)) }).replace(/</g, '\\u003c'));

  // Reemplazos con funcion: una cadena de reemplazo interpretaria "$&" o "$'" dentro del codigo.
  html = html.replace(/<link rel="stylesheet" href="css\/dashboard\.css(?:\?v=[^"]+)?">/, () => `<style>${css}</style>`);
  // Se incrustan, en el orden de index.html, todos los js/ que carga: no hay otra lista que mantener.
  html = html.replace(/<script src="js\/([\w-]+\.js)(?:\?v=[^"]+)?"><\/script>/g, (_, file) => `<script>${readFile(`js/${file}`)}</script>`);
  if (/<script src="js\//.test(html)) throw new Error('index.html carga un js/ que el build no incrusta');
  // La bitacora viaja incrustada: dist/ no lleva esos JSON.
  // Web App que escribe el Objetivo Reservas en la hoja (scripts/google-sheets-sync.gs). La URL llega por el
  // secret SHEET_SYNC_ENDPOINT y solo queda dentro del HTML cifrado: con ella cualquiera podria cambiar objetivos.
  const sheetSyncEndpoint = (process.env.SHEET_SYNC_ENDPOINT || '').trim();
  if (sheetSyncEndpoint && !DATA_ENDPOINT_RE.test(sheetSyncEndpoint)) throw new Error('SHEET_SYNC_ENDPOINT no es una URL /exec de script.google.com');
  if (sheetSyncEndpoint) console.log('[build] Objetivo Reservas conectado a la hoja');
  else console.warn('[build] sin SHEET_SYNC_ENDPOINT: el Objetivo Reservas se guarda solo en el navegador');
  html = html.replace(
    '</head>',
    () => `<script>window.AMADOR_SHEET_SYNC_ENDPOINT = ${JSON.stringify(sheetSyncEndpoint)};window.AMADOR_ADS_DATA = ${data};window.AMADOR_SHEET_MONTHS = [${sheetMonths.join(',')}];window.AMADOR_DRIVE_REPORTS = ${driveReports};window.AMADOR_BITACORA = ${bitacoraData};window.AMADOR_META_DATA = ${metaData};window.AMADOR_DATA_ENDPOINT = ${JSON.stringify(endpoint)};</script></head>`
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

  console.log(`[build] Meta: ${meta ? `${(meta.months || []).length} meses, barrido ${meta.sweptAt}` : 'sin barrido'}`);
  // Estado de cada mes del barrido (filas o error), sin cifras: un mes con error o sin filas sale de la hoja.
  (meta?.months || []).forEach(month => console.log(`[build]   ${month.name} ${month.year}: ${month.error ? `ERROR ${month.error}` : `${(month.rows || []).length} filas`}${(month.duplicates || []).length ? ', con duplicados' : ''}`));
  (meta?.ignored || []).forEach(item => console.log(`[build]   ignorado: ${item.reason}`));
  console.log(`[build] escrito dist/index.html (${(fs.statSync(DIST_HTML).size / 1024).toFixed(1)} KB)`);
}

main().catch(error => {
  console.error('[build] error:', error.message);
  process.exit(1);
});
