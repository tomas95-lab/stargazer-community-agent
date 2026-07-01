# How to Use — Daily Thread Bot

## Requisitos

- Node.js instalado
- Google Chrome instalado
- Acceso a Outlier Community con Google OAuth

## Setup inicial (solo una vez)

```bash
cd daily-thread-bot
npm install
npx playwright install chromium
cp .env.example .env
```

## Configurar el daily thread

Editá `data/topics.json` con el contenido del día:

```json
[
  {
    "date": "",
    "title": "Título del daily thread (mínimo 15 caracteres)",
    "topic": "Tema del día",
    "reminderTitle": "Nombre del error común",
    "reminderBody": "Explicación del reminder en markdown",
    "goodExample": "Ejemplo correcto (texto plano)",
    "badExample": "Ejemplo incorrecto (texto plano)",
    "quickRule": "Regla rápida en una línea",
    "tags": ["daily_project_announcements"],
    "webinar": {
      "enabled": false,
      "mandatory": true,
      "timeLabel": "12:00 PM ARG",
      "link": "https://zoom.us/j/..."
    }
  }
]
```

Si `date` está vacío, usa la fecha de hoy automáticamente.

Para activar la sección de webinar, poné `"enabled": true`.

## Modo dry-run (sin publicar)

```bash
npm run daily -- --dry-run
```

Genera los archivos en `output/` sin abrir el browser:
- `output/daily-thread-YYYY-MM-DD.md`
- `output/announcement-YYYY-MM-DD.md`

Usá esto para revisar el contenido antes de publicar.

## Modo publish

```bash
npm run daily -- --publish
```

Flujo:
1. Muestra un preview en la terminal
2. Pide confirmación (y/N)
3. Abre Chrome con un perfil separado
4. Navega a Community → new topic
5. Llena título, body y tags
6. Publica el thread
7. Captura la URL publicada
8. Genera el announcement con esa URL
9. Pregunta si postear el announcement en el chat
10. Copia el announcement al clipboard

Para saltar confirmaciones:

```bash
npm run daily -- --publish --yes
```

## Primera vez: login

La primera vez que corrés `--publish`, el bot abre Chrome y detecta que no estás logueado:

1. Aparece el mensaje `🔐 Login required`
2. Logueate con Google OAuth en la ventana de Chrome
3. Una vez que llegás a Community, el bot continúa automáticamente
4. La sesión queda guardada en `.browser-profile/`
5. Las próximas veces no te pide login

## Archivos generados

Después de publicar, encontrás en `output/`:

| Archivo | Contenido |
|---|---|
| `daily-thread-YYYY-MM-DD.md` | Thread publicado |
| `announcement-YYYY-MM-DD.md` | Mensaje de announcement |
| `published-url-YYYY-MM-DD.txt` | URL del post publicado |

## Cambiar selectores

Si la UI de Community cambia, editá los selectores en `src/config.ts`:

```ts
export const selectors = {
  titleInput: '#reply-title, ...',
  bodyInput: '.d-editor-input, ...',
  createTopicButton: 'button.btn-primary.create, ...',
  tagChooser: '.mini-tag-chooser summary, ...',
  tagInput: '.mini-tag-chooser .filter-input, ...',
  tagOption: (tag: string) => `.select-kit-row[data-value="${tag}"], ...',
};
```

Cuando un selector falla, el bot guarda screenshot + HTML en `output/` para ayudar a debuggear.

## Variables de entorno (.env)

| Variable | Default | Descripción |
|---|---|---|
| `HEADLESS` | `false` | `true` para correr sin ventana visible |
| `COMMUNITY_NEW_TOPIC_URL` | `...?category_id=15895` | URL para crear nuevo topic |
| `COMMUNITY_CHAT_URL` | `.../chat/c/stargazer-axiom/828853` | URL del chat para announcements |
| `COMMUNITY_CATEGORY_ID` | `15895` | ID de la categoría Stargazer Axiom |
| `BROWSER_PROFILE_PATH` | `.browser-profile` | Carpeta del perfil de Chrome |
| `SLOW_MO` | `50` | Delay entre acciones (ms) |

## No commitear

Estos archivos están en `.gitignore` y nunca deben subirse:

- `.env` — config local
- `.browser-profile/` — sesión de Chrome
- `output/*.md`, `output/*.txt` — contenido generado
- `output/*.png`, `output/*.html` — capturas de error

## Troubleshooting

**"Target page, context or browser has been closed"**
→ No cierres la ventana de Chrome mientras el bot está corriendo.

**"Title must be at least 15 characters"**
→ El título en `topics.json` es muy corto.

**"You must choose at least 1 tag"**
→ Agregá `"tags": ["daily_project_announcements"]` en `topics.json`.

**Selector not found**
→ La UI de Community cambió. Revisá los screenshots en `output/` y actualizá los selectores en `src/config.ts`.

**ERR_NAME_NOT_RESOLVED**
→ Problema de DNS. Verificá tu conexión y que Tailscale no esté bloqueando el dominio.
