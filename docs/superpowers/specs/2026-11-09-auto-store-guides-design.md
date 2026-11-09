# Guías SEO automáticas por tienda

Fecha: 2026-11-09 · Estado: aprobado en chat ("me cuadra… solo me meto si quiero cancelar algo")

## Por qué

La guía de Atmosfera Sport (`src/lib/store-guides.ts`) es el ejemplo de cómo posicionar "código descuento <tienda>".
Hacerla a mano tienda a tienda no escala y obliga a alguien a estar mirando qué tienda "ya tiene muchos cupones".
Queremos un sistema que decida solo, escriba la guía con datos reales de la tienda, avise y publique, y en el que
una persona solo intervenga para **cancelar**.

## Objetivos

- Elegir cada día las tiendas que merecen guía según señales medibles.
- Escribir una guía propia de esa tienda (no una plantilla con el nombre cambiado) con IA y los datos que tenemos.
- Avisar por Telegram; publicar sola a las 48 h salvo que se rechace.
- Más adelante, usar Search Console y GA4 para elegir mejor, y reescribir guías que no avanzan.

## No objetivos

- Guías para todas las tiendas. Solo las que pasan el umbral.
- Páginas nuevas: la guía va dentro de `/tiendas/<slug>` (una URL por tienda, ya en el sitemap).
- Afirmar políticas de la tienda (envíos, devoluciones) que no estén en `stores.facts`.

## Anti-objetivos (fallo aunque funcione)

- Que Google lo trate como *scaled content abuse*: muchas guías casi iguales publicadas de golpe.
- Que una guía invente códigos, porcentajes o condiciones.
- Que el coste de IA se dispare: todo pasa por `assertWithinBudget` y queda en Costes de IA.

## Diseño

### Datos: tabla `store_guides`

Una fila por tienda (`store_id` único). `content` guarda la forma `StoreGuide` actual (keyword, description, lead,
sections, faqs). `status`: `scheduled` (escrita, se publica en `publish_at`), `published`, `rejected`.
Además `signals` (jsonb, la foto de las señales con que se eligió), `created_at`, `published_at`, `rewritten_at`.
Una tienda rechazada no vuelve a proponerse sola.

Las guías escritas a mano en `store-guides.ts` ganan siempre: si la tienda tiene una, el cron no la toca.

### Elegibilidad y puntuación (fase 1, solo BD)

Elegible si:
- `country` es `ES` o vacío (la web es para España),
- tiene ≥ `guides.min_live` cupones vivos (por defecto 5: no archivados, sin revisión pendiente, no caducados),
- el enlace de la tienda tiene tracking (`storeLinkProblem` = null),
- no tiene guía (ni a mano ni en `store_guides`).

Puntuación: `cupones vivos + 3 × códigos vivos + 2 × clics de los últimos 30 días`.
Cada día se escriben como mucho `guides.per_day` (por defecto 2) de las mejor puntuadas.
Umbrales en la tabla `settings`, editables en el panel.

### Escritura

`generateStoreGuide(store, coupons)` en `ai-content.ts`, misma vía que el resto (`track`, presupuesto, `MODEL`),
nueva feature de coste `guides`. Salida con el esquema zod de `StoreGuide`. Entradas: nombre, web, categoría,
`facts`, `intro` y los cupones vivos (título, tipo, descuento, condiciones, caducidad).

Filtros automáticos antes de programarla (si falla, no se programa y se registra el motivo):
- longitud total entre 450 y 1400 palabras;
- la keyword aparece en el `lead`;
- no menciona envío gratis / devoluciones / plazos si `facts` no los trae;
- no contiene un código que no esté en los cupones;
- parecido con cualquier otra guía < 0,45 (Jaccard de trigramas de palabras), para que no salgan clones.

### Aviso y publicación

Al programar: mensaje al chat de administración de Telegram con la tienda, la keyword, el enlace a la vista previa
en el panel y la hora de publicación.
El cron publica las `scheduled` con `publish_at <= now()`. La página de tienda lee la guía publicada de la BD
cuando no hay una escrita a mano.

### Panel: `/panel/guias`

Lista de guías (programadas con cuenta atrás, publicadas, rechazadas) y las siguientes candidatas con su puntuación.
Acciones: **Cancelar** (rechaza), **Publicar ya**, **Reescribir**, ver la guía. Umbrales editables.

### Cron

`/api/guides/cron`, diario. Orden: publicar las que tocan → elegir candidatas → escribir y programar → avisar.
Protegido con `CRON_SECRET` como los demás.

### Fase 2: Search Console y GA4

Credencial: `GOOGLE_SERVICE_ACCOUNT_KEY` (JSON, solo en Vercel). Cuenta de servicio
`cuponlab-seo@cuponlab-seo.iam.gserviceaccount.com`, lectura en Search Console (`https://www.cuponlab.com/`) y Lector
en GA4 (propiedad `563375285`). Token OAuth firmando el JWT con `node:crypto` (sin dependencias nuevas).

- Search Console `searchAnalytics.query` por página y consulta, últimos 28 días: impresiones, clics, posición.
- GA4 `runReport`: sesiones por `/tiendas/<slug>`.
- La puntuación suma impresiones y da un extra a tiendas con consultas "código/cupón/descuento <tienda>" en
  posición 8-30 sin guía. La keyword de la guía pasa a ser la consulta real con más impresiones.
- Sin credencial, el sistema sigue con las señales de la BD.

### Fase 3: seguimiento

- A los 42 días de publicada, si la página no supera un mínimo de impresiones o su posición media está por encima
  de 30, se reescribe con las consultas reales (como mucho una reescritura cada 60 días), pasando otra vez por las
  48 h.
- Informe semanal por Telegram: guías publicadas, reescritas y las tiendas que más suben o bajan.

## Decisiones tomadas por mí (revisables)

- 48 h de espera, 2 guías al día, mínimo 5 cupones vivos.
- El aviso de Telegram enlaza al panel; cancelar se hace en el panel (sin botones en Telegram en la fase 1).
- Las guías a mano siguen en código y tienen prioridad.
