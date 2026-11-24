# Servidor MCP de CuponLab

`POST https://www.cuponlab.com/mcp` (Streamable HTTP, sin login, solo lectura). Código: `src/lib/mcp.ts` (protocolo y herramientas, con tests), `src/lib/mcp-data.ts` (los cupones vivos de la web pública) y `src/app/mcp/route.ts`.

## Herramientas

| Herramienta | Para qué |
| --- | --- |
| `search_coupons` | Cupones por producto, marca, tienda o categoría (`query`, `store`, `category`, `only_codes`, `limit`) |
| `top_deals` | Los mejores chollos de hoy, por votos y comprobación, opcionalmente de una categoría |
| `get_coupon` | El detalle de un cupón por id |
| `list_stores` | Las tiendas con cupones activos y cuántos tiene cada una |

Responde con los mismos cupones que la web pública (`siteCoupons`): nunca ofrece uno que un lector no vería en cuponlab.com.

## Enlaces y origen de los clics

Cada resultado trae `link` (`/go/cuponlab/<id>?o=<origen>`, el enlace con tracking) y `page` (la ficha, con `?utm_source=<origen>`). El origen es `claude`, `chatgpt` o `ia` (otros asistentes): se decide en `initialize` por el nombre del cliente o su user agent y viaja en el `Mcp-Session-Id`, así que el servidor no guarda estado. Los chats suelen quitar el Referer, por eso un clic con esos orígenes cuenta aunque no lo traiga (los bots se siguen descartando por user agent). En Estadísticas salen como «Claude (MCP)», «ChatGPT (MCP)» y «Otros asistentes de IA (MCP)».

## Probarlo

- MCP Inspector: `npx @modelcontextprotocol/inspector`, transporte «Streamable HTTP», URL `https://www.cuponlab.com/mcp`.
- Claude: Ajustes → Conectores → Añadir conector personalizado → la URL. Sirve en cualquier plan de pago.
- ChatGPT: Ajustes → Apps y conectores → Ajustes avanzados → activar el modo desarrollador → Crear, con la URL y sin autenticación.

## Publicarlo en los directorios

Que el asistente lo use solo, sin que el usuario lo pida, pasa únicamente para quien tiene el conector instalado. Para el resto hace falta estar en el directorio de cada uno.

**Claude** (claude.com/docs/connectors/building/submission): se envía desde claude.ai/directory/manage. Pide URL https, cada herramienta con `title` y `readOnlyHint` (ya está), errores útiles (ya está), URL de documentación, política de privacidad, contacto de soporte, icono y slug. Las descripciones no pueden decirle al modelo cómo comportarse, empujarle a preferir esta herramienta ni promocionar el servicio: por eso dicen solo qué hace cada una y cuándo aplica.

**ChatGPT** (developers.openai.com/apps-sdk/deploy/submission): ahora se publica como plugin desde el portal de OpenAI, con la organización verificada. Pide nombre, logo, descripción, web y política de privacidad, información del MCP y las herramientas, capturas y prompts de prueba con sus respuestas.

Páginas para el formulario: documentación en `/asistentes-ia`, privacidad en `/privacidad-asistentes`, soporte en `/contacto` y email de contacto hello@cuponlab.com (variable SITE_CONTACT_EMAIL; también sale en `/privacidad-asistentes` y `/asistentes-ia`), icono en `/icon.svg`.
