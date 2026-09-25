(function () {
  const STORAGE_KEY = 'rb-sidebar-collapsed';
  const LEGACY_STORAGE_KEY = 'amador-sidebar-collapsed';

  function getStoredState() {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored !== null) return stored === '1';
      return window.localStorage.getItem(LEGACY_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  function saveState(collapsed) {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // El dashboard también debe funcionar si el navegador bloquea localStorage.
    }
  }

  function wireSidebarToggle() {
    const shell = document.querySelector('.shell');
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('sidebar-toggle');
    if (!shell || !sidebar || !toggle) return;

    const items = Array.from(sidebar.querySelectorAll('.s-item'));
    let collapsed = getStoredState();

    function render() {
      shell.classList.toggle('sidebar-collapsed', collapsed);
      toggle.setAttribute('aria-expanded', String(!collapsed));

      const label = collapsed ? 'Expandir panel' : 'Minimizar panel';
      toggle.setAttribute('aria-label', label);
      toggle.setAttribute('title', label);

      // En la franja minimizada solo quedan los íconos: el nombre del módulo pasa al tooltip.
      items.forEach(function (item) {
        const name = item.querySelector('.s-title-nav')?.textContent.trim();
        if (collapsed && name) {
          item.setAttribute('title', name);
          item.setAttribute('aria-label', name);
        } else {
          item.removeAttribute('title');
          item.removeAttribute('aria-label');
        }
      });
    }

    toggle.addEventListener('click', function () {
      collapsed = !collapsed;
      saveState(collapsed);
      render();

      // Los gráficos recalculan su ancho cuando termina la animación del panel.
      window.setTimeout(function () {
        window.dispatchEvent(new Event('resize'));
      }, 250);
    });

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireSidebarToggle);
  } else {
    wireSidebarToggle();
  }
})();
