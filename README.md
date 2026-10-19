# Bloquiz

Aplicación web de trivias multijugador en tiempo real. Frontend React/Vite y servidor Node.js/Express + Socket.IO. Incluye creación de trivias, PIN de sala, lobby, preguntas cronometradas, puntaje por rapidez/racha, resultados y podio.

> Bloquiz es una implementación original de trivia inspirada en mecánicas comunes de concursos educativos. No incluye marca, recursos ni código de Kahoot.

## Requisitos
- Node.js 20 o superior
- npm

## Ejecutar en local
Desde la carpeta raíz:

```bash
npm install
npm run install:all
npm run dev
```

Abre la dirección Vite que aparece en consola (normalmente `http://localhost:5173`). Para jugar en modo multijugador, abre dos o más pestañas. Un navegador crea la partida y los demás se unen con el PIN. El backend escucha en `http://localhost:3001` y `GET /health` verifica disponibilidad.

Si frontend y backend no están en el mismo origen, configura `VITE_SERVER_URL` en `client/.env.local` y `CLIENT_URL` en el backend. En producción, `CLIENT_URL` admite una lista de orígenes separados por coma.

## Despliegue gratuito: Render (backend) + Vercel (frontend)
Los niveles gratuitos, límites y políticas de inactividad de los proveedores pueden cambiar; revisa su documentación y el panel antes de publicar.

### 1. Publicar el repositorio
Sube esta carpeta a un repositorio GitHub propio. No subas `.env` ni secretos. Bloquiz no necesita claves secretas para el MVP.

### 2. Backend en Render
1. En Render, crea un **Web Service** y conecta el repositorio.
2. Configura **Root Directory** como `server`.
3. Build Command: `npm install`.
4. Start Command: `npm start`.
5. Añade `CLIENT_URL` con el dominio de producción del frontend de Vercel, por ejemplo `https://tu-app.vercel.app` (sin barra final).
6. Despliega y verifica `https://TU-SERVICIO.onrender.com/health`.

Render puede suspender servicios gratuitos inactivos y el primer arranque puede demorar. Socket.IO utiliza WebSocket con fallback HTTP; para una instancia única no hace falta Redis.

### 3. Frontend en Vercel
1. Importa el mismo repositorio en Vercel.
2. **Root Directory**: `client`.
3. Framework preset: **Vite**. Build Command: `npm run build`. Output Directory: `dist`.
4. Environment Variable: `VITE_SERVER_URL=https://TU-SERVICIO.onrender.com`.
5. Despliega. Luego vuelve a Render y establece `CLIENT_URL` exactamente con el dominio Vercel asignado, y reinicia/redeploya el backend.

Si usas dominio propio, actualiza `CLIENT_URL` en Render con ese origen. Para pruebas desde otro dispositivo, ambos servicios deben ser públicos por HTTPS.

## Eventos Socket.IO principales
- `room:create` → `{ questions }`, responde `{ pin }`
- `room:join` → `{ pin, nickname }`
- `room:state` → estado público de la sala
- `game:start`, `game:question`, `game:answer`, `answer:ack`
- `game:results`, `game:next`, `game:podium`

## Límites del MVP / producción
La partida vive en memoria: reiniciar el servidor borra salas, y una única instancia de backend es necesaria para cada partida. Para escalar, agrega almacenamiento Redis con adapter de Socket.IO, persistencia de quizzes, límites antiabuso, autenticación de anfitriones y validación/rate limiting. El proyecto reproduce un flujo jugable original, no todos los productos o sistemas propietarios de otras plataformas.
