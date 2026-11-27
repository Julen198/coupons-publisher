# Campañas automáticas: páginas por tienda y fecha, con antelación y con informe

Fecha: 2026-11-27 · Pedido en el chat: «esto debería ser automático… con tiempo y previsión», «para todos los eventos
que puedan surgir», «una revisión y análisis pre y post datos».

## Qué hace (cron `/api/campaigns/cron`, 05:00 y 14:00 UTC)

1. Publica los textos cuya espera ha terminado y avisa a IndexNow.
2. Lee Search Console (búsqueda × página, 28 días) y agrupa las búsquedas entre la posición 8 y la 30:
   - tienda + fecha («black friday shein») → texto propio en `/ofertas/<evento>/<tienda>`, primero;
   - solo tienda («cupón esdemarca») → guía de tienda nueva, o reescritura de una automática de hace 30+ días, con esas
     búsquedas en el prompt (máx. 2 por ejecución; pasan por la espera de Guías SEO).
3. Calendario: cada fecha de `EVENT_PAGES` desde `leadDays` (42) días antes, sus `storesPerEvent` (12) mejores tiendas
   (cupones de la fecha, cupones vivos, clics, impresiones, categoría, y +20 si convirtieron en la edición anterior).
4. Escribe con IA (Sonnet, coste en «Guías SEO») y comprueba: 300-1000 palabras, keyword en la entradilla, sin códigos
   inventados, sin políticas sin datos, sin otro año, parecido < 0,35 con otras tiendas de la misma fecha.
5. Programa: 24 h de espera (12 h si la fecha está a menos de 7 días). Telegram avisa; se cancela en `/panel/campanas`.
6. Detecta eventos que no están en el calendario (Prime Day, días sin IVA, aniversarios, «Semana de…», «… Days») en los
   cupones vivos y en las búsquedas, y avisa la primera vez.
7. Informe de partida cuando una fecha entra en el plan, e informe final una semana después de que acabe: búsquedas del
   evento, páginas del evento, clics a tiendas, comisiones; antes, durante y el año anterior; qué páginas subieron o
   bajaron, qué llegó tarde (menos de 21 días), qué tiendas convirtieron, qué búsquedas siguen cerca. Las tiendas que
   convirtieron van primero en la siguiente edición.

## Indexación

Una página tienda × fecha se indexa si tiene cupones que nombran la fecha (como antes) o si tiene texto propio de esta
edición y la tienda tiene cupones vivos. Entra en el sitemap y en el listado «por tienda» de la página del evento.

## Datos

`campaign_guides` (una fila por tienda y fecha; el año se renueva cada edición) y `campaign_reports`. Están en
SCHEMA_SQL y el cron los crea si faltan.

## Pendiente

Páginas de calendario para los eventos detectados: de momento se avisa y se añaden a `EVENT_PAGES` a mano.
