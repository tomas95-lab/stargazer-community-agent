# How to Use - Daily Thread Bot

Esta herramienta sirve para operar el community de Stargazer Axiom: daily threads, announcements, mensajes rápidos, webinars/onboardings, links e historial.

## Setup Inicial

```bash
npm install
cd ui
npm install
cd ..
cp .env.example .env
```

Editá `.env` con credenciales reales.

Variables principales:

| Variable | Descripción |
|---|---|
| `ADMIN_TOKEN` | Token interno para acciones sensibles desde la UI/API |
| `DISCOURSE_API_KEY` | User API key para publicar en Community |
| `DISCOURSE_API_CLIENT_ID` | Identificador del cliente API |
| `COMMUNITY_BASE_URL` | Base URL de Community |
| `COMMUNITY_CATEGORY_ID` | Categoría donde se publica el daily |
| `COMMUNITY_CHAT_CHANNEL_ID` | Canal de chat para announcements |
| `DATA_STORE` | `github`, `local` o `auto` |
| `GITHUB_TOKEN` | Token para leer/escribir datos del repo |
| `GITHUB_OWNER` | Owner del repo usado como storage |
| `GITHUB_REPO` | Repo usado como storage |
| `ANTHROPIC_API_KEY` | Claude para el Community Agent |
| `ANTHROPIC_MODEL` | Modelo Claude, default `claude-haiku-4-5` |
| `CRON_SECRET` | Secreto para la ruta programada en Vercel |
| `AGENT_AUTO_POST` | `true` para que el cron postee respuestas seguras |
| `AGENT_MAX_ANSWERS` | Máximo de mensajes que Claude analiza por corrida |
| `AGENT_MESSAGE_COUNT` | Cantidad de mensajes recientes a leer antes de filtrar por día |
| `DM_REVIEW_MESSAGE_COUNT` | Cantidad de mensajes recientes a leer por DM |
| `DM_REVIEW_MAX_CHANNELS` | Máximo de canales DM activos a revisar por corrida, default `5` |
| `DM_REVIEW_REQUEST_DELAY_MS` | Pausa entre canales DM durante el scan de conversaciones |
| `DISCOURSE_RATE_LIMIT_RETRIES` | Reintentos GET cuando Discourse devuelve rate limit |
| `DISCOURSE_RATE_LIMIT_MAX_WAIT_SECONDS` | Espera máxima por rate limit antes de reintentar |
| `DAILY_PUBLISH_ENABLED` | Habilita publish dentro de `jobs:all` |
| `DAILY_PUBLISH_POST_CHAT` | `false` para publicar thread sin announcement al chat |
| `FORCE_DAILY_PUBLISH` | Fuerza publish aunque ya exista URL del día |

## Daily Thread

Los topics se cargan desde la capa `DATA_STORE`. En producción conviene `DATA_STORE=github`; para desarrollo local podés usar `DATA_STORE=local`. El archivo lógico sigue siendo `data/topics.json`.

Cada topic tiene esta forma:

```json
{
  "date": "2026-07-03",
  "title": "Rubric Granularity Don't Introduce Method Names",
  "topic": "Rubric Quality",
  "reminderTitle": "Your rubric must stay as abstract as your prompt.",
  "reminderBody": "Markdown body",
  "goodExample": "Example text",
  "badExample": "Example text",
  "quickRule": "Short rule",
  "tags": ["daily_project_announcements"],
  "webinar": {
    "enabled": false,
    "mandatory": false,
    "timeLabel": "",
    "link": "",
    "invitees": []
  }
}
```

Si no hay un topic con la fecha de hoy, el CLI usa el primer topic como fallback.

## Dry Run

```bash
npm run daily -- --dry-run
```

Genera archivos en `output/` sin publicar nada en Community:

- `daily-thread-YYYY-MM-DD.md`
- `announcement-YYYY-MM-DD.md`

## Publish

```bash
npm run daily -- --publish
```

Flujo:

1. Lee el topic de hoy.
2. Renderiza el daily thread.
3. Muestra un preview.
4. Pide confirmación.
5. Publica en Discourse con la API.
6. Guarda la URL publicada.
7. Genera el announcement.
8. Pregunta si postear el announcement al chat.

Para saltear confirmaciones:

```bash
npm run daily -- --publish --yes
```

## Dashboard

Servidor API local:

```bash
npm run server
```

UI:

```bash
npm run ui:dev
```

También podés correr ambos con:

```bash
npm run dev
```

La UI usa `/api` y Vite lo proxya a `http://localhost:3001`.

Para acciones sensibles, configurá `ADMIN_TOKEN` en el servidor y guardá el mismo token en la página Settings de la UI. Ese token se guarda solo en tu navegador y se manda como `X-Admin-Token`.

## Comms

Listar templates:

```bash
npm run comms -- --list
```

Renderizar un template:

```bash
npm run comms -- --template model_update --oldModel Qwen --newModel "Sonnet 4.6"
```

Guardar resultado:

```bash
npm run comms -- --template war_room_open --save
```

## Webinars y Onboardings

Las sesiones viven en `data/webinars.json`. El job `src/webinar-reminder.ts` manda reminders cuando una sesión está entre 45 y 75 minutos de empezar.

```bash
npm run job:webinars
```

## Jobs Locales

```bash
npm run job:daily
npm run job:dms
npm run job:webinars
npm run jobs:all
```

`jobs:all` no publica el daily por defecto. Para habilitarlo, poné esto en `.env`:

```env
DAILY_PUBLISH_ENABLED=true
```

## MCP

El MCP server expone herramientas para publicar daily threads, leer chat, mandar mensajes, leer posts y responder topics.

```bash
npm run mcp
```

## Community Agent

El agente lee solo mensajes del día Argentina, revisa el canal de community, consulta `data/project-guidelines.txt`, y decide si puede responder o si conviene que responda un humano.

Para actualizar la base de conocimiento después de cambiar `project_guidelines.pdf`:

```bash
npm run guidelines:extract
```

Por seguridad, el CLI arranca en modo sugerencia:

```bash
npm run ai:respond
```

Para postear respuestas seguras al chat:

```bash
npm run ai:respond -- --post
```

También existe API protegida para usarlo desde UI o scheduler HTTP:

```text
GET  /api/community-agent/messages?count=20
GET  /api/community-agent/overview
POST /api/community-agent/run
GET  /api/dm-review
POST /api/dm-review/run
POST /api/dm-review/draft
POST /api/dm-review/reply
GET  /api/cron/daily-thread
GET  /api/cron/community-agent
GET  /api/cron/dm-review
```

Ejemplo body para sugerencias:

```json
{ "post": false, "maxAnswers": 4, "messageCount": 50, "includeCommunity": true }
```

Control de volumen:

```bash
AGENT_MAX_ANSWERS=4
AGENT_MESSAGE_COUNT=50
AGENT_MIN_CONFIDENCE=0.72
```

En Vercel, `vercel.json` programa `/api/cron/daily-thread` a las 10:00 y 11:00 AM ARG. El segundo horario funciona como retry: si `output/published-url-YYYY-MM-DD.txt` ya existe, el job saltea la publicación para no duplicar. En Hobby, Vercel puede ejecutar los crons en cualquier momento dentro de la hora configurada, por eso el retry vive en la hora siguiente.

Para producción, usá `DATA_STORE=github` con `GITHUB_TOKEN` para que ese marker persista entre corridas serverless. Además, antes de publicar, el job busca en la categoría de Community si ya existe un daily thread con el título del día; si existe, guarda el marker y saltea.

También programa `/api/cron/community-agent` aproximadamente cada 90 minutos entre 10 AM y 7 PM ARG. Vercel usa cron en UTC, por eso hay varias entradas horarias.

También programa `/api/cron/dm-review` a las 3:30 PM y 6:00 PM ARG. Este job revisa como máximo 5 canales DM activos del día Argentina actual, guarda el timeline de mensajes del día en `output/dm-review-YYYY-MM-DD.json` y no responde automáticamente. Desde la UI se puede pedir un draft de Claude por conversación; las respuestas a DMs se envían manualmente, una conversación a la vez.

## Archivos Generados

| Archivo | Contenido |
|---|---|
| `output/daily-thread-YYYY-MM-DD.md` | Daily thread renderizado |
| `output/announcement-YYYY-MM-DD.md` | Announcement renderizado |
| `output/published-url-YYYY-MM-DD.txt` | URL publicada |
| `output/dm-review-YYYY-MM-DD.json` | Conversaciones DM detectadas en el día Argentina actual |
| `output/operations-log.json` | Log de acciones operativas |
| `output/community-agent-state.json` | Mensajes ya procesados por el Community Agent |

## Tests

```bash
npm test
```

## Estado Actual a Limpiar

- La publicación ya no usa browser automation ni Playwright.
- El repo tiene jobs locales y cron de Vercel para el Community Agent.
- La config del servidor es read-only; Settings solo permite guardar el admin token local del navegador.
