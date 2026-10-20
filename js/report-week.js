(function () {
  // Generacion de Reporte: el PDF de publicidad con el diseño del modelo de Amador ("Modelo Reporte
  // Amador"): laminas 16:9 con portada, contenido, "Como vamos" (el mes y su evolucion por semana), una
  // pagina por campaña (Reservas de Almuerzos, Eventos, Corporativos...), conclusiones y cierre.
  //
  // No hay datos nuevos aqui: sale del mismo barrido de Meta que alimenta Gasto publicitario
  // (window.AmadorObjectives.meta()). Se elige el mes y cada pagina lo parte en semanas de lunes a domingo
  // (S1, S2...). La lectura, el analisis de cada campaña y las conclusiones vienen propuestos con lo que
  // dicen los numeros; el equipo los reescribe sobre la misma lamina y quedan guardados por mes en este
  // navegador.
  //
  // El template es propio de Amador: cada tablero de marca tiene el suyo, adaptado por la marca.
  const { esc, safeUrl, change, limaParts, MONTHS, SHORT_MONTHS } = window.AmadorShared;

  const BRAND = 'Amador';
  const NOTES_KEY = 'amador-report-notes-v2';
  const DRIVE_SNAPSHOT_KEY = 'amador-drive-reports-snapshot-v1';
  const METRICS = ['spend', 'impressions', 'reach', 'clicks', 'results', 'messages', 'purchases'];
  const MAX_ADS = 4;
  const PAGE_WIDTH = 1280;
  const LOGO = 'assets/logo-lima-retail.png';
  const AGENCY_LINE = 'Lima Retail · Data Driven Marketing · Power KPI · Digital Analytics';
  const COVER_TAG = 'Meta Ads · Reservas por WhatsApp';
  const RED = '#c8102e';
  const TEAL = '#14a08c';

  // Lo que mide cada tipo de campaña: compras (Ventas), leads (Clientes potenciales), conversaciones
  // (Interaccion / Mensajes) o, si no es ninguno, el resultado que da Meta.
  const KINDS = {
    compras: { sub: 'Campaña de ventas: reservas y compras en la web.', icon: 'trend', metric: 'compras', adsMetric: 'compras', adsLabel: 'compras', label: 'Compras', one: 'compra', many: 'compras', article: 'las', chart: 'Compras por semana', color: RED, costLabel: 'Costo/compra' },
    leads: { sub: 'Campaña de clientes potenciales.', icon: 'briefcase', metric: 'leads', adsMetric: 'messages', adsLabel: 'conversaciones', label: 'Reservas (leads)', one: 'lead', many: 'leads', article: 'los', chart: 'Conversaciones por semana', color: TEAL, costLabel: 'Costo/lead' },
    mensajes: { sub: 'Campaña de mensajes por WhatsApp e Instagram.', icon: 'chat', metric: 'messages', adsMetric: 'messages', adsLabel: 'conversaciones', label: 'Conversaciones', one: 'conversación', many: 'conversaciones', article: 'las', chart: 'Conversaciones por semana', color: TEAL, costLabel: 'Costo/mensaje' },
    resultados: { sub: 'Campaña con el resultado que mide Meta.', icon: 'target', metric: 'results', adsMetric: 'results', adsLabel: 'resultados', label: 'Resultados', one: 'resultado', many: 'resultados', article: 'los', chart: 'Resultados por semana', color: TEAL, costLabel: 'Costo/result.' },
  };

  // Las campañas del modelo, con su nombre y su bajada. Una campaña nueva arma su pagina con su propio nombre.
  const CAMPAIGNS = [
    { key: 'almuerzos', match: /almuerzo|reservas web/, title: 'Reservas de Almuerzos', short: 'Almuerzos', sub: 'Campaña principal: reservas y ventas de almuerzos.', spendNote: 'Campaña almuerzos', chartSub: 'Campaña Reservas Almuerzos', icon: 'trend' },
    { key: 'eventos', match: /evento/, title: 'Eventos', short: 'Eventos', sub: 'Campaña de mensajes por Instagram para eventos.', desc: 'Mensajes por IG y artes de temporada.', spendNote: 'Campaña eventos', messagesNote: 'Mensajes por eventos', chartSub: 'Campaña Eventos', icon: 'chat' },
    { key: 'corporativos', match: /corporativ/, title: 'Corporativos', short: 'Corporativos', sub: 'Campaña de clientes potenciales corporativos.', desc: 'Leads corporativos y eficiencia.', spendNote: 'Campaña corporativos', chartSub: 'Campaña Corporativos', icon: 'briefcase' },
  ];

  // Iconos de linea (24x24) de las tarjetas de contenido y conclusiones.
  const ICONS = {
    chart: '<path d="M3 3v18h18"/><path d="M8 17v-5"/><path d="M13 17V8"/><path d="M18 17v-3"/>',
    play: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m10 8 6 4-6 4z"/>',
    chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/>',
    flag: '<path d="M4 22V4"/><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1"/>',
    trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    pulse: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.target}</svg>`;

  let selectedMonth = '';
  let wired = false;

  const normalize = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

  // ── Formatos del modelo ("S/ 2,431", "S/ 7.41", "328") ─────────────────
  const integer = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });
  const finite = value => value != null && Number.isFinite(Number(value));
  const num = value => (finite(value) ? integer.format(Math.round(value)) : '—');
  const money = value => (finite(value) ? `S/ ${integer.format(Math.round(value))}` : '—');
  const money2 = value => (finite(value) ? `S/ ${Number(value).toFixed(2)}` : '—');
  // Un costo de S/ 100 o mas va redondeado (S/ 183); debajo, con centimos (S/ 7.41).
  const cost = value => (finite(value) && value > 0 ? (value >= 100 ? money(value) : money2(value)) : '—');
  const compact = value => (value >= 1000 ? `${(value / 1000).toFixed(1)}k` : integer.format(Math.round(value)));
  const pageNumber = value => String(value).padStart(2, '0');
  const list = items => (items.length > 1 ? `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}` : items[0] || '');
  const noun = (kind, value) => (Math.round(value) === 1 ? kind.one : kind.many);
  const quoted = ads => list(ads.map(ad => `"${ad.name}"`));

  // ── Filas del barrido de Meta ──────────────────────────────────────────
  // El barrido que el tablero tiene en memoria (ya releido en vivo) y, si todavia no cargo, la copia del build.
  function sweep() {
    const live = window.AmadorObjectives?.meta?.();
    return live || window.AMADOR_META_DATA || null;
  }

  function sweepRows() {
    const months = (sweep()?.months || []).filter(month => !month.error && Array.isArray(month.rows) && month.rows.length && Array.isArray(month.columns));
    const rows = [];
    months.forEach(month => {
      const at = name => month.columns.indexOf(name);
      const columns = { day: at('day'), campaign: at('campaign'), adSet: at('adSet'), ad: at('ad'), objective: at('objective'), resultType: at('resultType'), preview: at('preview') };
      const numbers = METRICS.map(field => [field, at(field)]);
      month.rows.forEach(row => {
        const day = String(row[columns.day] ?? '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
        const item = { day, d: Number(day.slice(8, 10)) };
        Object.entries(columns).forEach(([field, index]) => {
          if (field !== 'day') item[field] = index < 0 ? '' : String(row[index] ?? '').trim();
        });
        numbers.forEach(([field, index]) => { item[field] = index < 0 ? 0 : Number(row[index]) || 0; });
        // Compras y leads son el resultado de Meta de su tipo: no se cuentan las compras atribuidas a una
        // campaña de mensajes.
        const type = normalize(item.resultType);
        item.compras = /compra/.test(type) ? item.results : 0;
        item.leads = /cliente.*potencial|lead/.test(type) ? item.results : 0;
        rows.push(item);
      });
    });
    return rows;
  }

  const activity = row => row.spend > 0 || row.impressions > 0 || row.messages > 0 || row.results > 0;

  function totals(rows) {
    const sum = { spend: 0, impressions: 0, reach: 0, results: 0, messages: 0, compras: 0, leads: 0 };
    rows.forEach(row => { Object.keys(sum).forEach(field => { sum[field] += row[field] || 0; }); });
    sum.spend = Math.round(sum.spend * 100) / 100;
    sum.cpm = sum.impressions > 0 ? (sum.spend / sum.impressions) * 1000 : null;
    return sum;
  }

  // ── Meses del selector ─────────────────────────────────────────────────
  function months() {
    const byMonth = new Map();
    sweepRows().forEach(row => {
      const key = row.day.slice(0, 7);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push(row);
    });
    const keys = [...byMonth.keys()].filter(key => byMonth.get(key).some(activity)).sort().reverse();
    return keys.map((key, index) => {
      const rows = byMonth.get(key);
      const [year, month] = key.split('-').map(Number);
      const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const activeDays = rows.filter(activity).map(row => row.d);
      const lastDay = Math.max(...activeDays);
      // Un mes anterior al ultimo con datos ya termino aunque su descarga no llegue al ultimo dia.
      const closed = index > 0 || lastDay === days;
      const from = Math.min(...activeDays) > 1 && index === keys.length - 1 ? Math.min(...activeDays) : 1;
      const to = closed ? days : lastDay;
      const name = MONTHS[month - 1];
      const range = `${from}–${to}`;
      return {
        id: key,
        year,
        month,
        name,
        rows,
        from,
        to,
        closed,
        option: `${name} ${year}${closed ? '' : ` · ${range} (en curso)`}`,
        labels: {
          period: closed && from === 1 ? `${name.toLowerCase()} ${year}` : `${name.toLowerCase()} ${year} (${range})`,
          range,
          source: `Fuente: Meta Ads · ${name.toLowerCase()} ${year}${closed && from === 1 ? '' : ` (${range})`}`,
          footer: `${BRAND} · Reporte Meta Ads · ${name} ${year}`,
          note: closed ? '' : `**Variación semanal de ${name.toLowerCase()} (${range}).** Las métricas se consolidan al cierre del mes.`,
          file: `${name}${year}${closed ? '' : `_${from}-${to}`}`,
        },
      };
    });
  }

  // Semanas de lunes a domingo dentro del mes: S1 va del dia 1 al primer domingo.
  function weeksOf(period) {
    const firstWeekday = (new Date(Date.UTC(period.year, period.month - 1, 1)).getUTCDay() + 6) % 7;
    const weekOf = day => Math.floor((day - 1 + firstWeekday) / 7);
    const count = weekOf(period.to) - weekOf(period.from) + 1;
    return { count, index: day => weekOf(day) - weekOf(period.from) };
  }

  function series(rows, field, weeks) {
    const values = Array(weeks.count).fill(0);
    rows.forEach(row => { values[weeks.index(row.d)] += row[field] || 0; });
    return values;
  }

  // ── Campañas ───────────────────────────────────────────────────────────
  function campaignOf(row) {
    const text = normalize(row.campaign);
    const known = CAMPAIGNS.find(item => item.match.test(text));
    if (known) return known;
    const name = String(row.campaign || '').split('|')[0].trim().replace(/^campa(n|ñ)a\s+/i, '') || 'Otra campaña';
    const title = name.charAt(0).toUpperCase() + name.slice(1);
    return { key: normalize(title), title, short: title, spendNote: 'Inversión de la campaña', chartSub: `Campaña ${title}` };
  }

  function kindOf(sum) {
    if (sum.compras > 0) return KINDS.compras;
    if (sum.leads > 0) return KINDS.leads;
    if (sum.messages > 0) return KINDS.mensajes;
    return KINDS.resultados;
  }

  // Mejores anuncios por el resultado de la campaña. Un anuncio es su nombre: si corre en varios conjuntos se
  // suma, y si Meta dejo vacia su vista previa se usa la de la misma pieza en otro mes.
  function bestAds(rows, field, previews) {
    const byName = new Map();
    rows.forEach(row => {
      const key = normalize(row.ad);
      if (!byName.has(key)) byName.set(key, { name: row.ad, spend: 0, value: 0, preview: '' });
      const ad = byName.get(key);
      ad.spend += row.spend;
      ad.value += row[field] || 0;
      if (!ad.preview && /^https:\/\//.test(row.preview || '')) ad.preview = row.preview;
    });
    return [...byName.entries()]
      .map(([key, ad]) => ({ ...ad, preview: ad.preview || previews.get(key) || '' }))
      .filter(ad => ad.spend > 0 || ad.value > 0)
      .sort((left, right) => right.value - left.value || right.spend - left.spend)
      .slice(0, MAX_ADS);
  }

  function buildReport(period) {
    const weeks = weeksOf(period);
    const previews = new Map();
    sweepRows().sort((left, right) => right.day.localeCompare(left.day)).forEach(row => {
      const key = normalize(row.ad);
      if (!previews.has(key) && /^https:\/\//.test(row.preview || '')) previews.set(key, row.preview);
    });
    const rows = period.rows.filter(row => row.d >= period.from && row.d <= period.to);
    const groups = new Map();
    rows.forEach(row => {
      const campaign = campaignOf(row);
      if (!groups.has(campaign.key)) groups.set(campaign.key, { campaign, rows: [] });
      groups.get(campaign.key).rows.push(row);
    });
    const order = key => {
      const index = CAMPAIGNS.findIndex(item => item.key === key);
      return index < 0 ? CAMPAIGNS.length : index;
    };
    const sections = [...groups.values()]
      .map(({ campaign, rows: items }) => {
        const sum = totals(items);
        const kind = kindOf(sum);
        const value = sum[kind.metric];
        const chartField = kind === KINDS.compras ? 'compras' : kind === KINDS.resultados ? 'results' : 'messages';
        const activeWeeks = series(items, 'spend', weeks).map(spend => spend > 0);
        const spendWeeks = series(items, 'spend', weeks);
        return {
          ...campaign,
          sub: campaign.sub || kind.sub,
          icon: campaign.icon || kind.icon,
          kind,
          sum,
          value,
          cost: value > 0 ? sum.spend / value : null,
          chart: series(items, chartField, weeks),
          firstWeek: activeWeeks.indexOf(true),
          lastWeek: spendWeeks.map(spend => spend > 0).lastIndexOf(true),
          ads: bestAds(items, kind.adsMetric, previews),
        };
      })
      .filter(section => section.sum.spend > 0 || section.sum.impressions > 0)
      .sort((left, right) => order(left.key) - order(right.key) || right.sum.spend - left.sum.spend);

    const sum = totals(rows);
    const spendOf = kind => sections.filter(section => section.kind === kind).reduce((total, section) => total + section.sum.spend, 0);
    return {
      period,
      labels: period.labels,
      weeks,
      sections,
      sum,
      costs: {
        compras: sum.compras > 0 ? spendOf(KINDS.compras) / sum.compras : null,
        leads: sum.leads > 0 ? spendOf(KINDS.leads) / sum.leads : null,
        messages: sum.messages > 0 ? sum.spend / sum.messages : null,
      },
      messages: series(rows, 'messages', weeks),
    };
  }

  // ── Textos propuestos (el equipo los reescribe sobre la lamina) ─────────
  function trendWord(values) {
    const first = values[0];
    const last = values[values.length - 1];
    if (values.length < 2) return '';
    if (last > first * 1.5 && last - first >= 3) return 'Fuerte crecimiento';
    if (last > first) return 'Crecimiento';
    if (last < first) return 'Baja';
    return 'Estable';
  }

  function chartNote(values, kind) {
    if (values.length < 2) return `${num(values[0] || 0)} ${noun(kind, values[0] || 0)} en la S1.`;
    const last = values.length;
    return `${trendWord(values)}: de ${num(values[0])} (S1) a ${num(values[last - 1])} (S${last}).`;
  }

  // Una campaña rinde poco cuando gasta S/ 200 o mas y trae dos resultados o menos de lo que mide.
  const weak = section => section.kind !== KINDS.mensajes && section.sum.spend >= 200 && section.value <= 2;

  function suggestLectura(report) {
    const { sum, costs, messages, sections } = report;
    const parts = [];
    if (sum.compras > 0) parts.push(`${num(sum.compras)} ${noun(KINDS.compras, sum.compras)} (${cost(costs.compras)} c/u)`);
    if (sum.leads > 0) parts.push(`${num(sum.leads)} ${sum.leads === 1 ? 'reserva web' : 'reservas web'} (${cost(costs.leads)}${sum.leads === 1 ? '' : ' c/u'})`);
    if (sum.messages > 0) parts.push(`${num(sum.messages)} mensajes por WhatsApp (${cost(costs.messages)} c/u)`);
    const counts = ['', 'Una métrica', 'Dos métricas distintas', 'Tres métricas distintas'];
    const text = [];
    if (parts.length) text.push(`${counts[parts.length]}: ${list(parts)}.`);
    if (messages.length > 1 && sum.messages > 0) {
      const word = { 'Fuerte crecimiento': 'crecieron fuerte', Crecimiento: 'crecieron', Baja: 'bajaron', Estable: 'se mantuvieron' }[trendWord(messages)];
      text.push(`Los mensajes ${word} semana a semana (${messages.map(num).join(' → ')}).`);
    }
    const poor = sections.find(weak);
    if (poor) text.push(`${poor.title} es la campaña menos eficiente (${cost(poor.cost)} por ${poor.kind.one}) — conviene revisar su configuración.`);
    return text.join(' ');
  }

  function suggestAnalysis(section) {
    const { kind, chart, ads, sum } = section;
    const many = kind.many;
    const winners = ads.filter(ad => ad.value > 0).slice(0, 2);
    let what;
    if (weak(section)) {
      what = `la campaña ${section.title} gastó ${money(sum.spend)} y generó solo ${num(section.value)} ${noun(kind, section.value)}${kind !== KINDS.mensajes && sum.messages > 0 ? ` y ${num(sum.messages)} ${sum.messages === 1 ? 'conversación' : 'conversaciones'}` : ''}.`;
    } else if (section.lastWeek >= 0 && section.lastWeek < chart.length - 1) {
      what = `${kind.article} ${many} sumaron ${num(section.value)} hasta la S${section.lastWeek + 1}, cuando la campaña dejó de correr.`;
    } else if (section.firstWeek > 0) {
      what = `la campaña se activó en la S${section.firstWeek + 1} y trajo ${num(section.value)} ${noun(kind, section.value)}.`;
    } else if (chart.length > 1) {
      const first = chart[0];
      const last = chart[chart.length - 1];
      const verb = last > first ? 'crecieron' : last < first ? 'bajaron' : 'se mantuvieron';
      what = `${kind.article} ${many} ${verb} de ${num(first)} (S1) a ${num(last)} (S${chart.length}), ${num(section.value)} en total.`;
    } else {
      what = `${num(section.value)} ${noun(kind, section.value)} con ${money(sum.spend)} de inversión.`;
    }
    let why;
    let next;
    if (weak(section)) {
      why = `el CPM es de ${money2(sum.cpm)} y los anuncios convierten poco.`;
      next = 'revisar público y creativos, o redirigir ese presupuesto a las campañas que sí rinden.';
    } else if (winners.length > 1) {
      why = `los anuncios ${quoted(winners)} son los que más ${kind.adsLabel} trajeron.`;
      next = 'replicar esa línea con nuevas piezas de producto y ocasión para sostener el ritmo.';
    } else if (winners.length) {
      why = `el anuncio "${winners[0].name}" fue el que más enganchó (${num(winners[0].value)} ${kind.adsLabel}).`;
      next = 'mantener esa línea de contenido y sumar piezas nuevas para sostener el volumen.';
    } else {
      why = `ningún anuncio trajo ${many} en el período.`;
      next = 'revisar público y creativos antes de seguir invirtiendo.';
    }
    return `**Qué pasó:** ${what} **Qué lo ocasionó:** ${why} **Qué hacemos:** ${next}`;
  }

  function suggestConclusions(report) {
    const { sections } = report;
    const cards = [];
    const main = [...sections].filter(section => section.value > 0 && !weak(section))
      .sort((left, right) => (right.kind === KINDS.compras) - (left.kind === KINDS.compras) || right.sum.spend - left.sum.spend)[0];
    if (main) {
      cards.push({
        icon: 'trend',
        title: `${main.short} es el motor`,
        text: `La campaña de ${main.short.toLowerCase()} trae ${main.value === 1 ? 'la' : 'las'} ${num(main.value)} ${noun(main.kind, main.value)} a ${cost(main.cost)} c/u. Sostener la inversión y replicar los anuncios que convierten.`,
      });
      const winners = main.ads.filter(ad => ad.value > 0).slice(0, 2);
      if (winners.length) {
        cards.push({
          icon: 'play',
          title: 'Replicar lo que convierte',
          text: `${quoted(winners)} ${winners.length > 1 ? 'son los que más' : 'es el que más'} ${main.kind.adsLabel} ${winners.length > 1 ? 'traen' : 'trae'}. Crear nuevas piezas en esa línea, con producto y ocasión.`,
        });
      }
    }
    const poor = sections.find(weak);
    if (poor) {
      cards.push({
        icon: 'chat',
        title: `Revisar ${poor.short.toLowerCase()}`,
        text: `La campaña ${poor.title} gastó ${money(poor.sum.spend)} por ${num(poor.value)} ${noun(poor.kind, poor.value)}. Revisar público y creativos, o mover ese presupuesto a las campañas que sí rinden.`,
      });
    }
    sections.filter(section => section !== main && section !== poor && section.value > 0).forEach(section => {
      if (cards.length >= 3) return;
      cards.push({
        icon: section.icon,
        title: `Sostener ${section.short.toLowerCase()}`,
        text: `${num(section.value)} ${noun(section.kind, section.value)} a ${cost(section.cost)} c/u. Mantener el contenido que engancha para sostener el volumen.`,
      });
    });
    return cards.slice(0, 3);
  }

  // ── Textos guardados por mes ───────────────────────────────────────────
  function readNotes() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(NOTES_KEY) || '{}');
      return saved && typeof saved === 'object' ? saved : {};
    } catch {
      return {};
    }
  }

  function writeNotes(notes) {
    try {
      window.localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    } catch {
      // Sin localStorage el texto dura hasta recargar; el PDF se descarga igual.
    }
  }

  function saveNote(monthId, key, value) {
    const notes = readNotes();
    notes[monthId] = { ...(notes[monthId] || {}), [key]: value };
    writeNotes(notes);
  }

  function resetNotes(monthId) {
    const notes = readNotes();
    delete notes[monthId];
    writeNotes(notes);
  }

  // **texto** va en negrita, como "Que paso:" en el modelo.
  const rich = text => esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

  // Texto editable sobre la lamina: al hacer clic se ve el texto con sus ** y al salir vuelve a negrita.
  const editable = (key, text, tag = 'p') => `<${tag} class="rp-edit" data-note="${esc(key)}" data-raw="${esc(text)}" title="Clic para editar · **texto** va en negrita">${rich(text)}</${tag}>`;

  // ── Piezas de las laminas ──────────────────────────────────────────────
  const kpi = (label, value, foot) => `
    <div class="rp-card rp-kpi">
      <span class="rp-kpi-label">${esc(label)}</span>
      <strong>${value}</strong>
      <span class="rp-delta muted">${esc(foot)}</span>
    </div>`;

  const head = (title, sub) => `<header class="rp-head"><h2>${esc(title)}</h2><p>${esc(sub)}</p></header>`;

  function footer(left, report, page, total) {
    return `
      <footer class="rp-foot">
        <span>${esc(left)}</span>
        <span class="rp-foot-right"><img src="${LOGO}" alt=""><b>Lima Retail</b>${esc(report.labels.footer)} · ${pageNumber(page)} / ${pageNumber(total)}</span>
      </footer>`;
  }

  const insight = (label, key, text) => `
    <div class="rp-insight">
      <span class="rp-insight-icon">${icon('pulse')}</span>
      <div>
        <span class="rp-insight-label">${label}</span>
        ${editable(key, text)}
      </div>
    </div>`;

  // Linea por semana, con el valor encima de cada punto (como el modelo).
  function lineChart(values, { title, sub, color }) {
    const top = 50;
    const bottom = 178;
    const left = 40;
    const right = 600;
    const max = Math.max(...values, 0) * 1.25 || 1;
    const y = value => bottom - (value / max) * (bottom - top);
    const x = index => (values.length > 1 ? left + ((right - left) * index) / (values.length - 1) : (left + right) / 2);
    const grid = [0, 1 / 3, 2 / 3, 1].map(step => {
      const value = max * step;
      return `<line x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}" class="rp-grid"/><text x="${left - 6}" y="${y(value) + 3}" text-anchor="end" class="rp-tick">${step ? compact(value) : 0}</text>`;
    }).join('');
    const points = values.map((value, index) => `${x(index)},${y(value)}`).join(' ');
    const marks = values.map((value, index) => `
      <circle cx="${x(index)}" cy="${y(value)}" r="3.5" fill="#fff" stroke="${color}" stroke-width="2"/>
      <text x="${x(index)}" y="${y(value) - 9}" text-anchor="middle" class="rp-point" fill="${color}">${compact(value)}</text>
      <text x="${x(index)}" y="${bottom + 15}" text-anchor="middle" class="rp-axis">Sem ${index + 1}</text>`).join('');
    return `
      <svg class="rp-chart" viewBox="0 0 620 196" preserveAspectRatio="xMidYMin meet" role="img" aria-label="${esc(title)}: ${values.map(num).join(', ')}">
        <text x="${left}" y="14" class="rp-chart-title">${esc(title)}</text>
        <text x="${left}" y="27" class="rp-chart-sub">${esc(sub)}</text>
        ${grid}
        <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"/>
        ${marks}
      </svg>`;
  }

  function adsTable(section) {
    if (!section.ads.length) return '<p class="rp-empty">Sin anuncios con entrega en el período.</p>';
    return `
      <table class="rp-table rp-ads">
        <colgroup><col><col style="width:16%"><col style="width:26%"><col style="width:13%"></colgroup>
        <thead><tr><th>Anuncio</th><th class="num">Gasto</th><th class="num">${esc(section.kind.adsLabel)}</th><th class="num">Ver</th></tr></thead>
        <tbody>${section.ads.map((ad, index) => {
          const url = safeUrl(ad.preview);
          return `<tr${index === 0 ? ' class="rp-top"' : ''}><td class="rp-name" title="${esc(ad.name)}">${esc(ad.name)}</td><td class="num">${money(ad.spend)}</td><td class="num">${num(ad.value)}</td><td class="num">${url ? `<a href="${url}" target="_blank" rel="noopener">Ver »</a>` : '—'}</td></tr>`;
        }).join('')}</tbody>
      </table>`;
  }

  // ── Laminas ────────────────────────────────────────────────────────────
  function issuedLabel() {
    const { year, month, day } = limaParts();
    return `${day} ${SHORT_MONTHS[month].toLowerCase()}. ${year}`;
  }

  function coverPage(report) {
    const { period } = report;
    return `
      <section class="rp-page rp-cover">
        <div class="rp-brand"><img src="${LOGO}" alt="Lima Retail"><div><b>Lima Retail</b><span>Data Driven Marketing</span></div></div>
        <div class="rp-cover-body">
          <h1>Reporte de Publicidad</h1>
          <p class="rp-cover-client">Cliente: <b>${BRAND}</b></p>
          <p class="rp-cover-period">${esc(`${period.name} ${period.year}`)} · evolución semanal&nbsp; | &nbsp;${esc(COVER_TAG)}</p>
        </div>
        <footer class="rp-foot">
          <span>${AGENCY_LINE}</span>
          <span class="rp-foot-right"><img src="${LOGO}" alt=""><b>Lima Retail</b>Emitido el ${esc(issuedLabel())}</span>
        </footer>
      </section>`;
  }

  function overviewDesc(sum) {
    const parts = [sum.compras > 0 ? 'Compras' : '', sum.leads > 0 ? 'reservas' : '', sum.messages > 0 ? 'mensajes' : ''].filter(Boolean);
    return parts.length ? `${list(parts)} del mes.`.replace(/^./, char => char.toUpperCase()) : 'Inversión y resultados del mes.';
  }

  function contentsPage(report, total) {
    const items = [
      { title: 'Cómo vamos', desc: overviewDesc(report.sum), icon: 'chart', page: 3 },
      ...report.sections.map((section, index) => ({
        title: section.title,
        desc: section.desc || (section.kind === KINDS.compras ? `${num(section.value)} ${noun(section.kind, section.value)} y mejores anuncios.` : `${section.kind.label} y mejores anuncios.`),
        icon: section.icon,
        page: 4 + index,
      })),
      { title: 'Conclusiones', desc: 'Acciones de la próxima semana.', icon: 'flag', page: 4 + report.sections.length },
    ];
    return `
      <section class="rp-page">
        ${head('Contenido del reporte', 'Qué encontrarás en cada sección de este informe mensual.')}
        <div class="rp-body rp-contents">
          ${items.map((item, index) => `
            <div class="rp-card rp-toc">
              <div class="rp-toc-top"><span class="rp-icon">${icon(item.icon)}</span><span class="rp-toc-num">${pageNumber(index + 1)}</span></div>
              <h3>${esc(item.title)}</h3>
              <p>${esc(item.desc)}</p>
              <span class="rp-toc-page">Página ${pageNumber(item.page)}</span>
            </div>`).join('')}
        </div>
        ${footer(report.labels.source, report, 2, total)}
      </section>`;
  }

  function overviewPage(report, notes, total) {
    const { sum, costs, period, labels } = report;
    const cards = [
      kpi('Inversión', money(sum.spend), period.closed ? 'Total del mes' : 'Acumulado del mes'),
      sum.compras > 0 ? kpi('Compras', num(sum.compras), `Costo/compra ${cost(costs.compras)}`) : '',
      sum.leads > 0 ? kpi('Reservas (leads)', num(sum.leads), `Costo/reserva ${cost(costs.leads)}`) : '',
      sum.messages > 0 ? kpi('Mensajes', num(sum.messages), `Costo/mensaje ${cost(costs.messages)}`) : '',
    ].filter(Boolean);
    const lectura = notes.lectura != null ? notes.lectura : suggestLectura(report);
    return `
      <section class="rp-page">
        ${head('Cómo vamos', `Evolución semanal de ${period.name.toLowerCase()} · reservas y pedidos por WhatsApp.`)}
        <div class="rp-body">
          <div class="rp-grid-4" style="grid-template-columns:repeat(${cards.length},1fr)">${cards.join('')}</div>
          <div class="rp-card rp-chart-card rp-chart-wide">
            <div class="rp-card-row">
              <div>
                <div class="rp-card-title">Conversaciones por semana</div>
                <div class="rp-card-sub">${esc(chartNote(report.messages, KINDS.mensajes))}</div>
              </div>
              <span class="rp-legend"><i style="background:${TEAL}"></i>Conversaciones</span>
            </div>
            ${lineChart(report.messages, { title: 'Conversaciones por semana', sub: `Evolución del mes (${period.from}-${period.to} ${SHORT_MONTHS[period.month - 1].toLowerCase()})`, color: TEAL })}
          </div>
          ${insight('Lectura', 'lectura', lectura)}
        </div>
        ${footer(labels.source, report, 3, total)}
      </section>`;
  }

  function sectionPage(section, report, notes, page, total) {
    const { kind, sum } = section;
    const cards = [kpi('Inversión', money(sum.spend), section.spendNote)];
    if (kind === KINDS.compras) {
      cards.push(kpi('Compras', num(section.value), 'Reservas cerradas'), kpi('Costo/compra', cost(section.cost), 'Coste ÷ compra'), kpi('Conversaciones', num(sum.messages), 'Mensajes de paso'));
    } else if (kind === KINDS.leads) {
      cards.push(kpi('Reservas (leads)', num(section.value), 'Lead web'), kpi('Conversaciones', num(sum.messages), 'Mensajes'), kpi('Costo/lead', cost(section.cost), weak(section) ? 'Muy alto' : 'Coste ÷ lead'));
    } else if (kind === KINDS.mensajes) {
      cards.push(kpi('Conversaciones', num(section.value), section.messagesNote || 'Mensajes de la campaña'), kpi('Costo/mensaje', cost(section.cost), 'Coste ÷ conversación'), kpi('CPM', money2(sum.cpm), 'Costo/mil'));
    } else {
      cards.push(kpi('Resultados', num(section.value), 'Resultado de Meta'), kpi('Costo/result.', cost(section.cost), 'Coste ÷ resultado'), kpi('CPM', money2(sum.cpm), 'Costo/mil'));
    }
    const key = `analisis:${section.key}`;
    const analysis = notes[key] != null ? notes[key] : suggestAnalysis(section);
    const steps = section.chart.map((_, index) => `S${index + 1}`).join(' → ');
    return `
      <section class="rp-page">
        ${head(section.title, section.sub)}
        <div class="rp-body">
          <div class="rp-grid-4">${cards.join('')}</div>
          <div class="rp-split">
            <div class="rp-card rp-chart-card">
              <div class="rp-card-title">Evolución semanal</div>
              <div class="rp-card-sub">${esc(steps)}.</div>
              ${lineChart(section.chart, { title: kind.chart, sub: section.chartSub, color: kind.color })}
            </div>
            <div class="rp-card rp-table-card">
              <div class="rp-card-title">Mejores anuncios</div>
              ${adsTable(section)}
            </div>
          </div>
          ${insight('Análisis', key, analysis)}
        </div>
        ${footer(report.labels.source, report, page, total)}
      </section>`;
  }

  function conclusionsPage(report, notes, page, total) {
    const cards = suggestConclusions(report).map((card, index) => {
      const title = notes[`concl:${index}:title`] != null ? notes[`concl:${index}:title`] : card.title;
      const text = notes[`concl:${index}:text`] != null ? notes[`concl:${index}:text`] : card.text;
      return `
        <div class="rp-card rp-conclusion">
          <div class="rp-toc-top"><span class="rp-icon framed">${icon(card.icon)}</span><span class="rp-concl-num">${pageNumber(index + 1)}</span></div>
          ${editable(`concl:${index}:title`, title, 'h3')}
          ${editable(`concl:${index}:text`, text)}
        </div>`;
    }).join('');
    const { period } = report;
    return `
      <section class="rp-page">
        ${head('Conclusiones y acciones', 'Lo que hacemos la próxima semana.')}
        <div class="rp-body">
          <div class="rp-grid-3 rp-conclusions">${cards}</div>
          ${report.labels.note ? `<div class="rp-note">${rich(report.labels.note)}</div>` : ''}
        </div>
        ${footer(`Fuente: análisis Lima Retail · ${BRAND} · ${period.name.toLowerCase()} ${period.year}`, report, page, total)}
      </section>`;
  }

  function closingPage() {
    return `
      <section class="rp-page rp-closing">
        <img src="${LOGO}" alt="Lima Retail">
        <b>Lima Retail</b>
        <span class="rp-closing-tag">Data Driven Marketing</span>
        <span>Power KPI · Digital Analytics</span>
      </section>`;
  }

  // ── El reporte que se toma como modelo ─────────────────────────────────
  // El ultimo PDF de la carpeta Reportes: se enlaza arriba como referencia. Se lee del listado que Archivo
  // de Reportes guardo de Drive y, si no hay, del catalogo del build.
  function modelReport() {
    let listing = null;
    try {
      const saved = JSON.parse(window.localStorage.getItem(DRIVE_SNAPSHOT_KEY) || 'null');
      if (saved && Array.isArray(saved.files)) listing = saved;
    } catch {
      // Sin snapshot se usa el catalogo publicado.
    }
    if (!listing && window.AMADOR_DRIVE_REPORTS?.files) listing = window.AMADOR_DRIVE_REPORTS;
    const files = (listing?.files || [])
      .filter(file => file.mimeType === 'application/pdf')
      .sort((left, right) => String(right.createdTime || '').localeCompare(String(left.createdTime || '')));
    return files.find(file => /reporte|meta.?ads/i.test(file.title || '')) || files[0] || null;
  }

  // ── Pintado ────────────────────────────────────────────────────────────
  function fitDeck() {
    const host = document.getElementById('week-report');
    if (!host || !host.clientWidth) return;
    host.style.setProperty('--rp-scale', String(Math.min(1, host.clientWidth / PAGE_WIDTH)));
  }

  function wireEditables(host, monthId) {
    host.querySelectorAll('[data-note]').forEach(node => {
      try {
        node.contentEditable = 'plaintext-only';
      } catch {
        node.contentEditable = 'true';
      }
      node.spellcheck = false;
      node.addEventListener('focus', () => { node.textContent = node.dataset.raw; });
      node.addEventListener('input', () => {
        node.dataset.raw = node.innerText.replace(/\n+$/, '');
        saveNote(monthId, node.dataset.note, node.dataset.raw);
      });
      node.addEventListener('blur', () => { node.innerHTML = rich(node.dataset.raw); });
    });
  }

  function render() {
    const host = document.getElementById('week-report');
    if (!host) return;

    const available = months();
    const select = document.getElementById('week-select');
    if (!available.length) {
      if (select) select.innerHTML = '<option value="">Sin meses con datos</option>';
      host.innerHTML = '<div class="panel"><div class="empty-state"><strong>Todavia no hay datos para el reporte</strong><span>El reporte se arma con las descargas de Meta Ads de la carpeta de Drive. En cuanto haya un mes con entregas, aparece aqui.</span></div></div>';
      return;
    }

    if (!available.some(month => month.id === selectedMonth)) selectedMonth = available[0].id;
    const period = available.find(month => month.id === selectedMonth);

    if (select) {
      select.innerHTML = available
        .map(month => `<option value="${esc(month.id)}"${month.id === selectedMonth ? ' selected' : ''}>${esc(month.option)}</option>`).join('');
    }

    const model = modelReport();
    const modelHost = document.getElementById('week-model');
    if (modelHost) {
      modelHost.innerHTML = model
        ? `Modelo: <a href="https://drive.google.com/file/d/${esc(model.id)}/view" target="_blank" rel="noopener">${esc(model.title)}</a>`
        : 'Modelo: el ultimo reporte de la carpeta de Drive (no se pudo leer la carpeta)';
    }

    const report = buildReport(period);
    const notes = readNotes()[period.id] || {};
    const conclusions = 4 + report.sections.length;
    const total = conclusions + 1;
    host.innerHTML = `
      <div class="rp-deck" id="week-doc">
        ${coverPage(report)}
        ${contentsPage(report, total)}
        ${overviewPage(report, notes, total)}
        ${report.sections.map((section, index) => sectionPage(section, report, notes, 4 + index, total)).join('')}
        ${conclusionsPage(report, notes, conclusions, total)}
        ${closingPage()}
      </div>`;

    fitDeck();
    wireEditables(host, period.id);
  }

  // El nombre del PDF lo pone el navegador con el titulo del documento: se cambia solo mientras imprime.
  function printReport() {
    const period = months().find(month => month.id === selectedMonth);
    if (!period) return;
    document.activeElement?.blur?.();
    const title = document.title;
    document.title = `Reporte_${BRAND}_${period.labels.file}`;
    const restore = () => { document.title = title; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    window.print();
    window.setTimeout(restore, 2000);
  }

  function init() {
    render();
    if (wired) return;
    wired = true;
    document.getElementById('week-select')?.addEventListener('change', event => {
      selectedMonth = event.target.value;
      render();
    });
    document.getElementById('week-print')?.addEventListener('click', printReport);
    // Sin dialogo de confirmacion: el boton vuelve directo a los textos propuestos del mes.
    document.getElementById('week-reset')?.addEventListener('click', () => {
      if (!selectedMonth) return;
      resetNotes(selectedMonth);
      render();
    });
    const host = document.getElementById('week-report');
    if (host && typeof window.ResizeObserver === 'function') new window.ResizeObserver(fitDeck).observe(host);
    // El barrido se relee al abrir el tablero y con Actualizar: si los numeros cambian, el reporte se repinta.
    window.addEventListener('amador:data-updated', () => {
      if (document.getElementById('view-week')?.classList.contains('visible')) render();
    });
  }

  window.ReporteSemanal = { init };
})();
