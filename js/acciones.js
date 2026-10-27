/**
 * acciones.js - Acciones sugeridas del mes para Meta Ads, con check.
 *
 * El Ciclo Mensual de Analisis y Optimizacion dice en que semana del mes vamos; las cifras reales
 * dicen que hacer. De las dos cosas sale la lista: cada accion lleva el numero exacto, el porque y
 * la ruta donde se toca en el Administrador de anuncios.
 *
 * Las palancas de Meta no son las de Google: aqui no se mueven keywords ni pujas, se mueve el arte,
 * el formato y la inversion de la campana. Por eso los cuatro hitos son los del ciclo de Meta
 * (calibracion, desgaste del arte, formato, escalar y repetir).
 *
 * En Amador cada campana mide lo suyo —reservas web, clientes potenciales o conversaciones—, asi
 * que las comparaciones son siempre dentro de la misma campana y nunca entre campanas distintas.
 *
 * El hito que corre hoy pone sus acciones primero, pero no se esconde ninguna: una pieza que gasta
 * sin resultados no puede esperar a la semana que le toque.
 *
 * El id de cada accion es estable (tipo + campana o anuncio, nunca la cifra), de modo que lo
 * marcado sigue marcado aunque los numeros cambien al dia siguiente. El estado es por mes y, por
 * ahora, vive solo en este navegador: lo que marca una persona no lo ven las demas, y la tarjeta lo
 * dice. Compartirlo pide una hoja y un Web App propios, como el CRM de Tierra Films.
 */
(function () {
  const { esc, fmt, limaParts, MONTHS } = window.AmadorShared;

  const LOCAL_KEY = 'amador_acciones_v1';
  const FRECUENCIA_ALTA = 2;
  const GASTO_MINIMO = 50;
  const CAMBIO_MINIMO = 0.15;
  const METRICS = ['spend', 'impressions', 'reach', 'clicks', 'results', 'messages', 'purchases'];

  const HITOS = [
    { key: 'calibracion', hasta: 7, titulo: 'Calibración', semana: 'Semana 1' },
    { key: 'desgaste', hasta: 14, titulo: 'Desgaste del arte', semana: 'Semana 2' },
    { key: 'formato', hasta: 21, titulo: 'Formato', semana: 'Semana 3' },
    { key: 'escalar', hasta: 31, titulo: 'Escalar y repetir', semana: 'Semana 4' },
  ];
  const ORDEN = HITOS.map(hito => hito.key);

  // Lo que mide cada campana, igual que en el reporte: lo que Meta le cuenta como resultado.
  const TIPOS = {
    compras: { metric: 'compras', uno: 'reserva web', varias: 'reservas web' },
    leads: { metric: 'leads', uno: 'lead', varias: 'leads' },
    mensajes: { metric: 'messages', uno: 'conversación', varias: 'conversaciones' },
    resultados: { metric: 'results', uno: 'resultado', varias: 'resultados' },
  };

  const state = { hechas: {}, cargado: false };

  const normalize = valor => String(valor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  const finite = valor => valor != null && Number.isFinite(Number(valor));
  const money = valor => fmt.money(valor);
  const count = valor => fmt.count(valor);
  // Un costo de centavos con dos decimales queda en «S/. 0.01» y la frase pierde sentido.
  const costo = valor => fmt.unitCost(valor);
  const pct = valor => `${valor > 0 ? '+' : ''}${Math.round(valor * 100)}%`;

  // ── Guardado ───────────────────────────────────────────────────────────────
  function cargar() {
    if (state.cargado) return;
    state.cargado = true;
    try {
      const guardado = JSON.parse(window.localStorage.getItem(LOCAL_KEY) || '{}');
      if (guardado && typeof guardado === 'object') state.hechas = guardado;
    } catch {
      // Sin localStorage las marcas duran lo que dure la pestana.
    }
  }

  function guardar() {
    try {
      window.localStorage.setItem(LOCAL_KEY, JSON.stringify(state.hechas));
    } catch {
      // Igual que arriba.
    }
  }

  const marcada = (mes, id) => Boolean(state.hechas[`${mes}|${id}`]);

  function marcar(mes, id, valor) {
    const key = `${mes}|${id}`;
    if (valor) state.hechas[key] = true;
    else delete state.hechas[key];
    guardar();
  }

  // Meta nombra las campanas «Campaña Reservas Web Almuerzos | LR - Gasto total»: en una frase se lee
  // mal y no aporta. En el titulo y el porque va el nombre corto; en la ruta, el nombre tal cual,
  // que es el que hay que buscar en el Administrador de anuncios.
  const corto = nombre => (String(nombre || '').split('|')[0].trim().replace(/^campa(n|ñ)a\s+/i, '').trim() || String(nombre || ''))
    // «Campaña corporativos» queda en «corporativos», que a mitad de frase se lee como un error.
    .replace(/^./, letra => letra.toUpperCase());

  function clave(texto) {
    const plano = normalize(texto).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (plano.length <= 32) return plano;
    let suma = 5381;
    for (let i = 0; i < plano.length; i += 1) suma = ((suma * 33) ^ plano.charCodeAt(i)) >>> 0;
    return `${plano.slice(0, 32)}-${suma.toString(36)}`;
  }

  // ── Filas del barrido ──────────────────────────────────────────────────────
  // Las mismas que usa el reporte: una por dia x campana x conjunto x anuncio.
  function sweep() {
    return window.AmadorObjectives?.meta?.() || window.AMADOR_META_DATA || null;
  }

  function sweepRows() {
    const meses = (sweep()?.months || []).filter(m => !m.error && Array.isArray(m.rows) && m.rows.length && Array.isArray(m.columns));
    const filas = [];
    meses.forEach(month => {
      const at = nombre => month.columns.indexOf(nombre);
      const cols = { day: at('day'), campaign: at('campaign'), adSet: at('adSet'), ad: at('ad'), resultType: at('resultType') };
      const nums = METRICS.map(campo => [campo, at(campo)]);
      month.rows.forEach(row => {
        const day = String(row[cols.day] ?? '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
        const item = { day, d: Number(day.slice(8, 10)), mes: day.slice(0, 7) };
        Object.entries(cols).forEach(([campo, i]) => { if (campo !== 'day') item[campo] = i < 0 ? '' : String(row[i] ?? '').trim(); });
        nums.forEach(([campo, i]) => { item[campo] = i < 0 ? 0 : Number(row[i]) || 0; });
        const tipo = normalize(item.resultType);
        item.compras = /compra/.test(tipo) ? item.results : 0;
        item.leads = /cliente.*potencial|lead/.test(tipo) ? item.results : 0;
        filas.push(item);
      });
    });
    return filas;
  }

  const activa = row => row.spend > 0 || row.impressions > 0 || row.messages > 0 || row.results > 0;

  function totales(filas) {
    const suma = { spend: 0, impressions: 0, reach: 0, clicks: 0, results: 0, messages: 0, compras: 0, leads: 0 };
    filas.forEach(row => { Object.keys(suma).forEach(campo => { suma[campo] += row[campo] || 0; }); });
    suma.frequency = suma.reach > 0 ? suma.impressions / suma.reach : null;
    return suma;
  }

  const tipoDe = suma => (suma.compras > 0 ? TIPOS.compras : suma.leads > 0 ? TIPOS.leads : suma.messages > 0 ? TIPOS.mensajes : TIPOS.resultados);
  const valorDe = (suma, tipo) => suma[tipo.metric] || 0;
  const costoDe = (suma, tipo) => (valorDe(suma, tipo) > 0 ? suma.spend / valorDe(suma, tipo) : null);
  const noun = (tipo, valor) => (Math.round(valor) === 1 ? tipo.uno : tipo.varias);

  // El ultimo mes con datos y el mismo tramo de dias del mes anterior.
  function periodo() {
    const filas = sweepRows().filter(activa);
    if (!filas.length) return null;
    const mes = filas.map(row => row.mes).sort().reverse()[0];
    const delMes = filas.filter(row => row.mes === mes);
    const [year, month] = mes.split('-').map(Number);
    const to = Math.max(...delMes.map(row => row.d));
    const dias = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const anterior = new Date(Date.UTC(year, month - 2, 1));
    const mesPrev = `${anterior.getUTCFullYear()}-${String(anterior.getUTCMonth() + 1).padStart(2, '0')}`;
    const prev = filas.filter(row => row.mes === mesPrev && row.d <= to);
    return { mes, year, month, to, dias, nombre: MONTHS[month - 1], rows: delMes, prev: prev.length ? prev : null, nombrePrev: MONTHS[(month + 10) % 12] };
  }

  function hitoDe(period) {
    const hoy = limaParts(new Date());
    const enCurso = period.month === hoy.month + 1 && period.year === hoy.year;
    const dia = enCurso ? hoy.day : period.to;
    return { hito: HITOS.find(item => dia <= item.hasta) || HITOS[HITOS.length - 1], dia, enCurso };
  }

  function causa(cur, prev, tipo) {
    const gasto = prev.spend > 0 ? cur.spend / prev.spend - 1 : 0;
    const res = valorDe(prev, tipo) > 0 ? valorDe(cur, tipo) / valorDe(prev, tipo) - 1 : 0;
    if (res < 0 && gasto >= -0.05) return 'los resultados cayeron con la misma inversión: es la creatividad, no el presupuesto';
    if (gasto > 0.1 && res <= gasto) return 'la inversión subió más rápido que los resultados';
    return 'el costo por resultado se movió sin que cambiara la inversión';
  }

  // El formato sale de la pieza de «05 Artes», que el barrido trae; sin pieza no se puede saber.
  const claveArte = nombre => normalize(nombre).replace(/\.[a-z0-9]{2,5}$/, '').replace(/[^a-z0-9]+/g, '');

  function porAnuncio(filas) {
    const mapa = new Map();
    filas.forEach(row => {
      const key = `${normalize(row.campaign)}|${normalize(row.ad)}`;
      if (!mapa.has(key)) mapa.set(key, { key, ad: row.ad, campaign: row.campaign, filas: [] });
      mapa.get(key).filas.push(row);
    });
    return [...mapa.values()].map(item => ({ ...item, ...totales(item.filas) })).filter(activa);
  }

  function porCampana(filas) {
    const mapa = new Map();
    filas.forEach(row => {
      const key = normalize(row.campaign);
      if (!mapa.has(key)) mapa.set(key, { key, campaign: row.campaign, filas: [] });
      mapa.get(key).filas.push(row);
    });
    return [...mapa.values()].map(item => ({ ...item, ...totales(item.filas) })).filter(item => item.spend > 0);
  }

  // ── El calculo ─────────────────────────────────────────────────────────────
  function acciones(period) {
    if (!period) return [];
    const lista = [];
    const campanas = porCampana(period.rows);
    const anuncios = porAnuncio(period.rows);
    const previosAds = period.prev ? new Map(porAnuncio(period.prev).map(ad => [ad.key, ad])) : new Map();
    const previasCamp = period.prev ? new Map(porCampana(period.prev).map(c => [c.key, c])) : new Map();
    const piezas = sweep()?.artes?.piezas || {};

    // 1 · Calibración.
    campanas.forEach(camp => {
      const prev = previasCamp.get(camp.key);
      if (!prev || camp.spend < GASTO_MINIMO) return;
      const tipo = tipoDe(camp);
      const ahora = costoDe(camp, tipo);
      const antes = costoDe(prev, tipo);
      if (!finite(ahora) || !finite(antes)) return;
      const cambio = ahora / antes - 1;
      if (cambio < CAMBIO_MINIMO) return;
      lista.push({
        id: `calibracion:${clave(camp.key)}`,
        hito: 'calibracion',
        tono: cambio >= 0.3 ? 'red' : 'amber',
        titulo: `Revisar ${corto(camp.campaign)}: cada ${tipo.uno} cuesta ${costo(ahora)}`,
        porque: `${pct(cambio)} contra el mismo tramo de ${period.nombrePrev.toLowerCase()} (${costo(antes)}); ${causa(camp, prev, tipo)}.`,
        donde: `Administrador de anuncios › Campañas › ${camp.campaign}`,
      });
    });

    // 2 · Desgaste del arte.
    anuncios.forEach(ad => {
      if (ad.spend < GASTO_MINIMO) return;
      const tipo = tipoDe(ad);
      const valor = valorDe(ad, tipo);
      if (valor === 0) {
        lista.push({
          id: `seca:${clave(ad.key)}`,
          hito: 'desgaste',
          tono: 'red',
          titulo: `Pausar «${ad.ad}» o cambiar su pieza`,
          porque: `Lleva ${money(ad.spend)} del mes sin un solo resultado.`,
          donde: `Administrador de anuncios › Anuncios › ${ad.ad}`,
        });
        return;
      }
      const prev = previosAds.get(ad.key);
      if (prev && prev.reach > 0) {
        const ahora = costoDe(ad, tipo);
        const antes = costoDe(prev, tipo);
        if (finite(ahora) && finite(antes)) {
          const masCaro = ahora / antes - 1;
          const menosAlcance = ad.reach / prev.reach - 1;
          if (masCaro >= CAMBIO_MINIMO && menosAlcance <= -0.1) {
            lista.push({
              id: `desgaste:${clave(ad.key)}`,
              hito: 'desgaste',
              tono: 'amber',
              titulo: `Renovar «${ad.ad}»: cuesta ${pct(masCaro)} y llega a ${pct(menosAlcance)} de gente`,
              porque: `${costo(antes)} → ${costo(ahora)} por ${tipo.uno} con ${count(ad.reach)} de alcance (antes ${count(prev.reach)}): la misma pieza llegando a menos gente y más cara.`,
              donde: `Administrador de anuncios › Anuncios › ${ad.ad}`,
            });
            return;
          }
        }
      }
      if (finite(ad.frequency) && ad.frequency >= FRECUENCIA_ALTA) {
        lista.push({
          id: `frecuencia:${clave(ad.key)}`,
          hito: 'desgaste',
          tono: 'amber',
          titulo: `Renovar «${ad.ad}»: la misma gente ya la vio ${ad.frequency.toFixed(1)} veces`,
          porque: `${count(ad.impressions)} impresiones sobre ${count(ad.reach)} personas. Pasada la segunda vez, la pieza deja de sumar y empieza a cansar.`,
          donde: `Administrador de anuncios › Anuncios › ${ad.ad}`,
        });
      }
    });

    // 3 · Formato: video contra imagen dentro de la misma campaña.
    campanas.forEach(camp => {
      const tipo = tipoDe(camp);
      const suyos = anuncios.filter(ad => normalize(ad.campaign) === camp.key && valorDe(ad, tipo) > 0);
      if (suyos.length < 2) return;
      const porFormato = new Map();
      suyos.forEach(ad => {
        const arte = piezas[claveArte(ad.ad)];
        const formato = arte?.tipo === 'video' ? 'video' : arte ? 'imagen' : '';
        if (!formato) return;
        const actual = porFormato.get(formato) || { spend: 0, valor: 0, ads: [] };
        actual.spend += ad.spend;
        actual.valor += valorDe(ad, tipo);
        actual.ads.push(ad);
        porFormato.set(formato, actual);
      });
      if (porFormato.size < 2) return;
      const ranking = [...porFormato.entries()]
        .map(([formato, item]) => ({ formato, ...item, costo: item.spend / item.valor }))
        .sort((left, right) => left.costo - right.costo);
      const mejor = ranking[0];
      const peor = ranking[ranking.length - 1];
      // Mover S/ 13 de un formato a otro no es una accion, es ruido.
      if (peor.costo < mejor.costo * (1 + CAMBIO_MINIMO) || peor.spend < GASTO_MINIMO) return;
      lista.push({
        id: `formato:${clave(camp.key)}`,
        hito: 'formato',
        tono: 'amber',
        titulo: `Mover inversión de ${peor.formato} a ${mejor.formato} en ${corto(camp.campaign)}`,
        porque: `En ${mejor.formato} cada ${tipo.uno} sale ${costo(mejor.costo)} y en ${peor.formato} ${costo(peor.costo)}; hoy ${peor.formato} se lleva ${money(peor.spend)}.`,
        donde: `Administrador de anuncios › Conjuntos de ${camp.campaign} › Presupuesto`,
      });
      const lider = mejor.ads.sort((left, right) => costoDe(left, tipo) - costoDe(right, tipo))[0];
      if (lider) {
        lista.push({
          id: `variaciones:${clave(lider.key)}`,
          hito: 'formato',
          tono: 'green',
          titulo: `Producir variaciones de «${lider.ad}»`,
          porque: `Es la pieza más barata de ${corto(camp.campaign)}: ${costo(costoDe(lider, tipo))} por ${tipo.uno}.`,
          donde: `Administrador de anuncios › Anuncios › ${lider.ad}`,
        });
      }
    });

    // 4 · Escalar y repetir.
    campanas.forEach(camp => {
      const prev = previasCamp.get(camp.key);
      if (!prev || camp.spend < GASTO_MINIMO) return;
      const tipo = tipoDe(camp);
      const ahora = costoDe(camp, tipo);
      const antes = costoDe(prev, tipo);
      if (!finite(ahora) || !finite(antes)) return;
      const cambio = ahora / antes - 1;
      if (cambio > -CAMBIO_MINIMO) return;
      const dias = new Set(camp.filas.filter(activa).map(row => row.d)).size || 1;
      const diario = camp.spend / dias;
      lista.push({
        id: `escalar:${clave(camp.key)}`,
        hito: 'escalar',
        tono: 'green',
        titulo: `Subir la inversión de ${corto(camp.campaign)} de ${money(diario)} a ${money(diario * 1.2)} por día`,
        porque: `Su costo por ${tipo.uno} bajó ${Math.round(Math.abs(cambio) * 100)}% (${costo(antes)} → ${costo(ahora)}): es donde el dinero rinde mejor este mes.`,
        donde: `Administrador de anuncios › Campañas › ${camp.campaign} › Presupuesto`,
      });
    });

    return lista;
  }

  // ── Pintado ────────────────────────────────────────────────────────────────
  function render() {
    const host = document.getElementById('acciones-lista');
    if (!host) return;
    const sub = document.getElementById('acciones-sub');
    const nota = document.getElementById('acciones-nota');
    const estado = document.getElementById('acciones-estado');
    cargar();

    const period = periodo();
    if (!period) {
      host.innerHTML = '<p class="acciones-vacio">Sin datos del mes para sugerir acciones.</p>';
      if (sub) sub.textContent = 'Lo que toca hacer en Meta Ads, con las cifras del mes.';
      if (estado) estado.textContent = '';
      return;
    }

    const { hito, dia, enCurso } = hitoDe(period);
    const lista = acciones(period).sort((left, right) => {
      const suyo = item => (item.hito === hito.key ? -1 : ORDEN.indexOf(item.hito));
      const tono = { red: 0, amber: 1, green: 2 };
      return suyo(left) - suyo(right) || tono[left.tono] - tono[right.tono];
    });

    if (sub) {
      sub.textContent = `${hito.semana} · ${hito.titulo}. ${enCurso ? `Día ${dia} de ${period.dias}` : `${period.nombre} ya cerró: se lee con su último día`}.`;
    }
    const contar = () => lista.filter(item => marcada(period.mes, item.id)).length;
    if (estado) estado.textContent = lista.length ? `${contar()} de ${lista.length} hechas` : '';
    if (nota) {
      nota.textContent = 'Lo marcado se guarda solo en este navegador: otra persona no lo ve. Las acciones del hito de esta semana van primero, pero no se esconde ninguna.';
    }

    if (!lista.length) {
      host.innerHTML = `<p class="acciones-vacio">Nada que corregir con las cifras de ${esc(period.nombre.toLowerCase())}: ninguna campaña se salió de su costo y ninguna pieza muestra desgaste.</p>`;
      return;
    }

    host.innerHTML = lista.map(item => {
      const hecha = marcada(period.mes, item.id);
      const suHito = HITOS.find(h => h.key === item.hito);
      return `
        <label class="accion ${esc(item.tono)}${hecha ? ' hecha' : ''}">
          <input type="checkbox" data-accion="${esc(item.id)}"${hecha ? ' checked' : ''}>
          <span class="accion-cuerpo">
            <span class="accion-titulo">${esc(item.titulo)}</span>
            <span class="accion-porque">${esc(item.porque)}</span>
            <span class="accion-donde">${esc(item.donde)}</span>
          </span>
          <span class="accion-hito">${esc(suHito ? suHito.titulo : item.hito)}</span>
        </label>`;
    }).join('');

    host.querySelectorAll('[data-accion]').forEach(input => {
      input.addEventListener('change', () => {
        marcar(period.mes, input.dataset.accion, input.checked);
        input.closest('.accion')?.classList.toggle('hecha', input.checked);
        if (estado) estado.textContent = `${contar()} de ${lista.length} hechas`;
      });
    });
  }

  window.AmadorAcciones = { render, acciones };
})();
