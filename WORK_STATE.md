# WORK_STATE

_Última actualización: 2026-04-16_

---

## 🎯 Tarea en curso

**Vector Logic Phase 4 — Email Intelligence: end-to-end funcional.** Falta sólo config de env en Vercel + testing real con un inbox.

## 📍 Punto exacto

- **Main**: `6cba531` — pipeline de ingesta real.
- **Main**: `3d842f6` — scaffold previo (OAuth + rules + detections UI).
- **DB**: 3 tablas + extensión a `vl_tasks` (migration `20260416_vl_email_intelligence_initial.sql`).
- **Backend** (apps/api):
  - OAuth flow completo (`GmailOAuthService`).
  - Ingesta real: `GmailProvider` (list + parse), `MatchEmailAgainstRules`, `ExtractTaskFromEmail` (LLM con tool schema), `PollInboxForUser` (orquestador).
  - Rutas: `POST /email-intel/ingest` (manual user) + `GET /email-intel/ingest/cron` (bearer CRON_SECRET).
  - `vercel.json` configurado con cron cada 5 minutos.
  - Tokens cifrados AES-256-GCM.
- **Frontend** (apps/web):
  - `EmailRulesView` (CRUD con filtros componibles + acciones).
  - `AIDetectionsView` (tabs por status + modal approve/edit/reject + botón "Poll now").
  - Panel Email Intelligence en Settings (OAuth connect/disconnect + sliders + defaults).
  - i18n EN/ES completo.
- **Review Agent**: clean.
- **TSC baseline**: 23 errores pre-existentes (sin regresión).

## ✅ Decisiones tomadas (recientes)

- LLM de extracción usa el `vl_ai_settings` del usuario (no una key del servidor) → costo en la cuenta del usuario, no del proyecto.
- Rule overrides ganan sobre IA ganan sobre defaults (orden estricto de prioridad).
- LLM devuelve `is_actionable: false` → detection queda como `rejected` silenciosamente (no molesta al usuario).
- Sin `vl_ai_settings` configurado → emails matcheados caen a `pending_review` con campos vacíos (graceful degradation).
- Cron Vercel = GET con bearer `CRON_SECRET`. Manual trigger = POST autenticado como usuario.
- 10-item backlog de features deferidas documentado en SPEC.md (push real-time, sandbox, visual editor, reply, attachments, multi-provider, historical reprocessing, learning loop, shared inboxes, multi-account).

## ⏭ Siguiente paso inmediato

**Usuario configura env vars en Vercel (apps/api)**:

1. **Google Cloud Console**:
   - Crear OAuth 2.0 Client ID tipo "Web application".
   - Authorized redirect URI: `https://worksuite-api.vercel.app/email-intel/oauth/callback`.
   - Habilitar Gmail API en el proyecto.
   - Copiar Client ID + Client Secret.

2. **Vercel (proyecto apps/api)**:
   - `GOOGLE_CLIENT_ID` = (del paso 1)
   - `GOOGLE_CLIENT_SECRET` = (del paso 1)
   - `GOOGLE_OAUTH_REDIRECT_URI` = `https://worksuite-api.vercel.app/email-intel/oauth/callback`
   - `EMAIL_INTEL_TOKEN_KEY` = salida de `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   - `CRON_SECRET` = string aleatorio largo (para el cron automático).

3. **Después**:
   - Conectar Gmail en Settings → Email Intelligence.
   - Crear al menos una rule (ej. `domain: gmail.com` + action: task type = Task).
   - Click "Poll now" para testear. O esperar 5min al cron.

## 🚫 Bloqueos / notas

- Sin env vars configurados, el botón "Connect Gmail" está gris y el panel muestra warning ámbar.
- Sin `vl_ai_settings`, las detecciones matcheadas caen a review con campos vacíos — no rompe, sólo pierde la extracción IA.
- **Deuda pre-existente**: `retro/ui/RetroBoard.tsx` importa de `/infra/`. No tocar sin spec.
- **Deuda Modal**: 5 módulos con Modal inline. No urgente.
- El cron de Vercel sólo corre en planes **Pro o Enterprise** — si el proyecto está en Hobby, el cron se ignora silenciosamente (pero el endpoint manual "Poll now" sigue funcionando).
