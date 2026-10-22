(function () {
  const DATA_URL = 'data/amador-ads-2026.json';
  // Copias de las pestanas mensuales de la hoja (respaldo si Google no responde). El build incrusta todas las
  // data/amador-<mes>-sheet-2026.json como window.AMADOR_SHEET_MONTHS; esta lista solo se usa en desarrollo.
  const SHEET_FILES = [[2026, 'june'], [2026, 'july'], [2026, 'august'], [2026, 'september']]
    .map(([year, month]) => ({ year, url: `data/amador-${month}-sheet-${year}.json` }));
  // Primer mes que se lee de las pestanas de la hoja. Una pestana sin año en el nombre ("Junio", "Octubre ") es del
  // primer año en que ese mes cae desde aqui: junio a diciembre de 2026 y enero a mayo de 2027. Desde entonces el año
  // va en el nombre ("Junio 2027"), porque la hoja no admite dos pestanas con el mismo nombre.
  const SHEET_START = '2026-06';
  const SHEET_START_YEAR = Number(SHEET_START.slice(0, 4));
  // Otros nombres de mes que se aceptan en una pestana (indice 0-11).
  const MONTH_ALIASES = { 8: ['setiembre'] };
  const SHEET_ID = '1Lj5rEepYZhHlf-VyGJwRYVMqnpWLu9lg3oL6wes3o-s';
  // CSV de una pestana: por su gid (exacto) o, si no se pudo leer la lista de pestanas, por su nombre.
  const liveCsvUrl = tab => `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&${tab.gid ? `gid=${encodeURIComponent(tab.gid)}` : `sheet=${encodeURIComponent(tab.name)}`}`;
  // Vista publicada de la hoja: trae el nombre y el gid de cada pestana.
  const SHEET_LIST_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/htmlview`;
  // Gasto, mensajes y anuncios salen de las descargas de Meta (un Google Sheet por mes en Drive) que barre el Web App
  // de scripts/meta-drive-sync.gs; las reservas siguen saliendo de la hoja. El build incrusta el ultimo barrido
  // (window.AMADOR_META_DATA) y la URL del Web App (window.AMADOR_DATA_ENDPOINT, secret DATA_ENDPOINT). Sin barrido
  // los meses salen enteros de la hoja, como antes. En desarrollo se lee la copia local data/amador-meta.json.
  const META_DATA_URL = 'data/amador-meta.json';
  const META_ENDPOINT_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;
  const META_ENDPOINT = META_ENDPOINT_RE.test(String(window.AMADOR_DATA_ENDPOINT || '')) ? window.AMADOR_DATA_ENDPOINT : '';
  // Columna "Objetivo" de Meta -> cuadro del tablero (Reservas, Mensajes, Branding). Uno que no esta aqui arma su cuadro.
  const META_OBJECTIVE_GROUPS = [
    { label: 'Reservas', match: /^(ventas|clientes potenciales|trafico|conversiones|reservas?)$/ },
    { label: 'Mensajes', match: /^(interaccion|mensajes?)$/ },
    { label: 'Branding', match: /^(reconocimiento|alcance|notoriedad|reproducciones de video)$/ },
  ];
  // Reservas de la hoja cuya campana no aparece en Meta (nombre distinto): se suman en una sola fila del mes.
  const UNMATCHED_RESERVATIONS = 'Reservas de la hoja sin campaña en Meta';
  const SYNC_INTERVAL_MS = 60 * 60 * 1000;
  // Al volver a la pestana del navegador solo se relee si la ultima lectura tiene mas de 5 minutos.
  const VISIBILITY_REFETCH_MS = 5 * 60 * 1000;
  const FETCH_TIMEOUT_MS = 30 * 1000;
  // Objetivo Reservas editado en el tablero, por mes y campana ("2026-09::Campana"). v1 no tenia el mes.
  const GOALS_KEY = 'amador-reservation-goals-v2';
  const LEGACY_GOALS_KEY = 'amador-reservation-goals-v1';
  const TABLE_COMPACT_KEY = 'amador-campaigns-compact-v1';
  // Minimizado de cada cuadro de objetivo (y, desde el grafico por cuadro, sus indicadores).
  const CAMPAIGN_BLOCKS_KEY = 'amador-campaign-charts-v1';
  const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>';
  const OBJECTIVES = [
    { key: 'reservas', label: 'Reservas', match: /reserva/, color: '#ea580c' },
    { key: 'mensajes', label: 'Mensajes', match: /mensaje/, color: '#16a34a' },
    { key: 'branding', label: 'Branding', match: /reconocimiento|thruplay|branding|alcance|notoriedad/, color: '#7c3aed' },
  ];
  const FALLBACK_COLORS = ['#0891b2', '#4f46e5', '#b45309', '#be123c'];
  const otherObjectives = new Map();
  // KPIs de cada cuadro, con su variacion contra el mes anterior al lado del valor.
  const BLOCK_KPIS = [
    { key: 'spend', label: 'Inversión', format: 'money', better: null },
    { key: 'messages', label: 'Mensajes', format: 'count', better: 'up' },
    { key: 'costPerMessage', label: 'Costo por mensaje', format: 'money', better: 'down' },
    { key: 'reservations', label: 'Reservas', format: 'count', better: 'up' },
    { key: 'costPerReservation', label: 'Costo por reserva', format: 'money', better: 'down' },
  ];
  // Historico: pestana "Todos" (todas las campanas) y filtro por estado.
  const HISTORY_ALL = 'todos';
  const HISTORY_STATUS = [
    { key: 'todas', label: 'Todas', one: 'campaña', many: 'campañas' },
    { key: 'activas', label: 'Activas', one: 'campaña activa', many: 'campañas activas' },
    { key: 'finalizadas', label: 'Finalizadas', one: 'campaña finalizada', many: 'campañas finalizadas' },
  ];
  // Indicadores del grafico de cada cuadro (todos por mes). Los costos salen de sumar gasto y resultados del mes
  // (sin resultados, hueco). combineColor: el de su linea cuando los indicadores van juntos en un solo cuadro.
  const BLOCK_METRICS = [
    { key: 'spend', label: 'Inversión', unit: 'money', combineColor: '#2563eb' },
    { key: 'messages', label: 'Mensajes', unit: 'count', combineColor: '#16a34a' },
    { key: 'reservations', label: 'Reservas', unit: 'count', combineColor: '#ea580c' },
    { key: 'costPerMessage', label: 'Costo por mensaje', unit: 'money', combineColor: '#0f766e' },
    { key: 'costPerReservation', label: 'Costo por reserva', unit: 'money', combineColor: '#db2777' },
  ];
  // URL del Web App de scripts/google-sheets-sync.gs; vacio = la edicion de objetivos queda solo local.
  // URL del Web App que escribe el Objetivo Reservas en la hoja (scripts/google-sheets-sync.gs). La incrusta el
  // build desde el secret SHEET_SYNC_ENDPOINT, solo dentro del HTML cifrado: no vive en el repo, que es publico.
  const SHEET_SYNC_ENDPOINT = window.AMADOR_SHEET_SYNC_ENDPOINT || '';
  const SHEET_SYNC_ENDPOINT_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;
  const CHART_COLLAPSED_KEY = 'amador-chart-collapsed-v1';
  const { MONTHS, SHORT_MONTHS, esc, safeUrl, fmt, change, hasActivity, limaParts, monthKey, daysInMonth, formatStamp, keepFocus } = window.AmadorShared;
  // Pestana "Anual" junto a las de mes: acumula los meses del año con datos.
  const YEAR_KEY = 'anual';
  // Resumen ejecutivo. better: hacia donde una variacion es buena (null = neutra). perMonth: en la vista anual se
  // muestra su promedio mensual.
  const KPIS = [
    { key: 'spend', label: 'Inversión', hint: 'Gasto total', better: null, format: 'money', perMonth: true },
    { key: 'messages', label: 'Mensajes', hint: 'Conversaciones iniciadas', better: 'up', format: 'count', perMonth: true },
    { key: 'costPerMessage', label: 'Costo por mensaje', hint: 'Inversión / mensajes', better: 'down', format: 'money' },
    { key: 'reservations', label: 'Reservas', hint: 'Conversiones de reserva', better: 'up', format: 'count', perMonth: true },
    { key: 'costPerReservation', label: 'Costo por reserva', hint: 'Inversión / reservas', better: 'down', format: 'money' },
  ];
  const REQUIRED_HEADERS = ['Tipo','Campaña','Anuncio','Objetivo','Reservas','Objetivo Reservas','Mensajes','Costo por mensaje','Costo por reserva','Ratio de reservas','Estado','Fecha de inicio','Fecha de fin','Duración (días)','Días restantes','Importe diario','Presupuesto total x campaña','Gasto x Campaña','Saldo por campaña','Proyección real de gasto mesual'];
  const OPTIONAL_HEADERS = ['Nuevo ppto diario','Observaciones','Vista previa','Conjunto de anuncios'];
  const AD_BUDGET_HEADERS = ['Presupuesto total x anuncio','Presupuesto total x conjunto'];
  const AD_SPENT_HEADERS = ['Gasto x Anuncio','Gasto x conjunto'];
  const AD_BALANCE_HEADERS = ['Saldo x anuncio','Saldo x conjunto'];
  const SERIES = {
    investment: { label: 'Inversion', unit: 'money', color: '#2563eb', fill: 'rgba(37,99,235,.11)' },
    messages: { label: 'Mensajes', unit: 'count', color: '#16a34a', fill: 'rgba(22,163,74,.10)' },
    reservations: { label: 'Reservas', unit: 'count', color: '#ea580c', fill: 'rgba(234,88,12,.10)' },
    // Costos del mes: gasto / resultados con la misma regla que los KPIs; sin resultados, hueco.
    costPerMessage: { label: 'Costo por mensaje', unit: 'money', color: '#0f766e', fill: 'rgba(15,118,110,.10)' },
    costPerReservation: { label: 'Costo por reserva', unit: 'money', color: '#db2777', fill: 'rgba(219,39,119,.10)' },
  };
  const CHART_SERIES_KEY = 'amador-chart-series-v1';
  // Grafico de la cuenta con varios indicadores en un solo cuadro (en vez de paneles apilados).
  const CHART_COMBINED_KEY = 'amador-chart-combined-v1';
  // monthKey: pestana elegida (YYYY-MM o anual); month: nombre del mes que muestran la tabla de campanas y sus
  // ediciones locales. current: lectura en vivo en curso. liveSheets: pestanas leidas en la ultima lectura.
  const state = {
    // charts: graficos de Chart.js vivos ("global" y uno por cuadro, "block:<objetivo>").
    // monthPicked: el usuario eligio una pestana; si no, la vista sigue al ultimo mes con datos (uno nuevo que
    // llega con la lectura en vivo se muestra solo). year: año de la vista anual. month: clave del mes de la tabla de
    // campanas (para sus filas agregadas a mano). chartYear: año que dibuja el grafico mensual de la cuenta.
    // sheetData: meses de la hoja (copias y lectura en vivo); meta: ultimo barrido de Meta; data: lo que se muestra,
    // los meses del barrido con las reservas de la hoja y el resto tal como viene de la hoja (composeData).
    sheetData: null, meta: null, metaError: '', metaSync: null,
    data: null, types: readChartSeries(), monthKey: null, monthPicked: false, year: null, month: null, chartYear: null, charts: new Map(), syncTimer: null, nextSync: 0, goals: {},
    chartCollapsed: readChartCollapsed(), chartCombined: readFlag(CHART_COMBINED_KEY), lastSync: null, lastFetch: 0, current: null, liveSheets: [], error: '', tabWarning: '', tabMissing: '', goalNote: '',
    // Tabla de anuncios: densidad, pantalla completa (las pestanas de mes vuelven a tabsHome) y filtro por objetivo.
    tableCompact: readFlag(TABLE_COMPACT_KEY), tableFullscreen: false, tabsHome: null, adsObjective: 'all',
    campaignBlocks: readBlockSettings(),
    historyMonth: HISTORY_ALL, historyYear: null, historyStatus: 'todas',
  };

  function readFlag(key) {
    try { return localStorage.getItem(key) === 'true'; } catch { return false; }
  }
  // La version anterior (v1) guardaba "campana::anuncio" sin mes: cada valor pasa a todos los meses en que aparece
  // esa campana, que es lo que se veia. Se hace una vez, con los datos ya cargados.
  function loadGoals() {
    try {
      const saved = localStorage.getItem(GOALS_KEY);
      if (saved != null) {
        const goals = JSON.parse(saved);
        state.goals = goals && typeof goals === 'object' ? goals : {};
        return;
      }
      const legacy = JSON.parse(localStorage.getItem(LEGACY_GOALS_KEY) || '{}') || {};
      const goals = {};
      state.data.months.forEach(month => (month.campaigns || []).forEach(campaign => {
        const prefix = `${campaign.name}::`;
        if (!Object.keys(legacy).some(key => key.startsWith(prefix))) return;
        const own = legacy[`${prefix}__campaign__`];
        const value = own !== '' && own != null
          ? Number(own)
          : (campaign.ads || []).reduce((sum, ad) => {
            const adGoal = legacy[`${prefix}${ad.name}`];
            return sum + Number(adGoal === '' || adGoal == null ? ad.reservationGoal || 0 : adGoal);
          }, 0);
        if (Number.isFinite(value)) goals[goalStoreKey(month.key, campaign.name)] = String(value);
      }));
      state.goals = goals;
      saveGoals();
    } catch {
      state.goals = {};
    }
  }
  function readChartCollapsed() {
    try {
      const saved = localStorage.getItem(CHART_COLLAPSED_KEY);
      return saved == null ? true : saved === 'true';
    } catch { return true; }
  }
  function saveChartCollapsed() {
    try { localStorage.setItem(CHART_COLLAPSED_KEY, String(state.chartCollapsed)); } catch {}
  }
  function saveGoals() {
    try { localStorage.setItem(GOALS_KEY, JSON.stringify(state.goals)); } catch {}
  }
  function readChartSeries() {
    try {
      const saved = JSON.parse(localStorage.getItem(CHART_SERIES_KEY) || '[]');
      const valid = Array.isArray(saved) ? saved.filter(key => SERIES[key]) : [];
      return valid.length ? valid : ['investment'];
    } catch { return ['investment']; }
  }
  function saveChartSeries() {
    try { localStorage.setItem(CHART_SERIES_KEY, JSON.stringify(state.types)); } catch {}
  }
  // El endpoint de escritura sale solo del build (SHEET_SYNC_ENDPOINT). No se acepta desde la URL ni desde
  // localStorage: un enlace manipulado podia desviar los POST a un tercero.
  function syncEndpoint() {
    return SHEET_SYNC_ENDPOINT_RE.test(SHEET_SYNC_ENDPOINT) ? SHEET_SYNC_ENDPOINT : '';
  }

  // ── Custom campaigns / ads (stored in localStorage) ──────────────────────
  const CUSTOM_KEY = 'amador-custom-rows-v1';
  // Por clave de mes ("2026-09"). La version anterior guardaba por nombre ("Septiembre"): eran meses de 2026.
  function readCustom() {
    try {
      const all = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '{}') || {};
      let moved = false;
      Object.keys(all).forEach(name => {
        const index = MONTHS.indexOf(name);
        if (index < 0) return;
        const key = monthKey(SHEET_START_YEAR, index);
        if (!all[key]) all[key] = all[name];
        delete all[name];
        moved = true;
      });
      if (moved) saveCustom(all);
      return all;
    } catch { return {}; }
  }
  function saveCustom(data) { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(data)); } catch {} }
  function getMonthCustom() { return (state.month && readCustom()[state.month]) || { campaigns: [], extraAds: {} }; }
  function setMonthCustom(fn) {
    if (!state.month) return;
    const all = readCustom();
    all[state.month] = fn(all[state.month] || { campaigns: [], extraAds: {} });
    saveCustom(all);
  }
  function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function normalizeHeader(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
  }
  function parseNumber(value) {
    const text = String(value ?? '').trim();
    if (!text || text === '-' || text === '\u2013') return null;
    let normalized = text.replace(/S\/?\.?/gi, '').replace(/%/g, '').trim();
    if (/^-?\d+,\d{1,2}$/.test(normalized)) normalized = normalized.replace(',', '.');
    else normalized = normalized.replace(/,/g, '');
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  }
  function parseCsv(text) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];
      if (quoted && char === '"' && next === '"') { cell += '"'; i += 1; continue; }
      if (char === '"') { quoted = !quoted; continue; }
      if (!quoted && char === ',') { row.push(cell); cell = ''; continue; }
      if (!quoted && (char === '\n' || char === '\r')) {
        if (char === '\r' && next === '\n') i += 1;
        row.push(cell); rows.push(row); row = []; cell = ''; continue;
      }
      cell += char;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(items => items.some(item => String(item).trim() !== ''));
  }
  function headerMap(headers) {
    const map = {};
    headers.forEach((header, index) => { map[normalizeHeader(header)] = index; });
    return map;
  }
  function get(row, map, name) { return row[map[normalizeHeader(name)]] ?? ''; }
  function getAny(row, map, names) {
    const name = names.find(item => map[normalizeHeader(item)] != null);
    return name ? get(row, map, name) : '';
  }
  function validateHeaders(headers) {
    const map = headerMap(headers);
    const missing = REQUIRED_HEADERS.filter(name => map[normalizeHeader(name)] == null);
    [AD_BUDGET_HEADERS, AD_SPENT_HEADERS, AD_BALANCE_HEADERS].forEach(group => { if (!group.some(name => map[normalizeHeader(name)] != null)) missing.push(group.join(' / ')); });
    if (missing.length) throw new Error(`Cabeceras faltantes: ${missing.join(', ')}`);
    return map;
  }
  // "1/9/2026" -> "2026-09-01"
  function isoDate(value) {
    const match = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : null;
  }
  // Si la pestana pedida no existe, Google devuelve la primera de la hoja (Junio) con estado 200. Una pestana es la
  // del mes pedido si al menos la mitad de sus filas con fechas corre en ese mes; sin fechas se acepta.
  function belongsToMonth(ranges, key) {
    if (!ranges.length) return true;
    const first = `${key}-01`;
    const last = `${key}-31`;
    const inside = ranges.filter(range => range.start <= last && range.end >= first).length;
    return inside * 2 >= ranges.length;
  }
  function dateLabel(value) {
    const text = String(value || '').trim();
    const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return text || null;
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `${match[1].padStart(2, '0')}-${months[Number(match[2]) - 1] || 'Mes'}`;
  }
  function cloneData(data) { return JSON.parse(JSON.stringify(data)); }
  function valueFor(month, type) {
    if (!month) return null;
    if (type === 'investment') return month.spend;
    if (Number.isFinite(Number(month[type]))) return Number(month[type]);
    const field = type === 'reservations' ? 'reservas' : 'messages';
    const ads = (month.campaigns || []).flatMap(campaign => campaign.ads || []);
    if (!ads.some(ad => ad[field] != null)) return null;
    return ads.reduce((total, ad) => total + Number(ad[field] || 0), 0);
  }
  function isTypeHeader(cell) {
    // Al exportar, el titulo del mes queda fusionado con la cabecera "Tipo".
    return /(^|\s)tipo$/.test(normalizeHeader(cell));
  }
  function sheetToMonthData(rows, sheetName) {
    const headerIndex = rows.findIndex(row => row.some(isTypeHeader) && row.some(cell => normalizeHeader(cell) === 'estado'));
    if (headerIndex < 0) throw new Error('No se encontro la fila de cabeceras del sheet.' );
    const headers = rows[headerIndex].map(cell => (isTypeHeader(cell) ? 'Tipo' : cell));
    const map = validateHeaders(headers);
    const campaigns = [];
    let current = null;
    let currentAdSet = null;
    let totals = null;
    const ranges = [];
    rows.slice(headerIndex + 1).forEach(row => {
      const first = String(get(row, map, 'Tipo')).trim();
      const campaignName = String(get(row, map, 'Campaña')).trim();
      const adSetName = String(get(row, map, 'Conjunto de anuncios')).trim();
      const adName = String(get(row, map, 'Anuncio')).trim();
      if (!first && !campaignName && !adSetName && !adName) return;
      if (first.toLowerCase().startsWith('total')) {
        totals = row;
        return;
      }
      const start = isoDate(get(row, map, 'Fecha de inicio'));
      const end = isoDate(get(row, map, 'Fecha de fin'));
      if (start || end) ranges.push({ start: start || end, end: end || start });
      if (campaignName) {
        current = {
          name: campaignName,
          type: first,
          status: String(get(row, map, 'Estado')).trim(),
          objective: String(get(row, map, 'Objetivo')).trim() || null,
          budget: parseNumber(get(row, map, 'Presupuesto total x campaña')),
          spent: parseNumber(get(row, map, 'Gasto x Campaña')),
          balance: parseNumber(get(row, map, 'Saldo por campaña')),
          realBalance: null,
          reservationGoal: parseNumber(get(row, map, 'Objetivo Reservas')),
          reservas: 0,
          messages: 0,
          ads: []
        };
        campaigns.push(current);
        currentAdSet = null;
      }
      if (adSetName) currentAdSet = adSetName;
      if (!current || !adName) return;
      const ad = {
        name: currentAdSet ? `${currentAdSet} · ${adName}` : adName,
        adSet: currentAdSet,
        objective: String(get(row, map, 'Objetivo')).trim() || null,
        status: String(get(row, map, 'Estado')).trim(),
        reservas: parseNumber(get(row, map, 'Reservas')) || 0,
        reservationGoal: parseNumber(get(row, map, 'Objetivo Reservas')),
        messages: parseNumber(get(row, map, 'Mensajes')) || 0,
        costPerMessage: parseNumber(get(row, map, 'Costo por mensaje')),
        costPerReservation: parseNumber(get(row, map, 'Costo por reserva')),
        reservationRatio: parseNumber(get(row, map, 'Ratio de reservas')),
        startDate: dateLabel(get(row, map, 'Fecha de inicio')),
        endDate: dateLabel(get(row, map, 'Fecha de fin')),
        duration: parseNumber(get(row, map, 'Duración (días)')),
        daysRemaining: parseNumber(get(row, map, 'Días restantes')),
        dailyAmount: parseNumber(get(row, map, 'Importe diario')),
        budget: parseNumber(getAny(row, map, AD_BUDGET_HEADERS)),
        spent: parseNumber(getAny(row, map, AD_SPENT_HEADERS)),
        balance: parseNumber(getAny(row, map, AD_BALANCE_HEADERS)),
        newDailyAmount: parseNumber(get(row, map, 'Nuevo ppto diario')),
        observation: String(get(row, map, 'Observaciones')).trim() || null,
        adUrl: String(get(row, map, 'Vista previa')).trim() || null
      };
      if (ad.costPerMessage == null && ad.messages > 0 && ad.spent != null) ad.costPerMessage = ad.spent / ad.messages;
      if (ad.costPerReservation == null && ad.reservas > 0 && ad.spent != null) ad.costPerReservation = ad.spent / ad.reservas;
      if (ad.reservationRatio == null && ad.messages > 0) ad.reservationRatio = ad.reservas / ad.messages * 100;
      current.ads.push(ad);
      current.reservas += ad.reservas;
      current.messages += ad.messages;
      if (ad.observation && !current.observation) current.observation = ad.observation;
    });
    const allAds = campaigns.flatMap(campaign => campaign.ads);
    const round2 = value => Math.round(Number(value) * 100) / 100;
    const adSpendTotal = parseNumber(totals && getAny(totals, map, AD_SPENT_HEADERS)) ?? round2(allAds.reduce((sum, ad) => sum + Number(ad.spent || 0), 0));
    const spend = parseNumber(totals && get(totals, map, 'Gasto x Campaña')) ?? round2(campaigns.reduce((sum, campaign) => sum + Number(campaign.spent || 0), 0));
    const budgetTotal = parseNumber(totals && get(totals, map, 'Presupuesto total x campaña')) ?? round2(campaigns.reduce((sum, campaign) => sum + Number(campaign.budget || 0), 0));
    const balanceTotal = parseNumber(totals && get(totals, map, 'Saldo por campaña')) ?? round2(campaigns.reduce((sum, campaign) => sum + Number(campaign.balance || 0), 0));
    const brandingSpend = round2(campaigns.filter(campaign => campaign.ads.some(ad => normalizeHeader(ad.objective).includes('reconocimiento'))).reduce((sum, campaign) => sum + Number(campaign.spent || 0), 0));
    const month = {
      name: sheetName,
      spend,
      messages: allAds.reduce((sum, ad) => sum + Number(ad.messages || 0), 0),
      reservations: allAds.reduce((sum, ad) => sum + Number(ad.reservas || 0), 0),
      adSpendTotal,
      budgetTotal,
      balanceTotal,
      reservationGoalTotal: parseNumber(totals && get(totals, map, 'Objetivo Reservas')),
      newDailyTotal: parseNumber(totals && get(totals, map, 'Nuevo ppto diario')) ?? round2(allAds.reduce((sum, ad) => sum + Number(ad.newDailyAmount || 0), 0)),
      totalObservation: String((totals && get(totals, map, 'Observaciones')) || '').trim(),
      spendBreakdown: { sales: round2(spend - brandingSpend), branding: brandingSpend },
      campaigns,
      headers: headers.map(header => String(header || '').trim()).filter(Boolean),
      source: `Google Sheets / Distribucion-amador / ${sheetName}`
    };
    return { month, ranges };
  }
  // Clave YYYY-MM de un mes; los que no traen año (copias de data/ anteriores) son del año del archivo base.
  const keyOfMonth = (month, fallbackYear) => monthKey(month.year ?? fallbackYear, MONTHS.indexOf(month.name));
  function mergeSheetMonth(monthData, source = 'Google Sheets') {
    const data = cloneData(state.sheetData);
    const incoming = { ...monthData, year: monthData.year ?? data.year };
    const key = keyOfMonth(incoming, data.year);
    const index = data.months.findIndex(month => keyOfMonth(month, data.year) === key);
    if (index >= 0) data.months[index] = incoming;
    else data.months.push(incoming);
    data.months.sort((a, b) => keyOfMonth(a, data.year).localeCompare(keyOfMonth(b, data.year)));
    data.source = source;
    state.sheetData = data;
  }

  // ── Meses desde el barrido de Meta ───────────────────────────────────────
  // Nombre de campana para cruzar la hoja con Meta: Meta antepone "Campaña " y no siempre deja espacio antes de "|"
  // ("Campaña Mensajes - Fiestas patrias| LR" es "Mensajes - Fiestas patrias | LR" en la hoja).
  const campaignMatchKey = name => normalizeHeader(name).replace(/^campana\s+/, '').replace(/\s*\|\s*/g, ' | ').trim();
  // "2026-10-07" -> "07-Oct", el formato de fecha de la hoja.
  const isoLabel = iso => { const [y, m, d] = String(iso || '').split('-'); return d ? dateLabel(`${Number(d)}/${Number(m)}/${y}`) : null; };
  function metaGroup(objective) {
    const text = normalizeHeader(objective);
    return META_OBJECTIVE_GROUPS.find(group => group.match.test(text))?.label || objective || '';
  }
  // Meses del barrido que se leyeron bien y traen filas; uno con error queda como lo trae la hoja.
  function metaMonthsOf(snapshot) {
    return (snapshot?.months || []).filter(month => !month.error && Array.isArray(month.rows) && month.rows.length && Array.isArray(month.columns));
  }
  // Un mes de Meta en la forma de un mes de la hoja: campanas con sus anuncios (gasto, mensajes y fechas de Meta) y,
  // de la hoja, las reservas, el tipo, el presupuesto y el Objetivo Reservas de cada campana (cruzadas por nombre).
  function metaToMonth(meta, sheet) {
    const index = name => meta.columns.indexOf(name);
    const num = (row, name) => (index(name) < 0 ? 0 : Number(row[index(name)]) || 0);
    const text = (row, name) => (index(name) < 0 ? '' : String(row[index(name)] ?? '').trim());
    const round2 = value => Math.round(Number(value) * 100) / 100;
    const rows = meta.rows.map(row => ({
      day: text(row, 'day'), campaign: text(row, 'campaign'), adSet: text(row, 'adSet'), ad: text(row, 'ad'),
      objective: text(row, 'objective'), resultType: text(row, 'resultType'), preview: text(row, 'preview'),
      spend: num(row, 'spend'), impressions: num(row, 'impressions'), reach: num(row, 'reach'), clicks: num(row, 'clicks'),
      results: num(row, 'results'), messages: num(row, 'messages'), purchases: num(row, 'purchases'),
    })).filter(row => row.day && row.campaign);
    const active = row => row.spend > 0 || row.impressions > 0;
    const lastDay = rows.filter(active).map(row => row.day).sort().pop() || `${monthKey(meta.year, meta.month - 1)}-01`;
    // Activa: gasto en los dos ultimos dias con datos (Meta deja dias sueltos sin entrega). composeData tambien marca
    // activa la que sigue con gasto el mes siguiente.
    const recent = day => Boolean(day) && (Date.parse(lastDay) - Date.parse(day)) / 86400000 <= 1;
    const sumOf = (items, field) => items.reduce((total, row) => total + row[field], 0);
    // Campanas de la hoja por su nombre normalizado.
    const sheetCampaigns = new Map((sheet?.campaigns || []).map(campaign => [campaignMatchKey(campaign.name), campaign]));
    const matched = new Set();
    const byCampaign = new Map();
    rows.forEach(row => {
      if (!byCampaign.has(row.campaign)) byCampaign.set(row.campaign, []);
      byCampaign.get(row.campaign).push(row);
    });
    const campaigns = [...byCampaign.entries()].map(([name, items]) => {
      const key = campaignMatchKey(name);
      const fromSheet = sheetCampaigns.get(key);
      if (fromSheet) matched.add(key);
      // El cuadro de la campana es el Objetivo de la hoja ("corporativos" va en Mensajes aunque en Meta sea Clientes
      // potenciales). Sin campana en la hoja, el objetivo de Meta con mas gasto (en Meta es uno por campana).
      const sheetObjective = String(fromSheet?.objective || fromSheet?.ads?.find(ad => ad.objective)?.objective || '').split('/')[0].trim();
      const spendByObjective = new Map();
      items.forEach(row => spendByObjective.set(row.objective, (spendByObjective.get(row.objective) || 0) + row.spend + 1e-9));
      const objective = metaGroup(sheetObjective || [...spendByObjective.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]);
      const days = items.filter(active).map(row => row.day).sort();
      const status = recent(days[days.length - 1]) ? 'Activa' : 'Finalizada';
      const byAd = new Map();
      items.forEach(row => {
        const key = `${row.adSet}\u0000${row.ad}`;
        if (!byAd.has(key)) byAd.set(key, []);
        byAd.get(key).push(row);
      });
      const ads = [...byAd.values()].map(adItems => {
        const first = adItems[0];
        const adDays = adItems.filter(active).map(row => row.day).sort();
        const spent = round2(sumOf(adItems, 'spend'));
        const messages = sumOf(adItems, 'messages');
        return {
          name: first.adSet ? `${first.adSet} · ${first.ad}` : first.ad,
          adSet: first.adSet || null,
          objective,
          status: recent(adDays[adDays.length - 1]) ? 'Activa' : 'Finalizada',
          reservas: null,
          reservationGoal: null,
          messages,
          costPerMessage: messages > 0 && spent > 0 ? spent / messages : null,
          costPerReservation: null,
          reservationRatio: null,
          // Fin: el ultimo dia con gasto de un anuncio que ya termino; uno activo no tiene fin.
          startDate: isoLabel(adDays[0]),
          endDate: recent(adDays[adDays.length - 1]) ? null : isoLabel(adDays[adDays.length - 1]),
          duration: null, daysRemaining: null, dailyAmount: null, budget: null, balance: null, newDailyAmount: null, observation: null,
          spent,
          impressions: sumOf(adItems, 'impressions'),
          reach: sumOf(adItems, 'reach'),
          clicks: sumOf(adItems, 'clicks'),
          results: sumOf(adItems, 'results'),
          purchases: sumOf(adItems, 'purchases'),
          // Dias con gasto o impresiones: los dias activos del modulo Anuncios (en la vista anual se unen).
          days: [...new Set(adDays)],
          resultType: adItems.find(row => row.resultType)?.resultType || null,
          adUrl: adItems.find(row => /^https:\/\//.test(row.preview))?.preview || null,
        };
      });
      const sheetAds = fromSheet?.ads || [];
      const sheetGoals = sheetAds.map(ad => ad.reservationGoal).filter(value => value != null);
      // Fechas planificadas de la hoja (inicio y fin de sus anuncios) si la campana esta en la hoja.
      const key0 = monthKey(meta.year, meta.month - 1);
      const planStarts = sheetAds.map(ad => ad.startDate).filter(date => dateOrderValue(date, key0) != null).sort((a, b) => dateOrderValue(a, key0) - dateOrderValue(b, key0));
      const planEnd = sheetAds.filter(ad => dateOrderValue(ad.endDate, key0) != null).sort((a, b) => dateOrderValue(b.endDate, key0) - dateOrderValue(a.endDate, key0))[0];
      const spent = round2(sumOf(items, 'spend'));
      const budget = fromSheet?.budget ?? null;
      return {
        name,
        type: fromSheet?.type || null,
        status,
        objective,
        budget,
        spent,
        balance: budget != null ? round2(budget - spent) : null,
        realBalance: null,
        reservationGoal: fromSheet?.reservationGoal ?? (sheetGoals.length ? sheetGoals.reduce((total, value) => total + Number(value), 0) : null),
        // Sin pestana del mes en la hoja no hay reservas que mostrar ("-"); con pestana, las de su campana (0 si no esta).
        reservas: sheet ? Number(fromSheet?.reservas || 0) : null,
        messages: sumOf(items, 'messages'),
        observation: fromSheet?.observation || null,
        sheetName: fromSheet?.name || null,
        plan: planStarts.length || planEnd ? { startDate: planStarts[0] || null, endDate: planEnd?.endDate || null, daysRemaining: planEnd?.daysRemaining ?? null } : null,
        // Sin fechas en la hoja: primer dia con gasto y, si ya termino, el ultimo.
        metaDates: { startDate: isoLabel(days[0]), endDate: status === 'Activa' ? null : isoLabel(days[days.length - 1]) },
        ads,
      };
    });
    // Reservas de campanas de la hoja que no aparecen en Meta (otro nombre): una fila del mes, sin gasto.
    const unmatched = (sheet?.campaigns || []).filter(campaign => !matched.has(campaignMatchKey(campaign.name)) && Number(campaign.reservas) > 0);
    if (unmatched.length) {
      campaigns.push({
        name: UNMATCHED_RESERVATIONS,
        type: 'Hoja',
        status: '',
        objective: 'Reservas',
        budget: null, spent: 0, balance: null, realBalance: null, reservationGoal: null,
        reservas: unmatched.reduce((total, campaign) => total + Number(campaign.reservas || 0), 0),
        messages: null,
        observation: `En la hoja: ${unmatched.map(campaign => campaign.name).join(', ')}`,
        sheetName: null,
        ads: [],
      });
    }
    const spend = round2(sumOf(rows, 'spend'));
    const brandingSpend = round2(campaigns.filter(campaign => campaign.objective === 'Branding').reduce((total, campaign) => total + campaign.spent, 0));
    const budgetTotal = sheet?.budgetTotal ?? null;
    return {
      name: meta.name,
      year: meta.year,
      spend,
      messages: sumOf(rows, 'messages'),
      // Las reservas son las de la hoja (todas sus campanas); sin pestana del mes, null.
      reservations: sheet ? campaigns.reduce((total, campaign) => total + Number(campaign.reservas || 0), 0) : null,
      impressions: sumOf(rows, 'impressions'),
      reach: sumOf(rows, 'reach'),
      clicks: sumOf(rows, 'clicks'),
      purchases: sumOf(rows, 'purchases'),
      adSpendTotal: spend,
      budgetTotal,
      balanceTotal: budgetTotal != null ? round2(budgetTotal - spend) : null,
      reservationGoalTotal: sheet?.reservationGoalTotal ?? null,
      newDailyTotal: null,
      totalObservation: sheet?.totalObservation || '',
      spendBreakdown: { sales: round2(spend - brandingSpend), branding: brandingSpend },
      campaigns,
      headers: [],
      // Ultimo dia con gasto o impresiones: el corte del mes en curso.
      lastDataDay: Number(lastDay.slice(8, 10)),
      meta: { fileName: meta.fileName, modifiedTime: meta.modifiedTime, lastDay, duplicates: meta.duplicates || [] },
      sheetTab: sheet ? (sheet.tabName || sheet.name) : null,
      readAt: sheet?.readAt,
      source: `Meta / ${meta.fileName}${sheet ? ` + Distribucion-amador / ${sheet.tabName || sheet.name}` : ''}`,
    };
  }
  // Lo que se muestra: cada mes del barrido de Meta (con las reservas de su pestana) y el resto de la hoja.
  function composeData() {
    const data = cloneData(state.sheetData);
    metaMonthsOf(state.meta).forEach(meta => {
      const key = monthKey(meta.year, meta.month - 1);
      const index = data.months.findIndex(month => keyOfMonth(month, data.year) === key);
      const month = metaToMonth(meta, index >= 0 ? data.months[index] : null);
      if (index >= 0) data.months[index] = month;
      else data.months.push(month);
    });
    data.months.sort((a, b) => keyOfMonth(a, data.year).localeCompare(keyOfMonth(b, data.year)));
    // Una campana (o anuncio) de Meta que sigue con gasto el mes siguiente no habia terminado.
    data.months.forEach((month, index) => {
      const next = data.months[index + 1];
      if (!month.meta || !next?.meta) return;
      const nextCampaigns = new Map(next.campaigns.map(campaign => [campaign.name, new Set(campaign.ads.map(ad => ad.name))]));
      month.campaigns.forEach(campaign => {
        const nextAds = nextCampaigns.get(campaign.name);
        if (!nextAds) return;
        campaign.status = 'Activa';
        if (campaign.metaDates) campaign.metaDates.endDate = null;
        campaign.ads.forEach(ad => {
          if (!nextAds.has(ad.name)) return;
          ad.status = 'Activa';
          ad.endDate = null;
        });
      });
    });
    return data;
  }
  function recompose() {
    state.data = composeData();
    decorate(state.data);
  }
  // Mes de hoy en hora de Lima: decide que meses se leen en vivo y cuales ya cerraron.
  function today() {
    const now = limaParts();
    return { ...now, key: monthKey(now.year, now.month) };
  }
  // Cada mes lleva su clave YYYY-MM, si ya cerro (calendario de Lima) y su dia de corte: el ultimo dia completo
  // para un mes cerrado y, para el mes en curso, el dia de la ultima lectura en vivo (o el de la copia guardada).
  function decorate(data) {
    const now = today();
    const fileCutoff = String(data.fileCutoff || '');
    data.months.forEach(month => {
      const index = MONTHS.indexOf(month.name);
      month.year = month.year ?? data.year;
      month.key = monthKey(month.year, index);
      month.days = daysInMonth(month.year, index);
      month.closed = month.key < now.key;
      let day = month.days;
      if (!month.closed) {
        // Un mes de Meta llega hasta su ultimo dia con gasto; uno de la hoja, hasta su lectura.
        if (month.lastDataDay) day = month.lastDataDay;
        else if (month.readAt) day = limaParts(new Date(month.readAt)).day;
        else if (fileCutoff.startsWith(month.key)) day = Number(fileCutoff.slice(8, 10));
        else day = now.day;
      }
      month.dataDay = Math.min(month.days, Math.max(1, day));
      month.cutoff = `${month.key}-${String(month.dataDay).padStart(2, '0')}`;
    });
    const latest = latestMonth(data);
    data.latestKey = latest?.key || null;
    data.cutoff = latest?.cutoff || null;
  }
  // Ultimo mes con actividad: gasto, mensajes o reservas (al empezar el mes la hoja puede traer mensajes y el
  // gasto todavia en 0).
  function latestMonth(data = state.data) {
    return (data?.months || []).filter(hasActivity).pop() || null;
  }
  // Huella de los datos para no repintar si una lectura trae lo mismo (la hora de lectura no cuenta).
  function signature(data = state.data) {
    return JSON.stringify((data?.months || []).map(({ readAt, ...month }) => month));
  }
  async function fetchText(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('Google no respondio a tiempo');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  // Lee un texto escapado de JavaScript ("Octubre ", "https:\/\/...\x3d...") tal como lo trae la vista publicada.
  function unescapeJs(text) {
    return String(text)
      .replace(/\\x([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\(.)/g, '$1');
  }
  // Nombre y gid de cada pestana. Si la vista publicada cambia de formato devuelve [] y se piden por nombre.
  async function fetchSheetTabs() {
    const html = await fetchText(`${SHEET_LIST_URL}?cacheBust=${Date.now()}`);
    return [...html.matchAll(/\{name: "((?:[^"\\]|\\.)*)", pageUrl: "((?:[^"\\]|\\.)*)"/g)]
      .map(([, name, url]) => ({ name: unescapeJs(name), gid: (unescapeJs(url).match(/[?&]gid=(\d+)/) || [])[1] || '' }))
      .filter(tab => tab.gid);
  }
  // Mes (0-11) y año de una pestana por su nombre, sin importar espacios, mayusculas ni tildes: "Octubre " es octubre
  // sin año y "Enero 2027" es enero de 2027. Un nombre que no es de mes devuelve null.
  function tabMonth(name) {
    const text = normalizeHeader(name).replace(/[^a-z0-9]+/g, ' ').trim();
    const yearMatch = text.match(/(?:^| )(20\d{2})$/);
    const word = (yearMatch ? text.slice(0, yearMatch.index) : text).trim();
    const index = MONTHS.findIndex((month, i) => normalizeHeader(month) === word || (MONTH_ALIASES[i] || []).includes(word));
    return index < 0 ? null : { index, year: yearMatch ? Number(yearMatch[1]) : null };
  }
  // Año de una pestana sin año en el nombre: el primero en que ese mes cae desde SHEET_START.
  const plainTabYear = index => (monthKey(SHEET_START_YEAR, index) >= SHEET_START ? SHEET_START_YEAR : SHEET_START_YEAR + 1);
  // La pestana del mes se pide por su gid. Sin la lista de pestanas se prueba por nombre: con el año y, si el mes
  // admite nombre sin año, sin el y con espacio final. Una pestana que no existe (el mes recien empieza) devuelve
  // null, no un error.
  async function fetchLiveMonth(year, index, tabs) {
    const sheetName = MONTHS[index];
    const plain = plainTabYear(index) === year;
    const candidates = tabs
      ? tabs.filter(tab => {
        const found = tabMonth(tab.name);
        return found && found.index === index && (found.year ?? plainTabYear(index)) === year;
      })
      : [`${sheetName} ${year}`].concat(plain ? [sheetName, `${sheetName} `] : []).map(name => ({ name }));
    for (const tab of candidates) {
      const text = await fetchText(`${liveCsvUrl(tab)}&cacheBust=${Date.now()}`);
      const { month, ranges } = sheetToMonthData(parseCsv(text), sheetName);
      const tabName = tab.name.trim() || sheetName;
      // Un nombre o gid que no existe devuelve la primera hoja (Junio): se descarta por sus fechas.
      if (belongsToMonth(ranges, monthKey(year, index))) return { month: { ...month, year, tabName }, tabName };
    }
    return null;
  }
  // Se leen en vivo el mes en curso (hora de Lima) y el anterior, que sigue recibiendo ajustes despues del cierre;
  // tambien entre diciembre y enero. Nada antes de SHEET_START, que no tiene pestana.
  function liveMonths() {
    const now = today();
    return [[now.year, now.month - 1], [now.year, now.month]]
      .map(([year, index]) => (index < 0 ? { year: year - 1, index: 11 } : { year, index }))
      .filter(item => monthKey(item.year, item.index) >= SHEET_START);
  }
  // ── Lectura en vivo y estado de los datos (barra superior) ───────────────
  function refreshButtons() {
    return [...document.querySelectorAll('[data-amador-refresh]')];
  }
  function setRefreshing(isLoading) {
    refreshButtons().forEach(button => {
      button.disabled = isLoading;
      button.textContent = isLoading ? 'Actualizando...' : 'Actualizar';
    });
  }
  // La proxima lectura automatica es una hora despues de la ultima, sea automatica o del boton.
  function scheduleSync() {
    clearTimeout(state.syncTimer);
    state.nextSync = Date.now() + SYNC_INTERVAL_MS;
    state.syncTimer = setTimeout(() => syncLiveSheet(), SYNC_INTERVAL_MS);
  }
  // Pestanas del mes en curso y el anterior. Una pestana con problemas no impide leer la otra; si fallan todas es
  // un error de lectura.
  async function readSheetTabs() {
    let tabs = null;
    try {
      const listed = await fetchSheetTabs();
      if (listed.length) tabs = listed;
    } catch (error) {
      console.warn('[amador] No se pudo leer la lista de pestanas; se piden por nombre:', error);
    }
    const results = await Promise.allSettled(liveMonths().map(item => fetchLiveMonth(item.year, item.index, tabs)));
    const failed = results.filter(result => result.status === 'rejected');
    if (failed.length && failed.length === results.length) throw failed[0].reason;
    const read = results.filter(result => result.status === 'fulfilled' && result.value).map(result => result.value);
    // Mes en curso sin pestana (o con una que no es de ese mes): se avisa con el nombre que se espera.
    const current = liveMonths().pop();
    const found = read.some(item => item.month.year === current?.year && MONTHS.indexOf(item.month.name) === current?.index);
    const failedCurrent = results.length && results[results.length - 1].status === 'rejected';
    return {
      read,
      warning: failed.length ? `No se pudo leer una pestaña de la hoja (${failed.map(result => result.reason?.message || result.reason).join('; ')}).` : '',
      missing: current && !found && !failedCurrent ? `${MONTHS[current.index]} ${current.year}` : '',
    };
  }
  // Ultimo barrido del Web App de Meta; Actualizar pide uno en el momento (fresh=1). Sin URL no hay nada que leer.
  async function readMeta(manual) {
    if (!META_ENDPOINT) return null;
    const payload = JSON.parse(await fetchText(`${META_ENDPOINT}?action=data${manual ? '&fresh=1' : ''}`));
    if (!payload?.ok || !Array.isArray(payload.months)) throw new Error(payload?.error || 'respuesta sin meses');
    return payload;
  }
  async function runSync(manual) {
    if (manual) updateStatusLabel(META_ENDPOINT ? 'Leyendo Meta y la hoja...' : 'Leyendo Google Sheets...');
    try {
      const [sheet, meta] = await Promise.allSettled([readSheetTabs(), readMeta(manual)]);
      const before = signature();
      const hadError = Boolean(state.error || state.metaError);
      if (sheet.status === 'fulfilled') {
        const { read, warning, missing } = sheet.value;
        state.tabWarning = warning;
        state.tabMissing = missing;
        state.lastSync = new Date();
        state.liveSheets = read.map(item => item.tabName);
        read.forEach(({ month }) => mergeSheetMonth({ ...month, readAt: state.lastSync.toISOString() }));
        state.error = '';
      } else {
        state.error = String(sheet.reason?.message || sheet.reason);
        console.warn('[amador] No se pudo sincronizar Google Sheets:', sheet.reason);
      }
      if (meta.status === 'fulfilled') {
        if (meta.value) {
          state.meta = meta.value;
          state.metaSync = new Date();
        }
        state.metaError = '';
      } else {
        state.metaError = String(meta.reason?.message || meta.reason);
        console.warn('[amador] No se pudo leer el barrido de Meta:', meta.reason);
      }
      recompose();
      // Sin ninguna lectura nueva, Proyecciones muestra el aviso de error.
      if (state.error && (state.metaError || !META_ENDPOINT)) window.dispatchEvent(new CustomEvent('amador:data-error', { detail: { error: state.error } }));
      // Una lectura silenciosa que trae lo mismo no repinta; Actualizar siempre publica.
      if (manual || hadError || signature() !== before) renderAll();
      return !state.error && !state.metaError;
    } catch (error) {
      state.error = String(error?.message || error);
      console.warn('[amador] No se pudo actualizar los datos:', error);
      window.dispatchEvent(new CustomEvent('amador:data-error', { detail: { error: state.error } }));
      return false;
    } finally {
      state.lastFetch = Date.now();
      scheduleSync();
      updateStatusLabel();
    }
  }
  // Una lectura a la vez: una automatica pedida durante otra se une a esa; Actualizar espera y relee.
  async function syncLiveSheet({ manual = false } = {}) {
    if (state.current && !manual) return state.current;
    while (state.current) await state.current;
    state.current = runSync(manual).finally(() => { state.current = null; });
    return state.current;
  }
  // Boton Actualizar de la barra superior: relee la hoja y sincroniza el Archivo de Reportes con Drive.
  async function refreshAll() {
    setRefreshing(true);
    try {
      await Promise.allSettled([syncLiveSheet({ manual: true }), window.ReportsArchive?.refresh?.()]);
    } finally {
      setRefreshing(false);
    }
  }
  // Fuente sin conexion para la pildora y la nota: Meta, la hoja o las dos.
  function offlineSources() {
    const names = [state.metaError && 'Meta', state.error && 'Google Sheets'].filter(Boolean);
    return names.join(' ni con ');
  }
  function statusLabel() {
    if (!state.data) return state.error ? 'Sin datos: no se pudo leer Google Sheets' : 'Cargando datos...';
    const month = latestMonth();
    // Un mes de Meta llega hasta su ultimo dia con gasto: "Datos al 12 de octubre".
    const dataPart = !month ? 'Sin datos' : month.meta && !month.closed ? `Datos al ${month.dataDay} de ${month.name.toLowerCase()}` : `Datos de ${month.name}`;
    if (state.error || state.metaError) return `${dataPart} | sin conexion con ${offlineSources()}`;
    if (!state.lastSync) return `${dataPart} | copia guardada`;
    return `${dataPart} | leidos ${formatStamp(state.lastSync)}`;
  }
  function updateStatusLabel(text) {
    const label = document.getElementById('topbar-status');
    if (label) label.textContent = text || statusLabel();
    const pill = label?.closest('.topbar-pill');
    const metaFailed = (state.meta?.months || []).some(item => item.error && liveMonths().some(live => live.year === item.year && live.index === item.month - 1));
    if (pill) pill.classList.toggle('warn', !text && (Boolean(state.error || state.metaError) || !state.lastSync || metaFailed));
    renderStatusCard();
  }
  // Avisos del Objetivo Reservas: van a la nota del detalle de la actualizacion.
  function setGoalNote(text) {
    state.goalNote = text;
    renderStatusCard();
  }
  function renderStatusCard() {
    const card = document.getElementById('data-status-card');
    if (!card || !state.data) return;
    const month = latestMonth();
    const year = month?.year ?? state.data.year;
    const set = (id, value) => {
      const node = document.getElementById(id);
      if (node) node.textContent = value || '-';
    };
    set('status-data', month ? (month.closed ? `${month.name} ${year} completo` : `1-${month.dataDay} ${month.name} ${year}`) : 'Sin meses con datos');
    set('status-last', state.lastSync ? formatStamp(state.lastSync) : 'sin lectura en vivo');
    renderNextSync();
    const sheets = state.liveSheets.length ? state.liveSheets : [month?.sheetTab || month?.name].filter(Boolean);
    const hasMeta = metaMonthsOf(state.meta).length > 0;
    set('status-sheet', `Distribucion-amador / ${sheets.join(' y ') || '-'}${hasMeta ? ' (reservas)' : ''}`);
    set('status-meta', month?.meta ? `${month.meta.fileName} | barrido ${state.meta?.sweptAt ? formatStamp(new Date(state.meta.sweptAt)) : '-'}` : (META_ENDPOINT || hasMeta ? 'Sin archivo del mes' : 'Sin conectar: el gasto sale de la hoja'));
    set('status-source', state.lastSync ? (state.error || state.metaError ? 'ultima lectura en vivo' : `${hasMeta ? 'Meta y ' : ''}Google Sheets en vivo`) : 'copia guardada en el tablero');
    const note = document.getElementById('status-note');
    if (!note) return;
    // Un solo aviso, por orden de gravedad: sin conexion, copia guardada, pestana sin leer, Objetivo Reservas, mes
    // sin gasto o mes en curso.
    const errors = [state.metaError && `Meta: ${state.metaError}`, state.error && `Google Sheets: ${state.error}`].filter(Boolean);
    const metaMonth = month?.meta;
    // Descarga del mes en curso o del anterior que el barrido no pudo leer (otro informe, columnas faltantes).
    const metaFailed = (state.meta?.months || []).filter(item => item.error && liveMonths().some(live => live.year === item.year && live.index === item.month - 1)).pop();
    let message = '';
    if (errors.length) message = `Sin conexion con ${offlineSources()} (${errors.join('; ')}). Se muestran los ultimos datos leidos.`;
    else if (!state.lastSync) message = 'Copia guardada en el tablero: todavia no llego la lectura en vivo.';
    else if (state.tabWarning) message = state.tabWarning;
    else if (metaFailed) message = `La descarga de ${metaFailed.name} ${metaFailed.year} en la carpeta de Meta no se pudo leer (${metaFailed.error}). Tiene que ser el informe por día, edad, sexo y anuncio, como los otros meses; mientras tanto ${metaFailed.name} sale de la hoja.`;
    else if (metaMonth?.duplicates.length) message = `Hay otro archivo de ${month.name} en la carpeta de Meta (${metaMonth.duplicates.join(', ')}): se usa el editado más recientemente.`;
    else if (state.tabMissing) message = metaMonth
      ? `La hoja todavía no tiene la pestaña de ${state.tabMissing}: el gasto y los mensajes salen de Meta y las reservas aparecen cuando se cree la pestaña.`
      : `La hoja todavía no tiene la pestaña de ${state.tabMissing} (puede llamarse «${state.tabMissing}»): se muestra el último mes con datos.`;
    else if (state.goalNote) message = state.goalNote;
    else if (month && !month.closed && !(Number(month.spend) > 0)) message = `La hoja todavía no trae el gasto de ${month.name}: se ven sus mensajes y reservas, y los costos aparecen cuando se cargue el gasto.`;
    else if (metaMonth && !month.closed) message = `${month.name} sigue en curso: el gasto llega hasta el ${month.dataDay} (última descarga de Meta en la carpeta) y las reservas, hasta la última lectura de la hoja.`;
    else if (month && !month.closed) message = `${month.name} sigue en curso: las cifras llegan hasta la ultima lectura.`;
    note.textContent = message;
    note.classList.toggle('error', errors.length > 0);
    note.hidden = !message;
  }
  function renderNextSync() {
    const node = document.getElementById('status-next');
    if (node) node.textContent = state.nextSync ? `${formatStamp(new Date(state.nextSync))} · cada hora con el tablero abierto` : '-';
  }
  function wireStatusCard() {
    const button = document.getElementById('data-status-btn');
    const card = document.getElementById('data-status-card');
    if (!button || !card) return;
    const close = () => {
      card.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    };
    button.addEventListener('click', event => {
      event.stopPropagation();
      const open = card.hidden;
      if (open) renderNextSync();
      card.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', event => {
      if (!card.hidden && !card.contains(event.target) && event.target !== button) close();
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  }

  // ── Pestanas de mes y periodo ────────────────────────────────────────────
  // Un mes con datos tuvo gasto, mensajes o reservas.
  const hasData = month => Boolean(month) && hasActivity(month);
  function monthByKey(key) {
    return state.data?.months.find(month => month.key === key) || null;
  }
  // Mes anterior, tambien entre años (enero contra diciembre).
  function previousMonth(month) {
    const index = MONTHS.indexOf(month?.name);
    if (index < 0) return null;
    return monthByKey(index > 0 ? monthKey(month.year, index - 1) : monthKey(month.year - 1, 11));
  }
  const annualView = () => state.monthKey === YEAR_KEY && state.data.months.some(hasData);
  // Años con meses con datos, del mas antiguo al mas reciente. Con mas de uno, las pestanas llevan encima los años.
  const dataYears = () => [...new Set(state.data.months.filter(hasData).map(month => month.year))];
  const monthsOfYear = year => state.data.months.filter(month => hasData(month) && month.year === year);
  // Año de la vista: el del mes elegido o, en la vista anual, el año elegido (si no tiene datos, el del ultimo mes).
  function viewYear() {
    const latestYear = latestMonth()?.year ?? state.data.year;
    if (state.monthKey === YEAR_KEY) return dataYears().includes(state.year) ? state.year : latestYear;
    return selectedMonth()?.year ?? latestYear;
  }
  function selectedMonth() {
    const month = monthByKey(state.monthKey);
    return hasData(month) ? month : latestMonth();
  }
  // Totales de uno o varios meses. Enero a mayo solo traen gasto: mensajes y reservas quedan en null si ningun mes
  // los registra, y sus costos usan solo el gasto de los meses que si los registran.
  function summarize(months) {
    const sum = type => {
      const values = months.map(month => valueFor(month, type)).filter(value => value != null);
      return values.length ? values.reduce((total, value) => total + Number(value), 0) : null;
    };
    // El costo usa solo los meses con gasto cargado: al empezar el mes la hoja trae mensajes con el gasto en 0 y
    // contarlos bajaria el costo del acumulado. Sin gasto no hay costo ("-").
    const priced = months.filter(month => Number(month.spend) > 0);
    const pricedWith = type => priced.filter(month => valueFor(month, type) != null);
    const cost = type => ratio(
      pricedWith(type).reduce((total, month) => total + Number(month.spend), 0),
      pricedWith(type).reduce((total, month) => total + Number(valueFor(month, type)), 0),
    );
    return {
      spend: months.reduce((total, month) => total + Number(month.spend || 0), 0),
      messages: sum('messages'),
      reservations: sum('reservations'),
      costPerMessage: cost('messages'),
      costPerReservation: cost('reservations'),
    };
  }
  // Periodo elegido: un mes (contra el mes anterior completo) o el acumulado del año.
  function currentPeriod() {
    if (!state.data) return null;
    if (annualView()) {
      const year = viewYear();
      const months = monthsOfYear(year);
      const first = months[0];
      const last = months[months.length - 1];
      return { annual: true, months, year, closed: today().year > year, label: `1 ${first.name} - ${last.dataDay} ${last.name}`, compare: null, previousYear: dataYears().includes(year - 1) };
    }
    const month = selectedMonth();
    if (!month) return null;
    const previous = previousMonth(month);
    // Contra el mes anterior de otro año va con su año ("Diciembre 2026 completo").
    const previousName = previous && previous.year !== month.year ? `${previous.name} ${previous.year}` : previous?.name;
    return {
      annual: false,
      month,
      months: [month],
      year: month.year,
      closed: month.closed,
      label: `1-${month.dataDay} ${month.name}`,
      // detail: el mes anterior trae campanas (enero y febrero de 2026 solo traen el gasto total).
      compare: hasData(previous) ? { month: previous, months: [previous], label: `${previousName} completo`, detail: (previous.campaigns || []).length > 0 } : null,
    };
  }
  // Mes en curso cuya pestana todavia no trae el gasto (trae mensajes o reservas con el gasto en 0).
  const spendPending = period => Boolean(period) && !period.annual && !period.closed && !(Number(period.month.spend) > 0);
  // "▲ 12.3% vs Agosto completo". El color depende de si subir es bueno para ese indicador.
  function deltaHtml(current, previous, better, compareLabel) {
    const variation = change(current, previous);
    if (variation == null) return compareLabel ? `<small class="delta flat">Sin dato en ${esc(compareLabel)}</small>` : '';
    const direction = Math.abs(variation) < 0.05 ? 'flat' : variation > 0 ? 'up' : 'down';
    const tone = direction === 'flat' || !better ? 'flat' : direction === better ? 'good' : 'bad';
    const arrow = direction === 'up' ? '&#9650;' : direction === 'down' ? '&#9660;' : '&#9679;';
    return `<small class="delta ${tone}">${arrow} ${fmt.pct(Math.abs(variation))}${compareLabel ? ` vs ${esc(compareLabel)}` : ''}</small>`;
  }
  // Fila de años sobre las pestanas de mes, solo con datos de mas de un año.
  function yearTabsHtml(selectedYear) {
    const years = dataYears();
    if (years.length < 2) return '';
    return `<div class="year-tabs" role="group" aria-label="Año">${years.map(year => `<button type="button" class="month-tab${year === selectedYear ? ' active' : ''}" data-year="${year}" aria-pressed="${year === selectedYear}">${year}</button>`).join('')}</div>`;
  }
  // Gasto publicitario y Anuncios comparten el mes: las dos filas de pestanas se pintan juntas.
  const MONTH_TAB_HOSTS = ['month-tabs', 'ads-month-tabs'];
  function renderTabs() {
    if (!state.data) return;
    const year = viewYear();
    const latest = latestMonth();
    const annual = annualView();
    const selected = annual ? null : selectedMonth()?.key;
    MONTH_TAB_HOSTS.map(id => document.getElementById(id)).filter(Boolean).forEach(host => keepFocus(host, () => {
      host.innerHTML = yearTabsHtml(year) + MONTHS.map((name, index) => {
        const key = monthKey(year, index);
        const on = key === selected;
        return `<button type="button" class="month-tab${on ? ' active' : ''}" data-month="${key}" aria-pressed="${on}"${hasData(monthByKey(key)) ? '' : ' disabled title="Sin datos en Meta ni en la hoja"'}>${name}${key === latest?.key ? '<span class="current-dot"></span>' : ''}</button>`;
      }).join('') + `<button type="button" class="month-tab${annual ? ' active' : ''}" data-month="${YEAR_KEY}" aria-pressed="${annual}" title="Acumulado ${year} de los meses con datos"${latest ? '' : ' disabled'}>Anual</button>`;
    }));
  }
  function renderPeriod(period) {
    const title = document.getElementById('period-title');
    const sub = document.getElementById('period-sub');
    if (!title || !sub) return;
    if (!period) {
      title.textContent = 'Sin datos';
      sub.textContent = 'No hay meses con datos en Meta ni en la hoja Distribucion-amador.';
      return;
    }
    if (period.annual) {
      const count = period.months.length;
      const withResults = period.months.filter(month => valueFor(month, 'messages') != null);
      const partial = withResults.length && withResults.length < count ? ` Mensajes y reservas se registran desde ${withResults[0].name}; los meses anteriores solo traen gasto.` : '';
      const compare = period.previousYear ? ' La vista anual no se compara con el año anterior.' : ' Sin año anterior para comparar.';
      title.textContent = `Periodo: ${period.label} ${period.year}${period.closed ? '' : ' (año en curso)'}`;
      sub.textContent = `Acumulado de ${count} ${count === 1 ? 'mes' : 'meses'} con datos (${period.months.map(month => SHORT_MONTHS[MONTHS.indexOf(month.name)]).join(', ')}).${partial}${compare}`;
      return;
    }
    title.textContent = `Periodo: ${period.label} ${period.year}${period.closed ? '' : ' (mes en curso)'}`;
    const noSpend = Number(period.month.spend) > 0 ? '' : `. La hoja todavía no trae el gasto de ${period.month.name}`;
    sub.textContent = `${period.compare ? `Comparacion vs ${period.compare.label}` : 'Sin mes anterior para comparar'}${noSpend}`;
  }
  // Promedio por mes de la vista anual con los meses cerrados (un mes a medias lo bajaria) que registran cada indicador.
  function monthlyAverage(period) {
    const closed = period.months.filter(month => month.closed);
    const months = closed.length ? closed : period.months;
    const average = {};
    KPIS.filter(kpi => kpi.perMonth).forEach(kpi => {
      const counted = months.filter(month => summarize([month])[kpi.key] != null);
      average[kpi.key] = counted.length ? {
        value: counted.reduce((total, month) => total + summarize([month])[kpi.key], 0) / counted.length,
        basis: `Promedio de ${counted.map(month => month.name).join(', ')}`,
      } : null;
    });
    return average;
  }
  function renderKpis(period) {
    const host = document.getElementById('kpi-strip');
    if (!host) return;
    if (!period) {
      host.innerHTML = '';
      return;
    }
    const current = summarize(period.months);
    const previous = period.compare ? summarize(period.compare.months) : null;
    const average = period.annual ? monthlyAverage(period) : null;
    host.innerHTML = KPIS.map(kpi => {
      let note = `<small>${kpi.hint}</small>`;
      // Con el gasto del mes en curso sin cargar, "▼ 100%" o "Sin dato en Septiembre" se leerian mal.
      if (['spend', 'costPerMessage', 'costPerReservation'].includes(kpi.key) && spendPending(period)) note = '<small>Gasto sin cargar en la hoja</small>';
      else if (previous) note = deltaHtml(current[kpi.key], previous[kpi.key], kpi.better, period.compare.label);
      else if (average?.[kpi.key]) note = `<small title="${esc(average[kpi.key].basis)}">Prom. mensual: ${fmt[kpi.format](average[kpi.key].value)}</small>`;
      return `<div class="kpi-pill"><span>${kpi.label}</span><strong>${fmt[kpi.format](current[kpi.key])}</strong>${note}</div>`;
    }).join('');
  }
  function statusClass(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'activa' || normalized === 'activo') return 'green';
    if (normalized === 'finalizada' || normalized === 'finalizado' || normalized === 'off') return 'red';
    return 'muted';
  }
  function isFinishedStatus(status) {
    const normalized = String(status || '').toLowerCase();
    return normalized === 'off' || normalized.includes('finaliz') || normalized.includes('desactiva');
  }
  function renderTrend(reservas, goal) {
    if (goal == null || Number(goal) <= 0) return '';
    const diff = Number(reservas || 0) - Number(goal);
    const reached = diff >= 0;
    const label = reached ? 'Sobre el objetivo' : 'Debajo del objetivo';
    const detail = reached ? `Sobre: ${diff}` : `Faltan: ${Math.abs(diff)}`;
    return `<span class="reservation-trend ${reached ? 'up' : 'down'}" title="${label}: ${reservas || 0}/${goal}" aria-label="${label}: ${reservas || 0} de ${goal}">${reached ? '&#9650;' : '&#9660;'} ${detail} | Objetivo: ${goal}</span>`;
  }
  function renderDeadline(endDate, days) {
    if (!endDate) return '-';
    if (days == null) return esc(endDate);
    const counterClass = days === 0 ? 'closed' : days <= 3 ? 'urgent' : '';
    const label = days === 0 ? 'Plazo finalizado' : `${days} ${days === 1 ? 'día restante' : 'días restantes'}`;
    return `${esc(endDate)}<span class="days-counter ${counterClass}">${label}</span>`;
  }

  // ── Campanas: objetivos, conjuntos y anuncios ────────────────────────────
  const addNullable = (a, b) => (a == null && b == null ? null : Number(a || 0) + Number(b || 0));
  // Costo por resultado; sin gasto o sin resultados no hay costo ("-" en lugar de S/. 0.00).
  const ratio = (spend, count) => (count > 0 && spend > 0 ? spend / count : null);
  const normalize = normalizeHeader;

  // El objetivo es el cuadro de cada campana. Desde julio viene en la campana; junio lo trae por anuncio y en texto
  // libre ("Reservas/Mensajes", "Interaccion/Reservas"): cuenta la primera palabra.
  function objectiveFor(text) {
    const first = String(text || '').split('/')[0].trim();
    const known = OBJECTIVES.find(item => item.match.test(normalize(first)));
    if (known) return known;
    const label = first ? first.charAt(0).toUpperCase() + first.slice(1) : 'Sin objetivo';
    const key = `otro-${normalize(label).replace(/[^a-z0-9]+/g, '-')}`;
    // Un objetivo no reconocido toma el siguiente color la primera vez que aparece y lo conserva entre meses.
    if (!otherObjectives.has(key)) otherObjectives.set(key, { key, label, color: FALLBACK_COLORS[otherObjectives.size % FALLBACK_COLORS.length] });
    return otherObjectives.get(key);
  }
  // Si los anuncios de una campana de junio tienen objetivos distintos, la campana va al de mayor gasto.
  function campaignObjective(campaign) {
    if (campaign.objective) return objectiveFor(campaign.objective);
    const bySpend = new Map();
    (campaign.ads || []).forEach(ad => {
      const objective = objectiveFor(ad.objective);
      bySpend.set(objective, (bySpend.get(objective) || 0) + Number(ad.spent || 0) + 1e-9);
    });
    return [...bySpend.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || objectiveFor('');
  }
  // Desde julio la hoja agrupa por conjunto: el gasto viene por conjunto (en su primera fila) y las reservas por
  // campana. Junio trae gasto y reservas por anuncio; marzo a mayo, solo campanas.
  const byAdSet = month => (month.campaigns || []).some(campaign => (campaign.ads || []).some(ad => ad.adSet));
  const shortMonth = month => SHORT_MONTHS[MONTHS.indexOf(month.name)];

  // Campanas del mes con las cifras de la campana en la hoja (su gasto es el de la hoja, no la suma de anuncios).
  function campaignEntries(month) {
    // Meta trae el gasto por anuncio; las reservas de la hoja quedan por campana.
    const perAd = Boolean(month.meta) || !byAdSet(month);
    const reservasByCampaign = Boolean(month.meta);
    return (month.campaigns || []).map(campaign => {
      const objective = campaignObjective(campaign);
      const ads = campaign.ads || [];
      const byEnd = ads.filter(ad => dateOrderValue(ad.endDate, month.key) != null).sort((a, b) => dateOrderValue(b.endDate, month.key) - dateOrderValue(a.endDate, month.key));
      const last = byEnd[0] || ads[0] || {};
      const starts = ads.map(ad => ad.startDate).filter(date => dateOrderValue(date, month.key) != null).sort((a, b) => dateOrderValue(a, month.key) - dateOrderValue(b, month.key));
      const adGoals = ads.map(ad => ad.reservationGoal).filter(value => value != null);
      const newDaily = ads.map(ad => ad.newDailyAmount).filter(value => value != null);
      return {
        month,
        monthKey: month.key,
        name: campaign.name,
        type: campaign.type || null,
        status: campaign.status || null,
        group: objective.key,
        groupLabel: objective.label,
        color: objective.color,
        perAd,
        reservasByCampaign,
        spend: Number(campaign.spent) || 0,
        messages: campaign.messages ?? null,
        reservations: campaign.reservas ?? null,
        budget: campaign.budget ?? null,
        balance: campaign.balance ?? null,
        // Desde julio el objetivo de reservas viene en la campana; en junio, por anuncio.
        sheetGoal: campaign.reservationGoal ?? (adGoals.length ? adGoals.reduce((sum, value) => sum + Number(value), 0) : null),
        // Un mes de Meta toma las fechas planificadas de la hoja o, sin ellas, las de Meta.
        startDate: campaign.plan?.startDate || campaign.metaDates?.startDate || starts[0] || null,
        endDate: campaign.plan ? campaign.plan.endDate : campaign.metaDates ? campaign.metaDates.endDate : last.endDate || null,
        daysRemaining: campaign.plan ? campaign.plan.daysRemaining : campaign.metaDates ? null : last.daysRemaining ?? null,
        newDaily: newDaily.length ? newDaily.reduce((sum, value) => sum + Number(value), 0) : null,
        ads,
        // Marzo a mayo no traen anuncios, solo los enlaces de vista previa de la campana.
        adUrls: Array.isArray(campaign.adUrls) ? campaign.adUrls : [],
      };
    });
  }
  // Una fila por anuncio. Desde julio el nombre en la hoja es "Conjunto · Anuncio": se separan.
  function adRows(entry) {
    return entry.ads.map(ad => {
      const adSet = ad.adSet || '';
      const name = adSet && String(ad.name).startsWith(`${adSet} · `) ? String(ad.name).slice(adSet.length + 3) : String(ad.name || '');
      return {
        key: [entry.group, normalize(entry.name), normalize(adSet), normalize(name)].join('|'),
        monthKey: entry.monthKey,
        campaign: entry.name,
        group: entry.group,
        groupLabel: entry.groupLabel,
        color: entry.color,
        adSet,
        ad: name,
        perAd: entry.perAd,
        reservasByCampaign: entry.reservasByCampaign,
        spend: Number(ad.spent) || 0,
        messages: Number(ad.messages) || 0,
        reservations: Number(ad.reservas) || 0,
        status: ad.status || entry.status,
        startDate: ad.startDate || entry.startDate,
        endDate: ad.endDate || entry.endDate,
        daysRemaining: ad.daysRemaining ?? entry.daysRemaining,
        daily: ad.dailyAmount ?? null,
        observation: ad.observation || null,
        preview: ad.adUrl || '',
        // Solo los meses de Meta traen impresiones, resultados, compras (reservas web) y dias por anuncio.
        fromMeta: Array.isArray(ad.days),
        days: Array.isArray(ad.days) ? ad.days : null,
        impressions: Number(ad.impressions) || 0,
        reach: Number(ad.reach) || 0,
        clicks: Number(ad.clicks) || 0,
        results: Number(ad.results) || 0,
        resultType: ad.resultType || '',
        purchases: Number(ad.purchases) || 0,
      };
    });
  }
  const goalStoreKey = (key, campaignName) => `${key}::${campaignName}`;
  // Objetivo Reservas de una campana en su mes: el editado en el tablero o el de la hoja.
  function entryGoal(entry) {
    const saved = state.goals[goalStoreKey(entry.monthKey, entry.name)];
    return saved === '' || saved == null ? entry.sheetGoal : Number(saved);
  }
  // Base del costo: solo lo que tiene gasto cargado (al empezar el mes la hoja trae mensajes con el gasto en 0 y
  // contarlos bajaria el costo). Las filas anuales traen su propia base, sumada mes a mes.
  const costBase = item => item.costBase || (item.spend > 0
    ? { spend: item.spend, messages: item.messages ?? null, reservations: item.reservations ?? null }
    : { spend: 0, messages: null, reservations: null });
  const addBase = (a, b) => ({ spend: a.spend + b.spend, messages: addNullable(a.messages, b.messages), reservations: addNullable(a.reservations, b.reservations) });
  const costs = item => {
    const base = costBase(item);
    return { costPerMessage: ratio(base.spend, base.messages), costPerReservation: ratio(base.spend, base.reservations) };
  };
  // Totales de varias campanas: los costos usan solo el gasto de las campanas que registran ese resultado.
  function totalsOf(entries) {
    const bases = entries.map(costBase);
    const cost = field => {
      const priced = bases.filter(base => base[field] != null);
      return ratio(priced.reduce((sum, base) => sum + base.spend, 0), priced.reduce((sum, base) => sum + Number(base[field]), 0));
    };
    return {
      spend: entries.reduce((sum, entry) => sum + entry.spend, 0),
      messages: entries.reduce((sum, entry) => addNullable(sum, entry.messages), null),
      reservations: entries.reduce((sum, entry) => addNullable(sum, entry.reservations), null),
      costPerMessage: cost('messages'),
      costPerReservation: cost('reservations'),
    };
  }
  // Objetivos del periodo con actividad, de mayor a menor gasto. Los nombres de campana salen solo de las que la tuvieron.
  // share es null si el periodo no tiene gasto.
  function objectivesOf(entries) {
    const total = entries.reduce((sum, entry) => sum + entry.spend, 0);
    const groups = new Map();
    entries.forEach(entry => {
      if (!groups.has(entry.group)) groups.set(entry.group, []);
      groups.get(entry.group).push(entry);
    });
    return [...groups.values()]
      .map(items => {
        const sums = totalsOf(items);
        const campaigns = [...new Set(items.filter(hasActivity).map(item => item.name))];
        // Cifras de cada campana del cuadro (en la vista anual, sumadas por nombre), de mayor a menor gasto.
        const byCampaign = campaigns
          .map(name => {
            const own = totalsOf(items.filter(item => item.name === name));
            return { name, ...own, share: sums.spend > 0 ? (own.spend / sums.spend) * 100 : null };
          })
          .sort((a, b) => b.spend - a.spend);
        return { key: items[0].group, label: items[0].groupLabel, color: items[0].color, campaigns, byCampaign, share: total > 0 ? (sums.spend / total) * 100 : null, ...sums };
      })
      .filter(hasActivity)
      .sort((a, b) => b.spend - a.spend);
  }
  // Una fila por campana con actividad. En la vista anual se juntan por nombre exacto (como en Meta: una campana
  // renombrada sale en dos filas).
  function distributionRows(entries, annual) {
    const total = entries.reduce((sum, entry) => sum + entry.spend, 0);
    let rows = entries.map(entry => ({ ...entry, goal: entryGoal(entry), months: hasActivity(entry) ? [entry.month] : [] }));
    if (annual) {
      const byName = new Map();
      rows.forEach(entry => {
        const row = byName.get(entry.name);
        if (!row) {
          byName.set(entry.name, { ...entry, months: [...entry.months], costBase: costBase(entry) });
          return;
        }
        Object.assign(row, { group: entry.group, groupLabel: entry.groupLabel, color: entry.color, type: entry.type || row.type });
        row.costBase = addBase(row.costBase, costBase(entry));
        row.spend += entry.spend;
        row.messages = addNullable(row.messages, entry.messages);
        row.reservations = addNullable(row.reservations, entry.reservations);
        row.goal = addNullable(row.goal, entry.goal);
        row.months.push(...entry.months);
      });
      rows = [...byName.values()];
    }
    return rows.filter(hasActivity).map(row => ({ ...row, ...costs(row), share: total > 0 ? (row.spend / total) * 100 : null })).sort((a, b) => (b.spend - a.spend) || (Number(b.messages) - Number(a.messages)));
  }
  // Conjuntos de un objetivo: su nombre dentro del objetivo, para compararlo con el mes anterior aunque cambie la
  // campana. Solo traen gasto y mensajes: las reservas vienen por campana.
  function adSetsOf(rows) {
    const withSet = rows.filter(row => row.adSet);
    const total = withSet.reduce((sum, row) => sum + row.spend, 0);
    const groups = new Map();
    withSet.forEach(row => {
      const key = `${row.group}|${normalize(row.adSet)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    return [...groups.entries()]
      .map(([key, items]) => {
        const spend = items.reduce((sum, row) => sum + row.spend, 0);
        const messages = items.reduce((sum, row) => sum + row.messages, 0);
        const active = items.filter(hasActivity);
        return {
          key,
          name: items[0].adSet,
          campaigns: [...new Set(active.map(row => row.campaign))],
          adCount: new Set(active.map(row => normalize(row.ad))).size,
          spend,
          messages,
          costPerMessage: messages > 0 && spend > 0 ? spend / messages : null,
          share: total > 0 ? (spend / total) * 100 : null,
        };
      })
      .filter(set => set.spend > 0 || set.messages > 0)
      .sort((a, b) => (b.spend - a.spend) || (b.messages - a.messages));
  }
  // Anuncios con actividad (gasto propio, mensajes o reservas). En la vista anual se suman los meses.
  function adsOf(rows) {
    const groups = new Map();
    rows.forEach(row => {
      if (!groups.has(row.key)) groups.set(row.key, []);
      groups.get(row.key).push(row);
    });
    return [...groups.values()]
      .map(items => {
        const last = items[items.length - 1];
        const starts = sortedDates(items, 'startDate', 1);
        const ends = sortedDates(items, 'endDate', -1);
        const sum = field => items.reduce((total, row) => total + row[field], 0);
        return {
          ...last,
          spend: sum('spend'),
          messages: sum('messages'),
          reservations: sum('reservations'),
          perAd: items.every(row => row.perAd),
          reservasByCampaign: items.some(row => row.reservasByCampaign),
          startDate: starts[0] || last.startDate,
          endDate: ends[0] || last.endDate,
          observation: [...items].reverse().find(row => row.observation)?.observation || null,
          preview: items.find(row => row.preview)?.preview || '',
        };
      })
      .filter(hasActivity);
  }
  // Campanas, objetivos y anuncios del periodo y del mes anterior, calculados una vez por render.
  function periodModel(period) {
    if (!period) return null;
    const entries = period.months.flatMap(campaignEntries);
    const previousEntries = period.compare ? period.compare.months.flatMap(campaignEntries) : [];
    return {
      entries,
      rows: entries.flatMap(adRows),
      objectives: objectivesOf(entries),
      distribution: distributionRows(entries, period.annual),
      previous: { entries: previousEntries, rows: previousEntries.flatMap(adRows), objectives: objectivesOf(previousEntries) },
    };
  }
  // Celda de variacion contra el mes anterior: "Nuevo" si no corria, pastilla verde o roja si no.
  function variationCell(current, previous) {
    if (previous == null) return '<span class="delta-pill new">Nuevo</span>';
    const variation = change(current, previous);
    if (variation == null) return '<span class="no-data">-</span>';
    return `<span class="delta-pill ${variation >= 0 ? 'good' : 'bad'}">${variation >= 0 ? '&#9650;' : '&#9660;'} ${fmt.pct(Math.abs(variation), 0)}</span>`;
  }
  const periodName = period => (period.annual ? `${period.label} ${period.year}` : `${period.label}`);

  // ── Distribucion de la inversion por campana ─────────────────────────────
  function goalInput(row) {
    return `<input class="reservation-goal-input" type="number" min="0" step="1" value="${esc(row.goal ?? '')}" data-month="${esc(row.monthKey)}" data-campaign="${esc(row.name)}" aria-label="Objetivo Reservas ${esc(row.name)}">`;
  }
  function renderDistribution(period, model) {
    const body = document.getElementById('distribution-body');
    const sub = document.getElementById('distribution-sub');
    const note = document.getElementById('campaigns-note');
    if (!body) return;
    const observation = !period || period.annual ? '' : String(period.month.totalObservation || '').trim();
    if (note) {
      note.textContent = observation ? `* ${observation}` : '';
      note.classList.toggle('visible', Boolean(observation));
    }
    if (!period) {
      body.innerHTML = '<tr><td class="table-empty" colspan="14">Sin datos para el periodo.</td></tr>';
      if (sub) sub.textContent = '';
      return;
    }
    const rows = model.distribution;
    const custom = period.annual ? null : getMonthCustom();
    const branding = period.months.reduce((sum, month) => sum + Number(month.spendBreakdown?.branding || 0), 0);
    const total = rows.reduce((sum, row) => sum + row.spend, 0);
    const withoutDetail = period.months.filter(month => hasData(month) && !(month.campaigns || []).length);
    if (sub && !period.annual && !(period.month.campaigns || []).length) {
      sub.textContent = `${periodName(period)} | ${period.month.name} no trae detalle de campañas: solo el gasto total.`;
    } else if (sub) {
      const parts = [`${periodName(period)} | ${rows.length} ${rows.length === 1 ? 'campaña' : 'campañas'} con gasto, mensajes o reservas.`];
      if (branding > 0) parts.push(`Ventas ${fmt.money(total - branding)} y Branding ${fmt.money(branding)}.`);
      if (withoutDetail.length) parts.push(`${withoutDetail.map(month => month.name).join(' y ')} no ${withoutDetail.length === 1 ? 'trae' : 'traen'} detalle de campañas.`);
      sub.textContent = parts.join(' ');
    }
    const html = rows.map(row => `
      <tr>
        <td class="campaign-name">${esc(row.name)}${period.annual ? `<small>${row.months.map(shortMonth).join(', ')}</small>` : ''}</td>
        <td><span class="objective-label" style="--campaign-color:${row.color}"><i class="campaign-dot"></i>${esc(row.groupLabel)}</span></td>
        <td>${esc(row.type || '-')}</td>
        <td class="num">${fmt.count(row.messages)}</td>
        <td class="num">${fmt.money(row.costPerMessage)}</td>
        <td class="num">${fmt.count(row.reservations)}</td>
        <td class="goal-col">${period.annual ? `<span class="goal-sum">${fmt.count(row.goal)}</span>` : goalInput(row)}${renderTrend(row.reservations, row.goal)}</td>
        <td class="num">${fmt.money(row.costPerReservation)}</td>
        <td class="num"><b>${fmt.money(row.spend)}</b></td>
        <td class="share-col"><div class="share-bar" style="--campaign-color:${row.color}"><span style="width:${Math.min(100, row.share || 0).toFixed(1)}%"></span></div><b class="share-value">${fmt.pct(row.share)}</b></td>
        <td class="num">${period.annual ? '-' : fmt.money(row.budget)}</td>
        <td class="num">${period.annual ? '-' : fmt.money(row.balance)}</td>
        <td class="date-col deadline-cell">${period.annual ? '-' : renderDeadline(row.endDate, row.daysRemaining)}</td>
        <td class="num">${period.annual ? '-' : fmt.money(row.newDaily)}</td>
      </tr>`);
    // Campanas agregadas a mano en este navegador (sin cifras de la hoja).
    (custom?.campaigns || []).forEach(campaign => html.push(`
      <tr class="custom-row">
        <td class="campaign-name"><input class="inline-edit wide" type="text" placeholder="Nombre campaña" value="${esc(campaign.name)}" data-field="cname" data-cid="${esc(campaign._id)}" aria-label="Nombre de la campaña agregada"></td>
        <td><span class="no-data">Manual</span></td>
        <td><input class="inline-edit" type="text" placeholder="Tipo" value="${esc(campaign.type)}" data-field="type" data-cid="${esc(campaign._id)}" aria-label="Tipo de la campaña agregada"></td>
        <td colspan="11"><span class="no-data">Agregada en este navegador: sin cifras de la hoja.</span></td>
      </tr>`));
    if (custom) html.push('<tr class="add-campaign-row"><td colspan="14"><button type="button" class="add-campaign-btn">＋ Agregar campaña</button></td></tr>');
    if (rows.length) {
      const sums = totalsOf(rows);
      const goal = rows.reduce((sum, row) => addNullable(sum, row.goal), null);
      const month = period.annual ? null : period.month;
      html.push(`
      <tr class="total-row">
        <td class="campaign-name">${month ? `Total actualizado ${month.name.toLowerCase()}` : `Total de campañas ${period.year}`}</td>
        <td></td><td></td>
        <td class="num">${fmt.count(sums.messages)}</td>
        <td class="num">${fmt.money(sums.costPerMessage)}</td>
        <td class="num">${fmt.count(sums.reservations)}</td>
        <td class="goal-col">${goal != null ? `<span class="goal-sum">${fmt.count(goal)}</span>` : ''}${renderTrend(sums.reservations, goal)}</td>
        <td class="num">${fmt.money(sums.costPerReservation)}</td>
        <td class="num">${fmt.money(month ? month.spend : sums.spend)}</td>
        <td><b class="share-value">${(month ? Number(month.spend) : sums.spend) > 0 ? '100%' : '-'}</b></td>
        <td class="num">${month ? fmt.money(month.budgetTotal) : '-'}</td>
        <td class="num">${month ? fmt.money(month.balanceTotal) : '-'}</td>
        <td></td>
        <td class="num">${month ? fmt.money(month.newDailyTotal) : '-'}</td>
      </tr>`);
    } else if (!custom?.campaigns.length) {
      const empty = period.annual || (period.month.campaigns || []).length ? `Sin campañas con actividad en ${esc(periodName(period))}.` : `${esc(period.month.name)} no trae detalle de campañas en la hoja.`;
      html.unshift(`<tr><td class="table-empty" colspan="14">${empty}</td></tr>`);
    }
    keepFocus(body, () => { body.innerHTML = html.join(''); });
  }

  // ── Graficos por mes ─────────────────────────────────────────────────────
  const formatValue = (unit, value) => (unit === 'money' ? fmt.money(value) : fmt.count(value));
  const tickValue = (unit, value) => (unit === 'money'
    ? (value === 0 ? 'S/. 0' : `S/. ${Number(value).toLocaleString('es-PE', { maximumFractionDigits: 0 })}`)
    : Number(value).toLocaleString('es-PE', { notation: Math.abs(value) >= 100000 ? 'compact' : 'standard', maximumFractionDigits: 1 }));

  // Con un indicador hay un solo eje y; con varios, un eje por indicador apilado en vertical (paneles con su
  // escala) sobre el mismo eje de meses. Nunca dos escalas a la vista sobre las mismas lineas: los cruces no
  // significarian nada. En un solo cuadro (combined) cada indicador tiene su escala sin eje visible: se compara la
  // forma y el valor va en cada punto.
  function yScales(metrics, combined) {
    const base = unit => ({ beginAtZero: true, border: { display: false }, ticks: { color: '#7890b5', font: { size: 10 }, callback: value => tickValue(unit, value) } });
    if (metrics.length === 1) return { y: { ...base(metrics[0].unit), grace: '12%', grid: { color: 'rgba(148,163,184,.20)' } } };
    if (combined) return Object.fromEntries(metrics.map((metric, index) => [`y${index}`, { display: false, beginAtZero: true, grace: '18%' }]));
    // Chart.js apila de abajo hacia arriba en el orden de los ejes: se dan al reves para que el primero quede arriba.
    return Object.fromEntries(metrics.map((metric, index) => [`y${index}`, {
      ...base(metric.unit),
      stack: 'metrics',
      stackWeight: 1,
      grace: '25%',
      // El tope de cada panel cae sobre el cero del panel de arriba: se omite para que no se encimen.
      ticks: { ...base(metric.unit).ticks, maxTicksLimit: 5, callback: (value, tickIndex, ticks) => (index > 0 && tickIndex === ticks.length - 1 ? '' : tickValue(metric.unit, value)) },
      // La linea del cero marca el piso de cada panel.
      grid: { color: context => (context.tick?.value === 0 ? '#cbd5e1' : 'rgba(148,163,184,.20)') },
      panelLabel: metric.label,
    }]).reverse());
  }

  // Total de cada mes del año por indicador; un mes sin dato queda como hueco. legend: leyenda propia (opcional).
  // combined: los indicadores van juntos en un solo cuadro, sin relleno (taparia las otras lineas).
  function monthlySeries(metrics, valueOf, legend, combined) {
    const multiple = metrics.length > 1;
    return {
      labels: SHORT_MONTHS,
      datasets: metrics.map((metric, index) => ({
        label: metric.label,
        unit: metric.unit,
        data: MONTHS.map((_, monthIndex) => valueOf(metric, monthIndex)),
        borderColor: metric.color,
        backgroundColor: `${metric.color}1a`,
        fill: !(combined && multiple),
        borderWidth: 2.5,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: metric.color,
        tension: 0.25,
        spanGaps: false,
        valueLabels: true,
        ...(multiple ? { yAxisID: `y${index}` } : {}),
      })),
      legend: legend || (multiple && combined
        ? metrics.map(metric => `<span><i class="legend-line" style="background:${metric.color}"></i><b>${esc(metric.label)} por mes</b></span>`).concat(COMBINED_NOTE)
        : multiple
          ? [`<span><i class="legend-line" style="background:${metrics[0].color}"></i><b>${metrics.length} indicadores por mes</b></span>`, '<span>Cada indicador con su escala.</span>']
          : [`<span><i class="legend-line" style="background:${metrics[0].color}"></i><b>${esc(metrics[0].label)} por mes</b></span>`]),
    };
  }
  const COMBINED_NOTE = '<span>Cada indicador con su escala: compara la forma y lee el valor en el punto.</span>';
  // Boton "Un solo cuadro" (con dos o mas indicadores marcados): junta los indicadores en un cuadro.
  const combineButtonHtml = (combined, attr) => `<button type="button" class="series-toggle chart-combine${combined ? ' active' : ''}" ${attr} aria-pressed="${combined}" title="${combined ? 'Volver a un panel por indicador' : 'Juntar los indicadores en un solo cuadro'}">Un solo cuadro</button>`;

  function destroyChart(id) {
    state.charts.get(id)?.destroy();
    state.charts.delete(id);
  }

  function drawLineChart(id, canvas, series, metrics, combined) {
    destroyChart(id);
    if (!canvas) return;
    if (typeof Chart === 'undefined') {
      canvas.parentElement.innerHTML = '<div class="empty-state"><strong>Grafico no disponible sin conexion.</strong><span>Los indicadores y las tablas siguen visibles.</span></div>';
      return;
    }
    // Cada panel extra suma alto para que ninguno quede aplastado; en un solo cuadro, algo mas para las etiquetas.
    const together = Boolean(combined) && metrics.length > 1;
    canvas.parentElement.style.height = together ? '380px' : metrics.length > 1 ? `${90 + 135 * metrics.length}px` : '';
    state.charts.set(id, new Chart(canvas, {
      type: 'line',
      data: { labels: series.labels, datasets: series.datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 24, right: 12, left: 4 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            filter: item => item.raw != null,
            callbacks: {
              title: items => MONTHS[items[0].dataIndex],
              label: context => ` ${context.dataset.label}: ${formatValue(context.dataset.unit, context.raw)}`,
            },
          },
        },
        scales: {
          x: { grid: { display: false }, border: { color: '#cbd5e1' }, ticks: { color: '#7890b5', font: { size: 10 }, autoSkip: true, maxTicksLimit: 12 } },
          ...yScales(metrics, together),
        },
      },
      plugins: [{
        // Valor en cada punto, menos los ceros (el punto ya esta en la base). Va arriba en un pico y abajo en un
        // valle, para no montarse en la linea, con halo blanco. Si choca con otra etiqueta o con el nombre de un
        // panel, o se sale de su panel, prueba el otro lado; si tampoco cabe, se omite (queda en el tooltip).
        id: 'valueLabels',
        afterDatasetsDraw(chart) {
          const ctx = chart.ctx;
          const placed = [];
          const overlaps = box => placed.some(other => !(box.right < other.left || box.left > other.right || box.bottom < other.top || box.top > other.bottom));
          ctx.save();
          // Los nombres de los paneles (panelLabels) tambien ocupan lugar.
          ctx.font = '600 11px Inter, sans-serif';
          Object.values(chart.scales).forEach(scale => {
            if (!scale.options.panelLabel) return;
            const left = chart.chartArea.left + 4;
            placed.push({ left, right: left + ctx.measureText(scale.options.panelLabel).width + 8, top: scale.top + 2, bottom: scale.top + 18 });
          });
          ctx.font = '600 10px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineJoin = 'round';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(255,255,255,.92)';
          chart.data.datasets.forEach((dataset, index) => {
            if (!dataset.valueLabels) return;
            const meta = chart.getDatasetMeta(index);
            const scale = chart.scales[meta.yAxisID];
            if (!scale) return;
            // Solo el panel de arriba puede usar el margen superior del grafico.
            const top = scale.top <= chart.chartArea.top + 1 ? chart.chartArea.top - 22 : scale.top;
            ctx.fillStyle = dataset.borderColor;
            meta.data.forEach((point, pointIndex) => {
              const value = dataset.data[pointIndex];
              if (value == null || Number(value) === 0) return;
              // Soles sin decimales, salvo montos chicos (S/. 8.40 no debe leerse S/. 8).
              const text = dataset.unit === 'money'
                ? (Math.abs(value) >= 10 ? tickValue('money', Math.round(value)) : fmt.money(value))
                : Number(value).toLocaleString('es-PE', { notation: value >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 });
              const half = ctx.measureText(text).width / 2 + 2;
              const before = dataset.data[pointIndex - 1];
              const after = dataset.data[pointIndex + 1];
              const valley = before != null && after != null && value < before && value < after;
              const sides = valley ? [point.y + 13, point.y - 12] : [point.y - 12, point.y + 13];
              // Pegada al borde, la etiqueta se corre hacia adentro para no cortarse.
              const x = Math.min(Math.max(point.x, half), chart.width - half);
              const box = sides
                .map(y => ({ y, left: x - half, right: x + half, top: y - 6, bottom: y + 6 }))
                .find(item => item.top >= top && item.bottom <= scale.bottom && !overlaps(item));
              if (!box) return;
              placed.push(box);
              ctx.strokeText(text, x, box.y);
              ctx.fillText(text, x, box.y);
            });
          });
          ctx.restore();
        },
      }, {
        // Nombre de cada panel arriba a la izquierda (solo con varios indicadores).
        id: 'panelLabels',
        afterDatasetsDraw(chart) {
          const ctx = chart.ctx;
          ctx.save();
          ctx.font = '600 11px Inter, sans-serif';
          ctx.textBaseline = 'top';
          Object.values(chart.scales).forEach(scale => {
            const label = scale.options.panelLabel;
            if (!label) return;
            const x = chart.chartArea.left + 8;
            const y = scale.top + 4;
            ctx.fillStyle = 'rgba(255,255,255,.85)';
            ctx.fillRect(x - 4, y - 2, ctx.measureText(label).width + 8, 16);
            ctx.fillStyle = '#475569';
            ctx.fillText(label, x, y);
          });
          ctx.restore();
        },
      }, {
        // Linea vertical en el mes del tooltip, a lo alto de todos los paneles.
        id: 'crosshair',
        afterDatasetsDraw(chart) {
          const active = chart.tooltip?.getActiveElements() || [];
          if (!active.length) return;
          const x = active[0].element.x;
          const ctx = chart.ctx;
          ctx.save();
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(x, chart.chartArea.top);
          ctx.lineTo(x, chart.chartArea.bottom);
          ctx.stroke();
          ctx.restore();
        },
      }],
    }));
  }

  // Casillas de indicadores de un grafico.
  function chipsHtml(items, selected, name, color) {
    return items.map(item => {
      const on = selected.includes(item.key);
      return `<label class="series-toggle campaign-chip${on ? ' active' : ''}" style="--campaign-color:${color}"><input type="checkbox" name="${esc(name)}" value="${esc(item.key)}"${on ? ' checked' : ''}>${esc(item.label)}</label>`;
    }).join('');
  }

  // Indicadores del grafico de un cuadro: el resultado del objetivo va primero (Reservas en su cuadro, Mensajes en
  // los demas) y, por defecto, junto a la inversion; despues el otro resultado y los costos (el del resultado del
  // cuadro primero). El orden sigue la lista, no los clics. En paneles van con el color del objetivo; en un solo
  // cuadro, cada uno con el suyo.
  function blockMetricList(objective, combined) {
    const result = objective.key === 'reservas' ? 'reservations' : 'messages';
    const costs = result === 'reservations' ? ['costPerReservation', 'costPerMessage'] : ['costPerMessage', 'costPerReservation'];
    return [result, 'spend', result === 'messages' ? 'reservations' : 'messages', ...costs]
      .map(key => BLOCK_METRICS.find(metric => metric.key === key))
      .map(metric => ({ ...metric, color: combined ? metric.combineColor : objective.color }));
  }

  // Valor de un objetivo en un mes; hueco si ese mes el objetivo no tuvo gasto o no registra el indicador. Los
  // costos salen de las sumas de sus campanas (totalsOf: solo las que tienen gasto cargado; sin resultados, hueco).
  function objectiveMonthValue(month, key, metric) {
    if (!hasData(month)) return null;
    const entries = campaignEntries(month).filter(entry => entry.group === key);
    if (!entries.some(hasActivity)) return null;
    if (metric === 'spend') return entries.reduce((sum, entry) => sum + entry.spend, 0);
    if (metric === 'costPerMessage' || metric === 'costPerReservation') return totalsOf(entries)[metric];
    return entries.reduce((sum, entry) => addNullable(sum, entry[metric]), null);
  }

  // ── Cuadro de cada objetivo ──────────────────────────────────────────────
  function blockSettings(key) {
    const saved = state.campaignBlocks[key] || {};
    return { ...saved, collapsed: saved.collapsed === true };
  }
  function saveBlockSettings(key, changes) {
    state.campaignBlocks[key] = { ...blockSettings(key), ...changes };
    try { localStorage.setItem(CAMPAIGN_BLOCKS_KEY, JSON.stringify(state.campaignBlocks)); } catch {}
  }
  function readBlockSettings() {
    try {
      const value = JSON.parse(localStorage.getItem(CAMPAIGN_BLOCKS_KEY) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }
  function setToggle(button, collapsed, what) {
    if (!button) return;
    button.setAttribute('aria-expanded', String(!collapsed));
    button.setAttribute('title', collapsed ? `Expandir ${what}` : `Minimizar ${what}`);
  }
  // Meses del año en que corrio un objetivo (vista anual, en lugar de la comparacion con el mes anterior).
  function objectiveMonths(period, entries, key) {
    const months = period.months.filter(month => entries.some(entry => entry.group === key && entry.monthKey === month.key && hasActivity(entry)));
    const withDetail = period.months.filter(month => (month.campaigns || []).length);
    if (months.length === withDetail.length) return `Activo en los ${months.length} ${months.length === 1 ? 'mes' : 'meses'} con detalle`;
    return `Activo en ${months.map(shortMonth).join(', ') || 'ningún mes'}`;
  }
  function adSetsHtml(period, objective, model) {
    const ofObjective = rows => rows.filter(row => row.group === objective.key);
    const rows = ofObjective(model.rows);
    const head = '<div class="adset-head"><div class="panel-title">Conjuntos de anuncios</div>';
    if (!rows.some(row => row.adSet)) {
      const why = rows.length
        ? `${period.annual ? 'Estos meses no agrupan' : `${period.month.name} no agrupa`} los anuncios por conjunto: el detalle va en la tabla de anuncios de abajo.`
        : 'La hoja no trae el detalle de anuncios de estas campañas.';
      return `${head}<div class="panel-sub">${why}</div></div>`;
    }
    const sets = adSetsOf(rows);
    const previousRows = ofObjective(model.previous.rows);
    // Sin conjuntos en el mes anterior (junio no agrupaba) no hay contra que comparar.
    const compare = Boolean(period.compare) && previousRows.some(row => row.adSet);
    const previous = new Map(compare ? adSetsOf(previousRows).map(set => [set.key, set]) : []);
    const manyCampaigns = objective.campaigns.length > 1;
    const columns = [['Conjunto']].concat(manyCampaigns ? [['Campaña']] : [], [['Mensajes', true]])
      .concat(compare ? [[`Mensajes ${period.compare.month.name}`, true], ['Variación', true]] : [])
      .concat([['Costo por mensaje', true], ['Gasto', true], ['% del objetivo']]);
    const body = sets.map(set => {
      const before = previous.get(set.key);
      return `
        <tr>
          <td class="campaign-name">${esc(set.name)}<small>${set.adCount} ${set.adCount === 1 ? 'anuncio' : 'anuncios'}</small></td>
          ${manyCampaigns ? `<td class="campaign-set-col">${esc(set.campaigns.join(' / '))}</td>` : ''}
          <td class="num"><b>${fmt.count(set.messages)}</b></td>
          ${compare ? `<td class="num">${before ? fmt.count(before.messages) : '<span class="no-data">-</span>'}</td><td class="num">${variationCell(set.messages, before?.messages)}</td>` : ''}
          <td class="num">${fmt.money(set.costPerMessage)}</td>
          <td class="num">${fmt.money(set.spend)}</td>
          <td class="share-col"><div class="share-bar"><span style="width:${Math.min(100, set.share || 0).toFixed(1)}%"></span></div><b class="share-value">${fmt.pct(set.share)}</b></td>
        </tr>`;
    }).join('') || `<tr><td class="table-empty" colspan="${columns.length}">Sin conjuntos con actividad en el periodo.</td></tr>`;
    let note = `${sets.length} ${sets.length === 1 ? 'conjunto' : 'conjuntos'} con gasto o mensajes en ${esc(periodName(period))}`;
    if (compare) note += `. Mensajes contra ${esc(period.compare.label)}`;
    else if (period.compare) note += `. ${esc(period.compare.month.name)} no agrupaba por conjunto`;
    return `${head}<div class="panel-sub">${note}. Las reservas se registran por campaña.</div></div>
      <div class="table-scroll">
        <table class="data-table adset-table">
          <thead><tr>${columns.map(([label, numeric]) => `<th${numeric ? ' class="num"' : ''}>${esc(label)}</th>`).join('')}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  }
  function campaignBlockHtml(period, objective, before, model) {
    const key = esc(objective.key);
    const settings = blockSettings(objective.key);
    let comparison = '';
    if (period.annual) comparison = `. ${objectiveMonths(period, model.entries, objective.key)}`;
    else if (period.compare && !period.compare.detail) comparison = `. ${period.compare.month.name} no trae detalle de campañas`;
    else if (period.compare) comparison = before ? ` vs ${period.compare.label}` : `. Nueva: no corría en ${period.compare.month.name}`;
    const kpis = BLOCK_KPIS.map(kpi => `
      <div><dt>${kpi.label}</dt><dd>${fmt[kpi.format](objective[kpi.key])}${before && !(kpi.key === 'spend' && spendPending(period)) ? deltaHtml(objective[kpi.key], before[kpi.key], kpi.better) : ''}</dd></div>`).join('');
    // Con varias campanas en el cuadro, el monto de cada una (la inversion de arriba es su suma).
    const beforeByName = new Map((before?.byCampaign || []).map(item => [item.name, item]));
    const split = objective.byCampaign.length > 1 ? `
        <div class="campaign-split" role="table" aria-label="Inversión por campaña de ${esc(objective.label)}">
          <div class="campaign-split-row campaign-split-head" role="row"><span role="columnheader">Campaña</span><span role="columnheader" class="num">Inversión</span><span role="columnheader" class="num">% del cuadro</span><span role="columnheader" class="num">Mensajes</span><span role="columnheader" class="num">Reservas</span></div>
          ${objective.byCampaign.map(item => `
          <div class="campaign-split-row" role="row"><span role="cell" class="campaign-split-name">${esc(item.name)}</span><span role="cell" class="num"><b>${fmt.money(item.spend)}</b>${beforeByName.has(item.name) && !spendPending(period) ? deltaHtml(item.spend, beforeByName.get(item.name).spend, null) : ''}</span><span role="cell" class="num">${item.share == null ? '-' : fmt.pct(item.share)}</span><span role="cell" class="num">${fmt.count(item.messages)}</span><span role="cell" class="num">${fmt.count(item.reservations)}</span></div>`).join('')}
        </div>` : '';
    return `
      <section class="campaign-block${settings.collapsed ? ' is-collapsed' : ''}" id="campaign-${key}" data-objective="${key}" style="--campaign-color:${objective.color}">
        <div class="panel-head chart-panel-head">
          <div>
            <div class="campaign-block-title"><i class="campaign-dot"></i>Campaña ${esc(objective.label)}${objective.share == null ? '' : `<em>${fmt.pct(objective.share)} de la inversión</em>`}</div>
            <div class="panel-sub">${esc(objective.campaigns.join(' / '))} | ${esc(periodName(period))}${esc(comparison)}</div>
          </div>
          <div class="chart-controls">
            <button type="button" class="chart-toggle" data-campaign-toggle="${key}" aria-controls="campaign-body-${key}">${CHEVRON}</button>
          </div>
        </div>
        <dl class="chart-kpis">${kpis}</dl>${split}
        <div class="campaign-block-body" id="campaign-body-${key}">
          <div class="chart-series-toggles chart-metrics" data-campaign-metrics role="group" aria-label="Indicadores del grafico de ${esc(objective.label)}"></div>
          <div class="chart-wrap h-300"><canvas role="img" aria-label="Grafico por mes de la campaña ${esc(objective.label)}"></canvas></div>
          <div class="chart-legend projection-legend" data-campaign-legend></div>
          ${adSetsHtml(period, objective, model)}
          ${campaignAdsHtml(period, objective, model)}
        </div>
      </section>`;
  }
  function renderCampaignBlock(key, period, model) {
    const block = [...document.querySelectorAll('#campaign-blocks .campaign-block')].find(node => node.dataset.objective === key);
    const objective = model?.objectives.find(item => item.key === key);
    if (!block || !objective) return;
    const settings = blockSettings(key);
    const keys = blockMetricList(objective).map(metric => metric.key);
    const saved = Array.isArray(settings.metrics) ? keys.filter(metricKey => settings.metrics.includes(metricKey)) : [];
    const selectedKeys = saved.length ? saved : keys.slice(0, 2);
    const combined = settings.combined && selectedKeys.length > 1;
    const metrics = blockMetricList(objective, combined);
    const selected = metrics.filter(metric => selectedKeys.includes(metric.key));
    block.classList.toggle('is-collapsed', settings.collapsed);
    setToggle(block.querySelector('[data-campaign-toggle]'), settings.collapsed, `la campaña ${objective.label}`);
    const chips = block.querySelector('[data-campaign-metrics]');
    const combineButton = selectedKeys.length > 1 ? combineButtonHtml(combined, 'data-campaign-combine') : '';
    keepFocus(chips, () => { chips.innerHTML = chipsHtml(metrics, selectedKeys, `campaign-metric-${key}`, objective.color) + combineButton; });
    if (settings.collapsed) {
      destroyChart(`block:${key}`);
      return;
    }
    const year = viewYear();
    const series = monthlySeries(selected, (metric, monthIndex) => objectiveMonthValue(monthByKey(monthKey(year, monthIndex)), key, metric.key), null, combined);
    block.querySelector('[data-campaign-legend]').innerHTML = series.legend.join('');
    drawLineChart(`block:${key}`, block.querySelector('canvas'), series, selected, combined);
  }
  function renderCampaignBlocks(period, model) {
    const host = document.getElementById('campaign-blocks');
    if (!host) return;
    if (!period || !model) {
      [...state.charts.keys()].filter(id => id.startsWith('block:')).forEach(destroyChart);
      host.innerHTML = '';
      return;
    }
    const previous = new Map(model.previous.objectives.map(objective => [objective.key, objective]));
    [...state.charts.keys()].filter(id => id.startsWith('block:')).forEach(destroyChart);
    keepFocus(host, () => {
      host.innerHTML = model.objectives.map(objective => campaignBlockHtml(period, objective, period.compare ? previous.get(objective.key) : null, model)).join('');
      model.objectives.forEach(objective => renderCampaignBlock(objective.key, period, model));
    });
  }

  // ── Modulo Anuncios (vista view-ads) ─────────────────────────────────────
  // Comparte el mes, el periodo y la comparacion (mes anterior completo) con Gasto publicitario: las dos vistas se
  // pintan con el mismo state.monthKey y el mismo modelo. Reservas web = las "Compras" que Meta atribuye al anuncio
  // (compras en el sitio web); la descarga no trae su valor, asi que no hay ventas ni ROAS. Las reservas de la hoja
  // siguen por campana. Solo los meses de Meta traen impresiones, resultados y dias por anuncio.
  const MESSAGE_RESULT = 'Conversaciones con mensajes iniciadas';
  const unique = values => [...new Set(values.filter(Boolean))];
  // Un anuncio es su nombre dentro de su objetivo: si corre en varios conjuntos o campanas (o meses, en la vista
  // anual) se suma. Los resultados de tipos distintos no se suman: el anuncio muestra los del tipo con mas resultados.
  // Un mes de la hoja (sin Meta) solo trae mensajes: cuentan como su resultado.
  function adsByName(rows) {
    const groups = new Map();
    rows.forEach(row => {
      const key = `${row.group}|${normalize(row.ad)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    return [...groups.entries()].map(([key, items]) => {
      const last = items[items.length - 1];
      const sum = field => items.reduce((total, row) => total + (Number(row[field]) || 0), 0);
      const meta = items.filter(row => row.fromMeta);
      const byType = new Map();
      items.forEach(row => {
        const type = row.fromMeta ? row.resultType : MESSAGE_RESULT;
        const count = row.fromMeta ? row.results : row.messages;
        if (type || count) byType.set(type, (byType.get(type) || 0) + count);
      });
      const [resultType, results] = [...byType.entries()].sort((a, b) => b[1] - a[1])[0] || ['', 0];
      const latestKey = items.reduce((max, row) => (row.monthKey > max ? row.monthKey : max), '');
      const latest = items.filter(row => row.monthKey === latestKey);
      return {
        key,
        group: last.group,
        groupLabel: last.groupLabel,
        color: last.color,
        ad: last.ad,
        campaigns: unique(items.map(row => row.campaign)),
        adSets: unique(items.map(row => row.adSet)),
        status: latest.some(row => row.status === 'Activa') ? 'Activa' : latest.find(row => row.status)?.status || '',
        fromMeta: meta.length > 0,
        perAd: items.every(row => row.perAd),
        spend: sum('spend'),
        messages: sum('messages'),
        purchases: sum('purchases'),
        impressions: sum('impressions'),
        reach: sum('reach'),
        clicks: sum('clicks'),
        resultType,
        results,
        resultsByType: byType,
        mixedResults: byType.size > 1,
        activeDays: meta.length ? new Set(meta.flatMap(row => row.days || [])).size : null,
        preview: items.find(row => /^https:\/\//.test(row.preview))?.preview || '',
      };
    }).filter(ad => ad.spend > 0 || ad.impressions > 0 || ad.clicks > 0 || ad.messages > 0 || ad.purchases > 0);
  }
  // De mas a menos resultados (a igual resultado, mas gasto). Lider: el primero con resultados de cada objetivo.
  function rankAds(ads, order) {
    ads.sort((a, b) => ((order?.get(a.group) ?? 0) - (order?.get(b.group) ?? 0)) || (b.results - a.results) || (b.spend - a.spend));
    const leaders = new Set();
    ads.forEach(ad => {
      ad.leader = ad.results > 0 && !leaders.has(ad.group);
      if (ad.leader) leaders.add(ad.group);
    });
    return ads;
  }
  // Costos de un anuncio: solo con gasto propio (desde julio la hoja lo registra por conjunto).
  const adCost = (ad, count) => (ad.perAd && count > 0 && ad.spend > 0 ? ad.spend / count : null);
  const adCpm = ad => (ad.perAd && ad.impressions > 0 && ad.spend > 0 ? (ad.spend / ad.impressions) * 1000 : null);
  const metaOnly = (ad, html) => (ad.fromMeta ? html : '<span class="no-data">-</span>');
  // Nombre del anuncio con la estrella del lider y el enlace a la vista previa de Meta.
  function adNameHtml(ad) {
    const url = safeUrl(ad.preview);
    const name = esc(ad.ad || '(sin nombre)');
    const star = ad.leader ? '<b class="leader-star" title="Líder del objetivo: más resultados">&#9733;</b> ' : '';
    const link = url ? `<a class="ad-link" href="${url}" target="_blank" rel="noopener noreferrer" title="Ver el anuncio en Meta">${name}<span aria-hidden="true"> &#8599;</span></a>` : name;
    return `<span class="ad-name-text" title="${esc(ad.ad)}">${star}${link}</span>`;
  }
  const campaignSetHtml = ad => `${esc(ad.campaigns.join(' / '))}${ad.adSets.length ? `<small>${esc(ad.adSets.join(' / '))}</small>` : ''}`;
  const spendHtml = ad => (ad.perAd ? fmt.money(ad.spend) : '<span class="no-data" title="El gasto se registra por conjunto">Por conjunto</span>');
  const resultTypeHtml = ad => `${esc(ad.resultType || '-')}${ad.mixedResults ? '<small>y otros tipos</small>' : ''}`;
  // Resultados del mes anterior del mismo tipo: 0 si ese mes corrio sin resultados y "-" si tuvo otro tipo.
  const previousResults = (ad, before) => (before ? before.resultsByType.get(ad.resultType) ?? (before.resultsByType.size ? null : 0) : null);
  function compareCells(ad, before, className = '') {
    const value = previousResults(ad, before);
    const cls = className ? ` ${className}` : '';
    return `<td class="num${cls}">${value == null ? '<span class="no-data">-</span>' : fmt.count(value)}</td>
          <td class="num${cls}">${before && value == null ? '<span class="no-data">-</span>' : variationCell(ad.results, value)}</td>`;
  }
  // Periodo del modulo: el mismo de Gasto publicitario.
  function renderAdsPeriod(period, compare) {
    const title = document.getElementById('ads-period-title');
    const sub = document.getElementById('ads-period-sub');
    if (!title || !sub) return;
    if (!period) {
      title.textContent = 'Sin datos';
      sub.textContent = 'No hay meses con datos en Meta ni en la hoja Distribucion-amador.';
      return;
    }
    if (period.annual) {
      title.textContent = `Periodo: ${period.label} ${period.year}${period.closed ? '' : ' (año en curso)'}`;
      sub.textContent = 'Acumulado del año: sin periodo anterior para comparar';
      return;
    }
    title.textContent = `Periodo: ${period.label} ${period.year}${period.closed ? '' : ' (mes en curso)'}`;
    if (!period.compare) sub.textContent = 'Sin mes anterior para comparar';
    else sub.textContent = compare ? `Comparación vs ${period.compare.label}` : `${period.compare.month.name} no trae el detalle de anuncios: sin comparación`;
  }
  // Top 3 por reservas web (a igual cantidad, mas mensajes y luego menos gasto).
  function renderTopReservations(period, ads) {
    const host = document.getElementById('ad-top');
    const sub = document.getElementById('ad-top-sub');
    if (!host) return;
    if (sub) sub.textContent = 'Reservas web: las compras en el sitio web que Meta atribuye a cada anuncio. Las reservas de la hoja se registran por campaña.';
    const top = ads.filter(ad => ad.purchases > 0)
      .sort((a, b) => (b.purchases - a.purchases) || (b.messages - a.messages) || (a.spend - b.spend))
      .slice(0, 3);
    if (!top.length) {
      const why = !period ? 'Sin datos para el periodo.'
        : ads.some(ad => ad.fromMeta) ? 'Ningún anuncio registró reservas web en el periodo.'
          : `Las reservas web por anuncio salen de las descargas de Meta: ${period.annual ? 'este periodo no tiene' : `${period.month.name} no tiene`} descarga.`;
      host.innerHTML = `<p class="ad-top-empty">${esc(why)}</p>`;
      return;
    }
    host.innerHTML = top.map((ad, index) => {
      const detail = [`${fmt.unitCost(adCost(ad, ad.purchases))} por reserva web`, `${fmt.count(ad.messages)} ${ad.messages === 1 ? 'mensaje' : 'mensajes'}`, `${fmt.money(ad.spend)} de inversión`];
      return `
        <article class="ad-top-card">
          <div class="ad-top-rank">Puesto ${index + 1}</div>
          <div class="ad-top-name">${adNameHtml({ ...ad, leader: false })}</div>
          <div class="ad-top-meta"><span class="objective-label" style="--campaign-color:${ad.color}"><i class="campaign-dot"></i>${esc(ad.groupLabel)}</span> ${campaignSetHtml(ad)}</div>
          <div class="ad-top-value">${fmt.count(ad.purchases)}<span>${ad.purchases === 1 ? 'reserva web' : 'reservas web'}</span></div>
          <div class="ad-top-detail">${detail.join(' · ')}</div>
        </article>`;
    }).join('');
  }
  function renderAdsFilter(objectives) {
    const select = document.getElementById('ads-objective');
    if (!select) return;
    if (state.adsObjective !== 'all' && !objectives.some(objective => objective.key === state.adsObjective)) state.adsObjective = 'all';
    select.innerHTML = ['<option value="all">Todos los objetivos</option>']
      .concat(objectives.map(objective => `<option value="${esc(objective.key)}"${objective.key === state.adsObjective ? ' selected' : ''}>${esc(objective.label)}</option>`))
      .join('');
  }
  const ADS_COLUMNS = 18;
  function renderAdsTable(period, model, all, previous, compare) {
    const body = document.getElementById('ads-body');
    const title = document.getElementById('ads-table-title');
    const sub = document.getElementById('ads-table-sub');
    const prevHead = document.getElementById('ads-prev-head');
    if (!body) return;
    document.getElementById('ads-table-panel')?.classList.toggle('no-compare', !compare);
    if (prevHead) prevHead.textContent = compare ? `Resultados ${period.compare.month.name}` : 'Mes anterior';
    if (!period || !model) {
      body.innerHTML = `<tr><td class="table-empty" colspan="${ADS_COLUMNS}">Sin datos para el periodo.</td></tr>`;
      if (title) title.textContent = 'Anuncios';
      if (sub) sub.textContent = '';
      renderAdsFilter([]);
      return;
    }
    renderAdsFilter(model.objectives);
    const rows = state.adsObjective === 'all' ? all : all.filter(ad => ad.group === state.adsObjective);
    const sheetOnly = all.some(ad => !ad.fromMeta);
    if (title) title.textContent = `Anuncios | ${periodName(period)}${period.annual ? '' : ` ${period.year}`}`;
    if (sub) {
      sub.textContent = model.rows.length
        ? `${rows.length} ${rows.length === 1 ? 'anuncio' : 'anuncios'} de más a menos resultados dentro de cada objetivo. La estrella marca al líder de cada objetivo.${sheetOnly ? ' Los anuncios de la hoja solo traen gasto y mensajes.' : ''}`
        : `La hoja no trae el detalle de anuncios de ${period.annual ? 'este periodo' : period.month.name}.`;
    }
    if (!rows.length) {
      const empty = model.rows.length ? 'No hay anuncios de este objetivo en el periodo.' : 'La hoja no trae el detalle de anuncios de este periodo.';
      keepFocus(body, () => { body.innerHTML = `<tr><td class="table-empty" colspan="${ADS_COLUMNS}">${empty}</td></tr>`; });
      return;
    }
    const html = rows.map(ad => {
      const before = previous.get(ad.key);
      return `
        <tr>
          <td class="type-col"><span class="objective-label" style="--campaign-color:${ad.color}"><i class="campaign-dot"></i>${esc(ad.groupLabel)}</span></td>
          <td class="ad-name-col">${adNameHtml(ad)}</td>
          <td class="num sales-col">${metaOnly(ad, `<b>${fmt.count(ad.purchases)}</b>`)}</td>
          <td class="num sales-col">${metaOnly(ad, fmt.unitCost(adCost(ad, ad.purchases)))}</td>
          <td class="campaign-set-col">${campaignSetHtml(ad)}</td>
          <td><span class="status-pill ${statusClass(ad.status)}">${esc(ad.status || '-')}</span></td>
          <td class="result-type-col">${resultTypeHtml(ad)}</td>
          <td class="num"><b>${fmt.count(ad.results)}</b></td>
          ${compareCells(ad, before, 'cmp-col')}
          <td class="num">${fmt.unitCost(adCost(ad, ad.results))}</td>
          <td class="num">${fmt.count(ad.messages)}</td>
          <td class="num">${spendHtml(ad)}</td>
          <td class="num">${metaOnly(ad, fmt.count(ad.impressions))}</td>
          <td class="num">${metaOnly(ad, fmt.count(ad.reach))}</td>
          <td class="num">${metaOnly(ad, fmt.money(adCpm(ad)))}</td>
          <td class="num">${metaOnly(ad, fmt.count(ad.clicks))}</td>
          <td class="num">${ad.activeDays == null ? '<span class="no-data">-</span>' : fmt.count(ad.activeDays)}</td>
        </tr>`;
    }).join('');
    keepFocus(body, () => { body.innerHTML = html; });
  }
  // Periodo, Top 3 y tabla del modulo Anuncios.
  function renderAdsView(period, model) {
    // Sin anuncios en el mes anterior (marzo a mayo solo traen campanas) no hay contra que comparar.
    const compare = Boolean(period?.compare) && model?.previous.rows.length > 0;
    const order = new Map((model?.objectives || []).map((objective, index) => [objective.key, index]));
    const all = model ? rankAds(adsByName(model.rows), order) : [];
    const previous = new Map(compare ? adsByName(model.previous.rows).map(ad => [ad.key, ad]) : []);
    renderAdsPeriod(period, compare);
    renderTopReservations(period, all);
    renderAdsTable(period, model, all, previous, compare);
  }
  // Anuncios de un objetivo, al final de su cuadro en Gasto publicitario. Reservas web solo si el objetivo las tuvo.
  function campaignAdsHtml(period, objective, model) {
    const ofObjective = rows => rows.filter(row => row.group === objective.key);
    const ads = rankAds(adsByName(ofObjective(model.rows)));
    const head = '<div class="adset-head"><div class="panel-title">Anuncios</div>';
    if (!ads.length) return `${head}<div class="panel-sub">${model.rows.length ? 'Sin anuncios con actividad en el periodo.' : 'La hoja no trae el detalle de anuncios de estas campañas.'}</div></div>`;
    const previousRows = ofObjective(model.previous.rows);
    const compare = Boolean(period.compare) && model.previous.rows.length > 0;
    const previous = new Map(compare ? adsByName(previousRows).map(ad => [ad.key, ad]) : []);
    const sales = ads.some(ad => ad.purchases > 0);
    const total = ads.reduce((sum, ad) => sum + (ad.perAd ? ad.spend : 0), 0);
    const columns = [['Anuncio']]
      .concat(sales ? [['Reservas web', true], ['Costo por reserva web', true]] : [], [['Campaña / conjunto'], ['Resultados', true]])
      .concat(compare ? [[`Resultados ${period.compare.month.name}`, true], ['Variación', true]] : [])
      .concat([['Costo por resultado', true], ['Mensajes', true], ['Inversión', true], ['% del objetivo'], ['Impresiones', true], ['Alcance', true], ['CPM', true], ['Clics', true], ['Días activos', true]]);
    const body = ads.map(ad => {
      const share = ad.perAd && total > 0 ? (ad.spend / total) * 100 : null;
      return `
        <tr>
          <td class="campaign-name">${adNameHtml(ad)}</td>
          ${sales ? `<td class="num sales-col">${metaOnly(ad, `<b>${fmt.count(ad.purchases)}</b>`)}</td><td class="num sales-col">${metaOnly(ad, fmt.unitCost(adCost(ad, ad.purchases)))}</td>` : ''}
          <td class="campaign-set-col">${campaignSetHtml(ad)}</td>
          <td class="num"><b>${fmt.count(ad.results)}</b><small class="cell-sub">${resultTypeHtml(ad)}</small></td>
          ${compare ? compareCells(ad, previous.get(ad.key)) : ''}
          <td class="num">${fmt.unitCost(adCost(ad, ad.results))}</td>
          <td class="num">${fmt.count(ad.messages)}</td>
          <td class="num">${spendHtml(ad)}</td>
          <td class="share-col">${share == null ? '<span class="no-data">-</span>' : `<div class="share-bar"><span style="width:${Math.min(100, share).toFixed(1)}%"></span></div><b class="share-value">${fmt.pct(share)}</b>`}</td>
          <td class="num">${metaOnly(ad, fmt.count(ad.impressions))}</td>
          <td class="num">${metaOnly(ad, fmt.count(ad.reach))}</td>
          <td class="num">${metaOnly(ad, fmt.money(adCpm(ad)))}</td>
          <td class="num">${metaOnly(ad, fmt.count(ad.clicks))}</td>
          <td class="num">${ad.activeDays == null ? '<span class="no-data">-</span>' : fmt.count(ad.activeDays)}</td>
        </tr>`;
    }).join('');
    let note = `${ads.length} ${ads.length === 1 ? 'anuncio' : 'anuncios'} de más a menos resultados en ${esc(periodName(period))}`;
    if (compare) note += `. Resultados contra ${esc(period.compare.label)}`;
    return `${head}<div class="panel-sub">${note}. La estrella marca al líder.</div></div>
      <div class="table-scroll">
        <table class="data-table adset-table camp-ads-table">
          <thead><tr>${columns.map(([label, numeric]) => `<th${numeric ? ' class="num"' : ''}>${esc(label)}</th>`).join('')}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  }

  // ── Herramientas de la tabla de anuncios ─────────────────────────────────
  function applyTableCompact() {
    const panel = document.getElementById('ads-table-panel');
    const button = document.getElementById('ads-density-btn');
    if (!panel || !button) return;
    panel.classList.toggle('is-compact', state.tableCompact);
    button.setAttribute('aria-pressed', String(state.tableCompact));
    button.textContent = state.tableCompact ? 'Cómodo' : 'Compacto';
    button.setAttribute('title', state.tableCompact ? 'Volver a filas amplias' : 'Reducir el alto de las filas');
  }
  function toggleTableFullscreen(force) {
    state.tableFullscreen = force == null ? !state.tableFullscreen : Boolean(force);
    const panel = document.getElementById('ads-table-panel');
    const button = document.getElementById('ads-expand-btn');
    const tabs = document.getElementById('ads-month-tabs');
    const scroll = panel?.querySelector('.table-scroll');
    if (!panel || !button) return;
    panel.classList.toggle('is-fullscreen', state.tableFullscreen);
    document.body.classList.toggle('amador-table-fullscreen', state.tableFullscreen);
    // Las pestanas de mes viajan al panel para cambiar de mes sin salir.
    if (tabs && scroll && state.tabsHome) {
      if (state.tableFullscreen) panel.insertBefore(tabs, scroll);
      else state.tabsHome.parent.insertBefore(tabs, state.tabsHome.next);
    }
    button.setAttribute('aria-pressed', String(state.tableFullscreen));
    button.innerHTML = state.tableFullscreen ? '&#10005; Salir' : '&#10530; Pantalla completa';
    button.setAttribute('title', state.tableFullscreen ? 'Salir de pantalla completa (Esc)' : 'Ver la tabla en pantalla completa (Esc para salir)');
    if (state.tableFullscreen) scroll?.focus?.();
  }
  // Distribucion y cuadros de Gasto publicitario y el modulo Anuncios, con el mismo modelo del periodo.
  function renderCampaignSection(period) {
    const model = periodModel(period);
    renderDistribution(period, model);
    renderCampaignBlocks(period, model);
    renderAdsView(period, model);
  }
  async function pushGoalToSheet(input) {
    const endpoint = syncEndpoint();
    if (!endpoint) {
      setGoalNote('Objetivo Reservas guardado en este navegador: falta el endpoint de escritura a Google Sheets.');
      return;
    }
    const payload = {
      action: 'updateReservationGoal',
      sheetName: monthByKey(input.dataset.month)?.tabName || MONTHS[Number(String(input.dataset.month).slice(5, 7)) - 1],
      campaign: input.dataset.campaign,
      ad: '__campaign__',
      campaignLevel: true,
      value: input.value === '' ? '' : Number(input.value)
    };
    setGoalNote('Enviando el Objetivo Reservas a Google Sheets...');
    try {
      await fetch(endpoint, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      setGoalNote('Objetivo Reservas enviado a Google Sheets.');
      setTimeout(() => syncLiveSheet(), 1800);
    } catch (error) {
      console.warn('[amador] No se pudo enviar el objetivo a Google Sheets:', error);
      setGoalNote('Objetivo Reservas guardado en este navegador; no se pudo enviar a Google Sheets.');
    }
  }
  // Orden de una fecha "dd-Mmm" de la hoja, que no trae año: el año sale del mes de su pestana (key "YYYY-MM"). Un mes
  // a mas de seis de distancia es del año anterior o del siguiente ("10-Ene" en la pestana de diciembre es de enero
  // del año siguiente), asi una campana que cruza de diciembre a enero se ordena bien.
  function dateOrderValue(label, key) {
    const match = String(label || '').match(/^(\d{1,2})-([A-Za-zÁ-ú]{3})/);
    if (!match) return null;
    const index = SHORT_MONTHS.findIndex(name => name.toLowerCase() === match[2].toLowerCase());
    if (index < 0) return null;
    let year = Number(String(key || '').slice(0, 4)) || 0;
    const tabIndex = Number(String(key || '').slice(5, 7)) - 1;
    if (year && tabIndex >= 0) {
      if (index - tabIndex > 6) year -= 1;
      else if (tabIndex - index > 6) year += 1;
    }
    return year * 10000 + index * 100 + Number(match[1]);
  }
  // Fechas de field en orden (direction 1: de la primera a la ultima; -1: al reves), cada una con el mes de su pestana.
  const sortedDates = (items, field, direction) => items
    .filter(item => dateOrderValue(item[field], item.monthKey) != null)
    .sort((a, b) => direction * (dateOrderValue(a[field], a.monthKey) - dateOrderValue(b[field], b.monthKey)))
    .map(item => item[field]);
  // ── Historico de campanas ────────────────────────────────────────────────
  // Una fila por campana (nombre exacto) con actividad en algun mes. Finalizada: dejo de gastar en Meta o la hoja la
  // marca apagada (OFF, Finalizada, Desactiva), o ya no aparece en el ultimo mes con datos.
  function campaignHistory() {
    const latestKey = latestMonth()?.key || '';
    const byName = new Map();
    state.data.months.filter(hasData).forEach(month => campaignEntries(month).forEach(entry => {
      if (!byName.has(entry.name)) byName.set(entry.name, []);
      byName.get(entry.name).push(entry);
    }));
    return [...byName.entries()]
      .map(([name, entries]) => {
        const active = entries.filter(hasActivity);
        if (!active.length) return null;
        const last = entries[entries.length - 1];
        return {
          name,
          group: last.group,
          groupLabel: last.groupLabel,
          color: last.color,
          entries,
          months: active.map(entry => entry.monthKey),
          lastKey: active[active.length - 1].monthKey,
          finished: isFinishedStatus(last.status) || last.monthKey < latestKey,
          ...totalsOf(entries),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.lastKey.localeCompare(a.lastKey) || b.spend - a.spend);
  }
  // Anuncios de las campanas: los de la hoja (desde junio) y, de marzo a mayo, los enlaces de vista previa.
  function historyAds(entries) {
    const ads = adsOf(entries.flatMap(adRows))
      .sort((a, b) => b.messages - a.messages)
      .map(ad => ({ name: ad.adSet ? `${ad.adSet} · ${ad.ad}` : ad.ad, preview: ad.preview }));
    entries.forEach(entry => {
      (entry.ads.length ? [] : entry.adUrls).forEach((url, index) => {
        if (!ads.some(ad => ad.preview === url)) ads.push({ name: `Anuncio ${index + 1} (${shortMonth(entry.month)})`, preview: url });
      });
    });
    return ads;
  }
  function historyMonth() {
    if (state.historyMonth === HISTORY_ALL) return null;
    const month = monthByKey(state.historyMonth);
    return month && campaignEntries(month).some(hasActivity) ? month : null;
  }
  // Año de las pestanas del Historico: el del mes elegido o, en "Todos", el elegido (por defecto el del ultimo mes).
  function historyYear(month) {
    if (month) return month.year;
    return dataYears().includes(state.historyYear) ? state.historyYear : (latestMonth()?.year ?? state.data.year);
  }
  function renderHistoryTabs(month) {
    const host = document.getElementById('history-month-tabs');
    if (!host) return;
    const year = historyYear(month);
    const latest = latestMonth();
    keepFocus(host, () => {
      host.innerHTML = yearTabsHtml(year) + MONTHS.map((name, index) => {
        const key = monthKey(year, index);
        const item = monthByKey(key);
        const available = Boolean(item) && campaignEntries(item).some(hasActivity);
        const on = month?.key === key;
        return `<button type="button" class="month-tab${on ? ' active' : ''}" data-month="${key}" aria-pressed="${on}"${available ? '' : ' disabled title="Sin campañas con actividad en la hoja"'}>${name}${key === latest?.key ? '<span class="current-dot"></span>' : ''}</button>`;
      }).join('') + `<button type="button" class="month-tab${month ? '' : ' active'}" data-month="${HISTORY_ALL}" aria-pressed="${!month}" title="Todas las campañas">Todos</button>`;
    });
  }
  const matchesStatus = (item, key) => key === 'todas' || (key === 'activas' ? !item.finished : item.finished);
  // Con un mes elegido quedan las campanas con actividad ese mes, con sus cifras de ese mes.
  function historyEntries(all, month) {
    if (!month) return all.map(item => ({ item, stats: item, entries: item.entries }));
    return all
      .map(item => ({ item, entries: item.entries.filter(entry => entry.monthKey === month.key && hasActivity(entry)) }))
      .filter(scope => scope.entries.length)
      .map(scope => ({ ...scope, stats: totalsOf(scope.entries) }))
      .sort((a, b) => b.stats.spend - a.stats.spend);
  }
  function renderHistoryStatus(scoped) {
    const host = document.getElementById('history-status-filter');
    if (!host) return;
    keepFocus(host, () => {
      host.innerHTML = HISTORY_STATUS.map(status => {
        const selected = status.key === state.historyStatus;
        const count = scoped.filter(scope => matchesStatus(scope.item, status.key)).length;
        return `<label class="series-toggle${selected ? ' active' : ''}"><input type="radio" name="history-status" value="${status.key}"${selected ? ' checked' : ''}>${status.label} (${count})</label>`;
      }).join('');
    });
  }
  function renderHistoryKpis(scoped, month) {
    const host = document.getElementById('history-kpis');
    if (!host) return;
    // Primer mes que registra mensajes (junio de 2026): antes la hoja solo traia gasto.
    const firstResults = state.data.months.find(item => valueFor(item, 'messages') != null);
    const since = firstResults ? `Desde ${firstResults.name.toLowerCase()}${dataYears().length > 1 ? ` de ${firstResults.year}` : ''}` : 'Sin registros';
    const totals = totalsOf(scoped.flatMap(scope => scope.entries));
    const active = scoped.filter(scope => !scope.item.finished).length;
    const finished = scoped.length - active;
    const statusNote = {
      todas: `${active} ${active === 1 ? 'activa' : 'activas'} y ${finished} ${finished === 1 ? 'finalizada' : 'finalizadas'}`,
      activas: 'Corriendo en el último mes con datos',
      finalizadas: 'Apagadas o sin el último mes',
    }[state.historyStatus];
    host.innerHTML = [
      ['Campañas', fmt.count(scoped.length), statusNote],
      ['Inversión', fmt.money(totals.spend), month ? `Gasto en ${month.name}` : 'Gasto acumulado'],
      ['Mensajes', fmt.count(totals.messages), month ? `En ${month.name}` : since],
      ['Reservas', fmt.count(totals.reservations), month ? `En ${month.name}` : since],
      ['Costo por reserva', fmt.money(totals.costPerReservation), 'Gasto / reservas'],
    ].map(([label, value, meta]) => `<div class="kpi-pill"><span>${label}</span><strong>${value}</strong><small>${esc(meta)}</small></div>`).join('');
  }
  function historyAdChip(ad) {
    const url = safeUrl(ad.preview);
    return url
      ? `<a class="history-ad-link" href="${url}" target="_blank" rel="noopener noreferrer">${esc(ad.name)}</a>`
      : `<span class="history-ad-muted">${esc(ad.name)}</span>`;
  }
  // La lista de anuncios va plegada: abierta estiraba la fila una linea por anuncio.
  function historyAdsCell(ads, campaign) {
    if (!ads.length) return '<span class="no-data">-</span>';
    return `<details class="history-ads" data-campaign="${esc(campaign)}"><summary>${ads.length} ${ads.length === 1 ? 'anuncio' : 'anuncios'}</summary><div class="history-ads-list">${ads.map(historyAdChip).join('')}</div></details>`;
  }
  function historyPeriod(entries) {
    const starts = sortedDates(entries, 'startDate', 1);
    const ends = sortedDates(entries, 'endDate', -1);
    if (starts[0] || ends[0]) return `${esc(starts[0] || '?')} - ${esc(ends[0] || '?')}`;
    const months = [...new Set(entries.map(entry => shortMonth(entry.month)))];
    return months.length > 1 ? `${months[0]} - ${months[months.length - 1]}` : months[0] || '-';
  }
  // Una sola tabla: "Todos" lleva una columna de gasto por mes; un mes deja sus campanas con las cifras de ese mes
  // y el gasto acumulado al final.
  function renderHistory() {
    const head = document.getElementById('history-head');
    const body = document.getElementById('history-body');
    if (!head || !body || !state.data) return;
    const open = new Set([...body.querySelectorAll('details.history-ads[open]')].map(node => node.dataset.campaign));
    const month = historyMonth();
    state.historyMonth = month ? month.key : HISTORY_ALL;
    renderHistoryTabs(month);
    const scoped = historyEntries(campaignHistory(), month);
    renderHistoryStatus(scoped);
    const rows = scoped.filter(scope => matchesStatus(scope.item, state.historyStatus));
    renderHistoryKpis(rows, month);
    const months = month ? [] : state.data.months.filter(item => campaignEntries(item).some(hasActivity));
    // Con meses de mas de un año cada columna lleva el suyo ("Dic 26", "Ene 27").
    const multiYear = new Set(months.map(item => item.year)).size > 1;
    head.innerHTML = `<tr><th>Campaña</th><th>Objetivo</th><th>Estado</th>${months.map(item => `<th class="num" title="${esc(`${item.name} ${item.year}`)}">${shortMonth(item)}${multiYear ? ` ${String(item.year).slice(2)}` : ''}${item.closed ? '' : ` (al ${item.dataDay})`}</th>`).join('')}<th class="num">${month ? `Gasto ${shortMonth(month)}` : 'Gasto total'}</th><th class="num">Mensajes</th><th class="num">Reservas</th><th class="num th-wrap">Costo por reserva</th><th>Anuncios</th>${month ? '<th>Fechas</th><th class="num" title="Gasto de la campaña en todos los meses">Gasto acumulado</th>' : '<th>Periodo</th>'}</tr>`;
    const status = HISTORY_STATUS.find(item => item.key === state.historyStatus);
    const sub = document.getElementById('history-sub');
    if (sub) {
      const first = months[0];
      const last = months[months.length - 1];
      const range = first && last ? (multiYear ? `de ${first.name} ${first.year} a ${last.name} ${last.year}` : `de ${first.name} a ${last.name} ${last.year}`) : '';
      if (!rows.length) sub.textContent = `Ninguna ${status.one} ${month ? `con actividad en ${month.name} ${month.year}` : 'en los datos'}.`;
      else if (month) sub.textContent = `${rows.length} ${rows.length === 1 ? status.one : status.many} con actividad en ${month.name} ${month.year}.`;
      else sub.textContent = `${rows.length} ${rows.length === 1 ? status.one : status.many} ${range}. Cada mes es el gasto de su pestaña en la hoja.`;
    }
    const columns = head.querySelectorAll('th').length;
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="${columns}" class="table-empty">Sin ${status.many} ${month ? `en ${esc(month.name)}` : 'en los meses cargados'}.</td></tr>`;
      return;
    }
    const spendIn = (entries, key) => entries.filter(entry => entry.monthKey === key).reduce((sum, entry) => sum + entry.spend, 0);
    const allEntries = rows.flatMap(scope => scope.entries);
    const total = totalsOf(allEntries);
    body.innerHTML = rows.map(({ item, stats, entries }) => `
      <tr>
        <td class="campaign-name">${esc(item.name)}</td>
        <td><span class="objective-label" style="--campaign-color:${item.color}"><i class="campaign-dot"></i>${esc(item.groupLabel)}</span></td>
        <td>${item.finished ? '<span class="type-pill slate">Finalizada</span>' : '<span class="type-pill green">Activa</span>'}</td>
        ${months.map(column => `<td class="num">${item.months.includes(column.key) ? fmt.money(spendIn(item.entries, column.key)) : '<span class="no-data">-</span>'}</td>`).join('')}
        <td class="num"><b>${fmt.money(stats.spend)}</b></td>
        <td class="num">${fmt.count(stats.messages)}</td>
        <td class="num">${fmt.count(stats.reservations)}</td>
        <td class="num">${fmt.money(stats.costPerReservation)}</td>
        <td>${historyAdsCell(historyAds(entries), item.name)}</td>
        <td class="date-col">${historyPeriod(entries)}</td>
        ${month ? `<td class="num">${fmt.money(item.spend)}</td>` : ''}
      </tr>`).join('') + `
      <tr class="total-row">
        <td class="campaign-name">${month ? `Total de ${esc(month.name)}` : 'Total'}</td>
        <td></td><td></td>
        ${months.map(column => `<td class="num">${rows.some(scope => scope.item.months.includes(column.key)) ? fmt.money(spendIn(allEntries, column.key)) : '<span class="no-data">-</span>'}</td>`).join('')}
        <td class="num">${fmt.money(total.spend)}</td>
        <td class="num">${fmt.count(total.messages)}</td>
        <td class="num">${fmt.count(total.reservations)}</td>
        <td class="num">${fmt.money(total.costPerReservation)}</td>
        <td></td><td></td>
        ${month ? '<td></td>' : ''}
      </tr>`;
    // Datos nuevos no cierran la lista de anuncios que se estaba mirando.
    if (open.size) body.querySelectorAll('details.history-ads').forEach(node => { if (open.has(node.dataset.campaign)) node.open = true; });
  }
  function applyChartCollapsed() {
    const panel = document.getElementById('chart-panel');
    const button = document.getElementById('chart-toggle-btn');
    if (!panel || !button) return;
    panel.classList.toggle('is-collapsed', state.chartCollapsed);
    setToggle(button, state.chartCollapsed, 'el grafico');
  }
  // Grafico mensual de la cuenta: el unico que muestra enero a mayo. Varios indicadores van en paneles apilados.
  function renderChart() {
    const selectedKeys = Object.keys(SERIES).filter(key => state.types.includes(key));
    const year = viewYear();
    state.chartYear = year;
    const months = monthsOfYear(year);
    document.getElementById('chart-title').textContent = `Evolucion mensual | ${selectedKeys.map(key => SERIES[key].label).join(' + ')} | ${year}`;
    const sub = document.getElementById('chart-sub');
    if (sub) {
      const first = months[0]?.name.toLowerCase();
      const last = months[months.length - 1]?.name.toLowerCase();
      sub.textContent = !months.length ? 'Sin meses con datos' : months.length === 1 ? `Indicadores reales registrados en ${first}` : `Indicadores reales registrados de ${first} a ${last}`;
    }
    document.querySelectorAll('#chart-series-toggles input').forEach(input => {
      input.checked = selectedKeys.includes(input.value);
      input.closest('.series-toggle')?.classList.toggle('active', input.checked);
    });
    // "Un solo cuadro" solo con dos o mas indicadores marcados.
    const combined = state.chartCombined && selectedKeys.length > 1;
    const combineButton = document.getElementById('chart-combine-btn');
    if (combineButton) {
      combineButton.hidden = selectedKeys.length < 2;
      combineButton.classList.toggle('active', combined);
      combineButton.setAttribute('aria-pressed', String(combined));
      combineButton.title = combined ? 'Volver a un panel por indicador' : 'Juntar los indicadores en un solo cuadro';
    }
    const legend = document.getElementById('chart-legend');
    if (state.chartCollapsed) {
      destroyChart('global');
      if (legend) legend.innerHTML = '';
      return;
    }
    const metrics = selectedKeys.map(key => ({ key, label: SERIES[key].label, unit: SERIES[key].unit, color: SERIES[key].color }));
    const items = metrics.map(metric => `<span><i class="legend-line" style="background:${metric.color}"></i><b>${esc(metric.label)} por mes</b></span>`);
    if (metrics.length > 1) items.push(combined ? COMBINED_NOTE : '<span>Cada indicador con su escala.</span>');
    const series = monthlySeries(metrics, (metric, monthIndex) => accountMonthValue(monthByKey(monthKey(year, monthIndex)), metric.key), items, combined);
    if (legend) legend.innerHTML = series.legend.join('');
    drawLineChart('global', document.getElementById('chart-monthly'), series, metrics, combined);
  }
  // Valor de la cuenta en un mes. Los costos son los del resumen ejecutivo (summarize); sin resultados, hueco.
  function accountMonthValue(month, key) {
    if (key === 'costPerMessage' || key === 'costPerReservation') return hasData(month) ? summarize([month])[key] : null;
    return valueFor(month, key);
  }
  // Cambiar de mes solo repinta lo que depende del mes: pestanas, periodo, KPIs y campanas.
  function renderMonthView() {
    if (!state.monthPicked || (!annualView() && !hasData(monthByKey(state.monthKey)))) state.monthKey = latestMonth()?.key || null;
    state.month = annualView() ? null : selectedMonth()?.key || null;
    const period = currentPeriod();
    renderTabs();
    renderYearTitles();
    renderPeriod(period);
    renderKpis(period);
    renderCampaignSection(period);
    // El grafico mensual de la cuenta muestra el año de la vista: se redibuja solo si ese año cambio.
    if (state.chartYear !== viewYear()) renderChart();
  }
  // Titulos con el año de la vista (la barra superior solo mientras se ve Gasto publicitario).
  function renderYearTitles() {
    const year = viewYear();
    const heading = document.getElementById('obj-title');
    if (heading) heading.textContent = `Indicadores ${year} por mes`;
    document.title = `Amador | Gasto publicitario ${year}`;
    if (document.getElementById('view-obj')?.classList.contains('visible')) {
      const title = document.getElementById('topbar-title');
      if (title) title.textContent = `Gasto publicitario ${year}`;
    }
  }
  // Datos nuevos: se repinta todo y se avisa a los modulos que dependen de estos datos (Proyecciones).
  function renderAll() {
    applyChartCollapsed();
    // Datos nuevos: el grafico se redibuja aunque el año no haya cambiado.
    state.chartYear = null;
    renderMonthView();
    renderHistory();
    window.dispatchEvent(new CustomEvent('amador:data-updated'));
  }
  function wireEvents() {
    document.getElementById('chart-series-toggles').addEventListener('change', event => {
      const input = event.target.closest('input[type="checkbox"]');
      if (!input) return;
      const selected = [...document.querySelectorAll('#chart-series-toggles input:checked')].map(item => item.value);
      if (!selected.length) { input.checked = true; return; }
      state.types = Object.keys(SERIES).filter(key => selected.includes(key));
      saveChartSeries();
      renderChart();
    });
    document.getElementById('chart-combine-btn')?.addEventListener('click', () => {
      state.chartCombined = !state.chartCombined;
      try { localStorage.setItem(CHART_COMBINED_KEY, String(state.chartCombined)); } catch {}
      renderChart();
    });
    // El unico boton Actualizar vive en la barra superior, junto al estado de los datos.
    refreshButtons().forEach(button => button.addEventListener('click', refreshAll));
    wireStatusCard();
    const onMonthTab = event => {
      const button = event.target.closest('.month-tab:not(:disabled)');
      if (!button) return;
      const year = Number(button.dataset.year);
      if (year) {
        if (year === viewYear()) return;
        // Otro año: la vista anual sigue en anual y un mes pasa al ultimo mes con datos de ese año.
        state.year = year;
        if (state.monthKey !== YEAR_KEY) state.monthKey = monthsOfYear(year).pop()?.key || null;
      } else {
        if (button.dataset.month === state.monthKey) return;
        // La vista anual abre en el año del mes que se estaba viendo.
        if (button.dataset.month === YEAR_KEY) state.year = viewYear();
        state.monthKey = button.dataset.month;
      }
      state.monthPicked = true;
      renderMonthView();
    };
    MONTH_TAB_HOSTS.forEach(id => document.getElementById(id)?.addEventListener('click', onMonthTab));
    document.getElementById('chart-toggle-btn').addEventListener('click', () => {
      state.chartCollapsed = !state.chartCollapsed;
      saveChartCollapsed();
      applyChartCollapsed();
      renderChart();
    });
    // Objetivo Reservas por campana y campanas agregadas a mano (tabla de distribucion).
    const distribution = document.getElementById('distribution-body');
    distribution?.addEventListener('change', event => {
      const input = event.target.closest('.reservation-goal-input');
      if (input) {
        state.goals[goalStoreKey(input.dataset.month, input.dataset.campaign)] = input.value;
        saveGoals();
        renderCampaignSection(currentPeriod());
        pushGoalToSheet(input);
        // Proyecciones toma el Objetivo Reservas del mes como referencia.
        window.dispatchEvent(new CustomEvent('amador:data-updated'));
        return;
      }
      const edit = event.target.closest('.inline-edit');
      if (!edit) return;
      const { field, cid } = edit.dataset;
      setMonthCustom(mc => {
        const campaign = mc.campaigns.find(item => item._id === cid);
        if (!campaign) return mc;
        if (field === 'type') campaign.type = edit.value;
        if (field === 'cname') {
          // Los anuncios agregados a la campana la siguen con su nombre nuevo.
          if (mc.extraAds[campaign.name]) { mc.extraAds[edit.value] = mc.extraAds[campaign.name]; delete mc.extraAds[campaign.name]; }
          campaign.name = edit.value;
        }
        return mc;
      });
      renderCampaignSection(currentPeriod());
    });
    distribution?.addEventListener('click', event => {
      if (!event.target.closest('.add-campaign-btn')) return;
      setMonthCustom(mc => {
        mc.campaigns.push({ _id: genId(), name: '', type: '', status: 'Activo', ads: [] });
        return mc;
      });
      renderCampaignSection(currentPeriod());
    });
    // Historico: pestanas de mes (o Todos) y filtro Todas / Activas / Finalizadas.
    document.getElementById('history-month-tabs')?.addEventListener('click', event => {
      const button = event.target.closest('.month-tab:not(:disabled)');
      if (!button) return;
      const year = Number(button.dataset.year);
      if (year) {
        const current = historyMonth();
        if (year === historyYear(current)) return;
        // Otro año: "Todos" se mantiene y un mes pasa al ultimo mes con campanas de ese año.
        state.historyYear = year;
        if (current) state.historyMonth = state.data.months.filter(item => item.year === year && campaignEntries(item).some(hasActivity)).pop()?.key || HISTORY_ALL;
      } else {
        if (button.dataset.month === state.historyMonth) return;
        // "Todos" se queda en el año del mes que se estaba viendo.
        if (button.dataset.month === HISTORY_ALL) state.historyYear = historyYear(historyMonth());
        state.historyMonth = button.dataset.month;
      }
      renderHistory();
    });
    document.getElementById('history-status-filter')?.addEventListener('change', event => {
      const input = event.target.closest('input[name="history-status"]');
      if (!input) return;
      state.historyStatus = input.value;
      renderHistory();
    });
    // Indicadores del grafico de cada cuadro: siempre queda al menos uno (desmarcar el ultimo lo deja como estaba).
    document.getElementById('campaign-blocks')?.addEventListener('change', event => {
      const input = event.target.closest('[data-campaign-metrics] input');
      const block = input?.closest('.campaign-block');
      const key = block?.dataset.objective;
      if (!key) return;
      const checked = [...block.querySelectorAll('[data-campaign-metrics] input:checked')].map(item => item.value);
      if (checked.length) saveBlockSettings(key, { metrics: checked });
      const period = currentPeriod();
      renderCampaignBlock(key, period, periodModel(period));
    });
    // Minimizar cada cuadro de objetivo y "Un solo cuadro" de su grafico.
    document.getElementById('campaign-blocks')?.addEventListener('click', event => {
      const combineKey = event.target.closest('[data-campaign-combine]')?.closest('.campaign-block')?.dataset.objective;
      if (combineKey) {
        saveBlockSettings(combineKey, { combined: !blockSettings(combineKey).combined });
        const period = currentPeriod();
        renderCampaignBlock(combineKey, period, periodModel(period));
        return;
      }
      const key = event.target.closest('[data-campaign-toggle]')?.closest('.campaign-block')?.dataset.objective;
      if (!key) return;
      saveBlockSettings(key, { collapsed: !blockSettings(key).collapsed });
      const period = currentPeriod();
      renderCampaignBlock(key, period, periodModel(period));
    });
    document.getElementById('ads-objective')?.addEventListener('change', event => {
      state.adsObjective = event.target.value;
      const period = currentPeriod();
      renderAdsView(period, periodModel(period));
    });
    document.getElementById('ads-density-btn')?.addEventListener('click', () => {
      state.tableCompact = !state.tableCompact;
      try { localStorage.setItem(TABLE_COMPACT_KEY, String(state.tableCompact)); } catch {}
      applyTableCompact();
    });
    document.getElementById('ads-expand-btn')?.addEventListener('click', () => toggleTableFullscreen());
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && state.tableFullscreen) toggleTableFullscreen(false);
    });
    // Cambiar de modulo con el panel fijo dejaria la pagina bloqueada.
    document.querySelectorAll('[data-view-target]').forEach(button => {
      button.addEventListener('click', () => { if (state.tableFullscreen) toggleTableFullscreen(false); });
    });
    const tabs = document.getElementById('ads-month-tabs');
    if (tabs) state.tabsHome = { parent: tabs.parentNode, next: tabs.nextSibling };
    applyTableCompact();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - state.lastFetch > VISIBILITY_REFETCH_MS) syncLiveSheet();
    });
  }
  async function init() {
    try {
      if (window.AMADOR_ADS_DATA) state.sheetData = cloneData(window.AMADOR_ADS_DATA);
      else { const response = await fetch(DATA_URL, { cache: 'no-store' }); if (!response.ok) throw new Error(`HTTP ${response.status}`); state.sheetData = await response.json(); }
      // La fecha del archivo es la de la copia guardada del mes en curso, no la de hoy.
      state.sheetData.fileCutoff = state.sheetData.cutoff;
      // Los meses del archivo base son de su año.
      state.sheetData.months.forEach(month => { month.year = month.year ?? state.sheetData.year; });
      const sheetMonths = window.AMADOR_SHEET_MONTHS || await Promise.all(SHEET_FILES.map(file => fetch(file.url, { cache: 'no-store' })
        .then(response => response.json())
        .then(month => ({ year: file.year, ...month }))));
      sheetMonths.forEach(month => mergeSheetMonth(month, state.sheetData.source || 'Datos locales'));
      // El build siempre define AMADOR_META_DATA (null sin barrido); en desarrollo se lee la copia local si existe.
      if ('AMADOR_META_DATA' in window) state.meta = window.AMADOR_META_DATA;
      else state.meta = await fetch(META_DATA_URL, { cache: 'no-store' }).then(response => (response.ok ? response.json() : null)).catch(() => null);
      recompose();
      loadGoals();
      state.monthKey = latestMonth()?.key || null;
      wireEvents();
      renderAll();
      updateStatusLabel(META_ENDPOINT ? 'Leyendo Meta y la hoja...' : 'Leyendo Google Sheets...');
      syncLiveSheet();
    } catch (error) {
      ['view-obj', 'view-ads'].forEach(id => { document.getElementById(id).innerHTML = '<div class="data-notice error"><strong>No se pudo cargar la informacion de Amador.</strong></div>'; });
      console.error(error);
      state.error = String(error?.message || error);
      window.dispatchEvent(new CustomEvent('amador:data-error', { detail: { error: state.error } }));
    }
  }
  // Snapshot de solo lectura para los modulos que dependen de estos datos (Proyecciones).
  function snapshot() {
    if (!state.data) return null;
    return {
      cutoff: state.data.cutoff,
      latestKey: state.data.latestKey,
      source: state.data.source,
      year: latestMonth()?.year ?? state.data.year,
      lastSync: state.lastSync,
      error: state.error,
      // Con el Objetivo Reservas editado en el tablero (Proyecciones lo usa como referencia).
      months: cloneData(state.data).months.map(month => ({
        ...month,
        campaigns: (month.campaigns || []).map(campaign => {
          const saved = state.goals[goalStoreKey(month.key, campaign.name)];
          return saved === '' || saved == null ? campaign : { ...campaign, reservationGoal: Number(saved) };
        }),
      })),
    };
  }
  // viewYear: año que muestra Gasto publicitario (la navegacion lo usa en el titulo de la barra superior).
  // meta: el barrido de Meta ya releido en vivo. Generacion de Reporte lo suma por semana y asi no
  // vuelve a pedirle los datos al Web App.
  window.AmadorObjectives = { renderHistory, snapshot, meta: () => state.meta, viewYear: () => (state.data ? viewYear() : null) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
