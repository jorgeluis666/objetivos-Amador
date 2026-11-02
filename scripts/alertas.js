#!/usr/bin/env node
/* ============================================================
   scripts/alertas.js — Alerta semanal de Meta Ads de Amador.

   Sale los lunes a las 7:00 a. m. de Lima (ALERTA_MOTIVO=lunes) y a mano.

   De donde salen los datos, que es lo que distingue a esta marca: el repositorio NO los tiene. Viven
   en el Web App de scripts/meta-drive-sync.gs y el build los incrusta en la pagina. Asi que aqui se
   piden igual que en scripts/build.js, con DATA_ENDPOINT; si no esta, se usa la copia local que el
   ultimo build dejo en data/amador-meta.json (ignorada por git). Sin ninguna de las dos no hay
   alerta, y se dice en voz alta en vez de mandar un correo en blanco.

   El barrido devuelve filas crudas por dia, campana y anuncio: aqui se suman por mes y por objetivo.

   Lee:
     DATA_ENDPOINT o data/amador-meta.json  → el mismo barrido que publica el tablero
     data/alertas-config.json               → remitente y destinatarios

   Envia por el correo del hosting (SMTP) o, si no esta configurado, por Resend.
   Registra el envio en data/alertas-envios.json (idempotencia).

   Uso:
     node scripts/alertas.js --dry-run     simula y muestra el correo que saldria
     node scripts/alertas.js --preview x   escribe el HTML en un archivo, sin enviar
     node scripts/alertas.js --force       reenvia aunque la semana ya este registrada
   ============================================================ */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const readJson = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run') || process.env.DRY_RUN === 'true';
const FORCE = ARGS.includes('--force');
const PREVIEW = ARGS.includes('--preview') ? ARGS[ARGS.indexOf('--preview') + 1] : null;
const MOTIVO = process.env.ALERTA_MOTIVO || 'manual';

const limaDate = () => new Date(Date.now() - 5 * 3600 * 1000);

function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return `${date.getUTCFullYear()}-W${String(Math.ceil(((date - start) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}

const money = v => `S/. ${Number(v || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const moneyCorto = v => `S/. ${Math.round(Number(v || 0)).toLocaleString('es-PE')}`;
const count = v => Number(v || 0).toLocaleString('es-PE');
const signedPct = v => (v > 0 ? '+' : '') + Math.round(v) + '%';
const ratio = (a, b) => (b ? a / b : null);
const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const config = readJson('data/alertas-config.json');
if (process.env.DASHBOARD_URL) config.url_dashboard = process.env.DASHBOARD_URL;
const enviosPath = path.join(ROOT, 'data/alertas-envios.json');
const enviosData = readJson('data/alertas-envios.json');

const lima = limaDate();
const weekKey = isoWeek(lima);
const fechaLabel = lima.toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

const COPIA = 'data/amador-meta.json';

// Mismo contrato que scripts/build.js: dos intentos y, si falla, la copia local del ultimo build.
async function cargarBarrido() {
  const endpoint = (process.env.DATA_ENDPOINT || '').trim();
  if (endpoint) {
    for (let intento = 1; intento <= 2; intento += 1) {
      try {
        const res = await fetch(`${endpoint}?action=data`, { redirect: 'follow', signal: AbortSignal.timeout(120000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();
        if (!payload.ok || !Array.isArray(payload.months)) throw new Error(payload.error || 'respuesta sin meses');
        return { payload, fuente: `Web App (barrido ${String(payload.sweptAt || '').slice(0, 10)})` };
      } catch (error) {
        console.warn(`  Intento ${intento}: no se pudo leer el barrido (${error.message})`);
      }
    }
  }
  if (fs.existsSync(path.join(ROOT, COPIA))) {
    return { payload: readJson(COPIA), fuente: `${COPIA} (copia del último build)` };
  }
  return { payload: null, fuente: null };
}

// ── Sumar las filas del mes ──────────────────────────────────
const CIFRAS = ['spend', 'impressions', 'reach', 'clicks', 'results', 'messages', 'purchases'];

function resumir(mes) {
  const at = Object.fromEntries(mes.columns.map((name, i) => [name, i]));
  const total = Object.fromEntries(CIFRAS.map(c => [c, 0]));
  const porObjetivo = new Map();
  const porCampana = new Map();
  const dias = new Set();

  for (const fila of mes.rows || []) {
    const dia = String(fila[at.day] || '');
    if (dia) dias.add(dia);
    const objetivo = String(fila[at.objective] || 'Sin objetivo').trim() || 'Sin objetivo';
    const campana = String(fila[at.campaign] || '').trim();
    const o = porObjetivo.get(objetivo) || Object.fromEntries(CIFRAS.map(c => [c, 0]));
    const c = porCampana.get(campana) || Object.fromEntries(CIFRAS.map(x => [x, 0]));
    for (const campo of CIFRAS) {
      const v = Number(fila[at[campo]]) || 0;
      total[campo] += v; o[campo] += v; c[campo] += v;
    }
    porObjetivo.set(objetivo, o);
    if (campana) porCampana.set(campana, c);
  }
  const ordenados = [...dias].sort();
  return {
    total,
    objetivos: [...porObjetivo.entries()].map(([nombre, v]) => ({ nombre, ...v })).sort((a, b) => b.spend - a.spend),
    campanas: [...porCampana.entries()].map(([nombre, v]) => ({ nombre, ...v })).sort((a, b) => b.spend - a.spend),
    primerDia: ordenados[0] || null,
    ultimoDia: ordenados[ordenados.length - 1] || null,
    nDias: dias.size,
  };
}

// La cifra que mide cada objetivo de Amador: reservas, leads o conversaciones.
const METRICA = {
  'Ventas': { campo: 'purchases', unidad: 'reservas' },
  'Clientes potenciales': { campo: 'results', unidad: 'leads' },
  'Mensajes': { campo: 'messages', unidad: 'conversaciones' },
  'Interacción': { campo: 'results', unidad: 'interacciones' },
};
const metricaDe = nombre => METRICA[nombre] || { campo: 'results', unidad: 'resultados' };

const SINGULAR = { reservas: 'reserva', conversaciones: 'conversación', leads: 'lead', interacciones: 'interacción', resultados: 'resultado' };
const unidad = (valor, nombre) => (Number(valor) === 1 ? (SINGULAR[nombre] || nombre) : nombre);

// Una campana de leads tambien trae compras, y una de ventas tambien trae conversaciones. Si la fila
// solo mostrara la cifra "propia" del objetivo, la tabla no sumaria lo que dicen el asunto y las
// tarjetas, y 12 frente a 13 se lee como un error. Asi que cada fila dice todo lo que ese objetivo
// produjo, sin contar dos veces: `results` ya es la compra cuando el objetivo es Ventas.
function logros(objetivo) {
  const partes = [];
  if (objetivo.purchases > 0) partes.push({ valor: objetivo.purchases, unidad: 'reservas' });
  if (objetivo.messages > 0) partes.push({ valor: objetivo.messages, unidad: 'conversaciones' });
  // `results` es la cifra que Meta cuenta para este objetivo, y a veces son las mismas compras o las
  // mismas conversaciones: repetirla con otro nombre parecia un resultado mas. Solo se nombra cuando
  // dice algo que las dos de arriba no dicen ya, y entonces va primero porque es la propia.
  const propia = metricaDe(objetivo.nombre);
  const propio = Number(objetivo[propia.campo]) || 0;
  if (propia.campo === 'results' && propio > 0 && !partes.some(p => p.valor === propio)) {
    partes.unshift({ valor: propio, unidad: propia.unidad });
  }
  return partes;
}

(async () => {
  console.log(`\n▶ Alerta de Meta Ads ${weekKey}${DRY_RUN ? ' [DRY-RUN]' : ''}`);
  console.log(`  Fecha Lima : ${fechaLabel}`);

  const { payload, fuente } = await cargarBarrido();
  if (!payload) {
    console.error('\n❌ Sin datos: no hay DATA_ENDPOINT ni copia local en data/amador-meta.json.');
    console.error('   El repositorio de Amador no guarda el barrido; hay que pasarle el endpoint.\n');
    process.exit(1);
  }
  console.log(`  Datos      : ${fuente}`);

  const meses = payload.months
    .map(m => ({ meta: m, r: resumir(m) }))
    .filter(x => x.r.total.spend > 0)
    .sort((a, b) => (a.meta.year - b.meta.year) || (a.meta.month - b.meta.month));

  if (!meses.length) {
    console.log('\n⏭  Todavía no hay un mes con inversión: no hay alerta que enviar.\n');
    process.exit(0);
  }

  const { meta: mes, r } = meses[meses.length - 1];
  const anterior = meses.length > 1 ? meses[meses.length - 2] : null;
  const K = r.total;
  const P = anterior ? anterior.r.total : null;

  const diasMes = new Date(mes.year, mes.month, 0).getDate();
  const diaCorte = r.ultimoDia ? Number(r.ultimoDia.slice(8, 10)) : r.nDias;
  const completo = diaCorte >= diasMes;
  const proyectar = v => (completo ? Number(v || 0) : (Number(v || 0) / diaCorte) * diasMes);
  const gastoCierre = proyectar(K.spend);

  const nombreMes = `${mes.name} ${mes.year}`;
  const costoPorResultado = ratio(K.spend, K.results);
  const costoPrevio = P ? ratio(P.spend, P.results) : null;

  // ── Avisos y nivel ─────────────────────────────────────────
  const avisos = [];
  avisos.push({ tone: 'blue', titulo: `Semana ${Math.ceil(diaCorte / 7)} del mes`, cuerpo: `Datos al día ${diaCorte} de ${diasMes}. Al ritmo de ahora, ${mes.name} cierra en ${moneyCorto(gastoCierre)}.` });

  if (!K.results && !K.messages && !K.purchases) {
    avisos.push({ tone: 'red', titulo: 'El mes no registra ningún resultado', cuerpo: `${money(K.spend)} invertidos sin reservas, leads ni conversaciones.` });
  } else if (costoPorResultado != null && costoPrevio != null && costoPorResultado > costoPrevio * 1.3) {
    avisos.push({ tone: 'amber', titulo: `El costo por resultado sube ${signedPct((costoPorResultado / costoPrevio - 1) * 100)}`, cuerpo: `De ${money(costoPrevio)} en ${anterior.meta.name} a ${money(costoPorResultado)}.` });
  }

  // Una campana que se lleva mas del 10% del gasto y no devuelve nada es lo primero que hay que mirar.
  r.campanas
    .filter(c => c.spend > K.spend * 0.1 && !c.results && !c.messages && !c.purchases)
    .forEach(c => avisos.push({ tone: 'red', titulo: `«${c.nombre}» gasta sin resultados`, cuerpo: `${money(c.spend)} sin reservas, leads ni conversaciones.` }));

  const NIVELES = { red: { txt: '🚨 Riesgo', label: 'Riesgo' }, amber: { txt: '⚠️ Atención', label: 'Atención' }, blue: { txt: '✅ En marcha', label: 'En marcha' } };
  const nivel = avisos.some(a => a.tone === 'red') ? 'red' : avisos.some(a => a.tone === 'amber') ? 'amber' : 'blue';

  // ── Idempotencia ───────────────────────────────────────────
  const huella = crypto.createHash('sha256').update(JSON.stringify({ mes: nombreMes, dia: diaCorte, K })).digest('hex').slice(0, 16);
  console.log(`  Mes        : ${nombreMes} · día ${diaCorte} de ${diasMes}${completo ? ' (completo)' : ''}`);
  console.log(`  Motivo     : ${MOTIVO}`);
  if (!FORCE && !DRY_RUN && !PREVIEW) {
    if (MOTIVO === 'datos' && enviosData.ultimaHuella === huella) {
      console.log('\n⏭  Las cifras del mes no cambiaron desde el último envío.\n');
      process.exit(0);
    }
    if (MOTIVO !== 'datos' && enviosData.enviados[weekKey]) {
      console.log(`\n⏭  Semana ${weekKey} ya registrada (${enviosData.enviados[weekKey]}). Usa --force para reenviar.\n`);
      process.exit(0);
    }
  }

  console.log(`\n📊 ${nombreMes}:`);
  console.log(`   Invertido   : ${money(K.spend)} → cierre ${money(gastoCierre)}`);
  r.objetivos.forEach(o => {
    const detalle = logros(o).map(p => `${count(p.valor)} ${unidad(p.valor, p.unidad)}`).join(', ') || 'sin resultados';
    console.log(`   ${o.nombre.padEnd(22)}: ${money(o.spend)} · ${detalle}`);
  });
  console.log(`   Nivel       : ${NIVELES[nivel].label}`);
  avisos.forEach(a => console.log(`   · [${a.tone}] ${a.titulo}`));

  // ── Email ──────────────────────────────────────────────────
  const C = { bg: '#f6fbff', card: '#ffffff', border: '#dbeafe', text: '#0f172a', muted: '#64748b', brand: '#2563eb', red: '#dc2626', amber: '#b45309' };
  const FONT = "Inter,-apple-system,'Segoe UI',sans-serif";
  // El tono de un aviso se dice con la tarjeta entera —fondo suave y borde fino del mismo color en
  // los cuatro lados—, como en el correo de Aquarius. Nada de barras de acento al costado: estan
  // prohibidas en Lima Retail.
  const TONO = {
    red:   { fg: '#b91c1c', bd: '#fecaca', box: '#fef2f2' },
    amber: { fg: '#b45309', bd: '#fde68a', box: '#fffbeb' },
    blue:  { fg: '#1d4ed8', bd: '#bfdbfe', box: '#eff6ff' },
  };
  const URL_TABLERO = config.url_dashboard.replace(/#.*$/, '').replace(/\/?$/, '/');

  const tarjeta = (rotulo, valor, sub) => `
    <td width="33%" valign="top" style="padding:0 6px;">
      <table role="presentation" width="100%" style="border:1px solid ${C.border};border-radius:12px;border-collapse:separate;background:${C.card};">
        <tr><td style="padding:14px 16px;font-family:${FONT};">
          <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:${C.muted};font-weight:700;">${esc(rotulo)}</div>
          <div style="font-size:22px;font-weight:700;color:${C.text};padding-top:4px;">${esc(valor)}</div>
          <div style="font-size:11px;color:${C.muted};padding-top:2px;">${esc(sub)}</div>
        </td></tr>
      </table>
    </td>`;

  const filaObjetivo = o => {
    const m = metricaDe(o.nombre);
    const costo = ratio(o.spend, o[m.campo]);
    const partes = logros(o);
    const detalle = partes.length
      ? partes.map(p => `${count(p.valor)} <span style="color:${C.muted};font-size:11px;">${esc(unidad(p.valor, p.unidad))}</span>`).join('<br>')
      : `<span style="color:${C.muted};font-size:12px;">sin resultados</span>`;
    return `<tr>
      <td style="padding:9px 12px;border-top:1px solid ${C.border};font-family:${FONT};font-size:13px;color:${C.text};font-weight:600;">${esc(o.nombre)}</td>
      <td align="right" style="padding:9px 12px;border-top:1px solid ${C.border};font-family:${FONT};font-size:13px;color:${C.text};">${money(o.spend)}</td>
      <td align="right" style="padding:9px 12px;border-top:1px solid ${C.border};font-family:${FONT};font-size:13px;color:${C.text};line-height:1.5;">${detalle}</td>
      <td align="right" style="padding:9px 12px;border-top:1px solid ${C.border};font-family:${FONT};font-size:13px;color:${C.muted};">${costo == null ? '—' : money(costo)}</td>
    </tr>`;
  };

  const avisoHTML = a => {
    const t = TONO[a.tone] || TONO.blue;
    return `
    <tr><td style="padding:0 0 10px;">
      <table role="presentation" width="100%" style="border:1px solid ${t.bd};border-radius:10px;border-collapse:separate;background:${t.box};">
        <tr><td style="padding:12px 14px;font-family:${FONT};">
          <div style="font-size:13px;font-weight:700;color:${t.fg};">${esc(a.titulo)}</div>
          <div style="font-size:12px;color:${C.muted};padding-top:3px;line-height:1.5;">${esc(a.cuerpo)}</div>
        </td></tr>
      </table>
    </td></tr>`;
  };

  const htmlEmail = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:${C.bg};">
<table role="presentation" width="100%" style="background:${C.bg};"><tr><td align="center" style="padding:26px 12px;">
<table role="presentation" width="620" style="max-width:620px;">

  <tr><td style="padding:0 0 16px;font-family:${FONT};">
    <div style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:${C.muted};font-weight:700;">Lima Retail · Meta Ads</div>
    <div style="font-size:21px;font-weight:700;color:${C.text};padding-top:3px;">Amador · ${esc(nombreMes)}</div>
    <div style="font-size:12px;color:${C.muted};padding-top:3px;">Datos al día ${diaCorte} de ${diasMes}${completo ? ' · mes completo' : ''} · ${esc(NIVELES[nivel].label)}</div>
  </td></tr>

  <tr><td style="padding:0 0 14px;"><table role="presentation" width="100%"><tr>
    ${tarjeta('Inversión', money(K.spend), completo ? 'mes cerrado' : `cierre ${moneyCorto(gastoCierre)}`)}
    ${tarjeta('Reservas web', count(K.purchases), K.purchases ? `${money(ratio(K.spend, K.purchases))} c/u` : 'sin reservas')}
    ${tarjeta('Conversaciones', count(K.messages), K.messages ? `${money(ratio(K.spend, K.messages))} c/u` : '—')}
  </tr></table></td></tr>

  <tr><td style="padding:0 0 16px;">
    <table role="presentation" width="100%" style="border:1px solid ${C.border};border-radius:12px;border-collapse:separate;background:${C.card};">
      <tr>
        <td style="padding:11px 12px;font-family:${FONT};font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:${C.muted};font-weight:700;">Objetivo</td>
        <td align="right" style="padding:11px 12px;font-family:${FONT};font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:${C.muted};font-weight:700;">Inversión</td>
        <td align="right" style="padding:11px 12px;font-family:${FONT};font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:${C.muted};font-weight:700;">Resultado</td>
        <td align="right" style="padding:11px 12px;font-family:${FONT};font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:${C.muted};font-weight:700;">Costo</td>
      </tr>
      ${r.objetivos.map(filaObjetivo).join('')}
    </table>
  </td></tr>

  ${avisos.map(avisoHTML).join('')}

  <tr><td align="center" style="padding:18px 0 8px;">
    <a href="${URL_TABLERO}" style="display:inline-block;background:${C.brand};color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:9px;font-size:14px;font-weight:600;font-family:${FONT};">Ver el tablero de Amador</a>
  </td></tr>
  <tr><td align="center" style="padding:8px 0 0;font-size:11px;line-height:1.6;color:${C.muted};font-family:${FONT};">
    ${esc(config.workspace)} · alerta automática (${weekKey}): los lunes a las 7:00 a. m.<br>
    Descargas de Meta Ads de la carpeta de Drive de Amador; el cierre proyectado usa el ritmo del mes.
  </td></tr>

</table></td></tr></table></body></html>`;

  if (PREVIEW) {
    fs.writeFileSync(PREVIEW, htmlEmail, 'utf8');
    console.log(`\n🖼  Vista previa escrita en ${PREVIEW} (sin envío).\n`);
    return;
  }

  const subject = `${NIVELES[nivel].txt} · ${nombreMes} · ${count(K.purchases)} ${unidad(K.purchases, 'reservas')} y ${count(K.messages)} ${unidad(K.messages, 'conversaciones')} · ${moneyCorto(K.spend)} · Lima Retail`;

  const porDefecto = { lista: config.destinatarios || [], fuente: 'data/alertas-config.json' };
  const { lista, fuente: fuenteLista } = porDefecto;
  const para = lista.map(d => (d.nombre ? `${d.nombre} <${d.email}>` : d.email)).join(', ');

  if (DRY_RUN) {
    console.log('\n─────────────────────────────────────────');
    console.log('[DRY-RUN] Email que se enviaría:');
    console.log('  Asunto :', subject);
    console.log('  Para   :', para || '(nadie)', `· ${fuenteLista}`);
    console.log('  Tamaño :', Math.round(htmlEmail.length / 1024), 'KB');
    console.log('[DRY-RUN] Sin envíos reales. FIN.\n');
    return;
  }

  if (!lista.length) {
    console.log(`\n⏭  La lista de destinatarios está vacía (${fuenteLista}): no se envía.\n`);
    return;
  }

  const toList = lista.map(d => d.email);
  const smtp = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].every(name => process.env[name]);
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!smtp && !RESEND_KEY) {
    console.error('\n❌ Falta la configuración de envío: SMTP_HOST, SMTP_USER y SMTP_PASS, o RESEND_API_KEY.\n');
    process.exit(1);
  }

  console.log(`\n📧 Enviando a: ${para} (${fuenteLista})`);
  console.log(`   Asunto: ${subject}`);

  function registrarEnvio() {
    if (MOTIVO !== 'datos') enviosData.enviados[weekKey] = new Date().toISOString();
    enviosData.ultimaHuella = huella;
    enviosData.ultimoEnvio = { fecha: new Date().toISOString(), motivo: MOTIVO, mes: nombreMes };
    fs.writeFileSync(enviosPath, JSON.stringify(enviosData, null, 2) + '\n', 'utf8');
    console.log(`📝 Registrado en alertas-envios.json: ${MOTIVO === 'datos' ? 'datos actualizados' : weekKey}\n`);
  }

  if (smtp) {
    const nodemailer = require('nodemailer');
    const port = Number(process.env.SMTP_PORT) || 465;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port, secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    // El remitente es la misma cuenta que se autentica: los hostings rechazan un "From" de otra cuenta.
    const from = /@/.test(process.env.SMTP_USER) ? process.env.SMTP_USER : config.from_email;
    const info = await transporter.sendMail({ from: `${config.from_name} <${from}>`, to: toList, subject, html: htmlEmail });
    console.log(`\n✅ Email enviado por el correo del hosting (${process.env.SMTP_HOST}). ID: ${info.messageId || '(sin id)'}`);
    registrarEnvio();
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${config.from_name} <${config.from_email}>`, to: toList, subject, html: htmlEmail }),
  });
  const body = await res.json().catch(() => res.text());
  if (!res.ok) {
    console.error(`\n❌ Error Resend ${res.status}:`, JSON.stringify(body, null, 2));
    process.exit(1);
  }
  console.log(`\n✅ Email enviado. Resend ID: ${body.id || '(desconocido)'}`);
  registrarEnvio();
})().catch(error => {
  console.error('\n❌ Error fatal:', error.message);
  process.exit(1);
});
