# Amador | Gasto publicitario 2026

Dashboard de Agencia Lima Retail para controlar la inversion publicitaria de Amador.

Version actual: `v1.9.2`.

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
- Proyecciones: cierre de mes estimado con los datos reales y calculadora de inversion por CPL.
- Historico de Campanas finalizadas.
- Archivo de Reportes: catalogo de los documentos guardados en la carpeta de Google Drive.

Los modulos Comparativo YoY, Distribucion, Productos Web y Usuarios y Claves se muestran deshabilitados hasta su futura implementacion.

## Datos

La fuente normalizada del dashboard esta en `data/amador-ads-2026.json`. Junio se cerro el 1 de julio de 2026 con los datos finales de `Distribucion-amador / Junio`; el CSV de respaldo esta en `data/csv-backups/`. Julio se cerro el 1 de septiembre de 2026 con los datos finales de `Distribucion-amador / Julio` (`data/amador-july-sheet-2026.json`). Agosto se cerro el 1 de septiembre de 2026 desde `Distribucion-amador / Agosto` (`data/amador-august-sheet-2026.json`). Septiembre se inicio el 3 de septiembre de 2026 desde `Distribucion-amador / Septiembre` (`data/amador-september-sheet-2026.json`) y se actualizo el 17 de septiembre de 2026 con el acumulado del mes (gasto S/1,778.94; 308 mensajes; 16 reservas); la sincronizacion en vivo apunta a esa pestana por nombre de hoja. El spreadsheet esta compartido como "cualquier persona con el enlace / lector", que es lo que necesita la lectura del CSV publicado; si vuelve a restringirse, el boton Actualizar deja de funcionar y hay que refrescar el JSON a mano. Las pestanas de julio en adelante agrupan anuncios por `Conjunto de anuncios` (RTGT, P. Frio, P. Caliente, etc.), reflejado en el campo `adSet`.

## Proyecciones

El modulo Proyecciones (antes Calculadora de Mensajes) lee los datos del modulo Gasto publicitario
a traves de `window.AmadorObjectives.snapshot()` y proyecta el cierre del mes en curso.

- El mes proyectado es el que corresponde a la fecha de corte (`cutoff`); si no tiene gasto, se usa el ultimo mes con datos.
- Ritmo diario = acumulado real / dias con datos; la proyeccion mantiene ese ritmo hasta el ultimo dia del mes.
- La linea de tiempo marca el dia de la ultima actualizacion y compara contra el presupuesto (inversion) o el objetivo de reservas.
- Cada sincronizacion con Google Sheets emite el evento `amador:data-updated` y el modulo se recalcula solo.

## Archivo de Reportes (Google Drive)

El modulo lee `data/amador-drive-reports.json`, un catalogo de la carpeta compartida
`Reportes Amador` (https://drive.google.com/drive/folders/1zqSfc2MlfsWYd3rfYgFWBgQwbrz6-R2b).
Cada entrada guarda `id`, `title`, `mimeType`, `sizeBytes`, `createdTime` y `modifiedTime` tal como los devuelve Drive;
el tipo de documento, el periodo y la version vigente se deducen en el navegador a partir del nombre del archivo.

Para incorporar nuevos documentos basta con agregar su bloque al arreglo `files` y actualizar `syncedAt`.
La vista previa usa el visor de Drive (`/preview`), por lo que el usuario debe tener acceso a la carpeta.

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
