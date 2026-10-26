(function () {
  // Generacion de Reporte: el PDF de publicidad con el diseño del modelo de Amador
  // ("Amador-Reporte-Ads-Semanal-1-25-Octubre-2026"): laminas 16:9 con portada, contenido, resumen por
  // objetivo, desglose semanal, una pagina por campaña, conclusiones y cierre.
  //
  // No hay datos nuevos aqui: sale del mismo barrido de Meta que alimenta Gasto publicitario
  // (window.AmadorObjectives.meta()). El filtro ofrece cortes acumulados: cada domingo cierra una semana
  // y el corte va siempre desde el dia 1 (en octubre de 2026: 1–4, 1–11, 1–18 y 1–25), porque es asi como
  // el cliente lee el mes mientras corre. Dentro del corte, cada pagina lo parte en semanas de lunes a
  // domingo (S1, S2...).
  //
  // La bajada de cada pagina, el destacado, el analisis y las conclusiones vienen propuestos con lo que
  // dicen los numeros; el equipo los reescribe sobre la misma lamina y quedan guardados por corte en este
  // navegador.
  //
  // El template es propio de Amador: cada tablero de marca tiene el suyo, adaptado por la marca.
  const { esc, safeUrl, limaParts, MONTHS, SHORT_MONTHS } = window.AmadorShared;

  const BRAND = 'Amador';
  const NOTES_KEY = 'amador-report-notes-v3';
  const DRIVE_SNAPSHOT_KEY = 'amador-drive-reports-snapshot-v1';
  const METRICS = ['spend', 'impressions', 'reach', 'clicks', 'results', 'messages', 'purchases'];
  const MAX_ADS = 4;
  const PAGE_WIDTH = 1280;
  const LOGO = 'assets/logo-lima-retail.png';
  const AGENCY_LINE = 'Lima Retail · Data Driven Marketing · Power KPI · Digital Analytics';
  const RED = '#c8102e';
  const TEAL = '#14a08c';

  // Lo que mide cada tipo de campaña: compras (Ventas), leads (Clientes potenciales), conversaciones
  // (Interaccion / Mensajes) o, si no es ninguno, el resultado que da Meta.
  const KINDS = {
    compras: { key: 'compras', metric: 'compras', adsMetric: 'compras', label: 'Reservas web', short: 'reservas', one: 'reserva', many: 'reservas', article: 'las', costLabel: 'Costo/reserva', chart: 'Reservas web por semana', column: 'RESERVAS', color: RED, rate: 'cpm' },
    leads: { key: 'leads', metric: 'leads', adsMetric: 'leads', label: 'Clientes potenciales', short: 'leads', one: 'lead', many: 'leads', article: 'los', costLabel: 'Costo/lead', chart: 'Clientes potenciales por semana', column: 'LEADS', color: TEAL, rate: 'ctr' },
    mensajes: { key: 'mensajes', metric: 'messages', adsMetric: 'messages', label: 'Conversaciones', short: 'conversaciones', one: 'conversación', many: 'conversaciones', article: 'las', costLabel: 'Costo/conversación', chart: 'Conversaciones por semana', column: 'CONVERS.', color: TEAL, rate: 'ctr' },
    resultados: { key: 'resultados', metric: 'results', adsMetric: 'results', label: 'Resultados', short: 'resultados', one: 'resultado', many: 'resultados', article: 'los', costLabel: 'Costo/result.', chart: 'Resultados por semana', column: 'RESULT.', color: TEAL, rate: 'cpm' },
  };

  // Las campañas del modelo, con su nombre y su bajada corta (la que va bajo el nombre en el resumen).
  // Una campaña nueva arma su pagina con su propio nombre.
  const CAMPAIGNS = [
    { key: 'almuerzos', match: /almuerzo|reservas web/, title: 'Reservas web almuerzos', short: 'Reservas web', tag: 'Ventas · almuerzos', desc: 'Evolución, conjuntos y mejores anuncios.', icon: 'trend' },
    { key: 'corporativos', match: /corporativ/, title: 'Corporativos', short: 'Corporativos', tag: 'Clientes potenciales', desc: 'Clientes potenciales y mejores anuncios.', icon: 'briefcase' },
    { key: 'eventos', match: /evento/, title: 'Mensajes IG · eventos', short: 'Eventos', tag: 'Ofrenda · WhatsApp', desc: 'Conversaciones, formatos y conjuntos.', icon: 'chat' },
  ];

  // El formato de la pieza sale de su nombre, que es lo unico que trae la descarga de Meta. El orden
  // importa: "Flyer animado" es animado antes que flyer, y "Flyer estatico" es estatico antes que flyer.
  const FORMATOS = [
    { match: /animad/, label: 'Flyer animado' },
    { match: /carrusel/, label: 'Carrusel' },
    { match: /est[aá]tic|flyer|imagen|foto/, label: 'Estático' },
    { match: /video|reel|claqueta|narraci|spot/, label: 'Video' },
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
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    pulse: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.target}</svg>`;

  let selectedPeriod = '';
  let wired = false;

  const normalize = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

  // ── Formatos del modelo ("S/ 3,453", "S/ 9.08", "382") ───────────────────
  const integer = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });
  const finite = value => value != null && Number.isFinite(Number(value));
  const num = value => (finite(value) ? integer.format(Math.round(value)) : '—');
  const money = value => (finite(value) ? `S/ ${integer.format(Math.round(value))}` : '—');
  const money2 = value => (finite(value) ? `S/ ${Number(value).toFixed(2)}` : '—');
  // Un costo de S/ 100 o mas va redondeado (S/ 147); debajo, con centimos (S/ 9.08).
  const cost = value => (finite(value) && value > 0 ? (value >= 100 ? money(value) : money2(value)) : '—');
  const percent = value => (finite(value) ? `${Number(value).toFixed(2)}%` : '—');
  const compact = value => (value >= 1000 ? `${(value / 1000).toFixed(1)}k` : integer.format(Math.round(value)));
  const pageNumber = value => String(value).padStart(2, '0');
  const list = items => (items.length > 1 ? `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}` : items[0] || '');
  const noun = (kind, value) => (Math.round(value) === 1 ? kind.one : kind.many);
  const quoted = ads => list(ads.map(ad => `"${ad.name}"`));
  const shortMonth = month => SHORT_MONTHS[month - 1].toLowerCase();

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
    const sum = { spend: 0, impressions: 0, reach: 0, clicks: 0, results: 0, messages: 0, compras: 0, leads: 0 };
    rows.forEach(row => { Object.keys(sum).forEach(field => { sum[field] += row[field] || 0; }); });
    sum.spend = Math.round(sum.spend * 100) / 100;
    sum.cpm = sum.impressions > 0 ? (sum.spend / sum.impressions) * 1000 : null;
    sum.ctr = sum.impressions > 0 ? (sum.clicks / sum.impressions) * 100 : null;
    return sum;
  }

  // ── Cortes del selector ────────────────────────────────────────────────
  // Un corte por domingo, siempre desde el primer dia con datos del mes, y el ultimo dia si no cae en
  // domingo. Es la regla del reporte: el cliente lee el mes acumulado, no la semana suelta.
  function cutsOf(year, month, from, last) {
    const cuts = [];
    for (let day = from; day <= last; day += 1) {
      if (new Date(year, month - 1, day).getDay() === 0) cuts.push(day);
    }
    if (!cuts.length || cuts[cuts.length - 1] !== last) cuts.push(last);
    return cuts;
  }

  function periods() {
    const byMonth = new Map();
    sweepRows().forEach(row => {
      const key = row.day.slice(0, 7);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push(row);
    });
    const keys = [...byMonth.keys()].filter(key => byMonth.get(key).some(activity)).sort().reverse();
    return keys.flatMap((key, index) => {
      const monthRows = byMonth.get(key);
      const [year, month] = key.split('-').map(Number);
      const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const activeDays = monthRows.filter(activity).map(row => row.d);
      const lastDay = Math.max(...activeDays);
      // Un mes anterior al ultimo con datos ya termino aunque su descarga no llegue al ultimo dia.
      const closed = index > 0 || lastDay === days;
      const first = Math.min(...activeDays) > 1 && index === keys.length - 1 ? Math.min(...activeDays) : 1;
      const name = MONTHS[month - 1];
      return cutsOf(year, month, first, closed ? days : lastDay)
        .map(to => cutPeriod({ key, year, month, name, days, closed, rows: monthRows }, first, to))
        .filter(Boolean)
        .reverse();
    });
  }

  function cutPeriod(month, from, to) {
    const rows = month.rows.filter(row => row.d >= from && row.d <= to);
    if (!rows.some(activity)) return null;
    const tag = shortMonth(month.month);
    const range = `${from} – ${to} ${tag}`;
    const whole = month.closed && to === month.days;
    return {
      id: `${month.key}:${to}`,
      year: month.year,
      month: month.month,
      name: month.name,
      days: month.days,
      closed: month.closed,
      from,
      to,
      rows,
      option: `${from}–${to} ${tag}${whole ? ' · mes completo' : ''}`,
      group: `${month.name} ${month.year}`,
      labels: {
        cover: `${month.name} ${month.year} · Evolución semanal (${from} - ${to} ${tag})  |  Meta Ads`,
        weeks: `Semanas · ${range} ${month.year}`,
        source: `Fuente: Meta Ads · ${range} ${month.year}`,
        sourceWeeks: `Fuente: Meta Ads · ${range} ${month.year} · semanas de lunes a domingo`,
        footer: `${BRAND} · Reporte Meta Ads · ${month.name} ${month.year} semanal`,
        conclusionsSource: `Fuente: análisis Lima Retail sobre Meta Ads · ${BRAND} · ${month.name.toLowerCase()} ${month.year}`,
        range,
        note: whole ? '' : `Evolución semanal: semanas de lunes a domingo; S1 corresponde al ${from} - ${firstSunday(month, from, to)} ${tag}.`,
        file: `${BRAND}-Reporte-Ads-Semanal-${from}-${to}-${month.name}-${month.year}`,
      },
    };
  }

  function firstSunday(month, from, to) {
    for (let day = from; day <= to; day += 1) {
      if (new Date(month.year, month.month - 1, day).getDay() === 0) return day;
    }
    return to;
  }

  // ── Semanas de lunes a domingo dentro del corte ────────────────────────
  function weeksOf(period) {
    const firstWeekday = (new Date(Date.UTC(period.year, period.month - 1, 1)).getUTCDay() + 6) % 7;
    const weekOf = day => Math.floor((day - 1 + firstWeekday) / 7);
    const base = weekOf(period.from);
    const count = weekOf(period.to) - base + 1;
    const spans = [];
    for (let index = 0; index < count; index += 1) {
      const start = Math.max(period.from, index === 0 ? period.from : 1 + (base + index) * 7 - firstWeekday);
      const end = Math.min(period.to, (base + index + 1) * 7 - firstWeekday);
      spans.push({ index, from: start, to: end, days: end - start + 1, label: `S${index + 1}`, range: `${start} – ${end}` });
    }
    return { count, index: day => weekOf(day) - base, spans };
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
    return { key: normalize(title), title, short: title, tag: '', desc: 'Evolución y mejores anuncios.', icon: 'target' };
  }

  function kindOf(sum) {
    if (sum.compras > 0) return KINDS.compras;
    if (sum.leads > 0) return KINDS.leads;
    if (sum.messages > 0) return KINDS.mensajes;
    return KINDS.resultados;
  }

  const formatoDe = name => (FORMATOS.find(item => item.match.test(normalize(name))) || { label: 'Pieza' }).label;

  // Mejores anuncios por el resultado de la campaña. Un anuncio es su nombre: si corre en varios conjuntos se
  // junta y se queda con el conjunto donde mas gasto; si Meta dejo vacia su vista previa se usa la de la misma
  // pieza en otro mes.
  function bestAds(rows, field, previews) {
    const byName = new Map();
    rows.forEach(row => {
      const key = normalize(row.ad);
      if (!byName.has(key)) byName.set(key, { name: row.ad, spend: 0, value: 0, messages: 0, preview: '', sets: new Map(), days: [] });
      const ad = byName.get(key);
      ad.spend += row.spend;
      ad.value += row[field] || 0;
      ad.messages += row.messages || 0;
      if (row.adSet) ad.sets.set(row.adSet, (ad.sets.get(row.adSet) || 0) + row.spend);
      if (activity(row)) ad.days.push(row.d);
      if (!ad.preview && /^https:\/\//.test(row.preview || '')) ad.preview = row.preview;
    });
    return [...byName.entries()]
      .map(([key, ad]) => ({
        ...ad,
        preview: ad.preview || previews.get(key) || '',
        // «Conjunto Corporativos - PF» se lee como «Corporativos - PF»: la palabra la pone Meta.
        adSet: ([...ad.sets.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || '').replace(/^conjunto\s+/i, ''),
        formato: formatoDe(ad.name),
        from: ad.days.length ? Math.min(...ad.days) : null,
        cost: ad.value > 0 ? ad.spend / ad.value : null,
      }))
      .filter(ad => ad.spend > 0 || ad.value > 0)
      .sort((left, right) => right.value - left.value || right.spend - left.spend)
      .slice(0, MAX_ADS);
  }

  // La causa de cada semana, que es la columna que explica el cuadro sin hacer leer los numeros.
  // «index» es la posicion dentro de las semanas que la campaña corrio; «week.index», la del mes.
  function weekCause(week, index, weeks, section) {
    if (index === 0 && week.days < 7) return `${week.days} días`;
    if (index === 0 && week.index === 0 && weeks.length > 1) return 'Inicio de mes';
    if (index === 0 && week.index > 0) return 'Inicio';
    const costs = weeks.map(item => item.cost).filter(finite);
    if (costs.length > 1 && finite(week.cost)) {
      if (week.cost === Math.max(...costs)) return 'Mayor costo';
      if (week.cost === Math.min(...costs)) return 'Menor costo';
    }
    const before = weeks[index - 1];
    if (before && finite(week.cost) && finite(before.cost) && Math.abs(week.cost - before.cost) <= before.cost * 0.1) return 'Se mantiene';
    if (week.value === 0 && week.spend > 0) return `Sin ${section.kind.many}`;
    return '';
  }

  function buildReport(period) {
    const weeks = weeksOf(period);
    const previews = new Map();
    sweepRows().sort((left, right) => right.day.localeCompare(left.day)).forEach(row => {
      const key = normalize(row.ad);
      if (!previews.has(key) && /^https:\/\//.test(row.preview || '')) previews.set(key, row.preview);
    });
    const groups = new Map();
    period.rows.forEach(row => {
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
        const spendWeeks = series(items, 'spend', weeks);
        const firstWeek = spendWeeks.findIndex(spend => spend > 0);
        const section = {
          ...campaign,
          kind,
          sum,
          value,
          cost: value > 0 ? sum.spend / value : null,
          costMessage: sum.messages > 0 ? sum.spend / sum.messages : null,
          chart: series(items, kind.metric, weeks),
          firstWeek,
          lastWeek: spendWeeks.map(spend => spend > 0).lastIndexOf(true),
          ads: bestAds(items, kind.adsMetric, previews),
          days: new Set(items.filter(activity).map(row => row.d)).size,
          firstDay: Math.min(...items.filter(activity).map(row => row.d)),
        };
        const rowsOfWeek = weeks.spans.map(span => {
          const inside = items.filter(row => row.d >= span.from && row.d <= span.to);
          const weekSum = totals(inside);
          const weekValue = weekSum[kind.metric];
          return { ...span, spend: weekSum.spend, value: weekValue, cost: weekValue > 0 ? weekSum.spend / weekValue : null, cpm: weekSum.cpm, ctr: weekSum.ctr, messages: weekSum.messages };
        }).filter(week => week.spend > 0 || week.value > 0);
        section.weeks = rowsOfWeek.map((week, index) => ({ ...week, cause: weekCause(week, index, rowsOfWeek, section) }));
        return section;
      })
      .filter(section => section.sum.spend > 0 || section.sum.impressions > 0)
      .sort((left, right) => order(left.key) - order(right.key) || right.sum.spend - left.sum.spend);

    const sum = totals(period.rows);
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
      // El desglose semanal del mes entero: inversion de la semana y, por campaña, su resultado.
      breakdown: weekBreakdown(weeks, sections, period),
    };
  }

  function weekBreakdown(weeks, sections, period) {
    const rows = weeks.spans.map(span => {
      const inside = period.rows.filter(row => row.d >= span.from && row.d <= span.to);
      return {
        ...span,
        spend: totals(inside).spend,
        cells: sections.map(section => {
          const week = section.weeks.find(item => item.index === span.index);
          return { section, value: week ? week.value : 0, cost: week ? week.cost : null, active: Boolean(week) };
        }),
      };
    }).filter(week => week.spend > 0);
    const peak = Math.max(...rows.map(week => week.spend), 0);
    return rows.map((week, index) => ({ ...week, note: weekNote(week, index, rows, sections, peak) }));
  }

  // La nota de la semana: lo que la distingue de las demas, que es lo que el modelo escribe a mano.
  function weekNote(week, index, rows, sections, peak) {
    const starts = sections.filter(section => section.firstWeek === week.index && week.index > 0);
    if (week.spend === peak && rows.length > 1) {
      return starts.length ? `Pico · ${starts.map(section => section.short.toLowerCase()).join(' y ')}` : 'Pico del mes';
    }
    if (starts.length) return `Entra ${list(starts.map(section => section.short.toLowerCase()))}`;
    if (index === 0) return week.days < 7 ? 'Inicio de mes' : 'Base';
    // Una campaña que multiplica su resultado contra la semana anterior manda la nota.
    const jump = week.cells
      .map(cell => {
        const before = rows[index - 1].cells.find(item => item.section === cell.section);
        const grew = before && before.value > 0 && cell.value >= before.value * 2;
        return grew ? `${cell.section.short} x${Math.round(cell.value / before.value)}` : '';
      })
      .filter(Boolean)[0];
    return jump || '';
  }

  // ── Textos propuestos (el equipo los reescribe sobre la lamina) ─────────
  // "de 1 a 5 por semana" cuando la serie arranca y termina en valores distintos: es la insignia del
  // indicador en el modelo.
  function badgeOf(section) {
    const values = section.chart.filter((_, index) => index >= section.firstWeek);
    if (values.length < 2) return '';
    const first = values[0];
    const last = values[values.length - 1];
    if (!first || first === last) return '';
    return `${num(first)} → ${num(last)} por semana`;
  }

  // La semana base del costo es la primera completa: una S1 de cuatro días no es comparable con una de
  // siete y exagera la caída.
  function baseWeek(weeks) {
    return weeks.find(week => week.days >= 7 && finite(week.cost)) || weeks.find(week => finite(week.cost));
  }

  function costBadge(section) {
    const costs = section.weeks.filter(week => finite(week.cost));
    if (costs.length < 2) return '';
    const first = baseWeek(costs);
    const last = costs[costs.length - 1];
    if (!first || first === last || first.cost === last.cost) return '';
    const change = Math.round(((last.cost - first.cost) / first.cost) * 100);
    return `${change > 0 ? '+' : ''}${change}% ${first.label} vs ${last.label}`;
  }

  function trendWord(values) {
    if (values.length < 2) return '';
    const first = values[0];
    const last = values[values.length - 1];
    if (last > first * 1.5 && last - first >= 3) return 'Fuerte crecimiento';
    if (last > first) return 'Crecimiento';
    if (last < first) return 'Baja';
    return 'Estable';
  }

  // Una campaña rinde poco cuando gasta S/ 200 o mas y trae dos resultados o menos de lo que mide.
  const weak = section => section.kind !== KINDS.mensajes && section.sum.spend >= 200 && section.value <= 2;

  // El destacado del resumen: la campaña que trae mas conversaciones ademas de su objetivo propio, que es
  // el dato que no se ve en el cuadro.
  function suggestResumenDestacado(report) {
    const extra = report.sections
      .filter(section => section.kind !== KINDS.mensajes && section.sum.messages > 0)
      .sort((left, right) => right.sum.messages - left.sum.messages)[0];
    if (!extra) {
      const best = [...report.sections].sort((left, right) => right.sum.messages - left.sum.messages)[0];
      return best ? `${best.title} concentra ${num(best.sum.messages)} conversaciones de WhatsApp a ${cost(best.costMessage)} cada una.` : '';
    }
    const top = [...report.sections].sort((left, right) => right.sum.messages - left.sum.messages)[0];
    const head = `${extra.title} generó ${num(extra.sum.messages)} conversaciones de WhatsApp a ${cost(extra.costMessage)} además de sus ${num(extra.value)} ${noun(extra.kind, extra.value)}`;
    // Solo se dice «la que más contactos trae» cuando de verdad lo es: si otra campaña trae más, se nombra.
    if (top === extra) {
      const second = report.sections.filter(section => section !== extra).sort((left, right) => right.sum.messages - left.sum.messages)[0];
      return `${head}: es la campaña que más contactos trae${second && second.sum.messages > 0 ? `, por encima de ${second.short.toLowerCase()} (${num(second.sum.messages)})` : ''}.`;
    }
    return `${head}, además de las ${num(top.sum.messages)} de ${top.short.toLowerCase()}, que es la campaña de mensajes.`;
  }

  function suggestResumenAnalisis(report) {
    const parts = report.sections.filter(section => section.value > 0).map(section => {
      const costs = section.weeks.filter(week => finite(week.cost));
      const first = costs[0];
      const last = costs[costs.length - 1];
      const move = first && last && first.cost !== last.cost ? ` (${cost(first.cost)} → ${cost(last.cost)})` : '';
      const series = section.chart.filter((_, index) => index >= section.firstWeek);
      const growth = series.length > 1 && series[0] !== series[series.length - 1]
        ? `pasó de ${num(series[0])} a ${num(series[series.length - 1])} ${section.kind.many} por semana`
        : `sumó ${num(section.value)} ${noun(section.kind, section.value)}`;
      return `${section.short} ${growth}${move}${section.kind !== KINDS.mensajes && section.sum.messages > 0 ? ` y además trajo ${num(section.sum.messages)} conversaciones` : ''}`;
    });
    if (!parts.length) return 'Sin resultados en el período.';
    const better = report.sections.filter(section => {
      const costs = section.weeks.filter(week => finite(week.cost));
      return costs.length > 1 && costs[costs.length - 1].cost < costs[0].cost;
    }).length;
    const head = better === report.sections.filter(section => section.value > 0).length && better > 1
      ? 'Todo mejoró su costo con el mes, sin subir la inversión: '
      : '';
    return `${head}${list(parts)}.`;
  }

  function suggestBreakdownDestacado(report) {
    const best = [...report.breakdown].sort((left, right) => right.spend - left.spend)[0];
    if (!best) return '';
    const hits = best.cells.filter(cell => cell.value > 0).map(cell => cell.section.short.toLowerCase());
    return `La ${best.label} fue la semana más fuerte: ${money(best.spend)} de inversión${hits.length ? ` y resultados en ${list(hits)}` : ''}, con el mejor ritmo del mes.`;
  }

  function suggestBreakdownAnalisis(report) {
    const parts = report.sections.filter(section => section.value > 0).map(section => {
      const serie = section.chart.filter((_, index) => index >= section.firstWeek);
      if (serie.length < 2) return `${section.short} sumó ${num(section.value)} ${noun(section.kind, section.value)} en la S${section.firstWeek + 1}`;
      const word = { 'Fuerte crecimiento': 'crecen con fuerza', Crecimiento: 'crecen', Baja: 'bajan', Estable: 'se mantienen' }[trendWord(serie)];
      return `${section.short} ${word} (${serie.map(num).join(' → ')} por semana)`;
    });
    return `${list(parts)}. Las páginas siguientes detallan cada campaña.`;
  }

  function suggestSectionDestacado(section) {
    const winners = section.ads.filter(ad => ad.value > 0);
    const empty = section.ads.filter(ad => ad.value === 0 && ad.spend > 0);
    if (!winners.length) return `Ningún anuncio trajo ${section.kind.many} en el período: ${money(section.sum.spend)} invertidos sin resultado.`;
    const top = winners[0];
    const sets = new Set(winners.map(ad => ad.adSet).filter(Boolean));
    const head = sets.size === 1
      ? `El conjunto ${[...sets][0]} generó ${num(section.value)} ${noun(section.kind, section.value)}`
      : `"${top.name}" es el que más ${section.kind.many} trae (${num(top.value)} a ${cost(top.cost)})`;
    return `${head}${empty.length ? `; ${quoted(empty.slice(0, 1))} gastó ${money(empty[0].spend)} sin ${section.kind.many}` : ''}.`;
  }

  function suggestSectionAnalisis(section) {
    const costs = section.weeks.filter(week => finite(week.cost));
    const first = costs[0];
    const last = costs[costs.length - 1];
    let what;
    if (weak(section)) {
      what = `la campaña gastó ${money(section.sum.spend)} y generó solo ${num(section.value)} ${noun(section.kind, section.value)}.`;
    } else if (first && last && first !== last) {
      const change = Math.round(((last.cost - first.cost) / first.cost) * 100);
      what = `con una inversión semanal parecida, ${section.kind.article} ${section.kind.many} pasaron de ${num(first.value)} a ${num(last.value)} y el costo ${change < 0 ? 'bajó' : 'subió'} ${change}% (${cost(first.cost)} → ${cost(last.cost)}).`;
    } else {
      what = `${num(section.value)} ${noun(section.kind, section.value)} con ${money(section.sum.spend)} de inversión.`;
    }
    const cheapest = section.ads.filter(ad => finite(ad.cost)).sort((left, right) => left.cost - right.cost)[0];
    const next = cheapest
      ? `escalar "${cheapest.name}" (${cost(cheapest.cost)}, el más barato).`
      : 'revisar público y creativos antes de seguir invirtiendo.';
    return `**Qué pasó:** ${what} **Acción:** ${next}`;
  }

  function suggestConclusions(report) {
    const cards = [];
    const main = [...report.sections].filter(section => section.value > 0 && !weak(section))
      .sort((left, right) => right.sum.spend - left.sum.spend)[0];
    if (main) {
      const serie = main.chart.filter((_, index) => index >= main.firstWeek);
      cards.push({
        icon: main.icon,
        title: `${main.short}: ${serie.length > 1 && serie[serie.length - 1] > serie[0] ? 'más con la misma inversión' : 'el motor del mes'}`,
        text: `${num(main.value)} ${noun(main.kind, main.value)} a ${cost(main.cost)} c/u con ${money(main.sum.spend)}. Sostener la inversión y replicar los anuncios que convierten.`,
      });
    }
    report.sections.filter(section => section !== main && section.value > 0).forEach(section => {
      if (cards.length >= 3) return;
      const serie = section.chart.filter((_, index) => index >= section.firstWeek);
      const growth = serie.length > 1 && serie[0] > 0 && serie[serie.length - 1] >= serie[0] * 2;
      cards.push({
        icon: section.icon,
        title: growth ? `${section.short} en crecimiento` : `Sostener ${section.short.toLowerCase()}`,
        text: `${num(section.value)} ${noun(section.kind, section.value)} a ${cost(section.cost)} c/u${section.sum.messages > 0 && section.kind !== KINDS.mensajes ? ` y ${num(section.sum.messages)} conversaciones` : ''}. Mantener el contenido que engancha para sostener el volumen.`,
      });
    });
    const poor = report.sections.find(weak);
    if (poor && cards.length < 3 && !cards.some(card => card.title.toLowerCase().includes(poor.short.toLowerCase()))) {
      cards.push({
        icon: 'chat',
        title: `Revisar ${poor.short.toLowerCase()}`,
        text: `La campaña ${poor.title} gastó ${money(poor.sum.spend)} por ${num(poor.value)} ${noun(poor.kind, poor.value)}. Revisar público y creativos, o mover ese presupuesto a las campañas que sí rinden.`,
      });
    }
    return cards.slice(0, 3);
  }

  // ── Textos guardados por corte ─────────────────────────────────────────
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

  function saveNote(periodId, key, value) {
    const notes = readNotes();
    notes[periodId] = { ...(notes[periodId] || {}), [key]: value };
    writeNotes(notes);
  }

  function resetNotes(periodId) {
    const notes = readNotes();
    delete notes[periodId];
    writeNotes(notes);
  }

  // **texto** va en negrita, como "Que paso:" en el modelo.
  const rich = text => esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

  // Texto editable sobre la lamina: al hacer clic se ve el texto con sus ** y al salir vuelve a negrita.
  const editable = (key, text, tag = 'p') => `<${tag} class="rp-edit" data-note="${esc(key)}" data-raw="${esc(text)}" title="Clic para editar · **texto** va en negrita">${rich(text)}</${tag}>`;

  // ── Piezas de las laminas ──────────────────────────────────────────────
  const kpi = (label, value, foot, badge) => `
    <div class="rp-card rp-kpi">
      <span class="rp-kpi-label">${esc(label)}${badge ? `<i class="rp-badge">${esc(badge)}</i>` : ''}</span>
      <strong>${value}</strong>
      <span class="rp-delta muted">${esc(foot)}</span>
    </div>`;

  const head = (title, sub, right) => `
    <header class="rp-head">
      <div><h2>${esc(title)}</h2><p>${esc(sub)}</p></div>
      ${right ? `<span class="rp-head-tag">${esc(right)}</span>` : ''}
    </header>`;

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
        <span class="rp-insight-label">${esc(label)}</span>
        ${editable(key, text)}
      </div>
    </div>`;

  // Destacado y analisis uno al lado del otro, como en el modelo.
  const duo = (destacadoKey, destacado, analisisKey, analisis) => `
    <div class="rp-duo">
      ${insight('DESTACADO', destacadoKey, destacado)}
      ${insight('Análisis', analisisKey, analisis)}
    </div>`;

  // El tope del eje se redondea a 3, 6, 15, 30… para que las tres marcas salgan enteras: un eje que
  // termina en 7 sobre una serie que llega a 5 se lee mal.
  function niceMax(value) {
    // Con series de una o dos unidades el eje se queda en 3: tres marcas enteras y no 0 / 0 / 1 / 1.
    const top = Math.max(value, 3);
    const step = Math.pow(10, Math.floor(Math.log10(top / 3)));
    return Math.ceil(top / (3 * step)) * 3 * step;
  }

  // Barras por semana con el valor encima, que es como el modelo muestra la evolucion.
  function barChart(values, { title, sub, color, labels }) {
    const top = 42;
    const bottom = 170;
    const left = 44;
    const right = 600;
    const max = niceMax(Math.max(...values, 0) * 1.25 || 1);
    const y = value => bottom - (value / max) * (bottom - top);
    const step = (right - left) / Math.max(values.length, 1);
    const width = Math.min(58, step * 0.52);
    const x = index => left + step * index + step / 2;
    const grid = [0, 1 / 3, 2 / 3, 1].map(part => {
      const value = max * part;
      return `<line x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}" class="rp-grid"/><text x="${left - 6}" y="${y(value) + 3}" text-anchor="end" class="rp-tick">${part ? compact(value) : 0}</text>`;
    }).join('');
    const bars = values.map((value, index) => `
      <rect x="${x(index) - width / 2}" y="${y(value)}" width="${width}" height="${Math.max(bottom - y(value), 1)}" rx="3" fill="${color}"/>
      <text x="${x(index)}" y="${y(value) - 7}" text-anchor="middle" class="rp-point" fill="${color}">${compact(value)}</text>
      <text x="${x(index)}" y="${bottom + 15}" text-anchor="middle" class="rp-axis">${esc(labels[index] || `S${index + 1}`)}</text>`).join('');
    return `
      <svg class="rp-chart" viewBox="0 0 620 192" preserveAspectRatio="xMidYMin meet" role="img" aria-label="${esc(title)}: ${values.map(num).join(', ')}">
        <text x="${left}" y="14" class="rp-chart-title">${esc(title)}</text>
        <text x="${left}" y="27" class="rp-chart-sub">${esc(sub)}</text>
        ${grid}
        ${bars}
      </svg>`;
  }

  // Mejores anuncios: una tarjeta por pieza con su formato arriba, el conjunto bajo el nombre y sus cifras.
  function adCards(section, period) {
    if (!section.ads.length) return '<p class="rp-empty">Sin anuncios con entrega en el período.</p>';
    return `
      <div class="rp-ad-cards">
        ${section.ads.map(ad => {
          const url = safeUrl(ad.preview);
          // Solo las piezas que entraron despues del arranque de su campaña llevan la fecha.
          const desde = ad.from && ad.from > section.firstDay ? ` · desde ${ad.from} ${shortMonth(period.month)}` : '';
          return `
            <div class="rp-ad-card">
              <div class="rp-ad-art is-empty">${esc(ad.formato)}</div>
              <div class="rp-ad-name">${esc(ad.name)}</div>
              <div class="rp-ad-meta">${esc(ad.adSet || '—')}${esc(desde)}</div>
              <dl class="rp-ad-figures">
                <div><dt>Inversión</dt><dd>${money(ad.spend)}</dd></div>
                <div><dt>Result.</dt><dd>${num(ad.value)}</dd></div>
                <div><dt>Costo</dt><dd>${ad.value > 0 ? cost(ad.cost) : `Sin ${section.kind.many}`}</dd></div>
              </dl>
              ${url ? `<a class="rp-ad-link" href="${url}" target="_blank" rel="noopener">Ver anuncio »</a>` : ''}
            </div>`;
        }).join('')}
      </div>`;
  }

  function weeksTable(section) {
    const rate = section.kind.rate;
    return `
      <table class="rp-table rp-weeks">
        <thead><tr><th>Semana</th><th class="num">Inversión</th><th class="num">${esc(section.kind.column)}</th><th class="num">Costo</th><th class="num">${rate === 'ctr' ? 'CTR' : 'CPM'}</th><th>Causa</th></tr></thead>
        <tbody>${section.weeks.map(week => `
          <tr>
            <td class="rp-name">${esc(`${week.label} · ${week.range}`)}</td>
            <td class="num">${money(week.spend)}</td>
            <td class="num">${num(week.value)}</td>
            <td class="num">${cost(week.cost)}</td>
            <td class="num">${rate === 'ctr' ? percent(week.ctr) : money2(week.cpm)}</td>
            <td class="rp-cause">${esc(week.cause)}</td>
          </tr>`).join('')}</tbody>
      </table>`;
  }

  // ── Laminas ────────────────────────────────────────────────────────────
  function issuedLabel() {
    const { year, month, day } = limaParts();
    return `${day} ${SHORT_MONTHS[month].toLowerCase()}. ${year}`;
  }

  function coverPage(report) {
    return `
      <section class="rp-page rp-cover">
        <div class="rp-brand"><img src="${LOGO}" alt="Lima Retail"><div><b>Lima Retail</b><span>Data Driven Marketing</span></div></div>
        <div class="rp-cover-body">
          <h1>Reporte de Publicidad</h1>
          <p class="rp-cover-client">Cliente: <b>${BRAND}</b></p>
          <p class="rp-cover-period">${esc(report.labels.cover)}</p>
        </div>
        <footer class="rp-foot">
          <span>${AGENCY_LINE}</span>
          <span class="rp-foot-right"><img src="${LOGO}" alt=""><b>Lima Retail</b>Emitido el ${esc(issuedLabel())}</span>
        </footer>
      </section>`;
  }

  function contentsPage(report, total) {
    const items = [
      { title: 'Resumen por objetivo', desc: 'Resultado, costo y conversaciones de cada campaña.', icon: 'chart', page: 3 },
      { title: 'Desglose semanal', desc: `${list(report.sections.map(section => section.short))}, semana por semana.`, icon: 'calendar', page: 4 },
      ...report.sections.map((section, index) => ({ title: section.title, desc: section.desc, icon: section.icon, page: 5 + index })),
      { title: 'Conclusiones', desc: 'Qué funciona y próximos pasos.', icon: 'flag', page: 5 + report.sections.length },
    ];
    return `
      <section class="rp-page">
        ${head('Contenido del reporte', 'Qué encontrarás en cada sección de este informe.')}
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

  // Pagina 03: el cuadro con una fila por campaña, que es el corazon del modelo.
  function resumenPage(report, notes, total) {
    const { sum, costs, sections, labels } = report;
    const compras = sections.find(section => section.kind === KINDS.compras);
    const leads = sections.find(section => section.kind === KINDS.leads);
    const cards = [
      kpi('Inversión total', money(sum.spend), `${num(sections.length)} ${sections.length === 1 ? 'campaña' : 'campañas'} · ${labels.range}`),
      compras ? kpi(KINDS.compras.label, num(sum.compras), `${cost(costs.compras)} c/u`, badgeOf(compras)) : '',
      leads ? kpi(KINDS.leads.label, num(sum.leads), `${cost(costs.leads)} c/u`, badgeOf(leads)) : '',
      sum.messages > 0 ? kpi('Conversaciones', num(sum.messages), 'WhatsApp · todas las campañas') : '',
    ].filter(Boolean);
    const destacado = notes['resumen:destacado'] != null ? notes['resumen:destacado'] : suggestResumenDestacado(report);
    const analisis = notes['resumen:analisis'] != null ? notes['resumen:analisis'] : suggestResumenAnalisis(report);
    return `
      <section class="rp-page">
        ${head('Resumen por objetivo', 'Cómo vamos en cada campaña: resultado, costo por resultado y conversaciones de WhatsApp.', labels.weeks)}
        <div class="rp-body">
          <div class="rp-grid-kpis">${cards.join('')}</div>
          <div class="rp-card rp-table-card rp-grow">
            <table class="rp-table rp-resumen">
              <thead><tr><th>Campaña</th><th class="num">Inversión</th><th class="num">Resultado</th><th class="num">Costo/resultado</th><th class="num">Conversaciones</th><th class="num">Costo/conversación</th></tr></thead>
              <tbody>
                ${sections.map(section => `
                  <tr>
                    <td class="rp-name"><b>${esc(section.title)}</b>${section.tag ? `<span class="rp-sub">${esc(section.tag)}</span>` : ''}</td>
                    <td class="num">${money(section.sum.spend)}</td>
                    <td class="num">${num(section.value)} ${esc(noun(section.kind, section.value))}</td>
                    <td class="num">${cost(section.cost)}</td>
                    <td class="num">${num(section.sum.messages)}</td>
                    <td class="num">${cost(section.costMessage)}</td>
                  </tr>`).join('')}
                <tr class="rp-total">
                  <td class="rp-name">Total · ${esc(`${sections.length} ${sections.length === 1 ? 'campaña' : 'campañas'}`)}</td>
                  <td class="num">${money(sum.spend)}</td>
                  <td class="num">—</td>
                  <td class="num">—</td>
                  <td class="num">${num(sum.messages)}</td>
                  <td class="num">—</td>
                </tr>
              </tbody>
            </table>
            <p class="rp-table-foot">Las conversaciones de WhatsApp de las campañas con otro objetivo son adicionales a ese objetivo; se atribuye toda la inversión de la campaña para estimar el costo por conversación. En las campañas de mensajes, las conversaciones son el objetivo.</p>
          </div>
          ${duo('resumen:destacado', destacado, 'resumen:analisis', analisis)}
        </div>
        ${footer(labels.sourceWeeks, report, 3, total)}
      </section>`;
  }

  // Pagina 04: la semana en la que ocurrio cada resultado, sin acumular.
  function breakdownPage(report, notes, total) {
    const { breakdown, sections, sum, labels } = report;
    const destacado = notes['semanal:destacado'] != null ? notes['semanal:destacado'] : suggestBreakdownDestacado(report);
    const analisis = notes['semanal:analisis'] != null ? notes['semanal:analisis'] : suggestBreakdownAnalisis(report);
    return `
      <section class="rp-page">
        ${head('Desglose semanal', 'Resultados de cada campaña en la semana que ocurrieron, con su costo por resultado.', labels.weeks)}
        <div class="rp-body">
          <div class="rp-card rp-table-card rp-grow">
            <table class="rp-table rp-breakdown">
              <thead><tr><th>Semana</th><th class="num">Inversión</th>${sections.map(section => `<th class="num">${esc(section.short)}</th>`).join('')}<th>Nota</th></tr></thead>
              <tbody>
                ${breakdown.map(week => `
                  <tr>
                    <td class="rp-name"><b>${esc(week.label)}</b><span class="rp-sub">${esc(`${week.range} ${shortMonth(report.period.month)}`)}</span></td>
                    <td class="num">${money(week.spend)}</td>
                    ${week.cells.map(cell => `<td class="num">${cell.active && (cell.value > 0 || cell.cost != null) ? `${num(cell.value)}${finite(cell.cost) ? `<span class="rp-sub">${cost(cell.cost)}</span>` : ''}` : '—'}</td>`).join('')}
                    <td class="rp-cause">${esc(week.note)}</td>
                  </tr>`).join('')}
                <tr class="rp-total">
                  <td class="rp-name">Total · ${esc(labels.range)}</td>
                  <td class="num">${money(sum.spend)}</td>
                  ${sections.map(section => `<td class="num">${num(section.value)}</td>`).join('')}
                  <td></td>
                </tr>
              </tbody>
            </table>
            <p class="rp-table-foot">Cada celda muestra la cantidad de resultados y, debajo, su costo en esa semana. Las semanas van de lunes a domingo; la S1 empieza el primer día con datos del mes.</p>
          </div>
          ${duo('semanal:destacado', destacado, 'semanal:analisis', analisis)}
        </div>
        ${footer(labels.sourceWeeks, report, 4, total)}
      </section>`;
  }

  function sectionSub(section) {
    const serie = section.chart.filter((_, index) => index >= section.firstWeek);
    if (serie.length > 1 && serie[serie.length - 1] > serie[0]) {
      return `Misma inversión semanal, más ${section.kind.many}: el ${section.kind.costLabel.toLowerCase()} bajó con el mes.`;
    }
    if (section.firstWeek > 0) return `Campaña activa desde la S${section.firstWeek + 1}: ${num(section.value)} ${noun(section.kind, section.value)} a ${cost(section.cost)} c/u.`;
    return `${num(section.value)} ${noun(section.kind, section.value)} a ${cost(section.cost)} c/u con ${money(section.sum.spend)} de inversión.`;
  }

  function sectionPage(section, report, notes, page, total) {
    const { kind, sum } = section;
    const diario = section.days > 0 ? sum.spend / section.days : null;
    const cards = [
      kpi('Inversión', money(sum.spend), diario ? `${money(diario)} por día en promedio` : 'Inversión de la campaña'),
      kpi(kind.label, num(section.value), `${section.weeks.length ? `${section.weeks[section.weeks.length - 1].label}: ${num(section.weeks[section.weeks.length - 1].value)}` : '—'}`, badgeOf(section)),
      kpi(kind.costLabel, cost(section.cost), section.weeks.length ? `${section.weeks[section.weeks.length - 1].label}: ${cost(section.weeks[section.weeks.length - 1].cost)}` : '—', costBadge(section)),
      kind !== KINDS.mensajes ? kpi('Conversaciones', num(sum.messages), 'WhatsApp · adicionales') : kpi('CPM', money2(sum.cpm), 'Costo por mil impresiones'),
      kind !== KINDS.mensajes ? kpi('Costo/conversación', cost(section.costMessage), 'Inversión ÷ conversaciones') : kpi('CTR', percent(sum.ctr), 'Clics ÷ impresiones'),
    ];
    const destacadoKey = `destacado:${section.key}`;
    const analisisKey = `analisis:${section.key}`;
    const destacado = notes[destacadoKey] != null ? notes[destacadoKey] : suggestSectionDestacado(section);
    const analisis = notes[analisisKey] != null ? notes[analisisKey] : suggestSectionAnalisis(section);
    return `
      <section class="rp-page">
        ${head(section.title, sectionSub(section), report.labels.weeks)}
        <div class="rp-body">
          <div class="rp-grid-kpis">${cards.join('')}</div>
          <div class="rp-split">
            <div class="rp-card rp-chart-card">
              <div class="rp-card-title">${esc(kind.chart)}</div>
              <div class="rp-card-sub">Lunes a domingo; la S1 empieza el primer día con datos del mes.</div>
              ${barChart(section.chart, { title: kind.chart, sub: section.tag || section.title, color: kind.color, labels: report.weeks.spans.map(span => `${span.label} · ${span.range}`) })}
              ${weeksTable(section)}
            </div>
            <div class="rp-card rp-table-card">
              <div class="rp-card-title">Mejores anuncios</div>
              <div class="rp-card-sub">Bajo cada nombre: conjunto · formato en la parte superior.</div>
              ${adCards(section, report.period)}
            </div>
          </div>
          ${duo(destacadoKey, destacado, analisisKey, analisis)}
        </div>
        ${footer(`${report.labels.source} · campaña ${section.title}`, report, page, total)}
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
    return `
      <section class="rp-page">
        ${head('Conclusiones y próximos pasos', `Qué funcionó en ${report.period.name.toLowerCase()} y qué se hará en las próximas semanas.`)}
        <div class="rp-body">
          <div class="rp-grid-3 rp-conclusions">${cards}</div>
          ${report.labels.note ? `<div class="rp-note">${rich(report.labels.note)}</div>` : ''}
        </div>
        ${footer(report.labels.conclusionsSource, report, page, total)}
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

  function wireEditables(host, periodId) {
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
        saveNote(periodId, node.dataset.note, node.dataset.raw);
      });
      node.addEventListener('blur', () => { node.innerHTML = rich(node.dataset.raw); });
    });
  }

  function render() {
    const host = document.getElementById('week-report');
    if (!host) return;

    const available = periods();
    const select = document.getElementById('week-select');
    if (!available.length) {
      if (select) select.innerHTML = '<option value="">Sin datos para el reporte</option>';
      host.innerHTML = '<div class="panel"><div class="empty-state"><strong>Todavía no hay datos para el reporte</strong><span>El reporte se arma con las descargas de Meta Ads de la carpeta de Drive. En cuanto haya un mes con entregas, aparece aquí.</span></div></div>';
      return;
    }

    if (!available.some(period => period.id === selectedPeriod)) selectedPeriod = available[0].id;
    const period = available.find(item => item.id === selectedPeriod);

    if (select) {
      // Un optgroup por mes: dentro van sus cortes, del mas reciente al mas antiguo.
      const groups = [];
      available.forEach(item => {
        const last = groups[groups.length - 1];
        if (last && last.group === item.group) last.items.push(item);
        else groups.push({ group: item.group, items: [item] });
      });
      select.innerHTML = groups
        .map(group => `<optgroup label="${esc(group.group)}">${group.items
          .map(item => `<option value="${esc(item.id)}"${item.id === selectedPeriod ? ' selected' : ''}>${esc(item.option)}</option>`).join('')}</optgroup>`)
        .join('');
    }

    const model = modelReport();
    const modelHost = document.getElementById('week-model');
    if (modelHost) {
      modelHost.innerHTML = model
        ? `Modelo: <a href="https://drive.google.com/file/d/${esc(model.id)}/view" target="_blank" rel="noopener">${esc(model.title)}</a>`
        : 'Modelo: el último reporte de la carpeta de Drive (no se pudo leer la carpeta)';
    }

    const report = buildReport(period);
    const notes = readNotes()[period.id] || {};
    const conclusions = 5 + report.sections.length;
    const total = conclusions + 1;
    host.innerHTML = `
      <div class="rp-deck" id="week-doc">
        ${coverPage(report)}
        ${contentsPage(report, total)}
        ${resumenPage(report, notes, total)}
        ${breakdownPage(report, notes, total)}
        ${report.sections.map((section, index) => sectionPage(section, report, notes, 5 + index, total)).join('')}
        ${conclusionsPage(report, notes, conclusions, total)}
        ${closingPage()}
      </div>`;

    fitDeck();
    wireEditables(host, period.id);
  }

  // El nombre del PDF lo pone el navegador con el titulo del documento: se cambia solo mientras imprime.
  function printReport() {
    const period = periods().find(item => item.id === selectedPeriod);
    if (!period) return;
    document.activeElement?.blur?.();
    const title = document.title;
    document.title = period.labels.file;
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
      selectedPeriod = event.target.value;
      render();
    });
    document.getElementById('week-print')?.addEventListener('click', printReport);
    // Sin dialogo de confirmacion: el boton vuelve directo a los textos propuestos del corte.
    document.getElementById('week-reset')?.addEventListener('click', () => {
      if (!selectedPeriod) return;
      resetNotes(selectedPeriod);
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
