# WORK_STATE

_Última actualización: 2026-04-16 (tarde)_

---

## 🎯 Tarea en curso

**Vector Logic Phase 4 — Email Intelligence: LIVE en prod, Gmail conectado.** Listo para crear la primera regla y probar "Poll now" end-to-end.

## 📍 Punto exacto

- **Frontend**: `worksuite.vercel.app` — Phase 4 UI desplegada (EmailRulesView, AIDetectionsView, panel Gmail en Settings).
- **API**: `worksuite-api.vercel.app` — deploy `dpl_3Z1kNaSKBsaemSkD27erC2d2Hx5s` (`/health` devuelve 200).
- **Main**: commit `ee4027c` (daily cron for Hobby plan).
- **DB**: migration `20260416_vl_email_intelligence_initial.sql` aplicada.
- **OAuth Gmail**: ✅ conectado (ignaciozitare@gmail.com autorizado via Google OAuth consent).
- **Env vars (Vercel worksuite-api)**: las 5 cargadas y verificadas sin newlines.
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `EMAIL_INTEL_TOKEN_KEY`, `CRON_SECRET`.

## ✅ Decisiones tomadas (recientes)

- Cron cambiado a daily (`0 9 * * *`) por límite del Hobby plan. El botón "Poll now" sirve para triggers manuales.
- OAuth consent screen quedó en modo Testing con `ignaciozitare@gmail.com` como test user. Para habilitar más users hay que agregarlos como test users o publicar la app (requiere verificación de Google por el scope sensitive `gmail.readonly`).
- Vercel webhook GitHub está caído — los pushes no auto-deploy. Se arregló con deploy via CLI usando token. Pendiente reconectar Git integration en Vercel Settings.

## ⏭ Siguiente paso inmediato

1. Ir a Vector Logic → Email Rules → crear 1 regla (ej. filter domain = `gmail.com` → action task type opcional).
2. AI Detections → **Poll now** → validar que:
   - Trae mensajes recientes del Gmail.
   - Matchea contra la regla.
   - Extrae campos vía LLM (requiere `vl_ai_settings` configurado con provider + API key).
   - Si confianza ≥ threshold → auto-crea task en Kanban.
   - Si < threshold → queda en pending_review.
3. Approve / Reject una detection para verificar el lifecycle completo.
4. Si todo OK, marcar Phase 4 como SHIPPED en SPEC.md.

## 🚫 Bloqueos / notas

- **Vercel Git integration rota**: pushes a main no auto-deployan el API. Workaround: deploy via CLI. Fix: Vercel → worksuite-api → Settings → Git → disconnect y reconectar.
- **Webhook arreglo = nice to have** — mientras no se arregle, cada cambio al API requiere deploy manual.
- **Sensitive scope `gmail.readonly`**: en Testing mode, máximo 100 test users y token refresh expira cada 7 días. Aceptable para v1.
- **No hay LLM extraction si el user no tiene `vl_ai_settings`**: en ese caso las detections caen a `pending_review` con campos vacíos. Graceful degradation.
- **Deuda Modal**: 5 módulos con Modal inline. No urgente.
- **Deuda hexagonal retro**: `retro/ui/RetroBoard.tsx` importa de `/infra/`. Fuera de scope.

## Backlog explícito (Phase 4 follow-ups)

Ya documentados en `specs/modules/vector-logic/SPEC.md` sección "Planned future iterations":
1. Push real-time (Gmail Pub/Sub)
2. Sandbox de testing
3. Visual rule editor
4. Reply desde tasks
5. Attachments
6. Multi-provider (Outlook/IMAP)
7. Reprocesar histórico
8. Learning loop
9. Shared team inboxes
10. Multi-account per user
