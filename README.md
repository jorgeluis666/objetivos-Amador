# Amador | Gasto publicitario 2026

Dashboard de Agencia Lima Retail para controlar la inversion publicitaria de Amador.

Version actual: `v1.18.0`.

## Versionado

El proyecto usa la nomenclatura `vMAJOR.MINOR.PATCH`:

- `MAJOR`: cambios incompatibles o una nueva etapa del tablero.
- `MINOR`: nuevos modulos, indicadores o funciones compatibles.
- `PATCH`: correcciones visuales, de datos o funcionamiento.

## Modulo activo

- Gasto mensual total, con pestanas por mes y una pestana Anual (acumulado de los meses con datos).
- Periodo y resumen ejecutivo en una tarjeta: inversion, mensajes, costo por mensaje, reservas y costo por reserva, con su variacion contra el mes anterior completo (en la vista anual, el promedio mensual de los meses cerrados).
- Campanas en un solo marco: distribucion de la inversion por campana y, debajo, un cuadro por objetivo con sus KPIs contra el mes anterior y sus conjuntos de anuncios (ver "Gasto publicitario: campanas").
- Anuncios del periodo con columnas ancladas, filtro por objetivo, densidad compacta y pantalla completa.
- Proyecciones: cierre de mes estimado con los datos reales y simulador de objetivo.
- Historico de Campanas finalizadas.
- Archivo de Reportes: catalogo de los documentos guardados en la carpeta de Google Drive.
- Bitacora: checklist mensual de cambios, comentarios y decisiones de la cuenta.
- Usuarios y Claves: directorio de las cuentas con acceso al tablero, sin contrasenas (ver "Usuarios y Claves").

La barra superior muestra el estado de los datos ("Datos de Septiembre | leidos ...", en ambar si se ve la copia guardada o no hay conexion con Google Sheets). Al pulsarla se abre el detalle: datos y su corte, ultima y proxima lectura, pestanas leidas, fuente y un aviso (sin conexion, copia guardada, Objetivo Reservas o mes en curso). Su boton **Actualizar** es el unico del tablero: relee la hoja y sincroniza el Archivo de Reportes con Drive.

El panel lateral se puede minimizar con el boton de la barra superior: en escritorio queda una franja de iconos de 88px (con el nombre del modulo como tooltip) y en pantallas de 900px o menos se oculta por completo. El estado se recuerda en `localStorage` (`rb-sidebar-collapsed`).

El tablero solo muestra los modulos activos: los modulos pendientes (Comparativo YoY, Distribucion, Productos Web) se retiraron del menu el 24 de septiembre de 2026 junto con la calculadora de inversion por CPL. Usuarios y Claves volvio como modulo activo el 29 de septiembre de 2026.

## Datos

La fuente normalizada del dashboard esta en `data/amador-ads-2026.json` (enero a mayo y la fecha de la ultima copia) y en una copia por pestana mensual de `Distribucion-amador` (`data/amador-<mes>-sheet-2026.json`: junio, julio, agosto y septiembre). El build incrusta todas las copias mensuales que haya en `data/`; en desarrollo se piden las de la lista `SHEET_FILES` de `js/objectives.js`. Junio, julio y agosto estan guardados con sus datos finales; la copia de septiembre es la del 17 de septiembre de 2026 (gasto S/1,778.94; 308 mensajes; 16 reservas) y la lectura en vivo la reemplaza por la pestana actual. Las pestanas de julio en adelante agrupan anuncios por `Conjunto de anuncios` (RTGT, P. Frio, P. Caliente, etc.), reflejado en el campo `adSet`.

Lectura en vivo: al abrir el tablero, cada hora y con el boton Actualizar se leen el CSV publicado de la pestana del mes en curso y la del mes anterior (hora de Lima), por nombre de hoja (`Octubre`, `Septiembre`...). Si la pestana del mes todavia no existe, Google devuelve la primera hoja (Junio): el tablero la descarta porque la mayoria de sus fechas no cae en el mes pedido, y sigue mostrando el mes anterior. Al volver a la pestana del navegador solo se relee si la ultima lectura tiene mas de 5 minutos; una lectura que trae lo mismo no repinta. Si Google no responde en 30 s o falla, se mantienen los ultimos datos y se emite `amador:data-error` (`detail.error`). Las copias de `data/` solo hacen falta como respaldo: un mes nuevo aparece en cuanto existe su pestana.

Fecha de corte: un mes cuyo ultimo dia ya paso en Lima esta cerrado y su corte es ese ultimo dia; el mes en curso corta en el dia de la ultima lectura en vivo (o en la fecha de `data/amador-ads-2026.json` si solo esta la copia guardada).

El spreadsheet esta compartido como "cualquier persona con el enlace / lector", que es lo que necesita la lectura del CSV publicado; si vuelve a restringirse, la lectura en vivo falla y el tablero muestra las copias de `data/`.

## Gasto publicitario: campanas

- **Solo lo que tuvo actividad**: campanas y conjuntos con gasto; anuncios con gasto propio, mensajes o reservas (sin heredar el gasto del conjunto). Lo demas no se muestra ni se menciona.
- **Objetivo (cuadro)**: el de la campana en la hoja (Reservas, Mensajes, Clics, Thruplays...). Junio lo trae por anuncio y en texto libre: cuenta la primera palabra ("Reservas/Mensajes" = Reservas) y, si los anuncios de una campana difieren, el de mayor gasto. Reservas va en naranja, Mensajes en verde y Branding (Reconocimiento, Thruplays) en violeta; otro objetivo toma un color fijo.
- **Granularidad de la hoja**: desde julio el gasto viene por conjunto (en su primera fila) y las reservas, el objetivo y las fechas por campana; mensajes y estado por anuncio. Junio trae gasto y reservas por anuncio y no tiene conjuntos; marzo a mayo solo campanas; enero y febrero solo el gasto total. Por eso los conjuntos muestran gasto y mensajes, y desde julio los anuncios muestran "Por conjunto" / "Por campana" en gasto y reservas.
- **Distribucion**: una fila por campana con mensajes, reservas, **Objetivo Reservas** editable, costos, gasto, % de la inversion, presupuesto, saldo, fin y dias restantes y nuevo presupuesto diario, mas la fila "Total actualizado". En la vista anual las campanas se juntan por nombre exacto y el objetivo es la suma de los meses.
- **Comparacion**: contra el mes anterior completo. Conjuntos y anuncios se comparan por nombre dentro del objetivo; uno que no corria sale como "Nuevo". Sin detalle en el mes anterior (enero, febrero o junio para los conjuntos) no hay comparacion.
- **Objetivo Reservas**: lo editado se guarda en este navegador por mes y campana (`localStorage`, clave `amador-reservation-goals-v2`, "2026-09::Campana"); los valores de la version anterior (`-v1`, sin mes) pasan a cada mes en que aparece la campana. Proyecciones lo usa como referencia.
- **Filas propias**: "Agregar campana" (distribucion) y "Agregar un anuncio a..." (anuncios) guardan filas de nota en este navegador (`amador-custom-rows-v1`), sin cifras de la hoja.
- Minimizado de cada cuadro en `amador-campaign-charts-v1` y densidad de la tabla de anuncios en `amador-campaigns-compact-v1`.

## Proyecciones

El modulo Proyecciones lee los datos del modulo Gasto publicitario
a traves de `window.AmadorObjectives.snapshot()` y proyecta el cierre del mes en curso.

- El mes proyectado es el ultimo con gasto; si ya cerro (calendario de Lima) se muestra completo y el simulador no aplica.
- Ritmo diario = acumulado real / dias con datos; la proyeccion mantiene ese ritmo hasta el ultimo dia del mes.
- La linea de tiempo marca el dia de la ultima actualizacion y compara contra el presupuesto (inversion) o el objetivo de reservas.
- Cada sincronizacion con Google Sheets emite el evento `amador:data-updated` y el modulo se recalcula solo.
- Simulador de objetivo: el ultimo punto de la linea de tiempo es un nodo arrastrable. Al moverlo hacia el cierre deseado
  (o escribir el valor / usar "Llevar al objetivo") se recalcula el cierre de inversion, mensajes y reservas, el ritmo
  diario requerido para los dias restantes, la brecha contra presupuesto u objetivo y la inversion adicional.
  El escenario conserva la eficiencia real del mes (costo por mensaje, costo por reserva y tasa de reserva) y no permite
  cerrar por debajo de lo ya realizado. Doble clic sobre el nodo o "Restablecer" vuelve a la proyeccion lineal.

## Bitacora

Checklist mensual de cambios, comentarios y decisiones de la cuenta (`js/bitacora.js`). Lo publicado sale de
`data/amador-bitacora-2026.json`, que el build incrusta en el HTML como `window.AMADOR_BITACORA` (dist/ no lleva ese
archivo). Formato:

```json
{ "year": 2026, "updatedAt": "2026-09-29", "items": [
  { "id": "b01", "date": "2026-09-01", "type": "cambio", "platform": "meta", "done": true, "text": "..." }
] }
```

- `type`: `cambio`, `comentario` o `decision` (otro valor se lee como `comentario`).
- `platform`: clave de `PLATFORMS` en `js/bitacora.js` (`general`, `meta`); para agregar una plataforma se edita esa
  lista, el select del formulario en `index.html` y su color en `css/dashboard.css` (`.log-tag.platform.<clave>`).
- `date` (`YYYY-MM-DD`) define el mes en que se agrupa el item; `done` marca la casilla.

Flujo editar -> exportar -> publicar: lo que se agrega o edita en el tablero queda como borrador en ese navegador
(`localStorage`, clave `amador-bitacora-draft`). **Exportar** descarga `amador-bitacora-2026.json` con `updatedAt` de hoy;
para publicarlo se reemplaza el archivo en `data/`, se hace commit y se despliega. El borrador guarda el `updatedAt`
sobre el que se hizo y se ignora cuando se publica una version nueva del archivo.

## Usuarios y Claves

Directorio de quien tiene acceso al tablero (`js/usuarios.js`). Las claves las valida Apache (ver "Publicacion en el
hosting de Lima Retail") y **nunca** se guardan en el repo ni en el HTML: esta vista solo lleva nombre, usuario de
acceso, rol, fecha de alta y estado. La version publicada es `data/amador-usuarios-2026.json` (el build la incrusta
como `window.AMADOR_USUARIOS`; dist/ no lleva ese archivo).

```json
{ "updatedAt": "2026-09-29", "users": [
  { "id": "u01", "name": "Nombre Apellido", "user": "cliente-amador", "role": "cliente", "status": "activo", "since": "2026-09-29" }
] }
```

- `role`: `cliente`, `equipo` o `admin` (otro valor se lee como `cliente`).
- `status`: `activo` o `suspendido`. `user` se guarda en minusculas y sin espacios ni `:` (igual que un usuario de Basic Auth).
- Se edita igual que la Bitacora: borrador en `localStorage` (clave `amador-usuarios-draft`), **Exportar** descarga
  `amador-usuarios-2026.json`, se reemplaza el archivo en `data/`, commit y despliegue.
- Dar, cambiar o quitar el acceso de verdad se hace en cPanel > Privacidad de directorios; la vista muestra los pasos.

## Archivo de Reportes (Google Drive)

El modulo lee `data/amador-drive-reports.json`, un catalogo de la carpeta compartida
`Reportes Amador` (https://drive.google.com/drive/folders/1zqSfc2MlfsWYd3rfYgFWBgQwbrz6-R2b).
Cada entrada guarda `id`, `title`, `mimeType`, `sizeBytes`, `createdTime` y `modifiedTime` tal como los devuelve Drive;
el tipo de documento, el periodo y la version vigente se deducen en el navegador a partir del nombre del archivo.

Para incorporar nuevos documentos basta con agregar su bloque al arreglo `files` y actualizar `syncedAt`.
La vista previa usa el visor de Drive (`/preview`), por lo que el usuario debe tener acceso a la carpeta.

### Sincronizar con Drive

El boton **Actualizar** de la barra superior (el mismo que relee la hoja) trae el contenido real de la carpeta y reemplaza en pantalla el catalogo
publicado: la tabla, los KPIs y los filtros se rearman con lo que hay en Drive en ese momento y el resultado
queda guardado en el navegador (`localStorage`, clave `amador-drive-reports-snapshot-v1`), asi que al volver
al modulo se ve ese listado y no el del ultimo build. El modulo tambien sincroniza solo al abrirse; en ese
caso el aviso verde aparece unicamente si hubo altas o bajas. Si Drive no responde, se mantiene lo que ya
estaba y se avisa en rojo.

`data/amador-drive-reports.json` sigue siendo el catalogo de respaldo: es lo que ve quien abre el tablero sin
que la Web App responda, por lo que conviene refrescarlo de vez en cuando con el listado de la carpeta.

La consulta usa el Web App de solo lectura `scripts/drive-reports-sync.gs` (archivo `Validar Drive.gs`
del proyecto de Apps Script "Distribucion Amador", implementado como Aplicacion web: ejecutar como el propietario,
acceso "Cualquier usuario"). Su URL `/exec` va fija en `DRIVE_SYNC_ENDPOINT` (`js/reports-archive.js`); no se lee
de la URL ni de localStorage. Sin ella, el modulo muestra el catalogo publicado y Actualizar avisa que falta configurarla.

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

## Publicacion en GitHub Pages con clave (actual)

`amador.limaretail.com` es un CNAME a `jorgeluis666.github.io`. Pages no puede pedir clave por servidor, asi que
`scripts/protect-pages.js` cifra el `dist/index.html` ya compilado (AES-256-GCM, clave PBKDF2-SHA256 de 600.000
iteraciones) y lo envuelve en `deploy/pages-gate.html`. El navegador solo lo descifra con la clave correcta: el
HTML publicado no lleva la clave, ni su hash, ni los datos en claro. Tambien quita `dist/.htaccess` y `dist/data/`
y agrega un `robots.txt` que bloquea buscadores.

- "Recordar en este equipo" guarda la clave derivada (no la escrita) en `localStorage`; sin marcarlo dura la sesion
  de la pestaña. Cada deploy usa otra sal, asi que despues de publicar todos vuelven a escribir la clave.
- Cambiar la clave = actualizar el secret y volver a publicar.
- Cualquiera puede descargar el HTML cifrado y probar claves sin limite en su propia maquina: la seguridad depende
  de que la clave sea larga y dificil de adivinar.
- Esto protege el sitio, no el repositorio: mientras el repo sea publico, `data/` se ve en github.com.

Configuracion unica en GitHub:

1. Settings > Secrets and variables > Actions > **New repository secret**: `DASHBOARD_PASSWORD` con la clave.
2. Settings > Pages > Build and deployment > Source: **GitHub Actions**. Asi deja de publicarse la raiz del repo.
3. Settings > Pages > Custom domain: `amador.limaretail.com` > Save; cuando GitHub emita el certificado,
   marcar **Enforce HTTPS** (la pagina de acceso necesita https para descifrar).

Cada push a `main` ejecuta `.github/workflows/deploy-pages.yml`. Si falta el secret, el build falla y no se publica nada.
Prueba local: `DASHBOARD_PASSWORD=<clave de prueba> npm run build:pages` y servir `dist/` en localhost.

## Publicacion en el hosting de Lima Retail (alternativa, manual)

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

`.github/workflows/deploy-hosting.yml` se ejecuta a mano (Actions > Run workflow), compila y sube `dist/` por FTPS.
Si falta `HTPASSWD_PATH` el build falla; si la ruta es incorrecta Apache responde 500 en vez de mostrar el tablero sin clave.
