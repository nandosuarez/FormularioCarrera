# Guia de Publicacion en Render con PostgreSQL

Esta aplicacion ya quedo preparada para funcionar en Render con PostgreSQL.

## Como funciona ahora

- Las inscripciones se guardan en PostgreSQL cuando existe `DATABASE_URL`.
- Los comprobantes de pago tambien se guardan dentro de PostgreSQL.
- Si `DATABASE_URL` esta vacia, la app usa el modo local con `data/db.json`.
- El panel administrativo sigue funcionando en `/admin`.

## Probar local

### Opcion 1: modo local simple

```powershell
Copy-Item .env.example .env
npm install
npm start
```

Esto usa `data/db.json` si no configuras `DATABASE_URL`.

### Opcion 2: probar el flujo PostgreSQL sin instalar Postgres

```powershell
Copy-Item .env.example .env
$env:DATABASE_URL="pgmem://local"
npm install
npm start
```

Ese modo usa una base en memoria compatible con PostgreSQL para pruebas rapidas. No conserva datos al reiniciar.

### Opcion 3: PostgreSQL real

Configura en `.env`:

```env
DATABASE_URL=postgresql://usuario:clave@host:5432/base_de_datos
DATABASE_SSL=false
```

Luego inicia la app:

```powershell
npm start
```

## Publicarlo en Render

El archivo [render.yaml](/C:/Users/josef/OneDrive/Desktop/JFSS/Gimnasio/Proyectos/Formulario/render.yaml) ya crea:

- un `Web Service` de Node.js
- una base `Render Postgres`
- la variable `DATABASE_URL` enlazada automaticamente

### Pasos

1. Sube el proyecto a GitHub.
2. En Render entra a `New +`.
3. Elige `Blueprint`.
4. Conecta el repositorio.
5. Render leera `render.yaml` y mostrara el servicio junto con la base.
6. Completa las variables pendientes:
   - `ADMIN_PASSWORD`
   - `EVENT_DATE`
   - `EVENT_TIME`
   - `EVENT_LOCATION`
   - `EVENT_CONTACT_EMAIL`
   - `EVENT_CONTACT_PHONE`
   - `SMTP_HOST`
   - `SMTP_USER`
   - `SMTP_PASS`
   - `SMTP_FROM`
7. Confirma el deploy.

## Variables importantes

Base y seguridad:

- `DATABASE_URL`
- `DATABASE_SSL`
- `SESSION_SECRET`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

Datos del evento:

- `EVENT_NAME`
- `EVENT_DATE`
- `EVENT_TIME`
- `EVENT_LOCATION`
- `EVENT_CONTACT_EMAIL`
- `EVENT_CONTACT_PHONE`

Correo:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

## Verificaciones despues del deploy

Prueba estas rutas:

- `https://tu-app.onrender.com/health`
- `https://tu-app.onrender.com/`
- `https://tu-app.onrender.com/admin`

## Notas

- Ya no necesitas disco persistente para la base ni para los comprobantes.
- Si no configuras SMTP, la aprobacion funciona pero el correo quedara marcado como fallido o no enviado.
- Al arrancar, la app crea las tablas necesarias automaticamente.
