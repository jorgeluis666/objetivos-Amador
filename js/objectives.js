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
  // URL del Web App de scripts/google-sheets-sync.gs; vacio = la edicion de objetivos queda solo local.
  const SHEET_SYNC_ENDPOINT = '';
  const SHEET_SYNC_ENDPOINT_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;
  const CHART_COLLAPSED_KEY = 'amador-chart-collapsed-v1';
  const { MONTHS, SHORT_MONTHS, esc, safeUrl, fmt, change, hasActivity, hasSpend, limaParts, monthKey, daysInMonth, formatStamp, keepFocus } = window.AmadorShared;
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
  const state = {
    data: null, types: readChartSeries(), monthKey: null, month: null, chart: null, syncTimer: null, nextSync: 0, goals: {},
    chartCollapsed: readChartCollapsed(), lastSync: null, lastFetch: 0, current: null, liveSheets: [], error: '', goalNote: '',
    // Tabla de anuncios: densidad, pantalla completa (las pestanas de mes vuelven a tabsHome) y filtro por objetivo.
    tableCompact: readFlag(TABLE_COMPACT_KEY), tableFullscreen: false, tabsHome: null, adsObjective: 'all',
    campaignBlocks: readBlockSettings(),
  };

  const fmtMoney = value => Number.isFinite(Number(value)) ? `S/. ${Number(value).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-';
  const fmtCount = value => Number(value || 0).toLocaleString('es-PE', { maximumFractionDigits: 0 });
  const fmtShort = value => {
    if (value == null) return '';
    if (value >= 1000) return `S/. ${(value / 1000).toFixed(2).replace(/0$/, '').replace(/\.0$/, '')}k`;
    return `S/. ${Math.round(value)}`;
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
      // detail: el mes anterior trae campanas (enero y febrero solo traen el gasto total).
      compare: hasData(previous) ? { month: previous, months: [previous], label: `${previous.name} completo`, detail: (previous.campaigns || []).length > 0 } : null,
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
    const perAd = !byAdSet(month);
    return (month.campaigns || []).map(campaign => {
      const objective = campaignObjective(campaign);
      const ads = campaign.ads || [];
      const byEnd = ads.filter(ad => dateOrderValue(ad.endDate) != null).sort((a, b) => dateOrderValue(b.endDate) - dateOrderValue(a.endDate));
      const last = byEnd[0] || ads[0] || {};
      const starts = ads.map(ad => ad.startDate).filter(date => dateOrderValue(date) != null).sort((a, b) => dateOrderValue(a) - dateOrderValue(b));
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
        spend: Number(campaign.spent) || 0,
        messages: campaign.messages ?? null,
        reservations: campaign.reservas ?? null,
        budget: campaign.budget ?? null,
        balance: campaign.balance ?? null,
        // Desde julio el objetivo de reservas viene en la campana; en junio, por anuncio.
        sheetGoal: campaign.reservationGoal ?? (adGoals.length ? adGoals.reduce((sum, value) => sum + Number(value), 0) : null),
        startDate: starts[0] || null,
        endDate: last.endDate || null,
        daysRemaining: last.daysRemaining ?? null,
        newDaily: newDaily.length ? newDaily.reduce((sum, value) => sum + Number(value), 0) : null,
        ads,
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
      };
    });
  }
  const goalStoreKey = (key, campaignName) => `${key}::${campaignName}`;
  // Objetivo Reservas de una campana en su mes: el editado en el tablero o el de la hoja.
  function entryGoal(entry) {
    const saved = state.goals[goalStoreKey(entry.monthKey, entry.name)];
    return saved === '' || saved == null ? entry.sheetGoal : Number(saved);
  }
  const costs = item => ({
    costPerMessage: item.messages > 0 ? item.spend / item.messages : null,
    costPerReservation: item.reservations > 0 ? item.spend / item.reservations : null,
  });
  // Totales de varias campanas: los costos usan solo el gasto de las campanas que registran ese resultado.
  function totalsOf(entries) {
    const spendWith = field => entries.filter(entry => entry[field] != null).reduce((sum, entry) => sum + entry.spend, 0);
    const messages = entries.reduce((sum, entry) => addNullable(sum, entry.messages), null);
    const reservations = entries.reduce((sum, entry) => addNullable(sum, entry.reservations), null);
    return {
      spend: entries.reduce((sum, entry) => sum + entry.spend, 0),
      messages,
      reservations,
      costPerMessage: messages > 0 ? spendWith('messages') / messages : null,
      costPerReservation: reservations > 0 ? spendWith('reservations') / reservations : null,
    };
  }
  // Objetivos del periodo con gasto, de mayor a menor. Los nombres de campana salen solo de las que tuvieron gasto.
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
        return { key: items[0].group, label: items[0].groupLabel, color: items[0].color, campaigns: [...new Set(items.filter(hasSpend).map(item => item.name))], share: total > 0 ? (sums.spend / total) * 100 : 0, ...sums };
      })
      .filter(hasSpend)
      .sort((a, b) => b.spend - a.spend);
  }
  // Una fila por campana con gasto. En la vista anual se juntan por nombre exacto (como en Meta: una campana
  // renombrada sale en dos filas).
  function distributionRows(entries, annual) {
    const total = entries.reduce((sum, entry) => sum + entry.spend, 0);
    let rows = entries.map(entry => ({ ...entry, goal: entryGoal(entry), months: entry.spend > 0 ? [entry.month] : [] }));
    if (annual) {
      const byName = new Map();
      rows.forEach(entry => {
        const row = byName.get(entry.name);
        if (!row) {
          byName.set(entry.name, { ...entry, months: [...entry.months] });
          return;
        }
        Object.assign(row, { group: entry.group, groupLabel: entry.groupLabel, color: entry.color, type: entry.type || row.type });
        row.spend += entry.spend;
        row.messages = addNullable(row.messages, entry.messages);
        row.reservations = addNullable(row.reservations, entry.reservations);
        row.goal = addNullable(row.goal, entry.goal);
        row.months.push(...entry.months);
      });
      rows = [...byName.values()];
    }
    return rows.filter(hasSpend).map(row => ({ ...row, ...costs(row), share: total > 0 ? (row.spend / total) * 100 : 0 })).sort((a, b) => b.spend - a.spend);
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
          costPerMessage: messages > 0 ? spend / messages : null,
          share: total > 0 ? (spend / total) * 100 : 0,
        };
      })
      .filter(hasSpend)
      .sort((a, b) => b.spend - a.spend);
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
        const starts = items.map(row => row.startDate).filter(date => dateOrderValue(date) != null).sort((a, b) => dateOrderValue(a) - dateOrderValue(b));
        const ends = items.map(row => row.endDate).filter(date => dateOrderValue(date) != null).sort((a, b) => dateOrderValue(b) - dateOrderValue(a));
        const sum = field => items.reduce((total, row) => total + row[field], 0);
        return {
          ...last,
          spend: sum('spend'),
          messages: sum('messages'),
          reservations: sum('reservations'),
          perAd: items.every(row => row.perAd),
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
      const parts = [`${periodName(period)} | ${rows.length} ${rows.length === 1 ? 'campaña' : 'campañas'} con gasto.`];
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
        <td class="share-col"><div class="share-bar" style="--campaign-color:${row.color}"><span style="width:${Math.min(100, row.share).toFixed(1)}%"></span></div><b class="share-value">${fmt.pct(row.share)}</b></td>
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
        <td><b class="share-value">100%</b></td>
        <td class="num">${month ? fmt.money(month.budgetTotal) : '-'}</td>
        <td class="num">${month ? fmt.money(month.balanceTotal) : '-'}</td>
        <td></td>
        <td class="num">${month ? fmt.money(month.newDailyTotal) : '-'}</td>
      </tr>`);
    } else if (!custom?.campaigns.length) {
      const empty = period.annual || (period.month.campaigns || []).length ? `Sin campañas con gasto en ${esc(periodName(period))}.` : `${esc(period.month.name)} no trae detalle de campañas en la hoja.`;
      html.unshift(`<tr><td class="table-empty" colspan="14">${empty}</td></tr>`);
    }
    keepFocus(body, () => { body.innerHTML = html.join(''); });
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
    const months = period.months.filter(month => entries.some(entry => entry.group === key && entry.monthKey === month.key && entry.spend > 0));
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
        ? `${period.annual ? 'Estos meses no agrupan' : `${period.month.name} no agrupa`} los anuncios por conjunto: el detalle va en la tabla de anuncios.`
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
          <td class="share-col"><div class="share-bar"><span style="width:${Math.min(100, set.share).toFixed(1)}%"></span></div><b class="share-value">${fmt.pct(set.share)}</b></td>
        </tr>`;
    }).join('') || `<tr><td class="table-empty" colspan="${columns.length}">Sin conjuntos con gasto en el periodo.</td></tr>`;
    let note = `${sets.length} ${sets.length === 1 ? 'conjunto' : 'conjuntos'} con gasto en ${esc(periodName(period))}`;
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
      <div><dt>${kpi.label}</dt><dd>${fmt[kpi.format](objective[kpi.key])}${before ? deltaHtml(objective[kpi.key], before[kpi.key], kpi.better) : ''}</dd></div>`).join('');
    return `
      <section class="campaign-block${settings.collapsed ? ' is-collapsed' : ''}" id="campaign-${key}" data-objective="${key}" style="--campaign-color:${objective.color}">
        <div class="panel-head chart-panel-head">
          <div>
            <div class="campaign-block-title"><i class="campaign-dot"></i>Campaña ${esc(objective.label)}<em>${fmt.pct(objective.share)} de la inversión</em></div>
            <div class="panel-sub">${esc(objective.campaigns.join(' / '))} | ${esc(periodName(period))}${esc(comparison)}</div>
          </div>
          <div class="chart-controls">
            <button type="button" class="chart-toggle" data-campaign-toggle="${key}" aria-controls="campaign-body-${key}">${CHEVRON}</button>
          </div>
        </div>
        <dl class="chart-kpis">${kpis}</dl>
        <div class="campaign-block-body" id="campaign-body-${key}">
          ${adSetsHtml(period, objective, model)}
        </div>
      </section>`;
  }
  function renderCampaignBlock(key, period, model) {
    const block = [...document.querySelectorAll('#campaign-blocks .campaign-block')].find(node => node.dataset.objective === key);
    const objective = model?.objectives.find(item => item.key === key);
    if (!block || !objective) return;
    const settings = blockSettings(key);
    block.classList.toggle('is-collapsed', settings.collapsed);
    setToggle(block.querySelector('[data-campaign-toggle]'), settings.collapsed, `la campaña ${objective.label}`);
  }
  function renderCampaignBlocks(period, model) {
    const host = document.getElementById('campaign-blocks');
    if (!host) return;
    if (!period || !model) {
      host.innerHTML = '';
      return;
    }
    const previous = new Map(model.previous.objectives.map(objective => [objective.key, objective]));
    keepFocus(host, () => {
      host.innerHTML = model.objectives.map(objective => campaignBlockHtml(period, objective, period.compare ? previous.get(objective.key) : null, model)).join('');
      model.objectives.forEach(objective => renderCampaignBlock(objective.key, period, model));
    });
  }

  // ── Anuncios del periodo ─────────────────────────────────────────────────
  function renderAdsFilter(objectives) {
    const select = document.getElementById('ads-objective');
    if (!select) return;
    if (state.adsObjective !== 'all' && !objectives.some(objective => objective.key === state.adsObjective)) state.adsObjective = 'all';
    select.innerHTML = ['<option value="all">Todos los objetivos</option>']
      .concat(objectives.map(objective => `<option value="${esc(objective.key)}"${objective.key === state.adsObjective ? ' selected' : ''}>${esc(objective.label)}</option>`))
      .join('');
  }
  // Anuncios agregados a mano en este navegador, por nombre de campana (sin cifras de la hoja).
  function customAdsHtml(period) {
    const custom = getMonthCustom();
    const names = [...new Set([...(period.month.campaigns || []).map(campaign => campaign.name), ...custom.campaigns.map(campaign => campaign.name).filter(Boolean)])];
    const rows = Object.entries(custom.extraAds || {}).flatMap(([owner, ads]) => (ads || []).map(ad => `
      <tr class="custom-row">
        <td class="type-col"><input class="inline-edit" type="text" placeholder="Objetivo" value="${esc(ad.objective)}" data-field="adobj" data-cname="${esc(owner)}" data-aid="${esc(ad._id)}" aria-label="Objetivo del anuncio agregado"></td>
        <td class="ad-name-col"><input class="inline-edit wide" type="text" placeholder="Nombre anuncio" value="${esc(ad.name)}" data-field="adname" data-cname="${esc(owner)}" data-aid="${esc(ad._id)}" aria-label="Nombre del anuncio agregado"></td>
        <td class="campaign-set-col">${esc(owner || 'Sin campaña')}</td>
        <td colspan="12"><span class="no-data">Agregado en este navegador: sin cifras de la hoja.</span></td>
      </tr>`));
    if (names.length) rows.push(`<tr class="add-campaign-row"><td colspan="15"><label class="add-ad-picker">Agregar un anuncio a <select data-add-ad-campaign aria-label="Campaña del anuncio a agregar">${names.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('')}</select></label><button type="button" class="add-campaign-btn add-ad-btn">＋ Agregar anuncio</button></td></tr>`);
    return rows.join('');
  }
  function renderAds(period, model) {
    const body = document.getElementById('campaigns-body');
    const title = document.getElementById('campaigns-title');
    const sub = document.getElementById('campaigns-sub');
    const prevHead = document.getElementById('ads-prev-head');
    if (!body) return;
    // Sin anuncios en el mes anterior (marzo a mayo solo traen campanas) no hay contra que comparar.
    const compare = Boolean(period?.compare) && model?.previous.rows.length > 0;
    document.querySelector('.campaigns-panel')?.classList.toggle('no-compare', !compare);
    if (!period || !model) {
      body.innerHTML = '<tr><td class="table-empty" colspan="15">Sin datos para el periodo.</td></tr>';
      if (title) title.textContent = 'Anuncios del periodo';
      if (sub) sub.textContent = '';
      if (prevHead) prevHead.textContent = 'Mes anterior';
      renderAdsFilter([]);
      return;
    }
    renderAdsFilter(model.objectives);
    const order = new Map(model.objectives.map((objective, index) => [objective.key, index]));
    const previous = new Map(compare ? adsOf(model.previous.rows).map(ad => [ad.key, ad]) : []);
    const all = adsOf(model.rows).sort((a, b) => ((order.get(a.group) ?? 99) - (order.get(b.group) ?? 99)) || (b.messages - a.messages) || (b.spend - a.spend));
    const leaders = new Set();
    all.forEach(ad => {
      if (ad.messages > 0 && !leaders.has(ad.group)) {
        leaders.add(ad.group);
        ad.leader = true;
      }
    });
    const rows = state.adsObjective === 'all' ? all : all.filter(ad => ad.group === state.adsObjective);
    const bySet = all.some(ad => !ad.perAd);
    if (title) title.textContent = `Anuncios | ${periodName(period)}${period.annual ? '' : ` ${period.year}`}`;
    if (sub) {
      sub.textContent = model.rows.length
        ? `${rows.length} ${rows.length === 1 ? 'anuncio' : 'anuncios'} ordenados por mensajes dentro de cada objetivo. La estrella marca al líder de cada objetivo.${bySet ? ' Desde julio el gasto se registra por conjunto y las reservas por campaña: van en su cuadro y en la distribución.' : ''}`
        : `La hoja no trae el detalle de anuncios de ${period.annual ? 'este periodo' : period.month.name}.`;
    }
    if (prevHead) prevHead.textContent = compare ? `Mensajes ${period.compare.month.name}` : 'Mes anterior';
    const extra = period.annual ? '' : customAdsHtml(period);
    if (!rows.length) {
      const empty = model.rows.length ? 'No hay anuncios de este objetivo en el periodo.' : 'La hoja no trae el detalle de anuncios de este periodo.';
      keepFocus(body, () => { body.innerHTML = `<tr><td class="table-empty" colspan="15">${empty}</td></tr>${extra}`; });
      return;
    }
    const html = rows.map(ad => {
      const before = previous.get(ad.key);
      const preview = safeUrl(ad.preview);
      const set = ad.adSet ? `<small>${esc(ad.adSet)}</small>` : '';
      return `
        <tr>
          <td class="type-col"><span class="objective-label" style="--campaign-color:${ad.color}"><i class="campaign-dot"></i>${esc(ad.groupLabel)}</span></td>
          <td class="ad-name-col" title="${esc(ad.ad)}"><span class="ad-name-text">${ad.leader ? '<b class="leader-star" title="Líder del objetivo">&#9733;</b> ' : ''}${esc(ad.ad || '(sin nombre)')}</span></td>
          <td class="campaign-set-col">${esc(ad.campaign)}${set}</td>
          <td><span class="status-pill ${statusClass(ad.status)}">${esc(ad.status || '-')}</span></td>
          <td class="num"><b>${fmt.count(ad.messages)}</b></td>
          <td class="num">${before ? fmt.count(before.messages) : '<span class="no-data">-</span>'}</td>
          <td class="num">${compare ? variationCell(ad.messages, before?.messages) : '<span class="no-data">-</span>'}</td>
          <td class="num">${ad.perAd ? fmt.money(ad.messages > 0 ? ad.spend / ad.messages : null) : '<span class="no-data">-</span>'}</td>
          <td class="num">${ad.perAd ? fmt.money(ad.spend) : '<span class="no-data" title="El gasto se registra por conjunto">Por conjunto</span>'}</td>
          <td class="num">${ad.perAd ? fmt.count(ad.reservations) : '<span class="no-data" title="Las reservas se registran por campaña">Por campaña</span>'}</td>
          <td class="date-col">${esc(ad.startDate || '-')}</td>
          <td class="date-col deadline-cell">${period.annual ? esc(ad.endDate || '-') : renderDeadline(ad.endDate, ad.daysRemaining)}</td>
          <td class="num">${fmt.money(ad.daily)}</td>
          <td class="observation-col">${esc(ad.observation || '-')}</td>
          <td>${preview ? `<a class="preview-link" href="${preview}" target="_blank" rel="noopener noreferrer">Ver anuncio &raquo;</a>` : '<span class="no-data">Sin enlace</span>'}</td>
        </tr>`;
    }).join('');
    keepFocus(body, () => { body.innerHTML = html + extra; });
  }

  // ── Herramientas de la tabla de anuncios ─────────────────────────────────
  function applyTableCompact() {
    const panel = document.querySelector('.campaigns-panel');
    const button = document.getElementById('campaigns-density-btn');
    if (!panel || !button) return;
    panel.classList.toggle('is-compact', state.tableCompact);
    button.setAttribute('aria-pressed', String(state.tableCompact));
    button.textContent = state.tableCompact ? 'Cómodo' : 'Compacto';
    button.setAttribute('title', state.tableCompact ? 'Volver a filas amplias' : 'Reducir el alto de las filas');
  }
  function toggleTableFullscreen(force) {
    state.tableFullscreen = force == null ? !state.tableFullscreen : Boolean(force);
    const panel = document.querySelector('.campaigns-panel');
    const button = document.getElementById('campaigns-expand-btn');
    const tabs = document.getElementById('month-tabs');
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
  // Distribucion, cuadros y anuncios del periodo.
  function renderCampaignSection(period) {
    const model = periodModel(period);
    renderDistribution(period, model);
    renderCampaignBlocks(period, model);
    renderAds(period, model);
  }
  async function pushGoalToSheet(input) {
    const endpoint = syncEndpoint();
    if (!endpoint) {
      setGoalNote('Objetivo Reservas guardado en este navegador: falta el endpoint de escritura a Google Sheets.');
      return;
    }
    const payload = {
      action: 'updateReservationGoal',
      sheetName: MONTHS[Number(String(input.dataset.month).slice(5, 7)) - 1],
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
    renderCampaignSection(period);
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
    // Anuncios agregados a mano (tabla de anuncios).
    const adsBody = document.getElementById('campaigns-body');
    adsBody?.addEventListener('change', event => {
      const edit = event.target.closest('.inline-edit');
      if (!edit) return;
      const { field, cname, aid } = edit.dataset;
      setMonthCustom(mc => {
        const item = (mc.extraAds[cname || ''] || []).find(ad => ad._id === aid);
        if (item && field === 'adname') item.name = edit.value;
        if (item && field === 'adobj') item.objective = edit.value;
        return mc;
      });
      renderCampaignSection(currentPeriod());
    });
    adsBody?.addEventListener('click', event => {
      if (!event.target.closest('.add-ad-btn')) return;
      const owner = adsBody.querySelector('[data-add-ad-campaign]')?.value || '';
      setMonthCustom(mc => {
        mc.extraAds[owner] = mc.extraAds[owner] || [];
        mc.extraAds[owner].push({ _id: genId(), name: '', objective: '' });
        return mc;
      });
      renderCampaignSection(currentPeriod());
    });
    // Minimizar cada cuadro de objetivo.
    document.getElementById('campaign-blocks')?.addEventListener('click', event => {
      const key = event.target.closest('[data-campaign-toggle]')?.closest('.campaign-block')?.dataset.objective;
      if (!key) return;
      saveBlockSettings(key, { collapsed: !blockSettings(key).collapsed });
      const period = currentPeriod();
      renderCampaignBlock(key, period, periodModel(period));
    });
    document.getElementById('ads-objective')?.addEventListener('change', event => {
      state.adsObjective = event.target.value;
      const period = currentPeriod();
      renderAds(period, periodModel(period));
    });
    document.getElementById('campaigns-density-btn')?.addEventListener('click', () => {
      state.tableCompact = !state.tableCompact;
      try { localStorage.setItem(TABLE_COMPACT_KEY, String(state.tableCompact)); } catch {}
      applyTableCompact();
    });
    document.getElementById('campaigns-expand-btn')?.addEventListener('click', () => toggleTableFullscreen());
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && state.tableFullscreen) toggleTableFullscreen(false);
    });
    // Cambiar de modulo con el panel fijo dejaria la pagina bloqueada.
    document.querySelectorAll('[data-view-target]').forEach(button => {
      button.addEventListener('click', () => { if (state.tableFullscreen) toggleTableFullscreen(false); });
    });
    const tabs = document.getElementById('month-tabs');
    if (tabs) state.tabsHome = { parent: tabs.parentNode, next: tabs.nextSibling };
    applyTableCompact();
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
      loadGoals();
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
  window.AmadorObjectives = { renderHistory, snapshot };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
