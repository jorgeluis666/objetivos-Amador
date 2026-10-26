// Web App del modulo Gasto publicitario de Amador. Proyecto independiente de script.google.com (no vinculado a una
// hoja), publicado por la cuenta que tiene acceso a la carpeta de descargas de Meta.
// Al cambiar este archivo: pegarlo en el proyecto y Implementar > Administrar implementaciones > editar > Nueva version.
//
// Carpeta de datos: un Google Sheet por mes con la descarga de Meta Ads ("Raw Data Report": una fila por
// dia x edad x sexo x anuncio), nombrado "Amador - Octubre 2026". Su ID NO va en este archivo (el repo es publico):
// se carga en Configuracion del proyecto > Propiedades del script como DATA_FOLDER_ID.
// GET ?action=data -> ultimo barrido (o uno nuevo si la carpeta cambio) | ?action=data&fresh=1 -> barrido en el
// momento (boton Actualizar). Disparador: cada hora (installSweepTriggers).
const DATA_FOLDER_PROPERTY = 'DATA_FOLDER_ID';
// Carpeta «05 Artes» de la marca, opcional: sin ella el barrido va igual, solo sin piezas.
const ARTES_FOLDER_PROPERTY = 'ARTES_FOLDER_ID';
const TIMEZONE = 'America/Lima';
const SWEEP_HOUR = 10;
const SWEEP_HANDLER = 'sweepScheduled';
const SNAPSHOT_PROPERTY = 'SNAPSHOT_FILE_ID';
const SNAPSHOT_NAME = 'Amador - barrido del tablero.json';
// Subirla al cambiar aggregateRaw_, toDay_, toNumber_, RAW_COLUMNS, OUTPUT_COLUMNS o TIMEZONE: los meses
// guardados con otra version se vuelven a leer aunque su archivo no haya cambiado.
const SWEEP_VERSION = 1;
const MANUAL_THROTTLE_MS = 60 * 1000;
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MONTH_PATTERNS = [
  /\bene(?:ro)?\b/, /\bfeb(?:rero)?\b/, /\bmar(?:zo)?\b/, /\babr(?:il)?\b/, /\bmay(?:o)?\b/, /\bjun(?:io)?\b/,
  /\bjul(?:io)?\b/, /\bago(?:sto)?\b/, /\bse(?:pt?|t)(?:iembre)?\b/, /\boct(?:ubre)?\b/, /\bnov(?:iembre)?\b/, /\bdic(?:iembre)?\b/,
];
// Cabeceras de la descarga de Meta (normalizadas: minusculas y sin tildes). Meta renombra algunas entre
// descargas (Octubre 2026: "Importe gastado" pasa a "Monto gastado"): se acepta cualquiera de la lista.
const RAW_COLUMNS = {
  day: ['dia'],
  ad: ['nombre del anuncio'],
  spend: ['importe gastado (pen)', 'monto gastado (pen)'],
  impressions: ['impresiones'],
  reach: ['alcance'],
  clicks: ['clics en el enlace'],
  objective: ['objetivo'],
  resultType: ['tipo de resultado'],
  results: ['resultados'],
  messages: ['conversaciones con mensajes iniciadas'],
  purchases: ['compras'],
  campaign: ['nombre de la campana'],
  adSet: ['nombre del conjunto de anuncios'],
  preview: ['enlace de vista previa'],
};
const REQUIRED_RAW = ['day', 'ad', 'spend', 'impressions', 'reach', 'results', 'campaign'];
const SUM_FIELDS = ['spend', 'impressions', 'reach', 'clicks', 'results', 'messages', 'purchases'];
// Filas que devuelve el Web App: una por dia x campana x conjunto x anuncio (se suman edad y sexo).
const OUTPUT_COLUMNS = ['day', 'campaign', 'adSet', 'ad', 'objective', 'resultType'].concat(SUM_FIELDS, ['preview']);

function doGet(event) {
  try {
    const params = (event && event.parameter) || {};
    if (params.action !== 'data') throw new Error('Accion no soportada.');
    let snapshot = params.fresh === '1' ? sweep_('manual') : readSnapshot_();
    if (!snapshot) snapshot = sweep_('inicial');
    // Una descarga subida despues del ultimo barrido (Meta se sube a media manana, despues del de las 10:00) se lee
    // al abrir el tablero, sin esperar al disparador ni al boton Actualizar.
    else if (params.fresh !== '1' && changedSafely_(snapshot)) snapshot = sweep_('archivo nuevo');
    return json_(Object.assign({ ok: true }, snapshot));
  } catch (error) {
    console.error(error);
    return json_({ ok: false, error: 'No se pudo leer la carpeta de datos.' });
  }
}

// Disparador de cada hora: solo barre si la carpeta cambio desde el ultimo barrido; el de las 10:00 barre siempre
// (relee el mes anterior, que Meta completa los primeros dias, aunque Drive no cambie su fecha de edicion).
function sweepScheduled() {
  const hour = Number(Utilities.formatDate(new Date(), TIMEZONE, 'H'));
  const previous = readSnapshot_();
  if (hour === SWEEP_HOUR || !previous || folderChangedSince_(previous)) sweep_('automatico');
}

// Ejecutar UNA vez a mano (y otra vez si cambia el horario). Borra los disparadores anteriores del barrido para
// no duplicarlos.
function installSweepTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === SWEEP_HANDLER)
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger(SWEEP_HANDLER).timeBased().everyHours(1).inTimezone(TIMEZONE).create();
  logSnapshot_(sweep_('instalacion'));
}

// Si no se puede revisar la carpeta se sirve el barrido guardado (es lo que habia antes de esta revision).
function changedSafely_(snapshot) {
  try {
    return folderChangedSince_(snapshot);
  } catch (error) {
    console.error(error);
    return false;
  }
}

// La carpeta cambio si algun Google Sheet se creo o se edito despues del barrido, o si el barrido trae un archivo
// que ya no esta (se borro o se reemplazo por otro).
function folderChangedSince_(snapshot) {
  const sweptAt = Date.parse(snapshot.sweptAt) || 0;
  const files = DriveApp.getFolderById(dataFolderId_()).getFilesByType(MimeType.GOOGLE_SHEETS);
  const present = {};
  let changed = false;
  while (files.hasNext()) {
    const file = files.next();
    if (file.isTrashed()) continue;
    present[file.getId()] = true;
    if (file.getLastUpdated().getTime() > sweptAt) changed = true;
  }
  return changed || (snapshot.months || []).some(month => month.fileId && !present[month.fileId]);
}

// Barrido manual desde el editor, para revisar que los archivos se leen bien.
function probarBarrido() {
  logSnapshot_(sweep_('prueba'));
}

function logSnapshot_(snapshot) {
  console.log('Barrido ' + snapshot.origin + ' ' + snapshot.sweptAt + ' | cada hora si cambia la carpeta y siempre a las ' + SWEEP_HOUR + ':00 (' + TIMEZONE + ')');
  snapshot.months.forEach(month => {
    if (month.error) {
      console.log(month.name + ' ' + month.year + ': ERROR ' + month.error);
      return;
    }
    const duplicates = month.duplicates.length ? ' | duplicados: ' + month.duplicates.join(', ') : '';
    if (!month.rows.length) {
      console.log(month.name + ' ' + month.year + ': sin filas con fecha valida' + duplicates);
      return;
    }
    const index = name => month.columns.indexOf(name);
    const sum = name => month.rows.reduce((total, row) => total + row[index(name)], 0);
    const days = month.rows.map(row => row[index('day')]).sort();
    console.log(month.name + ' ' + month.year + ': ' + month.rows.length + ' filas, gasto S/ ' + sum('spend').toFixed(2) +
      ', mensajes ' + sum('messages') + ', del ' + days[0] + ' al ' + days[days.length - 1] + duplicates);
  });
  snapshot.ignored.forEach(item => console.log('Ignorado: ' + item.fileName + ' -> ' + item.reason));
}

function sweep_(origin) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const previous = readSnapshot_();
    // Dos pedidos seguidos (dos personas abren el tablero a la vez) comparten el barrido del primero.
    if ((origin === 'manual' || origin === 'archivo nuevo') && previous && Date.now() - Date.parse(previous.sweptAt) < MANUAL_THROTTLE_MS) return previous;
    const data = readMonths_(previous);
    const snapshot = { version: SWEEP_VERSION, sweptAt: new Date().toISOString(), origin, months: data.months, ignored: data.ignored, artes: readArtes_() };
    writeSnapshot_(snapshot);
    return snapshot;
  } finally {
    lock.releaseLock();
  }
}

function dataFolderId_() {
  const id = PropertiesService.getScriptProperties().getProperty(DATA_FOLDER_PROPERTY);
  if (!id) throw new Error('Falta la propiedad del script ' + DATA_FOLDER_PROPERTY + ' (ID de la carpeta de descargas de Meta).');
  return id.trim();
}

// ── Artes ────────────────────────────────────────────────────────────────
// La carpeta «05 Artes» de la marca: dentro va una subcarpeta por campaña y mes («Amador Eventos -
// Octubre») con las piezas, nombradas **igual que el anuncio en Meta** salvo la extension. Esa
// igualdad es todo el emparejamiento: «OFRENDA - Video.mp4» es la pieza del anuncio «OFRENDA - Video».
//
// La propiedad es opcional: sin ella el barrido sigue igual y el reporte muestra el formato en lugar
// del arte. Un error leyendo la carpeta tampoco tumba el barrido, que es lo que trae los numeros.
function artesFolderId_() {
  const id = PropertiesService.getScriptProperties().getProperty(ARTES_FOLDER_PROPERTY);
  return id ? id.trim() : '';
}

// Ejecutar UNA vez a mano, desde el editor, y solo si se decide que las piezas se vean en el reporte.
// Drive sirve la miniatura (drive.google.com/thumbnail) unicamente si el archivo se puede abrir por
// enlace; con la carpeta compartida solo por correo responde con su pagina de acceso y la tarjeta cae
// al recuadro con el formato.
//
// Abre en modo LECTOR y solo la carpeta de artes, que es la que indica ARTES_FOLDER_ID: las demas
// carpetas de la marca siguen como estan. Las subcarpetas heredan, no hay que tocarlas una por una.
// Para cerrarla de nuevo: cerrarArtes().
function abrirArtesPorEnlace() {
  const id = artesFolderId_();
  if (!id) throw new Error('Falta la propiedad del script ' + ARTES_FOLDER_PROPERTY + '.');
  const folder = DriveApp.getFolderById(id);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  Logger.log('«%s» queda visible para cualquier persona con el enlace (solo lectura).', folder.getName());
}

function cerrarArtes() {
  const id = artesFolderId_();
  if (!id) throw new Error('Falta la propiedad del script ' + ARTES_FOLDER_PROPERTY + '.');
  const folder = DriveApp.getFolderById(id);
  folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
  Logger.log('«%s» vuelve a estar restringida a quien tenga acceso directo.', folder.getName());
}

function readArtes_() {
  const id = artesFolderId_();
  if (!id) return null;
  try {
    const root = DriveApp.getFolderById(id);
    const piezas = {};
    addArtesOf_(root, '', piezas);
    const campaigns = root.getFolders();
    while (campaigns.hasNext()) {
      const campaign = campaigns.next();
      if (campaign.isTrashed()) continue;
      addArtesOf_(campaign, campaign.getName(), piezas);
    }
    return { folder: { id: root.getId(), name: root.getName() }, piezas: piezas, error: null };
  } catch (error) {
    console.error(error);
    return { folder: null, piezas: {}, error: 'No se pudo leer la carpeta de artes: ' + error.message };
  }
}

function addArtesOf_(folder, campana, piezas) {
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (file.isTrashed()) continue;
    const mime = String(file.getMimeType() || '');
    const tipo = mime.indexOf('video/') === 0 ? 'video' : mime.indexOf('image/') === 0 ? 'imagen' : '';
    if (!tipo) continue;
    const clave = arteKey_(file.getName());
    // La primera que aparece se queda: una pieza repetida en dos meses es la misma pieza.
    if (!clave || piezas[clave]) continue;
    piezas[clave] = { tipo: tipo, nombre: file.getName(), campana: campana, id: file.getId() };
  }
}

// La clave con la que se emparejan pieza y anuncio: sin tildes, sin extension y sin nada que no sea
// letra o numero, porque «OFRENDA - Estático.jpeg» y «Ofrenda   Estatico» son el mismo anuncio.
function arteKey_(name) {
  return String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\.[A-Za-z0-9]{2,5}$/, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Un archivo por mes: si hay varios del mismo mes se usa el editado mas recientemente y se avisa.
// Un mes ya cerrado cuyo archivo no cambio desde el barrido anterior reutiliza sus filas sin abrir la hoja.
function readMonths_(previous) {
  const files = DriveApp.getFolderById(dataFolderId_()).getFiles();
  const byMonth = {};
  const ignored = [];
  while (files.hasNext()) {
    const file = files.next();
    if (file.isTrashed()) continue;
    if (file.getMimeType() !== MimeType.GOOGLE_SHEETS) {
      ignored.push({ fileName: file.getName(), reason: 'No es un Google Sheet (Archivo > Guardar como Hojas de calculo de Google).' });
      continue;
    }
    const period = detectPeriod_(file.getName());
    if (!period) {
      ignored.push({ fileName: file.getName(), reason: 'El nombre no indica mes y ano.' });
      continue;
    }
    const current = byMonth[period.key];
    if (!current) byMonth[period.key] = { period, file, duplicates: [] };
    else if (file.getLastUpdated() > current.file.getLastUpdated()) {
      current.duplicates.push(current.file.getName());
      current.file = file;
    } else current.duplicates.push(file.getName());
  }
  // Meses del barrido anterior que se leyeron bien, por archivo.
  const before = {};
  ((previous && previous.months) || []).forEach(month => { if (!month.error) before[month.fileId] = month; });
  const sameVersion = Boolean(previous && previous.version === SWEEP_VERSION);
  const recentKey = previousMonthKey_();
  const months = Object.keys(byMonth).sort().map(key => {
    const { period, file, duplicates } = byMonth[key];
    const entry = {
      name: MONTHS[period.month - 1], year: period.year, month: period.month,
      fileId: file.getId(), fileName: file.getName(), modifiedTime: file.getLastUpdated().toISOString(),
      duplicates, columns: OUTPUT_COLUMNS, rows: [], error: null,
    };
    const old = before[entry.fileId];
    const unchanged = Boolean(old && old.modifiedTime === entry.modifiedTime && Array.isArray(old.rows) && Array.isArray(old.columns));
    // El mes en curso y el anterior se releen siempre: el anterior se completa los primeros dias del mes y
    // Drive tarda en actualizar la fecha de edicion de un Sheet.
    if (unchanged && sameVersion && key < recentKey && JSON.stringify(old.columns) === JSON.stringify(OUTPUT_COLUMNS)) {
      entry.rows = old.rows;
      return entry;
    }
    try {
      const spreadsheet = SpreadsheetApp.openById(file.getId());
      entry.rows = aggregateRaw_(rawValues_(spreadsheet), spreadsheet.getSpreadsheetTimeZone());
    } catch (error) {
      if (unchanged && old.rows.length) {
        // El archivo no cambio desde el barrido anterior: un fallo pasajero de Google no borra sus filas.
        console.error(entry.fileName + ': ' + error);
        entry.columns = old.columns;
        entry.rows = old.rows;
      } else {
        entry.error = String((error && error.message) || error);
      }
    }
    return entry;
  });
  return { months, ignored };
}

// Mes anterior al de hoy en Lima ('yyyy-MM'): ese y los siguientes no se reutilizan del barrido anterior.
function previousMonthKey_() {
  const [year, month] = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-M').split('-').map(Number);
  return month === 1 ? (year - 1) + '-12' : year + '-' + String(month - 1).padStart(2, '0');
}

// La pestana con la descarga es la que tiene las cabeceras "Dia" e "Importe gastado (PEN)" (o "Monto gastado").
function rawValues_(spreadsheet) {
  const sheets = spreadsheet.getSheets();
  for (let i = 0; i < sheets.length; i += 1) {
    const values = sheets[i].getDataRange().getValues();
    const headerRow = values.findIndex(row => row.some(cell => isColumn_('day', cell)) && row.some(cell => isColumn_('spend', cell)));
    if (headerRow >= 0) return values.slice(headerRow);
  }
  throw new Error('No se encontro la descarga de Meta (columnas "Dia" e "Importe gastado (PEN)" o "Monto gastado (PEN)").');
}

function isColumn_(key, cell) {
  return RAW_COLUMNS[key].indexOf(normalize_(cell)) >= 0;
}

// Suma edad y sexo. El alcance sumado es aproximado: Meta no permite sumar personas unicas entre filas.
function aggregateRaw_(values, timeZone) {
  const headers = values[0].map(cell => normalize_(cell));
  const col = {};
  Object.keys(RAW_COLUMNS).forEach(key => { col[key] = headers.findIndex(cell => RAW_COLUMNS[key].indexOf(cell) >= 0); });
  const missing = REQUIRED_RAW.filter(key => col[key] < 0).map(key => RAW_COLUMNS[key].join(' / '));
  if (missing.length) throw new Error('Faltan columnas: ' + missing.join(', '));

  // Cada fecha se repite en miles de filas (edad x sexo x anuncio): se formatea una sola vez.
  const days = new Map();
  const dayOf = value => {
    if (!(value instanceof Date)) return toDay_(value, timeZone);
    const time = value.getTime();
    if (!days.has(time)) days.set(time, toDay_(value, timeZone));
    return days.get(time);
  };

  const groups = {};
  values.slice(1).forEach(row => {
    const day = dayOf(row[col.day]);
    if (!day) return;
    const text = key => (col[key] < 0 ? '' : String(row[col[key]] || '').trim());
    const key = [day, text('campaign'), text('adSet'), text('ad')].join('|');
    let group = groups[key];
    if (!group) {
      group = groups[key] = { day, campaign: text('campaign'), adSet: text('adSet'), ad: text('ad'), objective: '', resultType: '', preview: '' };
      SUM_FIELDS.forEach(field => { group[field] = 0; });
    }
    if (!group.objective) group.objective = text('objective');
    if (!group.resultType) group.resultType = text('resultType');
    if (!group.preview && /^https:\/\//.test(text('preview'))) group.preview = text('preview');
    SUM_FIELDS.forEach(field => { group[field] += col[field] < 0 ? 0 : toNumber_(row[col[field]]); });
  });

  return Object.keys(groups).sort().map(key => {
    const group = groups[key];
    group.spend = Math.round(group.spend * 100) / 100;
    return OUTPUT_COLUMNS.map(field => group[field]);
  });
}

// Una celda de fecha llega como Date: se formatea en la zona de la hoja para no correr el dia.
function toDay_(value, timeZone) {
  if (value instanceof Date) return Utilities.formatDate(value, timeZone || TIMEZONE, 'yyyy-MM-dd');
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[0] : null;
}

function toNumber_(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const number = Number(String(value || '').replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : 0;
}

// Si el nombre no trae ano se asume el ano en curso; si ese mes aun no llega, el ano anterior.
function detectPeriod_(name) {
  const text = normalize_(name)
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[_.\-]+/g, ' ')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2');
  const monthIndex = earliestMonth_(text);
  if (monthIndex < 0) return null;
  const yearMatch = text.match(/\b(20\d{2})\b/);
  let year = yearMatch ? Number(yearMatch[1]) : null;
  if (!year) {
    const now = new Date();
    const currentYear = Number(Utilities.formatDate(now, TIMEZONE, 'yyyy'));
    const currentMonth = Number(Utilities.formatDate(now, TIMEZONE, 'M'));
    year = monthIndex + 1 > currentMonth ? currentYear - 1 : currentYear;
  }
  return { key: year + '-' + String(monthIndex + 1).padStart(2, '0'), year, month: monthIndex + 1 };
}

// Si el nombre trae varias palabras de mes, gana la que aparece primero en el texto. Acepta "Setiembre".
function earliestMonth_(text) {
  let best = -1;
  let position = Infinity;
  MONTH_PATTERNS.forEach((pattern, index) => {
    const match = text.match(pattern);
    if (match && match.index < position) {
      best = index;
      position = match.index;
    }
  });
  return best;
}

function snapshotFile_() {
  const id = PropertiesService.getScriptProperties().getProperty(SNAPSHOT_PROPERTY);
  if (!id) return null;
  try {
    const file = DriveApp.getFileById(id);
    return file.isTrashed() ? null : file;
  } catch (error) {
    return null;
  }
}

function readSnapshot_() {
  const file = snapshotFile_();
  if (!file) return null;
  try {
    const snapshot = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
    // Un barrido guardado con otro formato (sin columnas, o de antes de los artes) se descarta y se
    // vuelve a leer: asi las piezas aparecen en el primer pedido despues de implementar, sin esperar
    // al disparador de las 10:00.
    const completo = snapshot.months && snapshot.months.every(month => month.columns) && 'artes' in snapshot;
    return completo ? snapshot : null;
  } catch (error) {
    return null;
  }
}

// El JSON del barrido queda en Mi unidad de la cuenta que publica, fuera de la carpeta de datos.
function writeSnapshot_(snapshot) {
  const content = JSON.stringify(snapshot);
  const file = snapshotFile_();
  if (file) {
    file.setContent(content);
    return;
  }
  const created = DriveApp.createFile(SNAPSHOT_NAME, content, MimeType.PLAIN_TEXT);
  PropertiesService.getScriptProperties().setProperty(SNAPSHOT_PROPERTY, created.getId());
}

function normalize_(value) {
  return String(value == null ? '' : value).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
