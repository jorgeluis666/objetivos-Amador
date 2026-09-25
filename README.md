# Amador | Gasto publicitario 2026

Dashboard de Agencia Lima Retail para controlar la inversion publicitaria de Amador.

Version actual: `v1.13.0`.

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
- Proyecciones: cierre de mes estimado con los datos reales y simulador de objetivo.
- Historico de Campanas finalizadas.
- Archivo de Reportes: catalogo de los documentos guardados en la carpeta de Google Drive.

El panel lateral se puede minimizar con el boton de la barra superior: en escritorio queda una franja de iconos de 88px (con el nombre del modulo como tooltip) y en pantallas de 900px o menos se oculta por completo. El estado se recuerda en `localStorage` (`rb-sidebar-collapsed`).

El tablero solo muestra los modulos activos: los modulos pendientes (Comparativo YoY, Distribucion, Productos Web, Usuarios y Claves) se retiraron del menu el 24 de septiembre de 2026 junto con la calculadora de inversion por CPL.

## Datos

La fuente normalizada del dashboard esta en `data/amador-ads-2026.json`. Junio se cerro el 1 de julio de 2026 con los datos finales de `Distribucion-amador / Junio`; el CSV de respaldo esta en `data/csv-backups/`. Julio se cerro el 1 de septiembre de 2026 con los datos finales de `Distribucion-amador / Julio` (`data/amador-july-sheet-2026.json`). Agosto se cerro el 1 de septiembre de 2026 desde `Distribucion-amador / Agosto` (`data/amador-august-sheet-2026.json`). Septiembre se inicio el 3 de septiembre de 2026 desde `Distribucion-amador / Septiembre` (`data/amador-september-sheet-2026.json`) y se actualizo el 17 de septiembre de 2026 con el acumulado del mes (gasto S/1,778.94; 308 mensajes; 16 reservas); la sincronizacion en vivo apunta a esa pestana por nombre de hoja. El spreadsheet esta compartido como "cualquier persona con el enlace / lector", que es lo que necesita la lectura del CSV publicado; si vuelve a restringirse, el boton Actualizar deja de funcionar y hay que refrescar el JSON a mano. Las pestanas de julio en adelante agrupan anuncios por `Conjunto de anuncios` (RTGT, P. Frio, P. Caliente, etc.), reflejado en el campo `adSet`.

## Proyecciones

El modulo Proyecciones lee los datos del modulo Gasto publicitario
a traves de `window.AmadorObjectives.snapshot()` y proyecta el cierre del mes en curso.

- El mes proyectado es el que corresponde a la fecha de corte (`cutoff`); si no tiene gasto, se usa el ultimo mes con datos.
- Ritmo diario = acumulado real / dias con datos; la proyeccion mantiene ese ritmo hasta el ultimo dia del mes.
- La linea de tiempo marca el dia de la ultima actualizacion y compara contra el presupuesto (inversion) o el objetivo de reservas.
- Cada sincronizacion con Google Sheets emite el evento `amador:data-updated` y el modulo se recalcula solo.
- Simulador de objetivo: el ultimo punto de la linea de tiempo es un nodo arrastrable. Al moverlo hacia el cierre deseado
  (o escribir el valor / usar "Llevar al objetivo") se recalcula el cierre de inversion, mensajes y reservas, el ritmo
  diario requerido para los dias restantes, la brecha contra presupuesto u objetivo y la inversion adicional.
  El escenario conserva la eficiencia real del mes (costo por mensaje, costo por reserva y tasa de reserva) y no permite
  cerrar por debajo de lo ya realizado. Doble clic sobre el nodo o "Restablecer" vuelve a la proyeccion lineal.

## Archivo de Reportes (Google Drive)

El modulo lee `data/amador-drive-reports.json`, un catalogo de la carpeta compartida
`Reportes Amador` (https://drive.google.com/drive/folders/1zqSfc2MlfsWYd3rfYgFWBgQwbrz6-R2b).
Cada entrada guarda `id`, `title`, `mimeType`, `sizeBytes`, `createdTime` y `modifiedTime` tal como los devuelve Drive;
el tipo de documento, el periodo y la version vigente se deducen en el navegador a partir del nombre del archivo.

Para incorporar nuevos documentos basta con agregar su bloque al arreglo `files` y actualizar `syncedAt`.
La vista previa usa el visor de Drive (`/preview`), por lo que el usuario debe tener acceso a la carpeta.

### Validar sincronizacion

El boton **Validar sincronizacion** del modulo revisa:

1. Que el catalogo publicado (`data/amador-drive-reports.json`) sea el mismo que se muestra; si hay uno mas nuevo lo recarga.
2. La integridad de los registros (campos obligatorios, IDs duplicados, fechas validas).
3. La antiguedad del ultimo corte (`syncedAt`): avisa si supera 3 dias.
4. En vivo contra la carpeta de Drive: documentos nuevos sin catalogar, eliminados que siguen en el catalogo y
   modificados (nombre, peso o fecha). Las filas afectadas se marcan en la tabla.

La comparacion en vivo usa el Web App de solo lectura `scripts/drive-reports-sync.gs` (archivo `Validar Drive.gs`
del proyecto de Apps Script "Distribucion Amador", implementado como Aplicacion web: ejecutar como el propietario,
acceso "Cualquier usuario"). Su URL `/exec` va fija en `DRIVE_SYNC_ENDPOINT` (`js/reports-archive.js`); no se lee
de la URL ni de localStorage. Sin ella, el boton hace las tres primeras validaciones y avisa que no pudo consultar Drive.

Medidas de seguridad del Web App: carpeta fija en el script (la peticion no puede pedir otra), solo la accion
`listDriveFolder`, sin escritura, respuesta limitada a id/nombre/tipo/peso/fechas, maximo 30 peticiones por minuto,
cache de 60 s y errores genericos hacia el cliente. El tablero solo acepta URLs `https://script.google.com/macros/s/.../exec`,
no envia cookies y descarta cualquier campo inesperado de la respuesta. Al cambiar el script hay que publicar una
**nueva version** de la implementacion existente (Implementar > Gestionar implementaciones > editar) para conservar la URL.

## Sincronizacion de escritura con Google Sheets

El tablero puede leer el CSV publicado de Google Sheets, pero necesita un puente autorizado para escribir cambios de vuelta en el spreadsheet. Para activar la edicion sincronizada de `Objetivo Reservas`:

1. Crear un proyecto de Apps Script vinculado al Google Sheet.
2. Copiar el contenido de `scripts/google-sheets-sync.gs`.
3. Publicarlo como Web App con ejecucion como propietario y acceso permitido a los usuarios que usaran el panel.
   El script solo escribe en las pestañas mensuales del spreadsheet fijado en `SPREADSHEET_ID` y solo acepta enteros entre 0 y 100000.
4. Pegar la URL `https://script.google.com/macros/s/.../exec` en `SHEET_SYNC_ENDPOINT` (`js/objectives.js`) y volver a publicar.
   Ya no se acepta desde `?sheetSyncEndpoint=` ni desde localStorage: un enlace manipulado podia desviar los datos a un tercero.

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

El resultado se genera en `dist/`: `index.html` (CSS, JS y datos incrustados), `assets/`, `data/amador-drive-reports.json` y `.htaccess`.
Nada mas: `data/csv-backups`, `scripts/` y el resto del repo nunca se publican.

## Publicacion en el hosting de Lima Retail

El acceso lo controla Apache con HTTP Basic Auth (una cuenta por cliente). No hay contraseña en el HTML.
`dist/.htaccess` se genera desde `deploy/.htaccess` con la ruta del archivo de claves y una CSP con el hash de cada script.

Configuracion unica en cPanel:

1. **Dominios** > activar **Forzar redireccion HTTPS** para el dominio o subdominio del cliente.
2. **Privacidad de directorios** > carpeta del cliente > activar proteccion y crear el usuario del cliente
   con una contraseña larga y aleatoria. cPanel crea el archivo de claves en
   `/home/<usuario_cpanel>/.htpasswds/<ruta_de_la_carpeta>/passwd`.
3. En GitHub > Settings > Secrets and variables > Actions, crear:
   - `HTPASSWD_PATH`: la ruta absoluta del paso 2.
   - `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`: una cuenta FTP limitada a la carpeta del cliente.
   - `FTP_SERVER_DIR`: carpeta destino relativa a esa cuenta, terminada en `/` (por ejemplo `./`).
4. Desactivar GitHub Pages (Settings > Pages) y dejar el repositorio en privado: los datos del cliente no deben quedar publicos.

Cada push a `main` ejecuta `.github/workflows/deploy-hosting.yml`, que compila y sube `dist/` por FTPS.
Si falta `HTPASSWD_PATH` el build falla; si la ruta es incorrecta Apache responde 500 en vez de mostrar el tablero sin clave.
