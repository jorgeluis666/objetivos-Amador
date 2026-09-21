(function () {
  const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const SHORT_MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const METRICS = {
    investment: { key: 'investment', label: 'Inversion', unit: 'money', color: '#2563eb', fill: 'rgba(37,99,235,.10)', field: 'spend', reference: 'budget', referenceLabel: 'Presupuesto' },
    messages: { key: 'messages', label: 'Mensajes', unit: 'count', color: '#16a34a', fill: 'rgba(22,163,74,.10)', field: 'messages', reference: null, referenceLabel: null },
    reservations: { key: 'reservations', label: 'Reservas', unit: 'count', color: '#ea580c', fill: 'rgba(234,88,12,.10)', field: 'reservations', reference: 'reservationGoal', referenceLabel: 'Objetivo' },
  };

  const SCENARIO_COLOR = '#7c3aed';
  const HANDLE_HIT_RADIUS = 16;
  // Orden fijo de datasets para poder actualizar el escenario mientras se arrastra sin recrear la grafica.
  const DS = { real: 0, forecast: 1, scenario: 2, handle: 3, reference: 4 };

  // factor = cierre objetivo / cierre proyectado. Es comun a los tres indicadores porque el escenario
  // mantiene el costo por mensaje y la tasa de reserva del mes; asi cambiar de indicador conserva el escenario.
  const state = { ready: false, metric: 'investment', chart: null, projection: null, factor: 1, dragging: false };

  const money = value => Number.isFinite(Number(value))
    ? `S/. ${Number(value).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '-';
  const count = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString('es-PE', { maximumFractionDigits: 0 }) : '-';
  const format = (value, unit) => (unit === 'money' ? money(value) : count(Math.round(Number(value) || 0)));

  function toDate(iso) {
    const value = /^\d{4}-\d{2}-\d{2}$/.test(String(iso)) ? `${iso}T00:00:00` : iso;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function longDate(date) {
    return date ? `${date.getDate()} de ${MONTHS[date.getMonth()].toLowerCase()} de ${date.getFullYear()}` : '-';
  }

  // El mes proyectado es el que esta en curso; si aun no tiene gasto, se usa el ultimo mes con datos.
  function pickMonth(months, cutoff) {
    const withData = months.filter(month => Number(month.spend) > 0);
    if (!withData.length) return null;
    const reference = toDate(cutoff) || new Date();
    const current = withData.find(month => MONTHS.indexOf(month.name) === reference.getMonth());
    return current || withData[withData.length - 1];
  }

  function buildProjection(snapshot) {
    const month = pickMonth(snapshot.months || [], snapshot.cutoff);
    if (!month) return null;

    const monthIndex = MONTHS.indexOf(month.name);
    const year = snapshot.year || (toDate(snapshot.cutoff) || new Date()).getFullYear();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const cutoffDate = toDate(snapshot.cutoff);
    const sameMonth = cutoffDate && cutoffDate.getMonth() === monthIndex && cutoffDate.getFullYear() === year;
    const closed = !sameMonth;
    const daysWithData = closed ? daysInMonth : Math.min(daysInMonth, Math.max(1, cutoffDate.getDate()));
    const daysLeft = daysInMonth - daysWithData;

    const reservationGoal = (month.campaigns || []).reduce((total, campaign) => total + (Number(campaign.reservationGoal) || 0), 0) || null;
    const references = { budget: Number(month.budgetTotal) || null, reservationGoal, messages: null };

    const metrics = Object.values(METRICS).map(metric => {
      const actual = Number(month[metric.field]) || 0;
      const pace = actual / daysWithData;
      const projected = closed ? actual : pace * daysInMonth;
      const reference = metric.reference ? references[metric.reference] : null;
      return {
        ...metric,
        actual,
        pace,
        projected,
        reference,
        gap: reference == null ? null : reference - projected,
        requiredPace: reference == null || daysLeft <= 0 ? null : Math.max(0, (reference - actual) / daysLeft),
      };
    });

    const byKey = Object.fromEntries(metrics.map(metric => [metric.key, metric]));
    const projectedSpend = byKey.investment.projected;
    const projectedMessages = byKey.messages.projected;
    const projectedReservations = byKey.reservations.projected;

    return {
      monthName: month.name,
      monthLabel: `${month.name} ${year}`,
      shortMonth: SHORT_MONTHS[monthIndex],
      year,
      daysInMonth,
      daysWithData,
      daysLeft,
      closed,
      cutoffDate,
      source: snapshot.source,
      metrics,
      byKey,
      budget: references.budget,
      budgetUsedPct: references.budget ? (byKey.investment.actual / references.budget) * 100 : null,
      budgetProjectedPct: references.budget ? (projectedSpend / references.budget) * 100 : null,
      costPerMessage: byKey.messages.actual ? byKey.investment.actual / byKey.messages.actual : null,
      costPerReservation: byKey.reservations.actual ? byKey.investment.actual / byKey.reservations.actual : null,
      projectedCostPerMessage: projectedMessages ? projectedSpend / projectedMessages : null,
      projectedCostPerReservation: projectedReservations ? projectedSpend / projectedReservations : null,
    };
  }

  function canSimulate(projection, metric) {
    return !projection.closed && projection.daysLeft > 0 && metric.projected > 0;
  }

  // El cierre objetivo nunca puede quedar por debajo de lo ya realizado.
  function clampFactor(projection, factor) {
    const min = projection.daysWithData / projection.daysInMonth;
    return Number.isFinite(factor) ? Math.max(min, factor) : 1;
  }

  function setTarget(projection, metric, value) {
    if (!canSimulate(projection, metric)) return;
    state.factor = clampFactor(projection, Number(value) / metric.projected);
  }

  function buildScenario(projection) {
    const factor = clampFactor(projection, state.factor);
    const metrics = projection.metrics.map(metric => {
      const target = metric.projected * factor;
      const pace = projection.daysLeft > 0 ? (target - metric.actual) / projection.daysLeft : null;
      return {
        ...metric,
        target,
        delta: target - metric.projected,
        deltaPct: metric.projected ? (target / metric.projected - 1) * 100 : null,
        scenarioPace: pace,
        paceChangePct: pace != null && metric.pace ? (pace / metric.pace - 1) * 100 : null,
        targetGap: metric.reference == null ? null : metric.reference - target,
        referencePct: metric.reference ? (target / metric.reference) * 100 : null,
      };
    });
    return { factor, active: Math.abs(factor - 1) > 0.0005, metrics, byKey: Object.fromEntries(metrics.map(metric => [metric.key, metric])) };
  }

  const signed = (value, unit) => `${value >= 0 ? '+' : '-'}${format(Math.abs(value), unit)}`;
  // Los ritmos de conteo se muestran con un decimal: 0.8 reservas por dia no debe verse como 1.
  const formatPace = (value, unit) => (unit === 'money' ? money(value) : Number(value || 0).toLocaleString('es-PE', { maximumFractionDigits: 1 }));
  const signedPct = value => (value == null ? '' : `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(1)}%`);

  function renderKpis(projection) {
    const host = document.getElementById('projection-kpis');
    if (!host) return;
    const investment = projection.byKey.investment;
    const messages = projection.byKey.messages;
    const reservations = projection.byKey.reservations;
    const budgetHint = projection.budget
      ? `${projection.budgetProjectedPct.toFixed(0)}% del presupuesto (${money(projection.budget)})`
      : 'Sin presupuesto registrado';
    const goalHint = reservations.reference
      ? `Objetivo ${count(reservations.reference)} | ${reservations.gap >= 0 ? `faltan ${count(Math.abs(Math.round(reservations.gap)))}` : `sobre el objetivo por ${count(Math.abs(Math.round(reservations.gap)))}`}`
      : 'Sin objetivo registrado';

    const cards = [
      { label: 'Inversion proyectada', value: money(investment.projected), hint: budgetHint },
      { label: 'Mensajes proyectados', value: count(Math.round(messages.projected)), hint: `Ritmo ${count(Math.round(messages.pace))} por dia` },
      { label: 'Reservas proyectadas', value: count(Math.round(reservations.projected)), hint: goalHint },
      { label: 'Ritmo de inversion', value: `${money(investment.pace)} / dia`, hint: projection.closed ? 'Mes cerrado' : `Quedan ${projection.daysLeft} dias del mes` },
      { label: 'Avance del mes', value: `${projection.daysWithData} de ${projection.daysInMonth} dias`, hint: `Datos al ${longDate(projection.cutoffDate)}` },
    ];

    host.innerHTML = cards.map(card => `
      <div class="kpi-pill">
        <span>${card.label}</span>
        <strong>${card.value}</strong>
        <small>${card.hint}</small>
      </div>
    `).join('');
  }

  function renderTable(projection) {
    const body = document.getElementById('projection-body');
    if (!body) return;
    const rows = projection.metrics.map(metric => {
      const gap = metric.gap == null
        ? '<span class="no-data">Sin referencia</span>'
        : `<span class="projection-gap ${metric.gap >= 0 ? 'ok' : 'over'}">${metric.gap >= 0 ? '' : '+'}${format(Math.abs(metric.gap), metric.unit)} ${metric.gap >= 0 ? 'por debajo' : 'por encima'}</span>`;
      return `
        <tr>
          <td class="campaign-name">${metric.label}</td>
          <td class="num">${format(metric.actual, metric.unit)}</td>
          <td class="num">${format(metric.pace, metric.unit)}</td>
          <td class="num projection-value">${format(metric.projected, metric.unit)}</td>
          <td class="num">${metric.reference == null ? '<span class="no-data">-</span>' : format(metric.reference, metric.unit)}</td>
          <td>${gap}</td>
        </tr>`;
    }).join('');

    const costRow = `
      <tr class="projection-cost-row">
        <td class="campaign-name">Costo por mensaje / reserva</td>
        <td class="num">${money(projection.costPerMessage)} / ${money(projection.costPerReservation)}</td>
        <td class="num"><span class="no-data">-</span></td>
        <td class="num projection-value">${money(projection.projectedCostPerMessage)} / ${money(projection.projectedCostPerReservation)}</td>
        <td class="num"><span class="no-data">-</span></td>
        <td><span class="no-data">Se mantiene si el ritmo no cambia</span></td>
      </tr>`;

    body.innerHTML = rows + costRow;

    const head = document.getElementById('projection-actual-head');
    if (head) head.textContent = `Actual al ${projection.daysWithData}-${projection.shortMonth}`;
    const closeHead = document.getElementById('projection-close-head');
    if (closeHead) closeHead.textContent = `Proyeccion al ${projection.daysInMonth}-${projection.shortMonth}`;
  }

  function renderLegend(projection, metric, scenario) {
    const host = document.getElementById('projection-legend');
    if (!host) return;
    const items = [
      `<span><i class="legend-line" style="background:${metric.color}"></i><b>Acumulado real</b></span>`,
      `<span><i class="legend-line dashed" style="background:${metric.color}"></i><b>Proyeccion al cierre</b></span>`,
    ];
    if (scenario.active) {
      items.push(`<span><i class="legend-line dashed" style="background:${SCENARIO_COLOR}"></i><b>Escenario objetivo</b></span>`);
    }
    if (metric.reference != null) {
      items.push(`<span><i class="legend-line dashed" style="background:#94a3b8"></i><b>${metric.referenceLabel}</b></span>`);
    }
    if (canSimulate(projection, metric)) {
      items.push(`<span style="color:${scenario.active ? SCENARIO_COLOR : metric.color}"><i class="legend-dot"></i><b>Nodo arrastrable (cierre objetivo)</b></span>`);
    }
    host.innerHTML = items.join('');
  }

  function scenarioSeries(projection, metric, scenarioMetric) {
    const last = projection.daysInMonth - 1;
    const simulable = canSimulate(projection, metric);
    const lineData = Array.from({ length: projection.daysInMonth }, (_, index) => (
      index + 1 >= projection.daysWithData
        ? metric.actual + scenarioMetric.scenarioPace * (index + 1 - projection.daysWithData)
        : null
    ));
    const handleData = Array.from({ length: projection.daysInMonth }, (_, index) => (index === last && simulable ? scenarioMetric.target : null));
    return { lineData, handleData };
  }

  const cutoffMarker = {
    id: 'cutoffMarker',
    afterDatasetsDraw(chart, args, options) {
      const index = options?.index;
      if (index == null || index < 0) return;
      const x = chart.scales.x.getPixelForValue(index);
      const { top, bottom } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#7890b5';
      ctx.font = '700 9px Inter, sans-serif';
      ctx.textAlign = x > (chart.chartArea.left + chart.chartArea.right) / 2 ? 'right' : 'left';
      ctx.fillText(options.label || 'Ultima actualizacion', x + (ctx.textAlign === 'right' ? -6 : 6), top + 10);
      ctx.restore();
    },
  };

  function renderChart(projection) {
    const canvas = document.getElementById('chart-projection');
    if (!canvas || typeof Chart === 'undefined') return;
    const metric = projection.byKey[state.metric] || projection.byKey.investment;
    const labels = Array.from({ length: projection.daysInMonth }, (_, index) => `${index + 1} ${projection.shortMonth}`);
    const real = labels.map((_, index) => (index + 1 <= projection.daysWithData ? metric.pace * (index + 1) : null));
    const forecast = labels.map((_, index) => (index + 1 >= projection.daysWithData ? metric.pace * (index + 1) : null));

    const scenario = buildScenario(projection);
    const scenarioMetric = scenario.byKey[metric.key];
    const series = scenarioSeries(projection, metric, scenarioMetric);
    const handleColor = scenario.active ? SCENARIO_COLOR : metric.color;

    const datasets = [
      { label: 'Acumulado real', data: real, borderColor: metric.color, backgroundColor: metric.fill, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, tension: .15, fill: true, unit: metric.unit },
      { label: 'Proyeccion al cierre', data: projection.closed ? [] : forecast, borderColor: scenario.active ? `${metric.color}66` : metric.color, borderDash: [6, 5], borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, tension: .15, fill: false, unit: metric.unit },
      { label: 'Escenario objetivo', data: scenario.active ? series.lineData : [], borderColor: SCENARIO_COLOR, borderDash: [2, 4], borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, tension: 0, fill: false, unit: metric.unit },
      { label: 'Cierre objetivo', data: series.handleData, showLine: false, pointRadius: 7, pointHoverRadius: 9, pointBorderWidth: 3, pointBackgroundColor: '#fff', pointBorderColor: handleColor, pointHoverBackgroundColor: '#fff', pointHoverBorderColor: handleColor, borderColor: handleColor, unit: metric.unit },
    ];
    if (metric.reference != null) {
      datasets.push({ label: metric.referenceLabel, data: labels.map(() => metric.reference), borderColor: '#94a3b8', borderDash: [3, 4], borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0, fill: false, unit: metric.unit });
    }
    const suggestedMax = Math.max(metric.projected * 1.3, (metric.reference || 0) * 1.1, scenarioMetric.target * 1.15);

    const ticks = metric.unit === 'money'
      ? value => (value === 0 ? 'S/. 0' : `S/. ${(value / 1000).toFixed(1)}k`)
      : value => Number(value).toLocaleString('es-PE');

    if (state.chart) state.chart.destroy();
    state.chart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 18, right: 14, left: 4 } },
        plugins: {
          legend: { display: false },
          cutoffMarker: { index: projection.daysWithData - 1, label: `Datos al ${projection.daysWithData}-${projection.shortMonth}` },
          tooltip: {
            callbacks: {
              label: context => (context.raw == null ? null : ` ${context.dataset.label}: ${format(context.raw, metric.unit)}`),
            },
          },
        },
        scales: {
          x: { grid: { display: false }, border: { color: '#cbd5e1' }, ticks: { color: '#7890b5', font: { size: 10 }, maxTicksLimit: 10, autoSkip: true } },
          y: { beginAtZero: true, suggestedMax, border: { display: false }, grid: { color: 'rgba(148,163,184,.20)' }, ticks: { color: '#7890b5', font: { size: 10 }, callback: ticks } },
        },
      },
      plugins: [cutoffMarker],
    });

    renderLegend(projection, metric, scenario);
  }

  // Actualizacion liviana durante el arrastre: solo cambian el escenario y el nodo.
  function updateScenario(projection) {
    const chart = state.chart;
    const metric = projection.byKey[state.metric] || projection.byKey.investment;
    const scenario = buildScenario(projection);
    if (chart) {
      const series = scenarioSeries(projection, metric, scenario.byKey[metric.key]);
      const handleColor = scenario.active ? SCENARIO_COLOR : metric.color;
      const handle = chart.data.datasets[DS.handle];
      chart.data.datasets[DS.forecast].borderColor = scenario.active ? `${metric.color}66` : metric.color;
      chart.data.datasets[DS.scenario].data = scenario.active ? series.lineData : [];
      handle.data = series.handleData;
      handle.pointBorderColor = handle.pointHoverBorderColor = handle.borderColor = handleColor;
      chart.update('none');
      renderLegend(projection, metric, scenario);
    }
    renderSimulator(projection);
  }

  function renderSimulator(projection) {
    const grid = document.getElementById('projection-sim-grid');
    if (!grid) return;
    const metric = projection.byKey[state.metric] || projection.byKey.investment;
    const scenario = buildScenario(projection);
    const selected = scenario.byKey[metric.key];
    const simulable = canSimulate(projection, metric);

    const input = document.getElementById('projection-sim-value');
    const goalButton = document.getElementById('projection-sim-goal');
    const resetButton = document.getElementById('projection-sim-reset');
    const sub = document.getElementById('projection-sim-sub');
    const note = document.getElementById('projection-sim-note');
    const label = document.getElementById('projection-sim-label');
    const prefix = document.getElementById('projection-sim-prefix');

    if (label) label.textContent = `${metric.label} al cierre`;
    if (prefix) prefix.textContent = metric.unit === 'money' ? 'S/' : '#';
    if (input) {
      input.disabled = !simulable;
      input.step = metric.unit === 'money' ? '10' : '1';
      input.min = simulable ? String(Math.ceil(metric.actual)) : '0';
      // No se pisa lo que el usuario esta escribiendo.
      if (document.activeElement !== input) {
        input.value = simulable ? (metric.unit === 'money' ? selected.target.toFixed(2) : String(Math.round(selected.target))) : '';
      }
    }
    if (resetButton) resetButton.disabled = !scenario.active;
    if (goalButton) {
      const hasGoal = simulable && metric.reference != null && metric.reference > 0;
      goalButton.hidden = !hasGoal;
      if (hasGoal) goalButton.textContent = `Llevar al ${metric.referenceLabel.toLowerCase()} (${format(metric.reference, metric.unit)})`;
    }

    if (!simulable) {
      const reason = projection.closed || projection.daysLeft <= 0
        ? 'El mes ya cerro: el simulador aplica al mes en curso.'
        : `Todavia no hay ${metric.label.toLowerCase()} registrados para simular.`;
      if (sub) sub.textContent = reason;
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;min-height:120px"><strong>Simulador no disponible</strong>${reason}</div>`;
      if (note) note.textContent = '';
      return;
    }

    if (sub) {
      sub.textContent = scenario.active
        ? `Escenario: cerrar ${projection.monthLabel} con ${format(selected.target, metric.unit)} de ${metric.label.toLowerCase()} (${signedPct(selected.deltaPct)} vs la proyeccion).`
        : 'Arrastra el nodo del ultimo dia de la grafica (o escribe el valor) hacia el cierre que quieres alcanzar.';
    }

    const referenceRow = item => {
      if (item.reference == null) return '';
      const isBudget = item.key === 'investment';
      const ok = isBudget ? item.targetGap >= 0 : item.targetGap <= 0;
      const text = isBudget
        ? (item.targetGap >= 0 ? `Quedan ${format(item.targetGap, item.unit)}` : `Excede ${format(-item.targetGap, item.unit)}`)
        : (item.targetGap > 0 ? `Faltan ${format(item.targetGap, item.unit)}` : `Cumple (+${format(-item.targetGap, item.unit)})`);
      return `<div><dt>vs ${item.referenceLabel.toLowerCase()} (${item.referencePct.toFixed(0)}%)</dt><dd class="${ok ? 'ok' : 'over'}">${text}</dd></div>`;
    };

    const cards = scenario.metrics.map(item => {
      const trend = !scenario.active ? '' : item.delta >= 0 ? 'up' : 'down';
      const perDay = item.unit === 'money' ? '/ dia' : 'por dia';
      return `
        <div class="sim-card ${item.key === metric.key ? 'selected' : ''}">
          <span>${item.label} al cierre</span>
          <strong>${format(item.target, item.unit)}</strong>
          <small class="sim-delta ${trend}">${scenario.active ? `${signed(item.delta, item.unit)} vs proyeccion (${signedPct(item.deltaPct)})` : 'Igual a la proyeccion'}</small>
          <dl>
            <div><dt>${item.key === 'investment' ? 'Presupuesto diario requerido' : 'Ritmo requerido'}</dt><dd>${formatPace(item.scenarioPace, item.unit)} ${perDay}</dd></div>
            <div><dt>Ritmo actual</dt><dd>${formatPace(item.pace, item.unit)} ${perDay}${scenario.active && item.paceChangePct != null ? ` (${signedPct(item.paceChangePct)})` : ''}</dd></div>
            <div><dt>Falta realizar</dt><dd>${format(Math.max(0, item.target - item.actual), item.unit)} en ${projection.daysLeft} dias</dd></div>
            ${referenceRow(item)}
          </dl>
        </div>`;
    });

    const spend = scenario.byKey.investment;
    const messages = scenario.byKey.messages;
    const reservations = scenario.byKey.reservations;
    const conversion = messages.actual ? (reservations.actual / messages.actual) * 100 : null;
    cards.push(`
      <div class="sim-card efficiency">
        <span>Eficiencia del escenario</span>
        <strong>${money(spend.delta)}</strong>
        <small class="sim-delta ${!scenario.active ? '' : spend.delta >= 0 ? 'up' : 'down'}">Inversion ${spend.delta >= 0 ? 'adicional' : 'menor'} vs el ritmo actual</small>
        <dl>
          <div><dt>Costo por mensaje</dt><dd>${money(projection.costPerMessage)}</dd></div>
          <div><dt>Costo por reserva</dt><dd>${money(projection.costPerReservation)}</dd></div>
          <div><dt>Tasa de reserva</dt><dd>${conversion == null ? '-' : `${conversion.toFixed(1)}%`}</dd></div>
        </dl>
      </div>`);

    grid.innerHTML = cards.join('');

    if (note) {
      note.textContent = `El escenario conserva la eficiencia real del mes (costo por mensaje, costo por reserva y tasa de reserva): mover un indicador recalcula los otros dos en la misma proporcion. El cierre objetivo no puede quedar por debajo de lo ya realizado al ${projection.daysWithData}-${projection.shortMonth}.`;
    }
  }

  function renderHeader(projection) {
    const title = document.getElementById('projection-title');
    if (title) title.textContent = `Linea de tiempo | ${projection.monthLabel}`;
    const sub = document.getElementById('projection-sub');
    if (sub) {
      sub.textContent = projection.closed
        ? `Mes cerrado con ${projection.daysInMonth} dias de datos.`
        : `Datos reales hasta el dia ${projection.daysWithData} y proyeccion lineal hasta el ${projection.daysInMonth}.`;
    }
    const note = document.getElementById('projection-note');
    if (note) {
      note.textContent = `La proyeccion asume que se mantiene el ritmo promedio del mes (${money(projection.byKey.investment.pace)} por dia). Fuente: ${projection.source || 'Distribucion-amador'}.`;
    }
    const desc = document.getElementById('projection-desc');
    if (desc) {
      desc.textContent = `Proyeccion al cierre de ${projection.monthLabel} calculada con los datos reales del modulo Gasto publicitario, actualizados al ${longDate(projection.cutoffDate)}.`;
    }
  }

  // El CPL real del mes alimenta la calculadora de inversion.
  function renderCplLink(projection) {
    const button = document.getElementById('projection-use-cpl');
    if (!button) return;
    const cpl = projection.costPerMessage;
    if (!cpl) {
      button.hidden = true;
      return;
    }
    button.hidden = false;
    button.textContent = `Usar CPL real (${money(cpl)})`;
    button.dataset.cpl = cpl.toFixed(2);
  }

  function renderEmpty() {
    const panel = document.getElementById('projection-panel');
    if (panel) panel.innerHTML = '<div class="empty-state"><strong>Sin datos para proyectar</strong>Todavia no hay gasto registrado en el mes en curso.</div>';
    const body = document.getElementById('projection-body');
    if (body) body.innerHTML = '<tr><td class="table-empty" colspan="6">Sin datos para proyectar.</td></tr>';
  }

  function renderWaiting() {
    const sub = document.getElementById('projection-sub');
    if (sub) sub.textContent = 'Esperando los datos del modulo Gasto publicitario...';
    const body = document.getElementById('projection-body');
    if (body) body.innerHTML = '<tr><td class="table-empty" colspan="6">Esperando los datos del modulo Gasto publicitario...</td></tr>';
  }

  function render() {
    // El modulo puede abrirse antes de que Gasto publicitario termine de cargar; el evento amador:data-updated lo reintenta.
    const snapshot = window.AmadorObjectives?.snapshot?.();
    if (!snapshot) {
      renderWaiting();
      return;
    }
    const projection = buildProjection(snapshot);
    state.projection = projection;
    if (!projection) {
      renderEmpty();
      return;
    }
    renderHeader(projection);
    renderKpis(projection);
    renderChart(projection);
    renderTable(projection);
    renderCplLink(projection);
    renderSimulator(projection);
  }

  function handlePosition(chart, projection, metric) {
    const target = buildScenario(projection).byKey[metric.key].target;
    return { x: chart.scales.x.getPixelForValue(projection.daysInMonth - 1), y: chart.scales.y.getPixelForValue(target) };
  }

  // Misma conversion que usa Chart.js internamente; offsetX falla con zoom o transformaciones CSS.
  function pointerPosition(event, chart) {
    if (Chart.helpers?.getRelativePosition) return Chart.helpers.getRelativePosition(event, chart);
    const rect = chart.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function nearHandle(event) {
    const chart = state.chart;
    const projection = state.projection;
    if (!chart || !projection) return false;
    const metric = projection.byKey[state.metric];
    if (!metric || !canSimulate(projection, metric)) return false;
    const point = handlePosition(chart, projection, metric);
    const pointer = pointerPosition(event, chart);
    return Math.hypot(pointer.x - point.x, pointer.y - point.y) <= HANDLE_HIT_RADIUS;
  }

  function wireDrag() {
    const canvas = document.getElementById('chart-projection');
    if (!canvas) return;

    canvas.addEventListener('pointerdown', event => {
      if (!nearHandle(event)) return;
      event.preventDefault();
      state.dragging = true;
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = 'grabbing';
      // Se congela la escala durante el arrastre para que el eje no salte bajo el cursor.
      const metric = state.projection.byKey[state.metric];
      const target = buildScenario(state.projection).byKey[metric.key].target;
      state.chart.options.scales.y.max = Math.max(state.chart.scales.y.max, target * 1.6);
      state.chart.update('none');
    });

    canvas.addEventListener('pointermove', event => {
      if (!state.dragging) {
        canvas.style.cursor = nearHandle(event) ? 'ns-resize' : '';
        return;
      }
      const chart = state.chart;
      const projection = state.projection;
      const metric = projection.byKey[state.metric];
      const { top, bottom } = chart.chartArea;
      const y = Math.min(bottom, Math.max(top, pointerPosition(event, chart).y));
      setTarget(projection, metric, chart.scales.y.getValueForPixel(y));
      updateScenario(projection);
    });

    const endDrag = event => {
      if (!state.dragging) return;
      state.dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      canvas.style.cursor = '';
      if (state.projection) renderChart(state.projection);
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    canvas.addEventListener('dblclick', event => {
      if (!nearHandle(event) || !state.projection) return;
      state.factor = 1;
      renderChart(state.projection);
      renderSimulator(state.projection);
    });
  }

  function wireSimulator() {
    const input = document.getElementById('projection-sim-value');
    input?.addEventListener('input', () => {
      const projection = state.projection;
      if (!projection || input.value === '') return;
      const metric = projection.byKey[state.metric];
      const value = Number(input.value);
      // Mientras se escribe, un valor por debajo de lo realizado se ignora en vez de corregirlo a mitad de tecleo.
      if (!Number.isFinite(value) || value < metric.actual) return;
      setTarget(projection, metric, value);
      renderChart(projection);
      renderSimulator(projection);
    });
    input?.addEventListener('change', () => {
      const projection = state.projection;
      if (!projection) return;
      const metric = projection.byKey[state.metric];
      if (input.value !== '') setTarget(projection, metric, Number(input.value));
      input.blur();
      renderChart(projection);
      renderSimulator(projection);
    });

    document.getElementById('projection-sim-goal')?.addEventListener('click', () => {
      const projection = state.projection;
      if (!projection) return;
      const metric = projection.byKey[state.metric];
      if (metric.reference == null) return;
      setTarget(projection, metric, metric.reference);
      renderChart(projection);
      renderSimulator(projection);
    });

    document.getElementById('projection-sim-reset')?.addEventListener('click', () => {
      state.factor = 1;
      if (!state.projection) return;
      renderChart(state.projection);
      renderSimulator(state.projection);
    });
  }

  function wireEvents() {
    document.getElementById('projection-metrics')?.addEventListener('change', event => {
      const input = event.target.closest('input[type="radio"]');
      if (!input) return;
      state.metric = input.value;
      document.querySelectorAll('#projection-metrics .series-toggle').forEach(label => {
        label.classList.toggle('active', label.dataset.series === state.metric);
      });
      if (state.projection) {
        renderChart(state.projection);
        renderSimulator(state.projection);
      }
    });

    wireDrag();
    wireSimulator();

    document.getElementById('projection-use-cpl')?.addEventListener('click', event => {
      const cpl = event.currentTarget.dataset.cpl;
      if (!cpl) return;
      window.MessagesCalculator?.init();
      const input = document.getElementById('messages-cpl');
      if (!input) return;
      input.value = cpl;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    });

    window.addEventListener('amador:data-updated', () => {
      if (state.ready) render();
    });
  }

  function init() {
    if (!state.ready) {
      wireEvents();
      state.ready = true;
    }
    render();
  }

  window.AmadorProjections = { init, render };
})();
