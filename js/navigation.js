(function () {
  const VIEW_KEY = 'amador-active-view';
  const VIEW_META = {
    'view-obj': {
      // El año es el que se esta viendo (js/objectives.js lo actualiza al cambiar de año).
      title: () => `Gasto publicitario ${window.AmadorObjectives?.viewYear?.() || new Date().getFullYear()}`,
      source: 'Fuente: Distribucion-amador (Google Sheets)',
      footer: 'Sincronizado por Agencia Lima Retail',
    },
    'view-ads': {
      title: 'Anuncios',
      source: 'Fuente: Descargas de Meta Ads (Drive)',
      footer: 'Reservas web: compras en el sitio web que Meta atribuye a cada anuncio',
    },
    'view-messages': {
      title: 'Proyecciones',
      source: 'Fuente: Gasto publicitario / Distribucion-amador',
      footer: 'Proyección lineal según el ritmo del mes',
    },
    'view-history': {
      title: 'Histórico de Campañas',
      source: 'Fuente: Distribucion-amador / Histórico consolidado',
      footer: 'Gasto de cada campaña mes a mes y acumulado',
    },
    'view-reports': {
      title: 'Archivo de Reportes',
      source: 'Fuente: Carpeta compartida Reportes Amador / Google Drive',
      footer: 'Vista previa y descarga directa desde Drive',
    },
    'view-week': {
      parent: 'view-reports',   // va dentro de Archivo de Reportes, con su pestaña
      title: 'Archivo de Reportes',
      source: 'Fuente: descargas de Meta Ads / carpeta Reportes de Drive',
      footer: 'El mes elegido, semana a semana',
    },
    'view-log': {
      title: 'Bitácora',
      source: 'Fuente: Bitácora del equipo de Agencia Lima Retail',
      footer: 'Las ediciones quedan como borrador hasta exportar y publicar el archivo',
    },
  };

  function storedView() {
    try {
      const value = window.localStorage.getItem(VIEW_KEY);
      return VIEW_META[value] ? value : 'view-obj';
    } catch {
      return 'view-obj';
    }
  }

  function saveView(viewId) {
    try {
      window.localStorage.setItem(VIEW_KEY, viewId);
    } catch {
      // La navegación sigue funcionando aunque localStorage no esté disponible.
    }
  }

  function showView(viewId) {
    const meta = VIEW_META[viewId] || VIEW_META['view-obj'];
    document.querySelectorAll('.view').forEach(view => {
      view.classList.toggle('visible', view.id === viewId);
    });
    // El menú marca el módulo; las pestañas de adentro, la sección abierta.
    document.querySelectorAll('[data-view-target]').forEach(button => {
      const target = button.dataset.viewTarget;
      const active = target === viewId || (button.classList.contains('s-item') && target === meta.parent);
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });

    document.getElementById('topbar-title').textContent = typeof meta.title === 'function' ? meta.title() : meta.title;
    // La bajada repite la descripcion del modulo en el panel lateral, como en Royal Baby.
    const desc = document.querySelector(`.s-item[data-view-target="${meta.parent || viewId}"] .s-desc-nav`);
    document.getElementById('topbar-caption').textContent = desc ? desc.textContent.trim() : '';
    document.getElementById('footer-source').textContent = meta.source;
    document.getElementById('footer-status').textContent = meta.footer;
    saveView(viewId);

    if (viewId === 'view-messages') window.AmadorProjections?.init();
    if (viewId === 'view-reports') window.ReportsArchive?.init();
    if (viewId === 'view-week') window.ReporteSemanal?.init();
    if (viewId === 'view-log') window.Bitacora?.init();
  }

  function initNavigation() {
    document.querySelectorAll('[data-view-target]').forEach(button => {
      button.addEventListener('click', () => showView(button.dataset.viewTarget));
    });
    showView(storedView());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavigation);
  } else {
    initNavigation();
  }
})();
