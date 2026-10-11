(function () {
  const DATA_URL = 'data/amador-ads-2026.json';
  // Copias de las pestanas mensuales de la hoja (respaldo si Google no responde). El build incrusta todas las
  // data/amador-<mes>-sheet-2026.json como window.AMADOR_SHEET_MONTHS; esta lista solo se usa en desarrollo.
  const SHEET_FILES = ['june', 'july', 'august', 'september'].map(month => `data/amador-${month}-sheet-2026.json`);
  const SHEET_ID = '1Lj5rEepYZhHlf-VyGJwRYVMqnpWLu9lg3oL6wes3o-s';
  const liveCsvUrl = sheetName => `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const SYNC_INTERVAL_MS = 60 * 60 * 1000;
  // Al volver a la pestana del navegador solo se relee si la ultima lectura tiene mas de 5 minutos.
  const VISIBILITY_REFETCH_MS = 5 * 60 * 1000;
  const FETCH_TIMEOUT_MS = 30 * 1000;
  const GOALS_KEY = 'amador-reservation-goals-v1';
  // URL del Web App de scripts/google-sheets-sync.gs; vacio = la edicion de objetivos queda solo local.
  const SHEET_SYNC_ENDPOINT = '';
  const SHEET_SYNC_ENDPOINT_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;
  const CHART_COLLAPSED_KEY = 'amador-chart-collapsed-v1';
  const { MONTHS, SHORT_MONTHS, esc, safeUrl, fmt, change, limaParts, monthKey, daysInMonth, formatStamp, keepFocus } = window.AmadorShared;
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
  };
  const CHART_SERIES_KEY = 'amador-chart-series-v1';
  // monthKey: pestana elegida (YYYY-MM o anual); month: nombre del mes que muestran la tabla de campanas y sus
  // ediciones locales. current: lectura en vivo en curso. liveSheets: pestanas leidas en la ultima lectura.
  const state = { data: null, types: readChartSeries(), monthKey: null, month: null, chart: null, syncTimer: null, nextSync: 0, goals: readGoals(), chartCollapsed: readChartCollapsed(), lastSync: null, lastFetch: 0, current: null, liveSheets: [], error: '', goalNote: '' };

  const fmtMoney = value => Number.isFinite(Number(value)) ? `S/. ${Number(value).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-';
  const fmtCount = value => Number(value || 0).toLocaleString('es-PE', { maximumFractionDigits: 0 });
  const fmtRatio = value => Number.isFinite(Number(value)) ? `${Number(value).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : '-';
  const fmtShort = value => {
    if (value == null) return '';
    if (value >= 1000) return `S/. ${(value / 1000).toFixed(2).replace(/0$/, '').replace(/\.0$/, '')}k`;
    return `S/. ${Math.round(value)}`;
  };


  function readGoals() {
    try { return JSON.parse(localStorage.getItem(GOALS_KEY) || '{}'); } catch { return {}; }
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
  // El endpoint de escritura va fijo en el codigo (SHEET_SYNC_ENDPOINT). Ya no se acepta desde la URL
  // ni desde localStorage: un enlace manipulado podia desviar los POST a un tercero.
  function syncEndpoint() {
    return SHEET_SYNC_ENDPOINT_RE.test(SHEET_SYNC_ENDPOINT) ? SHEET_SYNC_ENDPOINT : '';
  }

  // ── Custom campaigns / ads (stored in localStorage) ──────────────────────
  const CUSTOM_KEY = 'amador-custom-rows-v1';
  function readCustom() { try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '{}'); } catch { return {}; } }
  function saveCustom(data) { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(data)); } catch {} }
  function getMonthCustom() { return readCustom()[state.month] || { campaigns: [], extraAds: {} }; }
  function setMonthCustom(fn) {
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
  function goalKey(campaign, ad) { return `${campaign}::${ad}`; }
  function effectiveGoal(campaign, ad) {
    const saved = state.goals[goalKey(campaign.name, ad.name)];
    return saved === '' || saved == null ? ad.reservationGoal : Number(saved);
  }
  function sourceMonth(name) { return state.data.months.find(month => month.name === name); }
  function cloneData(data) { return JSON.parse(JSON.stringify(data)); }
  function valueFor(name, type) {
    const month = sourceMonth(name);
    if (!month) return null;
    if (type === 'investment') return month.spend;
    if (Number.isFinite(Number(month[type]))) return Number(month[type]);
    const field = type === 'reservations' ? 'reservas' : 'messages';
    const ads = (month.campaigns || []).flatMap(campaign => campaign.ads || []);
    if (!ads.some(ad => ad[field] != null)) return null;
    return ads.reduce((total, ad) => total + Number(ad[field] || 0), 0);
  }
  function formatSeriesValue(value, series, short = false) {
    if (value == null) return '';
    if (series.unit === 'money') return short ? fmtShort(value) : fmtMoney(value);
    return fmtCount(value);
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
  function mergeSheetMonth(monthData, source = 'Google Sheets') {
    const data = cloneData(state.data);
    const index = data.months.findIndex(month => month.name === monthData.name);
    if (index >= 0) data.months[index] = monthData;
    else data.months.push(monthData);
    data.months.sort((a, b) => MONTHS.indexOf(a.name) - MONTHS.indexOf(b.name));
    data.source = source;
    state.data = data;
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
      month.key = monthKey(data.year, index);
      month.days = daysInMonth(data.year, index);
      month.closed = month.key < now.key;
      let day = month.days;
      if (!month.closed) {
        if (month.readAt) day = limaParts(new Date(month.readAt)).day;
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
  function latestMonth(data = state.data) {
    return (data?.months || []).filter(month => Number(month.spend) > 0).pop() || null;
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
      if (error?.name === 'AbortError') throw new Error('Google Sheets no respondio a tiempo');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  // Una pestana que todavia no existe (el mes recien empieza) devuelve null, no un error.
  async function fetchLiveMonth(index) {
    const sheetName = MONTHS[index];
    const text = await fetchText(`${liveCsvUrl(sheetName)}&cacheBust=${Date.now()}`);
    const { month, ranges } = sheetToMonthData(parseCsv(text), sheetName);
    return belongsToMonth(ranges, monthKey(state.data.year, index)) ? month : null;
  }
  // Se leen en vivo el mes en curso (hora de Lima) y el anterior, que sigue recibiendo ajustes despues del
  // cierre. Solo meses del año del tablero.
  function liveMonthIndexes() {
    const now = today();
    return [[now.year, now.month - 1], [now.year, now.month]]
      .map(([year, month]) => (month < 0 ? [year - 1, 11] : [year, month]))
      .filter(([year]) => year === state.data.year)
      .map(([, month]) => month);
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
  async function runSync(manual) {
    if (manual) updateStatusLabel('Leyendo Google Sheets...');
    try {
      const months = (await Promise.all(liveMonthIndexes().map(fetchLiveMonth))).filter(Boolean);
      state.lastSync = new Date();
      state.liveSheets = months.map(month => month.name);
      const before = signature();
      months.forEach(month => mergeSheetMonth({ ...month, readAt: state.lastSync.toISOString() }));
      decorate(state.data);
      const hadError = Boolean(state.error);
      state.error = '';
      // Una lectura silenciosa que trae lo mismo no repinta; Actualizar siempre publica.
      if (manual || hadError || signature() !== before) renderAll();
      return true;
    } catch (error) {
      state.error = String(error?.message || error);
      console.warn('[amador] No se pudo sincronizar Google Sheets:', error);
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
  function statusLabel() {
    if (!state.data) return state.error ? 'Sin datos: no se pudo leer Google Sheets' : 'Cargando datos...';
    const month = latestMonth();
    const dataPart = month ? `Datos de ${month.name}` : 'Sin datos';
    if (state.error) return `${dataPart} | sin conexion con Google Sheets`;
    if (!state.lastSync) return `${dataPart} | copia guardada`;
    return `${dataPart} | leidos ${formatStamp(state.lastSync)}`;
  }
  function updateStatusLabel(text) {
    const label = document.getElementById('topbar-status');
    if (label) label.textContent = text || statusLabel();
    const pill = label?.closest('.topbar-pill');
    if (pill) pill.classList.toggle('warn', !text && (Boolean(state.error) || !state.lastSync));
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
    const year = state.data.year;
    const set = (id, value) => {
      const node = document.getElementById(id);
      if (node) node.textContent = value || '-';
    };
    set('status-data', month ? (month.closed ? `${month.name} ${year} completo` : `1-${month.dataDay} ${month.name} ${year}`) : 'Sin meses con gasto');
    set('status-last', state.lastSync ? formatStamp(state.lastSync) : 'sin lectura en vivo');
    renderNextSync();
    const sheets = state.liveSheets.length ? state.liveSheets : [month?.name].filter(Boolean);
    set('status-sheet', `Distribucion-amador / ${sheets.join(' y ') || '-'}`);
    set('status-source', state.lastSync ? (state.error ? 'ultima lectura en vivo' : 'Google Sheets en vivo') : 'copia guardada en el tablero');
    const note = document.getElementById('status-note');
    if (!note) return;
    // Un solo aviso, por orden de gravedad: sin conexion, copia guardada, Objetivo Reservas o mes en curso.
    let message = '';
    if (state.error) message = `Sin conexion con Google Sheets: ${state.error}. Se muestran los ultimos datos leidos.`;
    else if (!state.lastSync) message = 'Copia guardada en el tablero: todavia no llego la lectura en vivo.';
    else if (state.goalNote) message = state.goalNote;
    else if (month && !month.closed) message = `${month.name} sigue en curso: las cifras llegan hasta la ultima lectura.`;
    note.textContent = message;
    note.classList.toggle('error', Boolean(state.error));
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
  const hasData = month => Number(month?.spend) > 0;
  function monthByKey(key) {
    return state.data?.months.find(month => month.key === key) || null;
  }
  function previousMonth(month) {
    const index = MONTHS.indexOf(month?.name);
    return index > 0 ? monthByKey(monthKey(state.data.year, index - 1)) : null;
  }
  const annualView = () => state.monthKey === YEAR_KEY && state.data.months.some(hasData);
  function selectedMonth() {
    const month = monthByKey(state.monthKey);
    return hasData(month) ? month : latestMonth();
  }
  // Totales de uno o varios meses. Enero a mayo solo traen gasto: mensajes y reservas quedan en null si ningun mes
  // los registra, y sus costos usan solo el gasto de los meses que si los registran.
  function summarize(months) {
    const sum = type => {
      const values = months.map(month => valueFor(month.name, type)).filter(value => value != null);
      return values.length ? values.reduce((total, value) => total + Number(value), 0) : null;
    };
    const spendWith = type => months.filter(month => valueFor(month.name, type) != null).reduce((total, month) => total + Number(month.spend || 0), 0);
    const messages = sum('messages');
    const reservations = sum('reservations');
    return {
      spend: months.reduce((total, month) => total + Number(month.spend || 0), 0),
      messages,
      reservations,
      costPerMessage: messages > 0 ? spendWith('messages') / messages : null,
      costPerReservation: reservations > 0 ? spendWith('reservations') / reservations : null,
    };
  }
  // Periodo elegido: un mes (contra el mes anterior completo) o el acumulado del año.
  function currentPeriod() {
    if (!state.data) return null;
    if (annualView()) {
      const months = state.data.months.filter(hasData);
      const first = months[0];
      const last = months[months.length - 1];
      return { annual: true, months, year: state.data.year, closed: today().year > state.data.year, label: `1 ${first.name} - ${last.dataDay} ${last.name}`, compare: null };
    }
    const month = selectedMonth();
    if (!month) return null;
    const previous = previousMonth(month);
    return {
      annual: false,
      month,
      months: [month],
      year: state.data.year,
      closed: month.closed,
      label: `1-${month.dataDay} ${month.name}`,
      compare: hasData(previous) ? { month: previous, months: [previous], label: `${previous.name} completo` } : null,
    };
  }
  // "▲ 12.3% vs Agosto completo". El color depende de si subir es bueno para ese indicador.
  function deltaHtml(current, previous, better, compareLabel) {
    const variation = change(current, previous);
    if (variation == null) return compareLabel ? `<small class="delta flat">Sin dato en ${esc(compareLabel)}</small>` : '';
    const direction = Math.abs(variation) < 0.05 ? 'flat' : variation > 0 ? 'up' : 'down';
    const tone = direction === 'flat' || !better ? 'flat' : direction === better ? 'good' : 'bad';
    const arrow = direction === 'up' ? '&#9650;' : direction === 'down' ? '&#9660;' : '&#9679;';
    return `<small class="delta ${tone}">${arrow} ${fmt.pct(Math.abs(variation))}${compareLabel ? ` vs ${esc(compareLabel)}` : ''}</small>`;
  }
  function renderTabs() {
    const host = document.getElementById('month-tabs');
    if (!host || !state.data) return;
    const year = state.data.year;
    const latest = latestMonth();
    const annual = annualView();
    const selected = annual ? null : selectedMonth()?.key;
    keepFocus(host, () => {
      host.innerHTML = MONTHS.map((name, index) => {
        const key = monthKey(year, index);
        const on = key === selected;
        return `<button type="button" class="month-tab${on ? ' active' : ''}" data-month="${key}" aria-pressed="${on}"${hasData(monthByKey(key)) ? '' : ' disabled title="Sin datos en la hoja Distribucion-amador"'}>${name}${key === latest?.key ? '<span class="current-dot"></span>' : ''}</button>`;
      }).join('') + `<button type="button" class="month-tab${annual ? ' active' : ''}" data-month="${YEAR_KEY}" aria-pressed="${annual}" title="Acumulado ${year} de los meses con datos"${latest ? '' : ' disabled'}>Anual</button>`;
    });
  }
  function renderPeriod(period) {
    const title = document.getElementById('period-title');
    const sub = document.getElementById('period-sub');
    if (!title || !sub) return;
    if (!period) {
      title.textContent = 'Sin datos';
      sub.textContent = 'No hay meses con gasto en la hoja Distribucion-amador.';
      return;
    }
    if (period.annual) {
      const count = period.months.length;
      const withResults = period.months.filter(month => valueFor(month.name, 'messages') != null);
      const partial = withResults.length && withResults.length < count ? ` Mensajes y reservas se registran desde ${withResults[0].name}; los meses anteriores solo traen gasto.` : '';
      title.textContent = `Periodo: ${period.label} ${period.year}${period.closed ? '' : ' (año en curso)'}`;
      sub.textContent = `Acumulado de ${count} ${count === 1 ? 'mes' : 'meses'} con datos (${period.months.map(month => SHORT_MONTHS[MONTHS.indexOf(month.name)]).join(', ')}).${partial} Sin año anterior para comparar.`;
      return;
    }
    title.textContent = `Periodo: ${period.label} ${period.year}${period.closed ? '' : ' (mes en curso)'}`;
    sub.textContent = period.compare ? `Comparacion vs ${period.compare.label}` : 'Sin mes anterior para comparar';
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
      if (previous) note = deltaHtml(current[kpi.key], previous[kpi.key], kpi.better, period.compare.label);
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
  function renderReservationProgress(value, goal) {
    if (goal == null || Number(goal) <= 0) return `${value}`;
    const reached = Number(value) >= Number(goal);
    const label = reached ? 'Sobre el objetivo' : 'Debajo del objetivo';
    return `<span class="reservation-value">${value}</span><span class="reservation-trend ${reached ? 'up' : 'down'}" title="${label}: ${value}/${goal}" aria-label="${label}: ${value} de ${goal}">${reached ? '▲' : '▼'} Objetivo: ${goal}</span>`;
  }
  function renderTrend(reservas, goal) {
    if (goal == null || Number(goal) <= 0) return '';
    const diff = Number(reservas) - Number(goal);
    const reached = diff >= 0;
    const label = reached ? 'Sobre el objetivo' : 'Debajo del objetivo';
    const detail = reached ? `Sobre: ${diff}` : `Faltan: ${Math.abs(diff)}`;
    return `<span class="reservation-trend ${reached ? 'up' : 'down'}" title="${label}: ${reservas}/${goal}" aria-label="${label}: ${reservas} de ${goal}">${reached ? '&#9650;' : '&#9660;'} ${detail} | Objetivo: ${goal}</span>`;
  }
  function renderDeadline(endDate, days) {
    if (!endDate) return '-';
    if (days == null) return esc(endDate);
    const counterClass = days === 0 ? 'closed' : days <= 3 ? 'urgent' : '';
    const label = days === 0 ? 'Plazo finalizado' : `${days} ${days === 1 ? 'día restante' : 'días restantes'}`;
    return `${esc(endDate)}<span class="days-counter ${counterClass}">${label}</span>`;
  }
  function renderGoalInput(campaign, ad) {
    const value = effectiveGoal(campaign, ad);
    return `<input class="reservation-goal-input" type="number" min="0" step="1" value="${esc(value)}" data-campaign="${esc(campaign.name)}" data-ad="${esc(ad.name)}" aria-label="Objetivo Reservas ${esc(campaign.name)} ${esc(ad.name)}">`;
  }
  function goalValue(campaign, ad) {
    return Number(effectiveGoal(campaign, ad || {}) || 0);
  }
  function campaignGoal(campaign, ads) {
    const saved = state.goals[goalKey(campaign.name, '__campaign__')];
    if (saved !== '' && saved != null) return Number(saved);
    const rows = ads && ads.length ? ads : (campaign.ads || []);
    return rows.reduce((sum, ad) => sum + goalValue(campaign, ad), 0);
  }
  function renderCampaignGoalInput(campaign, ads) {
    const value = campaignGoal(campaign, ads);
    return `<input class="reservation-goal-input" type="number" min="0" step="1" value="${esc(value || '')}" data-campaign="${esc(campaign.name)}" data-ad="__campaign__" aria-label="Objetivo Reservas ${esc(campaign.name)}">`;
  }
  function updateAdGoal(campaignName, adName, value) {
    const month = sourceMonth(state.month);
    const campaign = month?.campaigns?.find(item => item.name === campaignName);
    if (!campaign) return;
    const numberValue = value === '' ? null : Number(value);
    if (adName === '__campaign__') {
      const firstAd = campaign.ads?.[0];
      if (firstAd) firstAd.reservationGoal = Number.isFinite(numberValue) ? numberValue : null;
      (campaign.ads || []).slice(1).forEach(item => { item.reservationGoal = null; });
      campaign.reservationGoal = firstAd?.reservationGoal ?? null;
      Object.keys(state.goals).forEach(key => { if (key.startsWith(`${campaignName}::`) && key !== goalKey(campaignName, '__campaign__')) delete state.goals[key]; });
    } else {
      const ad = campaign.ads?.find(item => item.name === adName);
      if (!ad) return;
      ad.reservationGoal = Number.isFinite(numberValue) ? numberValue : null;
      campaign.reservationGoal = campaign.ads?.find(item => item?.reservationGoal != null)?.reservationGoal ?? null;
    }
    month.reservationGoalTotal = (month.campaigns || []).reduce((sum, item) => sum + campaignGoal(item, item.ads || []), 0);
  }
  async function pushGoalToSheet(input) {
    const endpoint = syncEndpoint();
    if (!endpoint) {
      setGoalNote('Objetivo Reservas guardado en este navegador: falta el endpoint de escritura a Google Sheets.');
      return;
    }
    const payload = {
      action: 'updateReservationGoal',
      sheetName: state.month,
      campaign: input.dataset.campaign,
      ad: input.dataset.ad,
      campaignLevel: input.dataset.ad === '__campaign__',
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
  function renderCampaigns(period) {
    const body = document.getElementById('campaigns-body');
    if (!period || period.annual) {
      document.getElementById('campaigns-title').textContent = 'Campanas por mes';
      document.getElementById('campaigns-sub').textContent = period ? 'Elige un mes para ver sus campanas y anuncios.' : '';
      document.getElementById('campaigns-note')?.classList.remove('visible');
      body.innerHTML = `<tr><td colspan="23" class="table-empty">${period ? 'La vista anual resume los indicadores; el detalle de campanas va por mes.' : 'Sin datos.'}</td></tr>`;
      return;
    }
    const month = period.month;
    const baseCampaigns = month.campaigns || [];
    const monthCustom = getMonthCustom();
    const campaigns = [...baseCampaigns, ...monthCustom.campaigns];
    const active = baseCampaigns.filter(c => ['activa', 'activo'].includes(String(c.status || '').toLowerCase())).length;
    document.getElementById('campaigns-title').textContent = `Campanas de ${month.name} ${state.data.year}`;
    document.getElementById('campaigns-sub').textContent = baseCampaigns.length ? `${active} activas de ${baseCampaigns.length} campanas registradas.` : 'Sin detalle de campanas en el archivo fuente.';
    const note = document.getElementById('campaigns-note');
    if (note) {
      const observation = String(month.totalObservation || '').trim();
      note.textContent = observation ? `* ${observation}` : '';
      note.classList.toggle('visible', Boolean(observation));
    }
    if (!campaigns.length) { body.innerHTML = '<tr><td colspan="23" class="table-empty">Sin campanas registradas para este mes.</td></tr>'; return; }
    const rows = [];
    let totalReservas = 0;
    let totalGoals = 0;
    let totalMessages = 0;
    for (const c of campaigns) {
      const isCustomC = !!(c._id);
      const baseAds = c.ads?.length ? c.ads : [null];
      const extraAds = (monthCustom.extraAds || {})[c.name] || [];
      const ads = [...baseAds, ...extraAds];
      const span = ads.length;
      const campaignTotalReservas = ads.reduce((s, ad) => s + Number((ad || {}).reservas ?? (ads.length === 1 ? c.reservas : 0) ?? 0), 0);
      const campaignTotalGoal = campaignGoal(c, ads);
      totalGoals += campaignTotalGoal;
      ads.forEach((ad, i) => {
        const currentAd = ad || {};
        const isExtraAd = extraAds.includes(ad);
        const budget = currentAd.budget ?? c.budget;
        const spent = currentAd.spent ?? (span === 1 ? c.spent : null);
        const daily = currentAd.dailyAmount ?? c.dailyAmount;
        const obj = currentAd.objective ?? c.objective;
        const st = currentAd.status ?? c.status;
        const adName = currentAd.name ?? '—';
        const reservas = Number(currentAd.reservas ?? (span === 1 ? c.reservas : 0) ?? 0);
        const messages = Number(currentAd.messages ?? (span === 1 ? c.messages : 0) ?? 0);
        const costPerMessage = currentAd.costPerMessage ?? (messages > 0 && spent != null ? spent / messages : null);
        const costPerReservation = currentAd.costPerReservation ?? (reservas > 0 && spent != null ? spent / reservas : null);
        const ratio = currentAd.reservationRatio ?? (messages > 0 ? reservas / messages * 100 : null);
        const adBalance = currentAd.balance ?? (budget != null && spent != null ? budget - spent : null);
        const observation = currentAd.observation ?? (i === 0 ? c.observation : null);
        totalReservas += reservas;
        totalMessages += messages;
        const rs = span > 1 ? ` rowspan="${span}"` : '';
        let tr = '<tr>';
        if (i === 0) {
          if (isCustomC) {
            tr += `<td class="type-col"${rs}><input class="inline-edit" type="text" placeholder="Tipo" value="${esc(c.type)}" data-field="type" data-cid="${esc(c._id)}"></td>`;
            tr += `<td class="campaign-name"${rs}><input class="inline-edit wide" type="text" placeholder="Nombre campaña" value="${esc(c.name)}" data-field="cname" data-cid="${esc(c._id)}"></td>`;
          } else {
            tr += `<td class="type-col"${rs}>${esc(c.type || '—')}</td>`;
            tr += `<td class="campaign-name"${rs}>${esc(c.name)}</td>`;
          }
        }
        if (isExtraAd || isCustomC) {
          tr += `<td class="ad-name-col"><input class="inline-edit" type="text" placeholder="Nombre anuncio" value="${esc(currentAd.name)}" data-field="adname" data-cname="${esc(c.name)}" data-cid="${esc(c._id)}" data-aid="${esc(currentAd._id)}"></td>`;
          tr += `<td><input class="inline-edit" type="text" placeholder="Objetivo" value="${esc(obj)}" data-field="adobj" data-cname="${esc(c.name)}" data-cid="${esc(c._id)}" data-aid="${esc(currentAd._id)}"></td>`;
        } else {
          tr += `<td class="ad-name-col">${safeUrl(currentAd.adUrl) ? `<a href="${safeUrl(currentAd.adUrl)}" target="_blank" rel="noopener" title="Ver vista previa del anuncio">${esc(adName)}</a>` : esc(adName)}</td>`;
          tr += `<td><span class="objective-pill">${esc(obj || '—')}</span></td>`;
        }
        tr += `<td class="resultados-col">${reservas}</td>`;
        if (i === 0) {
          tr += `<td class="goal-col"${rs}>${renderCampaignGoalInput(c, ads)}${renderTrend(campaignTotalReservas, campaignTotalGoal)}</td>`;
        }
        tr += `<td class="num">${fmtCount(messages)}</td>`;
        tr += `<td class="num">${fmtMoney(costPerMessage)}</td>`;
        tr += `<td class="num">${fmtMoney(costPerReservation)}</td>`;
        tr += `<td class="num">${fmtRatio(ratio)}</td>`;
        tr += `<td><span class="status-pill ${statusClass(st)}">${esc(st || '—')}</span></td>`;
        tr += `<td class="date-col">${esc(currentAd.startDate || '—')}</td>`;
        tr += `<td class="date-col deadline-cell">${renderDeadline(currentAd.endDate, currentAd.daysRemaining)}</td>`;
        tr += `<td class="num">${currentAd.duration != null ? currentAd.duration + ' d' : '—'}</td>`;
        tr += `<td class="num">${fmtMoney(daily)}</td>`;
        tr += `<td class="num">${fmtMoney(budget)}</td>`;
        tr += `<td class="num">${fmtMoney(spent)}</td>`;
        if (i === 0) tr += `<td class="num campaign-total"${rs}>${fmtMoney(c.budget)}</td>`;
        if (i === 0) tr += `<td class="num campaign-total"${rs}>${fmtMoney(c.spent)}</td>`;
        tr += `<td class="num">${fmtMoney(adBalance)}</td>`;
        if (i === 0) tr += `<td class="num campaign-total"${rs}>${fmtMoney(c.balance)}</td>`;
        tr += `<td class="num">${fmtMoney(currentAd.newDailyAmount)}</td>`;
        tr += `<td class="observation-col">${esc(observation || '—')}</td>`;
        tr += '</tr>';
        rows.push(tr);
      });
      // Separator row with "add ad" button on the dividing line
      rows.push(`<tr class="campaign-sep"><td colspan="23"><button class="add-ad-btn add-ad-line-btn" data-cname="${esc(c.name)}">＋ Agregar anuncio</button></td></tr>`);
    }
    rows.push(`<tr class="add-campaign-row"><td colspan="23"><button class="add-campaign-btn">＋ Agregar campaña</button></td></tr>`);
    rows.push(`<tr class="reservations-total-row"><td></td><td></td><td></td><td class="total-label">Total actualizado ${month.name.toLowerCase()}</td><td class="resultados-col">${totalReservas}</td><td class="goal-col">${totalGoals || ''}</td><td class="num">${totalMessages}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td class="num">${fmtMoney(month.adSpendTotal)}</td><td class="num">${fmtMoney(month.budgetTotal)}</td><td class="num">${fmtMoney(month.spend)}</td><td class="num">${fmtMoney(month.balanceTotal)}</td><td></td><td></td><td></td></tr>`);
    body.innerHTML = rows.join('');
  }
  function dateOrderValue(label) {
    const match = String(label || '').match(/^(\d{1,2})-([A-Za-zÁ-ú]{3})/);
    if (!match) return null;
    const index = SHORT_MONTHS.findIndex(name => name.toLowerCase() === match[2].toLowerCase());
    if (index < 0) return null;
    return index * 100 + Number(match[1]);
  }
  function finishedCampaigns() {
    return (state.data?.months || []).flatMap(month => (month.campaigns || [])
      .filter(campaign => isFinishedStatus(campaign.status))
      .map(campaign => {
        const ads = campaign.ads || [];
        const reservas = Number(campaign.reservas ?? ads.reduce((sum, ad) => sum + Number(ad.reservas || 0), 0));
        const messages = Number(campaign.messages ?? ads.reduce((sum, ad) => sum + Number(ad.messages || 0), 0));
        const spent = Number(campaign.spent ?? ads.reduce((sum, ad) => sum + Number(ad.spent || 0), 0));
        const budget = Number(campaign.budget ?? ads.reduce((sum, ad) => sum + Number(ad.budget || 0), 0));
        const balance = Number(campaign.balance ?? (Number.isFinite(budget) && Number.isFinite(spent) ? budget - spent : 0));
        const startDates = ads.map(ad => ad.startDate).filter(date => dateOrderValue(date) != null);
        const endDates = ads.map(ad => ad.endDate).filter(date => dateOrderValue(date) != null);
        const startDate = startDates.sort((a, b) => dateOrderValue(a) - dateOrderValue(b))[0] || null;
        const endDate = endDates.sort((a, b) => dateOrderValue(b) - dateOrderValue(a))[0] || null;
        return { month: month.name, campaign, ads, reservas, messages, spent, budget, balance, startDate, endDate };
      }));
  }
  function renderHistory() {
    const body = document.getElementById('history-body');
    if (!body || !state.data) return;
    const rows = finishedCampaigns();
    const kpis = document.getElementById('history-kpis');
    const sub = document.getElementById('history-sub');
    const totals = rows.reduce((acc, row) => {
      acc.spend += Number(row.spent || 0);
      acc.budget += Number(row.budget || 0);
      acc.reservas += Number(row.reservas || 0);
      acc.messages += Number(row.messages || 0);
      return acc;
    }, { spend: 0, budget: 0, reservas: 0, messages: 0 });
    if (kpis) {
      kpis.innerHTML = [
        ['Campañas', fmtCount(rows.length), 'Finalizadas'],
        ['Inversión', fmtMoney(totals.spend), 'Gasto acumulado'],
        ['Reservas', fmtCount(totals.reservas), 'Total historico'],
        ['Mensajes', fmtCount(totals.messages), 'Conversaciones'],
        ['Saldo', fmtMoney(totals.budget - totals.spend), 'Presupuesto no usado']
      ].map(([label, value, meta]) => `<div class="kpi-pill"><span>${label}</span><strong>${value}</strong><small>${meta}</small></div>`).join('');
    }
    if (sub) sub.textContent = rows.length ? `${rows.length} campanas finalizadas encontradas en los meses disponibles.` : 'Sin campanas finalizadas registradas.';
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="10" class="table-empty">Sin campanas finalizadas en los meses cargados.</td></tr>';
      return;
    }
    body.innerHTML = rows.map(({ month, campaign, ads, reservas, messages, spent, budget, balance, startDate, endDate }) => `
      <tr>
        <td class="date-col">${esc(month)}</td>
        <td class="campaign-name">${esc(campaign.name)}</td>
        <td class="num">${fmtCount(reservas)}</td>
        <td class="num">${fmtCount(messages)}</td>
        <td class="num">${fmtMoney(budget)}</td>
        <td class="num">${fmtMoney(spent)}</td>
        <td class="num">${fmtMoney(balance)}</td>
        <td>${ads.length ? ads.map(ad => safeUrl(ad.adUrl) ? `<a class="history-ad-link" href="${safeUrl(ad.adUrl)}" target="_blank" rel="noopener">${esc(ad.name)}</a>` : `<span class="history-ad-muted">${esc(ad.name)}</span>`).join('') : '-'}</td>
        <td class="date-col">${esc(startDate || '-')}</td>
        <td class="date-col">${esc(endDate || '-')}</td>
      </tr>
    `).join('');
  }
  function chartOptions(selectedKeys) {
    const hasMoney = selectedKeys.includes('investment');
    const hasCount = selectedKeys.some(key => key !== 'investment');
    const mixed = hasMoney && hasCount;
    const moneyTicks = value => value === 0 ? 'S/. 0' : `S/. ${(value / 1000).toFixed(1)}k`;
    const countTicks = value => Number(value).toLocaleString('es-PE');
    const scales = {
      x: { grid: { display: false }, border: { color: '#cbd5e1' }, ticks: { color: '#7890b5', font: { size: 10 } } },
      y: { beginAtZero: true, suggestedMax: hasMoney ? 3500 : undefined, border: { display: false }, grid: { color: 'rgba(148,163,184,.20)' }, ticks: { precision: 0, color: '#7890b5', font: { size: 10 }, callback: value => hasMoney ? moneyTicks(value) : countTicks(value) } }
    };
    if (mixed) scales.y1 = { beginAtZero: true, position: 'right', border: { display: false }, grid: { drawOnChartArea: false }, ticks: { precision: 0, color: '#7890b5', font: { size: 10 }, callback: countTicks } };
    return { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, layout: { padding: { top: 24, right: 12, left: 4 } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: context => ` ${context.dataset.label}: ${formatSeriesValue(context.raw, SERIES[context.dataset.seriesKey] || SERIES.investment)}` } } }, scales };
  }
  function applyChartCollapsed() {
    const panel = document.getElementById('chart-panel');
    const button = document.getElementById('chart-toggle-btn');
    if (!panel || !button) return;
    panel.classList.toggle('is-collapsed', state.chartCollapsed);
    button.textContent = state.chartCollapsed ? '+' : '-';
    button.setAttribute('aria-expanded', String(!state.chartCollapsed));
    button.setAttribute('title', state.chartCollapsed ? 'Expandir grafico' : 'Minimizar grafico');
  }
  function renderChart() {
    const selectedKeys = Object.keys(SERIES).filter(key => state.types.includes(key));
    document.getElementById('chart-title').textContent = `Evolucion mensual | ${selectedKeys.map(key => SERIES[key].label).join(' + ')} | 2026`;
    const legend = document.getElementById('chart-legend');
    if (legend) legend.innerHTML = selectedKeys.map(key => `<span><i class="legend-line ${key}"></i><b>${SERIES[key].label}</b></span>`).join('');
    document.querySelectorAll('#chart-series-toggles input').forEach(input => {
      input.checked = selectedKeys.includes(input.value);
      input.closest('.series-toggle')?.classList.toggle('active', input.checked);
    });
    if (state.chartCollapsed) return;
    const canvas = document.getElementById('chart-monthly');
    if (!canvas) return;
    if (typeof Chart === 'undefined') { canvas.parentElement.innerHTML = '<div class="empty-state"><strong>Grafico no disponible sin conexion.</strong><span>Los totales mensuales siguen visibles debajo.</span></div>'; return; }
    const mixed = selectedKeys.includes('investment') && selectedKeys.some(key => key !== 'investment');
    const datasets = selectedKeys.map(key => {
      const series = SERIES[key];
      return { label: series.label, seriesKey: key, data: MONTHS.map(name => valueFor(name, key)), borderColor: series.color, backgroundColor: series.fill, borderWidth: 2.5, pointRadius: 5, pointHoverRadius: 7, pointBackgroundColor: series.color, pointBorderColor: series.color, tension: .25, fill: selectedKeys.length === 1, spanGaps: false, yAxisID: mixed && key !== 'investment' ? 'y1' : 'y' };
    });
    if (state.chart) state.chart.destroy();
    state.chart = new Chart(canvas, { type: 'line', data: { labels: SHORT_MONTHS, datasets }, options: chartOptions(selectedKeys), plugins: [{ id: 'valueLabels', afterDatasetsDraw(chart) { const ctx = chart.ctx; ctx.save(); ctx.font = '600 10px Inter, sans-serif'; ctx.textAlign = 'center'; chart.data.datasets.forEach((dataset, datasetIndex) => { const meta = chart.getDatasetMeta(datasetIndex); ctx.fillStyle = dataset.borderColor; meta.data.forEach((point, index) => { const value = dataset.data[index]; if (value == null) return; ctx.fillText(formatSeriesValue(value, SERIES[dataset.seriesKey], true), point.x, point.y - 13); }); }); ctx.restore(); } }] });
  }
  // Cambiar de mes solo repinta lo que depende del mes: pestanas, periodo, KPIs y campanas.
  function renderMonthView() {
    if (!annualView() && !hasData(monthByKey(state.monthKey))) state.monthKey = latestMonth()?.key || null;
    state.month = (annualView() ? latestMonth() : selectedMonth())?.name || null;
    const period = currentPeriod();
    renderTabs();
    renderPeriod(period);
    renderKpis(period);
    renderCampaigns(period);
  }
  // Datos nuevos: se repinta todo y se avisa a los modulos que dependen de estos datos (Proyecciones).
  function renderAll() {
    applyChartCollapsed();
    renderChart();
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
    // El unico boton Actualizar vive en la barra superior, junto al estado de los datos.
    refreshButtons().forEach(button => button.addEventListener('click', refreshAll));
    wireStatusCard();
    document.getElementById('month-tabs')?.addEventListener('click', event => {
      const button = event.target.closest('.month-tab:not(:disabled)');
      if (!button || button.dataset.month === state.monthKey) return;
      state.monthKey = button.dataset.month;
      renderMonthView();
    });
    document.getElementById('chart-toggle-btn').addEventListener('click', () => {
      state.chartCollapsed = !state.chartCollapsed;
      saveChartCollapsed();
      applyChartCollapsed();
      if (!state.chartCollapsed) renderChart();
    });
    document.getElementById('campaigns-body').addEventListener('change', event => {
      const input = event.target.closest('.reservation-goal-input');
      if (input) {
        if (input.dataset.ad === '__campaign__') {
          Object.keys(state.goals).forEach(key => { if (key.startsWith(`${input.dataset.campaign}::`)) delete state.goals[key]; });
        }
        state.goals[goalKey(input.dataset.campaign, input.dataset.ad)] = input.value;
        updateAdGoal(input.dataset.campaign, input.dataset.ad, input.value);
        saveGoals();
        renderCampaigns(currentPeriod());
        pushGoalToSheet(input);
        return;
      }
      const edit = event.target.closest('.inline-edit');
      if (edit) {
        const { field, cid, cname, aid } = edit.dataset;
        setMonthCustom(mc => {
          if (field === 'type' || field === 'cname') {
            const camp = mc.campaigns.find(x => x._id === cid);
            if (camp) {
              if (field === 'type') camp.type = edit.value;
              if (field === 'cname') {
                // also rename extraAds key
                if (mc.extraAds[camp.name]) { mc.extraAds[edit.value] = mc.extraAds[camp.name]; delete mc.extraAds[camp.name]; }
                camp.name = edit.value;
              }
            }
          } else if (field === 'adname' || field === 'adobj') {
            const key = cname || cid;
            const ads = mc.extraAds[key] || [];
            const adItem = ads.find(a => a._id === aid);
            if (adItem) {
              if (field === 'adname') adItem.name = edit.value;
              if (field === 'adobj') adItem.objective = edit.value;
            }
          }
          return mc;
        });
        renderCampaigns(currentPeriod());
      }
    });
    document.getElementById('campaigns-body').addEventListener('click', event => {
      const addAdBtn = event.target.closest('.add-ad-btn');
      if (addAdBtn) {
        const cname = addAdBtn.dataset.cname || '';
        setMonthCustom(mc => {
          if (!mc.extraAds[cname]) mc.extraAds[cname] = [];
          mc.extraAds[cname].push({ _id: genId(), name: '', objective: '' });
          return mc;
        });
        renderCampaigns(currentPeriod());
        return;
      }
      const addCampBtn = event.target.closest('.add-campaign-btn');
      if (addCampBtn) {
        setMonthCustom(mc => {
          mc.campaigns.push({ _id: genId(), name: '', type: '', status: 'Activo', ads: [] });
          return mc;
        });
        renderCampaigns(currentPeriod());
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - state.lastFetch > VISIBILITY_REFETCH_MS) syncLiveSheet();
    });
  }
  async function init() {
    try {
      if (window.AMADOR_ADS_DATA) state.data = cloneData(window.AMADOR_ADS_DATA);
      else { const response = await fetch(DATA_URL, { cache: 'no-store' }); if (!response.ok) throw new Error(`HTTP ${response.status}`); state.data = await response.json(); }
      // La fecha del archivo es la de la copia guardada del mes en curso, no la de hoy.
      state.data.fileCutoff = state.data.cutoff;
      const sheetMonths = window.AMADOR_SHEET_MONTHS || await Promise.all(SHEET_FILES.map(url => fetch(url, { cache: 'no-store' }).then(response => response.json())));
      sheetMonths.forEach(month => mergeSheetMonth(month, state.data.source || 'Datos locales'));
      decorate(state.data);
      state.monthKey = latestMonth()?.key || null;
      wireEvents();
      renderAll();
      updateStatusLabel('Leyendo Google Sheets...');
      syncLiveSheet();
    } catch (error) { document.getElementById('view-obj').innerHTML = '<div class="data-notice error"><strong>No se pudo cargar la informacion de Amador.</strong></div>'; console.error(error); }
  }
  // Snapshot de solo lectura para los modulos que dependen de estos datos (Proyecciones).
  function snapshot() {
    if (!state.data) return null;
    return {
      cutoff: state.data.cutoff,
      latestKey: state.data.latestKey,
      source: state.data.source,
      year: state.data.year,
      lastSync: state.lastSync,
      error: state.error,
      months: cloneData(state.data).months,
    };
  }
  window.AmadorObjectives = { renderHistory, snapshot };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
