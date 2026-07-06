# Amador | Gasto publicitario 2026

Dashboard de Agencia Lima Retail para controlar la inversion publicitaria de Amador.

Version actual: `v1.4.0`.

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

La fuente normalizada del dashboard esta en `data/amador-ads-2026.json`. Junio se cerro el 1 de julio de 2026 con los datos finales de `Distribucion-amador / Junio`; el CSV de respaldo esta en `data/csv-backups/`. Julio se sincronizo el 6 de julio de 2026 desde la pestana `Distribucion-amador / Julio` (`data/amador-july-sheet-2026.json`); la sincronizacion en vivo apunta a esa pestana por nombre de hoja.

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
