(function () {
  // Utilidades comunes de los modulos del tablero (window.AmadorShared): escape, formatos, fechas en hora de Lima,
  // descarga de archivos y conservacion del foco al repintar. Se carga antes que los demas js/.
  const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const SHORT_MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const TIMEZONE = 'America/Lima';
  // Lima no tiene horario de verano: siempre UTC-5.
  const LIMA_OFFSET_HOURS = -5;

  // Los textos vienen del Google Sheet y de Drive (editables por terceros): siempre se escapan antes de ir a innerHTML.
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  // Solo enlaces https; descarta http, javascript:, data:, etc.
  const safeUrl = value => (/^https:\/\//i.test(String(value || '').trim()) ? esc(String(value).trim()) : '');
  const finite = value => value != null && value !== '' && Number.isFinite(Number(value));

  // toLocaleString con opciones arma un Intl.NumberFormat en cada llamada: se guarda uno por cantidad de decimales.
  const numberFormats = new Map();
  function formatNumber(value, min, max) {
    const key = `${min}|${max}`;
    if (!numberFormats.has(key)) numberFormats.set(key, new Intl.NumberFormat('es-PE', { minimumFractionDigits: min, maximumFractionDigits: max }));
    return numberFormats.get(key).format(Number(value));
  }
  const fmt = {
    money: value => (finite(value) ? `S/. ${formatNumber(value, 2, 2)}` : '-'),
    count: value => (finite(value) ? formatNumber(Math.round(Number(value)), 0, 0) : '-'),
    decimal: (value, digits = 2) => (finite(value) ? formatNumber(value, digits, digits) : '-'),
    pct: (value, digits = 1) => (finite(value) ? `${formatNumber(value, digits, digits)}%` : '-'),
    // Costos de centavos con mas decimales para que no queden en 0.01.
    unitCost: value => (finite(value) && Number(value) > 0 && Number(value) < 0.1 ? `S/. ${formatNumber(value, 3, 4)}` : fmt.money(value)),
  };

  // Variacion porcentual; null si no hay base para comparar.
  function change(current, previous) {
    if (!finite(current) || !finite(previous) || Number(previous) === 0) return null;
    return ((Number(current) - Number(previous)) / Number(previous)) * 100;
  }

  // Lo que se muestra: un anuncio cuenta si tuvo gasto propio, mensajes o reservas; campanas y conjuntos se filtran
  // por gasto (hasSpend). Sirve para filas y para agregados.
  const hasActivity = item => Number(item?.spend) > 0 || Number(item?.messages) > 0 || Number(item?.reservations) > 0;
  const hasSpend = item => Number(item?.spend) > 0;

  // ── Fechas en hora de Lima ─────────────────────────────────────────────
  function limaParts(date = new Date()) {
    const shifted = new Date(date.getTime() + LIMA_OFFSET_HOURS * 3600 * 1000);
    return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate(), hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes() };
  }

  const monthKey = (year, monthIndex) => `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const daysInMonth = (year, monthIndex) => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

  // "sab, 11 oct, 09:40" en hora de Lima.
  function formatStamp(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    try {
      return date.toLocaleString('es-PE', { timeZone: TIMEZONE, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch {
      return date.toLocaleString('es-PE');
    }
  }

  // Descarga un archivo armado en el navegador (Exportar de Bitacora y Usuarios).
  function download(fileName, content, mimeType) {
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Lo que identifica a un control entre dos render: el id o, sin id, tag, name, value (radio/checkbox) y data-*.
  function focusTarget(node) {
    const type = node.tagName === 'INPUT' ? node.type : '';
    return {
      id: node.id,
      tagName: node.tagName,
      name: node.getAttribute('name'),
      value: type === 'radio' || type === 'checkbox' ? node.value : null,
      data: [...node.attributes].filter(attr => attr.name.startsWith('data-')).map(attr => `${attr.name}=${attr.value}`).sort().join('\n'),
    };
  }

  function textSelection(node) {
    if (node.tagName !== 'INPUT' && node.tagName !== 'TEXTAREA') return null;
    try {
      // Los tipos sin seleccion (number, email, checkbox...) devuelven null o lanzan.
      return typeof node.selectionStart === 'number'
        ? { start: node.selectionStart, end: node.selectionEnd, direction: node.selectionDirection || 'none' }
        : null;
    } catch {
      return null;
    }
  }

  // Un render que reemplaza el HTML de root no debe sacar al usuario del control en el que estaba: se enfoca el
  // control equivalente del HTML nuevo y se le devuelve la seleccion de texto.
  function keepFocus(root, render) {
    const active = document.activeElement;
    if (!root || !active || active === root || !root.contains(active)) return render();
    const target = focusTarget(active);
    const selection = textSelection(active);
    const result = render();
    if (document.activeElement === active) return result;
    const match = target.id
      ? [...root.querySelectorAll('[id]')].find(node => node.id === target.id)
      : [...root.querySelectorAll(target.tagName)].find(node => {
        const candidate = focusTarget(node);
        return candidate.name === target.name && candidate.value === target.value && candidate.data === target.data;
      });
    if (!match) return result;
    match.focus({ preventScroll: true });
    if (selection && textSelection(match)) {
      try {
        match.setSelectionRange(selection.start, selection.end, selection.direction);
      } catch {
        // El campo nuevo no admite seleccion: queda enfocado con el cursor donde lo deje el navegador.
      }
    }
    return result;
  }

  window.AmadorShared = {
    MONTHS,
    SHORT_MONTHS,
    esc,
    safeUrl,
    finite,
    fmt,
    change,
    hasActivity,
    hasSpend,
    limaParts,
    monthKey,
    daysInMonth,
    formatStamp,
    download,
    keepFocus,
  };
})();
