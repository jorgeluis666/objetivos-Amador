#!/usr/bin/env node

// Prepara dist/ para GitHub Pages, que no puede pedir clave por servidor: cifra el tablero ya compilado
// (AES-256-GCM, clave PBKDF2-SHA256 de DASHBOARD_PASSWORD) y lo envuelve en deploy/pages-gate.html.
// Correr despues de scripts/build.js. La clave solo llega por variable de entorno (secret de Actions).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const DIST_HTML = path.join(DIST_DIR, 'index.html');
const ITERATIONS = 600000;
const MIN_LENGTH = 8;

function main() {
  const password = (process.env.DASHBOARD_PASSWORD || '').trim();
  if (!password) throw new Error('falta DASHBOARD_PASSWORD');
  if (password.length < MIN_LENGTH) throw new Error(`DASHBOARD_PASSWORD debe tener al menos ${MIN_LENGTH} caracteres`);
  if (!fs.existsSync(DIST_HTML)) throw new Error('no existe dist/index.html: correr antes scripts/build.js');

  const html = fs.readFileSync(DIST_HTML, 'utf8');
  if (html.includes('id="gate"')) throw new Error('dist/index.html ya esta cifrado: correr scripts/build.js otra vez');

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  // WebCrypto espera el tag de autenticacion pegado al final del texto cifrado.
  const data = Buffer.concat([cipher.update(html, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  const payload = JSON.stringify({
    iterations: ITERATIONS,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    data: data.toString('base64'),
  });

  const template = fs.readFileSync(path.join(ROOT, 'deploy', 'pages-gate.html'), 'utf8');
  if (template.split('__PAYLOAD__').length !== 2) throw new Error('deploy/pages-gate.html debe contener __PAYLOAD__ exactamente una vez');
  fs.writeFileSync(DIST_HTML, template.replace('__PAYLOAD__', () => payload), 'utf8');

  // Pages publica todo lo que haya en dist/: fuera el .htaccess del hosting y el catalogo de Drive en claro
  // (reports-archive.js ya lo lee incrustado en el HTML cifrado).
  fs.rmSync(path.join(DIST_DIR, '.htaccess'), { force: true });
  fs.rmSync(path.join(DIST_DIR, 'data'), { recursive: true, force: true });
  fs.writeFileSync(path.join(DIST_DIR, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');

  console.log(`[protect-pages] dist/index.html cifrado (${(fs.statSync(DIST_HTML).size / 1024).toFixed(1)} KB)`);
}

try {
  main();
} catch (error) {
  console.error('[protect-pages] error:', error.message);
  process.exit(1);
}
