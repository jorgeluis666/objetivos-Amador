/**
 * Web App de SOLO LECTURA para el boton "Validar sincronizacion" del Archivo de Reportes.
 * Va en el archivo "Validar Drive.gs" del proyecto de Apps Script "Distribucion Amador".
 *
 * Seguridad:
 * - La carpeta esta fija aqui: la peticion no puede pedir otra carpeta de la cuenta.
 * - Solo acepta action=listDriveFolder; no hay doPost ni escritura de ningun tipo.
 * - Devuelve unicamente id, nombre, tipo, peso y fechas (sin duenos, enlaces ni contenido).
 * - Limite de peticiones por minuto y cache de 60 s para que no se abuse de la cuota de Drive.
 * - Los errores internos se registran en el log y al cliente solo le llega un mensaje generico.
 */
const AMADOR_REPORTS_FOLDER_ID = '1zqSfc2MlfsWYd3rfYgFWBgQwbrz6-R2b';
const AMADOR_REPORTS_MAX_PER_MINUTE = 30;
const AMADOR_REPORTS_CACHE_KEY = 'amador_reports_listing_v1';
const AMADOR_REPORTS_CACHE_SECONDS = 60;

function doGet(event) {
  const params = (event && event.parameter) || {};
  if (params.action !== 'listDriveFolder') {
    return respuestaJsonReportes_({ ok: false, error: 'Solicitud no valida.' });
  }
  if (!dentroDelLimiteReportes_()) {
    return respuestaJsonReportes_({ ok: false, error: 'Demasiadas solicitudes; intenta en un minuto.' });
  }
  try {
    return respuestaJsonReportes_({ ok: true, result: listarCarpetaReportes_() });
  } catch (error) {
    console.error('listDriveFolder', error);
    return respuestaJsonReportes_({ ok: false, error: 'No se pudo leer la carpeta.' });
  }
}

function dentroDelLimiteReportes_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) return false;
  try {
    const cache = CacheService.getScriptCache();
    const key = 'amador_reports_rate_' + Math.floor(Date.now() / 60000);
    const count = Number(cache.get(key) || 0);
    if (count >= AMADOR_REPORTS_MAX_PER_MINUTE) return false;
    cache.put(key, String(count + 1), 120);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function listarCarpetaReportes_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(AMADOR_REPORTS_CACHE_KEY);
  if (cached) return JSON.parse(cached);

  const folder = DriveApp.getFolderById(AMADOR_REPORTS_FOLDER_ID);
  const files = [];
  const iterator = folder.getFiles();
  while (iterator.hasNext()) {
    const file = iterator.next();
    if (file.isTrashed()) continue;
    files.push({
      id: file.getId(),
      title: file.getName(),
      mimeType: file.getMimeType(),
      sizeBytes: file.getSize(),
      createdTime: file.getDateCreated().toISOString(),
      modifiedTime: file.getLastUpdated().toISOString(),
    });
  }
  const result = { folder: { id: folder.getId() }, checkedAt: new Date().toISOString(), files };
  try {
    cache.put(AMADOR_REPORTS_CACHE_KEY, JSON.stringify(result), AMADOR_REPORTS_CACHE_SECONDS);
  } catch (error) {
    // La cache admite hasta 100 KB por clave; si el listado crece mas, simplemente no se guarda.
  }
  return result;
}

function respuestaJsonReportes_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
