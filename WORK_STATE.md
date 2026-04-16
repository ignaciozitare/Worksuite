# WORK_STATE

_Última actualización: 2026-04-16_

---

## 🎯 Tarea en curso

**Vector Logic Phase 4 — Email Intelligence**. Scaffold + skeleton funcional completo (OAuth + rules CRUD + detections UI). Polling real de Gmail + extracción con LLM quedan pendientes para el próximo pase.

## 📍 Punto exacto

- **Main**: scaffold de Phase 4 pusheado (próximo commit).
- **DB**: 3 tablas creadas + `vl_tasks` extendido (migration `20260416_vl_email_intelligence_initial.sql`).
- **Backend** (apps/api):
  - Rutas `/email-intel/*` registradas (connection, oauth/start, oauth/callback, rules CRUD, detections list/approve/reject).
  - `GmailOAuthService` completo (auth URL + code exchange + refresh + userinfo).
  - `tokenCrypto` con AES-256-GCM (requiere `EMAIL_INTEL_TOKEN_KEY` en prod; no-op si falta).
  - 3 Supabase repos.
- **Frontend** (apps/web):
  - 2 vistas nuevas: `EmailRulesView` (CRUD con filtros componibles + acciones), `AIDetectionsView` (tabs por status + modal detalle con approve/edit/reject).
  - Panel Email Intelligence en `SettingsView` (connect/disconnect Gmail, slider de confianza, polling interval, defaults).
  - Sidebar: sección nueva "Email Intelligence" con 2 tabs.
  - i18n keys en EN/ES.
- **Review Agent**: corrido sobre Phase 4 — `#fff` sobre CTAs es convención del proyecto, hex en CanvasDesigner son exceptions React Flow SVG. Clean.
- **TSC baseline**: 23 errores (era 24) — bajé 1 agregando `FastifyRequest.user` en `fastify.d.ts`. Mis archivos nuevos: 0 errores.

## ✅ Decisiones tomadas (recientes)

- Seguí proceso completo CLAUDE.md: Spec → DBA → Scaffold → Dev → Review en cada fase de Phase 4.
- Scope v1 de Email Intelligence limitado a Gmail OAuth, rules CRUD, review inbox. Polling real + extracción LLM se posponen al próximo pase — no hay sentido testearlos hasta que el user configure `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_OAUTH_REDIRECT_URI` en Vercel.
- Backlog de 10 features deliberadamente deferidas documentado en `specs/modules/vector-logic/SPEC.md` sección "Planned future iterations".
- OAuth tokens encriptados en app layer con AES-256-GCM (EMAIL_INTEL_TOKEN_KEY). Si la key no existe, scheme degrada a no-op (ok para dev local).

## ⏭ Siguiente paso inmediato

1. Usuario configura en Vercel (apps/api):
   - `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID, tipo Web application).
   - `GOOGLE_OAUTH_REDIRECT_URI` = `https://worksuite-api.vercel.app/email-intel/oauth/callback` (añadir también en el OAuth Client de Google).
   - `EMAIL_INTEL_TOKEN_KEY` = salida de `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
2. Probar "Connect Gmail" flow end-to-end.
3. Crear al menos una rule.
4. Siguiente pase dev: polling real (Gmail API) + LLM extraction prompt + cron.

## 🚫 Bloqueos / notas

- **Polling + LLM extraction no implementados aún** — las tablas existen, las rutas aprueban/rechazan detections, pero no hay nada generándolas. Sin emails reales procesados hasta el próximo pase.
- **Cron**: Vercel cron se configurará con `/email-intel/ingest` route en el próximo pase (el endpoint aún no existe).
- **Deuda pre-existente hexagonal**: `apps/web/src/modules/retro/ui/RetroBoard.tsx` — sigue igual, fuera de scope.
- **Deuda Modal**: 5 módulos con `function Modal()` inline — no urgente.
