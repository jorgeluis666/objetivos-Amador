# Amador | Gasto publicitario 2026

Dashboard de Agencia Lima Retail para controlar la inversion publicitaria de Amador.

Version actual: `v1.31.0`.

## Versionado

El proyecto usa la nomenclatura `vMAJOR.MINOR.PATCH`:

- `MAJOR`: cambios incompatibles o una nueva etapa del tablero.
- `MINOR`: nuevos modulos, indicadores o funciones compatibles.
- `PATCH`: correcciones visuales, de datos o funcionamiento.

Convenciones de pantalla (desde la v1.30.1, alineadas con Royal Baby): soles como `S/. 1,234.56`, un dato vacio como `—` (raya), meses "Septiembre"/"Sep" (las hojas e informes que dicen "Setiembre" o "Set" se siguen leyendo), tildes en todos los textos, pestaña del mes activa en los tonos de la marca (rojo) y tablas con numeros monoespaciados a la derecha.

## Modulo activo

- Gasto mensual total, con pestanas por mes y una pestana Anual (acumulado de los meses con datos).
- Periodo y resumen ejecutivo en una tarjeta: inversion, mensajes, costo por mensaje, reservas y costo por reserva, con su variacion contra el mes anterior completo (en la vista anual, el promedio mensual de los meses cerrados).
- Campanas en un solo marco: distribucion de la inversion por campana y, debajo, un cuadro por objetivo con sus KPIs contra el mes anterior, sus conjuntos y sus anuncios (ver "Gasto publicitario: campanas").
- Anuncios: modulo propio con el Top 3 por reservas web y la tabla de todos los anuncios (ver "Anuncios").
- Proyecciones: cierre de mes estimado con los datos reales y simulador de objetivo.
- Historico de Campanas: todas las campanas con gasto, activas y finalizadas, con pestanas por mes y Todos (ver "Historico de Campanas").
- Archivo de Reportes: catalogo de los documentos guardados en la carpeta de Google Drive.
  - Pestana Generacion de Reporte, dentro de Archivo de Reportes: el Reporte de Publicidad con el diseño del modelo de Amador, por mes y semana a semana, y descarga en PDF (ver "Generacion de Reporte").
- Bitacora: checklist mensual de cambios, comentarios y decisiones de la cuenta.

La barra superior (desde la v1.31.0, como Royal Baby) queda fija al hacer scroll y es translucida (blanco al 88 % con desenfoque). A la izquierda van el boton para minimizar el panel, el titulo de la vista y como bajada la misma descripcion del modulo que muestra el panel lateral. A la derecha, la pildora de sincronizacion: "Sincronizado · hace 12 min" en verde; "cargando…" / "Recargando…" en ambar con el punto latiendo durante una lectura; "Aún no sincronizado" en ambar mientras se ve la copia guardada (tambien ambar si una descarga de Meta del mes no se pudo leer); "Sin conexión con Meta / Google Sheets" en rojo. Al pulsarla se abre el detalle: datos y su corte, ultima y proxima lectura, pestanas leidas, fuente y un aviso (sin conexion, copia guardada, Objetivo Reservas o mes en curso). Al lado, el boton fantasma **Actualizar** con icono de recarga es el unico del tablero: relee la hoja y sincroniza el Archivo de Reportes con Drive (mismo `id="topbar-refresh-btn"` y `data-amador-refresh`).

El panel lateral se puede minimizar con el boton de la barra superior: en escritorio queda una franja de iconos de 88px (con el nombre del modulo como tooltip) y en pantallas de 900px o menos se oculta por completo. El estado se recuerda en `localStorage` (`rb-sidebar-collapsed`).

El tablero solo muestra los modulos activos: los modulos pendientes (Comparativo YoY, Distribucion, Productos Web) se retiraron del menu el 24 de septiembre de 2026 junto con la calculadora de inversion por CPL. Usuarios y Claves volvio como modulo activo el 29 de septiembre de 2026.

El pie del panel lateral lleva el nombre de la cuenta, el WhatsApp de Agencia Lima Retail
(+51 937 409 733) y www.limaretail.com. El modulo "Usuarios y Claves" salio del tablero; el
directorio guardado sigue en el repositorio por si hace falta recuperarlo.

## Datos

Desde la v1.22.0 el modulo Gasto publicitario combina dos fuentes:

- **Descargas de Meta Ads** (carpeta de Drive "Meta Files - Amador"): un Google Sheet por mes con el "Raw Data Report" de Meta (una fila por dia x edad x sexo x anuncio), llamado `Amador - <Mes> <Año>`. De ahi salen el gasto, los mensajes ("Conversaciones con mensajes iniciadas"), impresiones, alcance, clics, el objetivo y los anuncios con sus fechas. Las lee el Web App de `scripts/meta-drive-sync.gs` (ver "Descargas de Meta (Web App)").
- **Hoja `Distribucion-amador`** (carpeta "Excel madre distribucion - Amador"): las **reservas**, el tipo, el presupuesto, las fechas planificadas y el Objetivo Reservas de cada campana. Se cruzan con Meta por nombre de campana: Meta antepone "Campaña " y a veces no deja espacio antes de "|" ("Campaña Mensajes - Fiestas patrias| LR" es "Mensajes - Fiestas patrias | LR" en la hoja). Las reservas de campanas de la hoja que no aparecen en Meta (por ejemplo, junio, con otros nombres) van en una fila "Reservas de la hoja sin campaña en Meta"; el total del mes siempre es el de la hoja.

El cuadro de cada campana es la columna **Objetivo** de la hoja (desde la v1.24.1: "corporativos" va en Mensajes aunque en Meta sea Clientes potenciales). Si un cuadro junta varias campanas, debajo de sus indicadores va el monto de cada una (inversion, % del cuadro, mensajes y reservas). Solo una campana que no esta en la hoja usa el objetivo de Meta: Ventas, Clientes potenciales y Trafico van a **Reservas**; Interaccion a **Mensajes**; Reconocimiento y Alcance a **Branding**. Una campana es **Activa** si gasto en los dos ultimos dias con datos o sigue con gasto el mes siguiente; si no, **Finalizada**. El mes en curso llega hasta el ultimo dia con gasto de su descarga ("Datos al 12 de octubre"). Los meses sin descarga de Meta (enero a mayo de 2026) y cualquier mes si no hay barrido salen enteros de la hoja, como antes. Los meses de la descarga reemplazan los de la hoja aunque cambie el total de gasto: el archivo de junio de 2026 empieza el 15 y hay que reemplazarlo por la descarga del mes completo.

La fuente normalizada del dashboard esta en `data/amador-ads-2026.json` (enero a mayo y la fecha de la ultima copia) y en una copia por pestana mensual de `Distribucion-amador` (`data/amador-<mes en ingles>-sheet-<año>.json`: junio, julio, agosto y septiembre de 2026). El build incrusta todas las copias mensuales que haya en `data/`, de cualquier año, cada una con su año; en desarrollo se piden las de la lista `SHEET_FILES` de `js/objectives.js`. Junio, julio, agosto y septiembre estan guardados con sus datos finales (septiembre se cerro el 12 de octubre de 2026: gasto S/3,662.40; 451 mensajes; 30 reservas); la lectura en vivo los reemplaza por la pestana actual. Las pestanas de julio en adelante agrupan anuncios por `Conjunto de anuncios` (RTGT, P. Frio, P. Caliente, etc.), reflejado en el campo `adSet`.

Lectura en vivo: al abrir el tablero, cada hora y con el boton Actualizar se leen el CSV publicado de la pestana del mes en curso y la del mes anterior (hora de Lima), tambien entre diciembre y enero. La lista de pestanas (nombre y gid) sale de la vista publicada de la hoja (`/htmlview`); la del mes se reconoce sin importar espacios en los extremos, mayusculas ni tildes (la de octubre se llama "Octubre " con espacio final; "Setiembre" tambien vale) y se pide por su gid. Si esa lista no se puede leer, se pide por nombre: con el año y, si el mes admite nombre sin año, sin el y con espacio final.

Pestanas y años: la hoja no admite dos pestanas con el mismo nombre, asi que el año va en el nombre (`Enero 2027`, `Junio 2027`). Una pestana sin año ("Junio", "Octubre ") es del primer año en que ese mes cae desde junio de 2026 (`SHEET_START`): junio a diciembre son de 2026 y enero a mayo, de 2027. Por eso en 2027 enero a mayo pueden llamarse "Enero" o "Enero 2027", pero desde junio la pestana tiene que llevar el año ("Junio 2027"); una pestana sin año nunca se toma como de otro año. Si falta la pestana del mes en curso, el detalle de la actualizacion lo avisa con el nombre esperado y el tablero sigue en el ultimo mes con datos. Con datos de mas de un año, las pestanas de mes de Gasto publicitario y del Historico llevan encima los años; cada mes se compara con el anterior aunque sea del año pasado (enero contra "Diciembre 2026 completo"), la vista Anual y los graficos muestran el año elegido y el Historico "Todos" junta todos los años con una columna por mes ("Dic 26", "Ene 27"). Si la pestana del mes todavia no existe, Google devuelve la primera hoja (Junio): el tablero la descarta porque la mayoria de sus fechas no cae en el mes pedido, y sigue mostrando el mes anterior. Una pestana que falla no impide leer la otra (el aviso queda en el detalle de la actualizacion). Al volver a la pestana del navegador solo se relee si la ultima lectura tiene mas de 5 minutos; una lectura que trae lo mismo no repinta. Si Google no responde en 30 s o falla, se mantienen los ultimos datos y se emite `amador:data-error` (`detail.error`). Las copias de `data/` solo hacen falta como respaldo: un mes nuevo aparece en cuanto existe su pestana.

Fecha de corte: un mes cuyo ultimo dia ya paso en Lima esta cerrado y su corte es ese ultimo dia; el mes en curso corta en el dia de la ultima lectura en vivo (o en la fecha de `data/amador-ads-2026.json` si solo esta la copia guardada).

El spreadsheet esta compartido como "cualquier persona con el enlace / lector", que es lo que necesita la lectura del CSV publicado; si vuelve a restringirse, la lectura en vivo falla y el tablero muestra las copias de `data/`.

## Gasto publicitario: campanas

- **Solo lo que tuvo actividad**: meses, campanas y conjuntos con gasto, mensajes o reservas; anuncios con gasto propio, mensajes o reservas (sin heredar el gasto del conjunto). Lo demas no se muestra ni se menciona. Al empezar el mes la hoja puede traer mensajes con el gasto en 0: el mes ya aparece, los costos salen "—" y la inversion dice "Gasto sin cargar en la hoja" en lugar de una variacion.
- Hasta que se elige una pestana, la vista sigue al ultimo mes con datos: un mes nuevo que llega con la lectura en vivo se muestra solo.
- **Objetivo (cuadro)**: el de la campana en la hoja (Reservas, Mensajes, Clics, Thruplays...). Junio lo trae por anuncio y en texto libre: cuenta la primera palabra ("Reservas/Mensajes" = Reservas) y, si los anuncios de una campana difieren, el de mayor gasto. Reservas va en naranja, Mensajes en verde y Branding (Reconocimiento, Thruplays) en violeta; otro objetivo toma un color fijo.
- **Granularidad de la hoja**: desde julio el gasto viene por conjunto (en su primera fila) y las reservas, el objetivo y las fechas por campana; mensajes y estado por anuncio. Junio trae gasto y reservas por anuncio y no tiene conjuntos; marzo a mayo solo campanas; enero y febrero solo el gasto total. Por eso los conjuntos muestran gasto y mensajes, y desde julio los anuncios muestran "Por conjunto" / "Por campana" en gasto y reservas.
- **Distribucion**: una fila por campana con mensajes, reservas, **Objetivo Reservas** editable, costos, gasto, % de la inversion, presupuesto, saldo, fin y dias restantes y nuevo presupuesto diario, mas la fila "Total actualizado". En la vista anual las campanas se juntan por nombre exacto y el objetivo es la suma de los meses.
- **Comparacion**: contra el mes anterior completo. Conjuntos y anuncios se comparan por nombre dentro del objetivo; uno que no corria sale como "Nuevo". Sin detalle en el mes anterior (enero, febrero o junio para los conjuntos) no hay comparacion.
- **Objetivo Reservas**: lo editado se guarda en este navegador por mes y campana (`localStorage`, clave `amador-reservation-goals-v2`, "2026-09::Campana"); los valores de la version anterior (`-v1`, sin mes) pasan a cada mes en que aparece la campana. Proyecciones lo usa como referencia.
- **Filas propias**: "Agregar campana" (distribucion) guarda filas de nota en este navegador (`amador-custom-rows-v1`, por mes "2026-09"; las guardadas antes por nombre de mes pasan a 2026), sin cifras de la hoja. Los anuncios agregados a mano dejaron de mostrarse en la v1.23.0 (siguen guardados en esa clave).
- **Anuncios de cada cuadro**: al final de cada objetivo, debajo de los conjuntos, sus anuncios de mas a menos resultados con la estrella en el lider y el nombre enlazado a la vista previa de Meta; Reservas web y su costo van junto al anuncio solo si el objetivo las tuvo. Despues: resultados (con su tipo), resultados del mes anterior y variacion, costo por resultado, mensajes, inversion y % del objetivo, impresiones, alcance, CPM, clics y dias activos.
- **Graficos por mes**: cada cuadro trae su grafico del año con Inversion, Mensajes, Reservas, Costo por mensaje y Costo por reserva (por defecto el resultado del objetivo y la inversion). Los costos salen de sumar gasto y resultados del mes con la misma regla que los KPIs (solo campanas con gasto cargado); un mes sin mensajes o sin reservas queda como hueco. Con varios indicadores, cada uno va en su propio panel con su escala, apilados sobre el mismo eje de meses: nunca dos escalas a la vista en un mismo panel. Un mes sin actividad del objetivo queda como hueco. El grafico mensual de la cuenta (el unico con enero a mayo) sigue la misma regla, suma los mismos dos costos y arranca minimizado.
- **Valor en cada punto**: cada mes lleva su valor, arriba en un pico y abajo en un valle, con halo blanco y dentro de su panel; los ceros no llevan etiqueta y una que choca con otra se omite (queda en el tooltip). Los soles van sin decimales salvo montos menores a S/. 10.
- **Un solo cuadro**: con dos o mas indicadores marcados aparece el boton "Un solo cuadro", que los junta en un cuadro con un color por indicador y cada uno con su escala sin eje visible (se compara la forma y el valor se lee en el punto). Se guarda por cuadro y, para el grafico de la cuenta, en `amador-chart-combined-v1`.
- Minimizado, indicadores y "Un solo cuadro" de cada cuadro en `amador-campaign-charts-v1`; densidad de la tabla de anuncios en `amador-campaigns-compact-v1`.

## Anuncios

Modulo `view-ads` (en el menu, despues de Gasto publicitario), en `js/objectives.js` (seccion "Modulo Anuncios"). Usa los mismos datos, periodo y comparacion (mes anterior completo) que Gasto publicitario y **comparte el mes elegido**: las dos filas de pestanas se pintan juntas, asi que cambiar de mes en una vista cambia la otra. Puede abrirse primero: la carga de datos es la misma.

- **Periodo**: "Periodo: 1-13 Octubre 2026 (mes en curso)" y "Comparación vs Septiembre completo"; en Anual, "Acumulado del año: sin periodo anterior para comparar". Si el mes anterior no trae anuncios (mayo y antes), no hay comparacion.
- **Top 3 de anuncios por reservas web**: las reservas web son las "Compras" que Meta atribuye al anuncio (tipo de resultado "Compras en el sitio web"). La descarga trae la columna "Valor de conversion de compras" vacia, asi que no hay ventas ni ROAS. Orden: mas reservas web, luego mas mensajes y luego menos inversion. Cada tarjeta: puesto, anuncio con enlace, objetivo, campaña y conjunto, reservas web y debajo costo por reserva web, mensajes e inversion. Las reservas de la hoja siguen por campaña (son mas: incluyen las que llegan por otros canales).
- **Tabla**: Objetivo, Anuncio (enlace ↗ a la vista previa y estrella en el lider de cada objetivo), Reservas web, Costo por reserva web, Campaña / conjunto, Estado, Resultado, Resultados, Resultados del mes anterior, Variacion, Costo por resultado, Mensajes, Inversion, Impresiones, Alcance, CPM, Clics y Dias activos. Filtro por objetivo, Compacto (`amador-campaigns-compact-v1`) y Pantalla completa (las pestanas de mes entran al panel; `Esc` o cambiar de modulo la cierran). Sin comparacion se ocultan Mes anterior y Variacion.
- **Un anuncio** es su nombre dentro de su objetivo: si corre en varios conjuntos o campañas (o meses, en Anual) se suma. Los resultados de tipos distintos no se suman: se muestra el tipo con mas resultados ("y otros tipos" si hubo mas) y se compara con los del mismo tipo del mes anterior ("Nuevo" si no corria). Lider = mas resultados del objetivo.
- CPM, costos y dias activos salen de las sumas (alcance = suma de filas, no alcance unico). Dias activos = dias con gasto o impresiones (en Anual, la union de fechas). Solo se muestran anuncios con inversion, impresiones, clics, mensajes o reservas web.
- Los meses que salen de la hoja (sin descarga de Meta) solo traen gasto y mensajes por anuncio: su resultado son los mensajes y el resto queda en "—".

## Historico de Campanas

- Una fila por campana (nombre exacto) con gasto en algun mes. En **Todos** lleva una columna de gasto por mes ("Oct (al 11)" si el mes sigue en curso), gasto total, mensajes, reservas, costo por reserva, anuncios y periodo; con un **mes** elegido quedan las campanas con gasto ese mes, con sus cifras de ese mes, sus fechas y el gasto acumulado al final.
- Estado: **Finalizada** si dejo de gastar en Meta (o, en los meses de la hoja, si la hoja la marca apagada: OFF, Finalizada, Desactiva) o ya no aparece en el ultimo mes con datos; si no, **Activa**. El filtro Todas / Activas / Finalizadas muestra cuantas hay de cada una y los KPIs siguen los dos filtros.
- Los anuncios van plegados (marzo a mayo solo traen enlaces de vista previa) y siguen abiertos tras una actualizacion.

## Proyecciones

El modulo Proyecciones lee los datos del modulo Gasto publicitario
a traves de `window.AmadorObjectives.snapshot()` y proyecta el cierre del mes en curso.

- El mes proyectado es el ultimo con actividad (gasto, mensajes o reservas); si ya cerro (calendario de Lima) se muestra completo y el simulador no aplica. Sin gasto cargado, la inversion no se puede simular y los costos salen "—".
- Ritmo diario = acumulado real / dias con datos; la proyeccion mantiene ese ritmo hasta el ultimo dia del mes.
- La linea de tiempo marca el dia de la ultima actualizacion y compara contra el presupuesto (inversion) o el objetivo de reservas.
- Cada sincronizacion con Google Sheets emite el evento `amador:data-updated` y el modulo se recalcula solo; si llega durante el arrastre del nodo, se aplica al soltar. Si los datos no cargan, `amador:data-error` muestra el motivo.
- Simulador de objetivo: el ultimo punto de la linea de tiempo es un nodo arrastrable. Al moverlo hacia el cierre deseado
  (o escribir el valor / usar "Llevar al objetivo") se recalcula el cierre de inversion, mensajes y reservas, el ritmo
  diario requerido para los dias restantes, la brecha contra presupuesto u objetivo y la inversion adicional.
  El escenario conserva la eficiencia real del mes (costo por mensaje, costo por reserva y tasa de reserva) y no permite
  cerrar por debajo de lo ya realizado. Doble clic sobre el nodo o "Restablecer" vuelve a la proyeccion lineal.

## Generacion de Reporte

Pestana que arma el "Reporte de Publicidad" con el diseño del modelo de Amador (`Modelo Reporte Amador`):
laminas 16:9 con fondo claro, tarjetas blancas de borde fino y acentos en azul.

| Pagina | Contenido |
| --- | --- |
| Portada | Logo de Lima Retail, "Reporte de Publicidad", cliente, mes ("Octubre 2026 · evolucion semanal") y fecha de emision. |
| Contenido | Una tarjeta por seccion con su icono y su numero de pagina. |
| Como vamos | Inversion, compras (costo/compra), reservas o leads (costo/reserva) y mensajes (costo/mensaje); conversaciones por semana (S1, S2...); recuadro "Lectura". |
| Una por campana | Reservas de Almuerzos, Eventos, Corporativos (y cualquier otra campana con gasto, con su propio nombre): 4 KPIs segun lo que mide, evolucion semanal, mejores anuncios (hasta 4, con "Ver »" a la vista previa) y recuadro "Analisis" (Que paso / Que lo ocasiono / Que hacemos). |
| Conclusiones y acciones | Tres tarjetas: la campana motor, los anuncios a replicar y la campana a revisar; en un mes en curso, la nota de que las metricas se consolidan al cierre. |
| Cierre | Logo y firma de Lima Retail. |

- **Periodo:** se elige el mes (el en curso llega hasta el ultimo dia con datos) y cada pagina lo parte en
  semanas de lunes a domingo dentro del mes: S1 va del dia 1 al primer domingo. No compara contra el mes
  anterior.
- **De donde salen los numeros:** de las mismas filas del barrido de Meta que usa Gasto publicitario (en
  `window.AMADOR_META_DATA` y en la relectura en vivo que expone `AmadorObjectives.meta()`). No hay una
  fuente nueva ni una lectura extra.
- **Que mide cada campana:** compras = resultados "Compras en el sitio web"; leads = resultados "Clientes
  potenciales"; conversaciones = la columna "messages" de Meta. El costo por compra y por lead es la
  inversion de su campana entre su resultado; el costo por mensaje es la inversion total entre los mensajes.
  En las campanas de leads la tabla de anuncios y el grafico miden conversaciones, como en el modelo.
- **Textos:** la lectura, el analisis de cada campana y las conclusiones vienen propuestos con lo que dicen
  los numeros. Se editan con un clic sobre la lamina (`**texto**` va en negrita) y quedan guardados por mes
  en el navegador (`amador-report-notes-v2`); no se publican con el tablero. "Restablecer textos" vuelve a
  los propuestos, sin dialogo de confirmacion.
- **El modelo** es el ultimo PDF de la carpeta Reportes (el listado que ya trae Archivo de Reportes): su
  nombre y su enlace salen arriba.
- **Descargar PDF** abre el dialogo de impresion con las laminas solas, una por hoja de 13.33 x 7.5 in (el
  tamaño del modelo), y el nombre del archivo ya armado. Activar "Graficos de fondo" si el navegador no lo
  hace solo.

El modulo es `js/report-week.js` y su template es propio de Amador: cada tablero de marca tiene el suyo,
adaptado por la marca. Sus estilos y los de impresion estan al final de `css/dashboard.css`.

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
  lista (el select del formulario se llena desde ella) y su color en `css/dashboard.css` (`.log-tag.platform.<clave>`).
- `date` (`YYYY-MM-DD`) define el mes en que se agrupa el item; `done` marca la casilla.

Flujo editar -> exportar -> publicar: lo que se agrega o edita en el tablero queda como borrador en ese navegador
(`localStorage`, clave `amador-bitacora-draft`). **Exportar** descarga `amador-bitacora-2026.json` con `updatedAt` de hoy;
para publicarlo se reemplaza el archivo en `data/`, se hace commit y se despliega. El borrador guarda el `updatedAt` y una
huella del contenido sobre el que se hizo y se ignora cuando se publica una version nueva del archivo. Editar una fila no
saca el foco del campo: la lista solo se redibuja si cambia el orden, el filtro o el conteo, y una fecha tecleada se
reordena al salir del campo.


## Archivo de Reportes (Google Drive)

El modulo lee `data/amador-drive-reports.json`, un catalogo de la carpeta compartida
`Reportes Amador` (https://drive.google.com/drive/folders/1zqSfc2MlfsWYd3rfYgFWBgQwbrz6-R2b).
Cada entrada guarda `id`, `title`, `mimeType`, `sizeBytes`, `createdTime` y `modifiedTime` tal como los devuelve Drive;
el tipo de documento, el periodo y la version vigente se deducen en el navegador a partir del nombre del archivo (gana la primera palabra de mes; "mar", "may" y "set" solo cuentan pegadas al ano, y "set"/"setiembre" es septiembre). Imagenes, hojas de calculo y comprimidos sin "reporte" en el nombre van como Otros documentos. Las fechas se muestran en hora de Lima.

Para incorporar nuevos documentos basta con agregar su bloque al arreglo `files` y actualizar `syncedAt`.
La vista previa usa el visor de Drive (`/preview`), por lo que el usuario debe tener acceso a la carpeta.

### Sincronizar con Drive

El boton **Actualizar** de la barra superior (el mismo que relee la hoja) trae el contenido real de la carpeta y reemplaza en pantalla el catalogo
publicado: la tabla, los KPIs y los filtros se rearman con lo que hay en Drive en ese momento y el resultado
queda guardado en el navegador (`localStorage`, clave `amador-drive-reports-snapshot-v1`), asi que al volver
al modulo se ve ese listado y no el del ultimo build. El modulo tambien sincroniza solo al abrirse; en ese
caso el aviso verde aparece unicamente si hubo altas o bajas. Si Drive no responde, se mantiene lo que ya
estaba y el conteo de documentos dice "no se pudo releer la carpeta" (con Actualizar, ademas, el aviso en rojo).

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
3. Publicarlo como Web App con ejecucion como propietario y acceso "Cualquier persona" (quien abre el tablero no
   tiene por que haber iniciado sesion en Google). El script solo escribe en las pestañas mensuales del spreadsheet
   fijado en `SPREADSHEET_ID` y solo acepta enteros entre 0 y 100000.
4. Guardar la URL `https://script.google.com/macros/s/.../exec` en el secret `SHEET_SYNC_ENDPOINT` del repositorio y
   volver a publicar. El build la incrusta solo dentro del HTML cifrado (`window.AMADOR_SHEET_SYNC_ENDPOINT`): no vive
   en el repo, que es publico, porque con ella cualquiera podria cambiar los objetivos. Tampoco se acepta desde
   `?sheetSyncEndpoint=` ni desde localStorage: un enlace manipulado podia desviar los datos a un tercero.

Desde ese momento, los cambios en `Objetivo Reservas` se actualizan localmente y se envian al Sheet.

## Descargas de Meta (Web App)

`scripts/meta-drive-sync.gs` es un proyecto independiente de Apps Script (no vinculado a una hoja), publicado por una cuenta con acceso a la carpeta "Meta Files - Amador". Barre la carpeta cada hora si cambio algo (un archivo nuevo, editado o borrado), siempre a las 10:00 de Lima, al abrir el tablero si hay una descarga mas nueva que el ultimo barrido (desde la v1.25.0: Meta se sube a media manana, despues de las 10:00) y cuando se pulsa Actualizar (`?action=data&fresh=1`); dos pedidos dentro del mismo minuto comparten un barrido. suma edad y sexo por dia, campana, conjunto y anuncio, y guarda el resultado en un JSON de Mi unidad ("Amador - barrido del tablero.json"). Los meses cerrados cuyo archivo no cambio no se vuelven a leer; el mes en curso y el anterior, siempre.

Configuracion unica:

1. script.google.com > Nuevo proyecto > pegar `scripts/meta-drive-sync.gs`. Configuracion del proyecto: zona horaria **America/Lima** y, en Propiedades del script, `DATA_FOLDER_ID` con el ID de la carpeta de descargas (no va en el repo, que es publico).
2. Ejecutar una vez `installSweepTriggers()`: pide los permisos (Drive, Hojas, Script; "Google no ha verificado esta app" se acepta), crea el disparador de cada hora y hace el primer barrido. Al pasar de una version anterior a la v1.25.0 hay que volver a ejecutarla: el disparador diario se reemplaza por el de cada hora. `probarBarrido()` escribe en el registro filas, gasto, mensajes y fechas de cada mes.
3. Implementar > Nueva implementacion > **Aplicacion web**, ejecutar como **Yo**, acceso **Cualquier persona**. La URL `/exec` es un secreto (quien la tenga lee los numeros): solo va como secret `DATA_ENDPOINT` en GitHub.
4. Cada cambio al `.gs`: pegarlo y Implementar > Administrar implementaciones > editar > **Nueva version** (la URL no cambia). Un cambio de columnas o de la suma exige subir `SWEEP_VERSION`.

Cada mes: subir la descarga como Hoja de calculo de Google (Archivo > Guardar como Hojas de calculo de Google; un `.xlsx` se ignora) con el nombre `Amador - <Mes> <Año>`, un solo archivo por mes (si hay dos, se usa el editado mas recientemente y el detalle de la actualizacion lo avisa). Tiene que ser el mismo informe que los demas meses (a nivel de anuncio, desglosado por Dia, Edad y Sexo): un informe por conjunto o sin la columna "Dia" no se puede leer, el detalle de la actualizacion lo avisa en ambar y ese mes sale de la hoja. La descarga tiene que estar en español: las columnas se reconocen por su nombre ("Dia", "Monto gastado (PEN)" o "Importe gastado (PEN)", "Nombre de la campaña"...).

## Desarrollo

```bash
npm install
npm run dev
```

En desarrollo el barrido de Meta se lee de `data/amador-meta.json` (copia local, fuera de git), que deja el build cuando corre con `DATA_ENDPOINT=<url /exec> npm run build`. Sin esa copia el tablero muestra solo la hoja.

## Build

```bash
npm run build
```

El resultado se genera en `dist/`: `index.html` (CSS, JS y datos incrustados), `assets/`, `data/amador-drive-reports.json` y `.htaccess`.
Con `DATA_ENDPOINT` el build baja el barrido de Meta (dos intentos), lo guarda en `data/amador-meta.json` y lo incrusta junto con la URL; en GitHub Actions, si no lo puede leer, falla y Pages conserva el deploy anterior. Sin `DATA_ENDPOINT` usa la copia local si existe y, si no, publica solo con la hoja (el workflow lo avisa con un warning).
Nada mas: `data/csv-backups`, `scripts/` y el resto del repo nunca se publican.

## Publicacion en GitHub Pages con clave (actual)

`amador.limaretail.com` es un CNAME a `jorgeluis666.github.io`. Pages no puede pedir clave por servidor, asi que
`scripts/protect-pages.js` cifra el `dist/index.html` ya compilado (AES-256-GCM, clave PBKDF2-SHA256 de 600.000
iteraciones) y lo envuelve en `deploy/pages-gate.html`. El navegador solo lo descifra con la clave correcta: el
HTML publicado no lleva la clave, ni su hash, ni los datos en claro. Tambien quita `dist/.htaccess` y `dist/data/`
y agrega un `robots.txt` que bloquea buscadores.

- "Recordar en este equipo" guarda la clave derivada (no la escrita) en `localStorage`; sin marcarlo dura la sesion
  de la pestaña. La sal es fija por marca (`lr-gate:amador`), asi que lo recordado sigue sirviendo despues de cada deploy
  y solo deja de servir cuando cambia la clave (entonces el formulario vuelve a pedirla).
- La clave se toma sin espacios en los extremos y en NFC, en el build y en la pantalla de acceso; si trae un salto de
  linea el build falla. La foto de fondo (JPEG de 125 KB) solo se descarga si se ve (no en pantallas de 768px o menos).
- Cambiar la clave = actualizar el secret y volver a publicar.
- Cualquiera puede descargar el HTML cifrado y probar claves sin limite en su propia maquina: la seguridad depende
  de que la clave sea larga y dificil de adivinar.
- Esto protege el sitio, no el repositorio: mientras el repo sea publico, `data/` se ve en github.com.

Configuracion unica en GitHub:

1. Settings > Secrets and variables > Actions > **New repository secret**: `DASHBOARD_PASSWORD` con la clave y
   `DATA_ENDPOINT` con la URL `/exec` del Web App de Meta.
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
