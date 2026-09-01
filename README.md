# Amador | Gasto publicitario 2026

Dashboard de Agencia Lima Retail para controlar la inversion publicitaria de Amador.

Version actual: `v1.6.0`.

## Versionado

El proyecto usa la nomenclatura `vMAJOR.MINOR.PATCH`:

- `MAJOR`: cambios incompatibles o una nueva etapa del tablero.
- `MINOR`: nuevos modulos, indicadores o funciones compatibles.
- `PATCH`: correcciones visuales, de datos o funcionamiento.

## Modulo activo

- Gasto mensual total.
- Distribucion entre Branding y Ventas.
- Campanas por mes.
- Estado, objetivo, presupuesto, gasto, importe diario y URL de anuncios.

Los modulos Comparativo YoY, Distribucion, Productos Web y Usuarios y Claves se muestran deshabilitados hasta su futura implementacion.

## Datos

La fuente normalizada del dashboard esta en `data/amador-ads-2026.json`. Junio se cerro el 1 de julio de 2026 con los datos finales de `Distribucion-amador / Junio`; el CSV de respaldo esta en `data/csv-backups/`. Julio se cerro el 1 de septiembre de 2026 con los datos finales de `Distribucion-amador / Julio` (`data/amador-july-sheet-2026.json`). Agosto se cerro el 1 de septiembre de 2026 desde `Distribucion-amador / Agosto` (`data/amador-august-sheet-2026.json`); la sincronizacion en vivo apunta a esa pestana por nombre de hoja. Las pestanas de julio en adelante agrupan anuncios por `Conjunto de anuncios` (RTGT, P. Frio, P. Caliente, etc.), reflejado en el campo `adSet`.

## Sincronizacion de escritura con Google Sheets

GitHub Pages puede leer el CSV publicado de Google Sheets, pero necesita un puente autorizado para escribir cambios de vuelta en el spreadsheet. Para activar la edicion sincronizada de `Objetivo Reservas`:

1. Crear un proyecto de Apps Script vinculado al Google Sheet.
2. Copiar el contenido de `scripts/google-sheets-sync.gs`.
3. Publicarlo como Web App con ejecucion como propietario y acceso permitido a los usuarios que usaran el panel.
4. Abrir el dashboard una vez con `?sheetSyncEndpoint=URL_DE_LA_WEB_APP`. El panel guardara ese endpoint en el navegador.

Desde ese momento, los cambios en `Objetivo Reservas` se actualizan localmente y se envian al Sheet.

## Desarrollo

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

El resultado para GitHub Pages se genera en `dist/`.
