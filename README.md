# Formulario de Inscripción - Ruta del Acordeón 10K 2026

Aplicación web hecha con Node.js y Express para gestionar las inscripciones del evento.

## Incluye

- Formulario público de inscripción
- Base de datos persistente en `data/db.json`
- Carga de comprobante de pago
- Panel administrativo con usuario y contraseña
- Validación manual de inscritos
- Aprobación o rechazo desde el panel
- Envío de correo al aprobar una inscripción

## Requisitos

- Node.js 20 o superior

## Configuración

1. Instala dependencias:

```bash
npm install
```

2. Crea el archivo `.env` a partir de `.env.example`.

3. Ajusta al menos estas variables:

```env
SESSION_SECRET=una-clave-segura
ADMIN_USERNAME=admin
ADMIN_PASSWORD=tu-clave-segura
EVENT_NAME=Carrera Atletica Ruta del Acordeon 10K - 2026
```

4. Si quieres enviar correos al aprobar, configura SMTP:

```env
SMTP_HOST=smtp.tuservidor.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=usuario@dominio.com
SMTP_PASS=tu-clave
SMTP_FROM=usuario@dominio.com
```

5. Inicia el proyecto:

```bash
npm start
```

La app quedará disponible en [http://localhost:3000](http://localhost:3000).

## Publicación en la web

Puedes desplegarla en un VPS, Railway, Render o cualquier hosting Node.js.

Puntos importantes para producción:

- Debes mantener persistentes las carpetas `data/` y `uploads/`
- Configura variables de entorno seguras
- Usa un servicio SMTP real para el envío de correos
- Si usas proxy reverso, publícala detrás de HTTPS

## Render

El proyecto ya incluye un archivo `render.yaml` listo para crear el servicio.

### Lo que necesitas en Render

- Un repositorio en GitHub, GitLab o Bitbucket
- Un web service de tipo Node
- Un disco persistente, porque la app guarda:
  - la base de datos JSON
  - los comprobantes subidos por los participantes

### Configuración usada

- `buildCommand`: `npm install`
- `startCommand`: `npm start`
- `healthCheckPath`: `/health`
- disco persistente montado en `/opt/render/project/src/storage`

### Variables importantes

- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `EVENT_DATE`
- `EVENT_TIME`
- `EVENT_LOCATION`
- `EVENT_CONTACT_EMAIL`
- `EVENT_CONTACT_PHONE`
- `SMTP_HOST`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

Si no configuras SMTP, la aprobación funcionará, pero el correo quedará marcado como no enviado.

## Acceso administrador

El acceso se hace desde `/admin` con el usuario y contraseña definidos en el archivo `.env`.
