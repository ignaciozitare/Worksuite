# SPEC — Login Screen Redesign (Carbon Logic)

**Tipo:** Core change (UI/UX)
**Diseño fuente:** Pencil → `pencil-new.pen` → `screen/login` (nodeId `okQCH`)
**Última actualización:** 2026-04-26

---

## 1. Propósito
Reemplazar la pantalla de login actual por la versión rediseñada del Pencil, alineada con el design system Carbon Logic. No cambia el flujo de autenticación ni el backend — sólo la presentación visual.

## 2. Quiénes lo usan
Cualquier usuario no autenticado que accede a WorkSuite. Es la primera pantalla pública.

## 3. Qué puede hacer el usuario
- Ingresar email y contraseña.
- Enviar el formulario para iniciar sesión.
- Ver el estado de error si las credenciales son inválidas o falta un campo.
- Leer el aviso "Don't have an account? Contact admin" (texto informativo, sin link).

## 4. Layout

### Desktop (≥ 1024px)
Split 50/50 horizontal:

**Izquierda — Hero**
- Fondo: gradient radial dark blue (`#0e0e0e → #131f3a → #0e0e0e`, 225°).
- Centrado vertical y horizontal, gap 24px.
- Eyebrow: `WORKSUITE` (Inter 700, 11px, letter-spacing 0.1, color `--ac` / primary-strong).
- Headline: `Work smarter,\nnot harder.` (Inter 600, 48px, letter-spacing -0.02, color `--tx`, alineación centro, dos líneas).
- Tagline: `Your all-in-one platform for time tracking, desk management, deployments, and team collaboration.` (Inter 400, 16px, color `--tx2`, alineación centro, ancho 400).

**Derecha — Form panel**
- Ancho fijo 480px, fondo `--bg` (surface-lowest), padding 48px, gap 32px, centrado vertical.
- Header: "Welcome back" (Inter 600, 28px, -0.02 tracking) + "Sign in to your account" (Inter 400, 14px, muted).
- Form (gap 20px):
  - Label `EMAIL` (Inter 700, 12px, ALL CAPS, 0.05 tracking, color muted) + input field (`--sf` background, radius-md, padding 10/14).
  - Label `PASSWORD` (idem) + input field type="password".
  - Botón `Sign In`: full width, gradient `--ac → --ac2`, radius-lg, padding 10/20, glow shadow (`#4d8eff4D`, blur 12, offset y:4), texto Inter 600 14px color `--bg`.
- Footer (centrado): "Don't have an account? Contact admin" (texto plano, sin click — "Contact admin" sólo cambia de color a primary).

### Mobile (< 1024px)
Sólo el panel derecho, ocupando 100% del viewport. El hero izquierdo se oculta. El form queda centrado en pantalla con padding lateral cómodo.

## 5. Estados y comportamiento

- **Idle (default):** form vacío, botón habilitado.
- **Loading:** botón deshabilitado mientras se procesa el login (mantener el spinner/loader que ya tiene la implementación actual si existe).
- **Error de auth (credenciales inválidas, campo vacío, error de red):** banner rojo arriba del form con el mensaje correspondiente. Estilo: fondo rojo al 10%, texto rojo, sin borde, radius-md, padding cómodo. Reutilizar tokens semánticos `--red`.
- **Éxito:** redirige según el flujo actual de autenticación (sin cambios).

## 6. Reglas
- Email y contraseña son obligatorios. Si falta alguno, mostrar error sin pegarle al backend.
- No se permite registro desde el frontend (el footer es informativo: pedir invitación al admin por canales externos).
- Cero hardcoded hex para colores de UI — todo vía CSS vars (`var(--bg)`, `var(--sf)`, `var(--tx)`, `var(--ac)`, `var(--red)`, etc). El gradient específico del hero usa variables nuevas (`--login-hero-gradient`, `--login-hero-glow-1`, `--login-hero-glow-2`) definidas en `WorkSuiteApp.css`.
- **Excepción aceptada:** los SVG icons de SSO (Google, Microsoft) usan los hex oficiales de la marca por requerimiento de identidad visual. No se sustituyen por tokens del DS.
- Sizing tokens (border-radius en input/botón): se aceptan literales numéricos cuando no hay var dedicada (p.ej. `borderRadius: 8` cuando aún no existe `--r3` específico). Los colores **siempre** vía CSS var.

## 7. i18n
- Todas las strings visibles van por `t()` desde `@worksuite/i18n`.
- **Decisión técnica:** se reutiliza el namespace existente `auth.*` (camelCase) en lugar de crear un namespace nuevo `login.*` paralelo. Esto evita duplicación con keys ya presentes en producción y mantiene la convención del resto del repo.
- Keys reutilizadas (ya existían):
  - `auth.tagline` → "Work smarter,\nnot harder."
  - `auth.taglineDesc` → "Your all-in-one platform for time tracking, desk management, deployments, and team collaboration."
  - `auth.welcomeBack` → "Welcome back"
  - `auth.signInSubtitle` → "Sign in to your account"
  - `auth.email` → "Email"
  - `auth.password` → "Password"
  - `auth.login` → "Sign In"
  - `auth.signingIn` → "Signing in…"
  - `auth.noAccount` → "Don't have an account?"
  - `auth.orContinueWith` → "or continue with"
- Keys agregadas en este rediseño:
  - `auth.contactAdmin` → "Contact admin" (rename desde `auth.employeeAdmin`)
  - `auth.errorRequired` → "Email and password are required"
  - `auth.errorNetwork` → "Could not connect. Try again."
  - `auth.showPassword` → "Show password" (aria-label)
  - `auth.hidePassword` → "Hide password" (aria-label)
- El label `EMAIL` / `PASSWORD` se renderiza con `text-transform: uppercase` sobre las keys `auth.email` / `auth.password`. No se duplican keys en mayúsculas.
- El eyebrow `WORKSUITE` se renderiza con `t('app.name').toUpperCase()` reutilizando la key existente.
- Por decisión del usuario: ambos archivos (`en.json` y `es.json`) llevan los **mismos strings en inglés** para todo el namespace `auth.*`. Sin traducción al español en este momento.

## 8. Conexiones
- Reutiliza el flujo de auth actual (Supabase Auth). No se modifican `IAuthRepository`, `useAuth`, `SupabaseAuthRepository`, ni nada del lado de domain/infra.
- El componente activo a reemplazar se confirma en la fase Scaffold/Dev. Hay dos candidatos en el repo (`apps/web/src/shared/auth/LoginPage.tsx` y `apps/web/src/modules/auth/LoginPage.tsx`); el Scaffold Agent valida cuál está montado en el router antes de tocar nada.

## 9. Fuera de alcance
- Cualquier cambio a la lógica de autenticación, tabla de usuarios, sesión, RLS, o providers.
- "Forgot password" / "Reset password" / "Sign up" — no se agregan.
- **SSO con Google/Microsoft:** no se agregan providers nuevos. Los botones SSO existentes (condicionales según `getSsoConfig()` desde DB) **se preservan** en el rediseño y se restilan al sistema Carbon Logic. Si la config de SSO está deshabilitada, los botones no se renderizan y queda 100% Pencil-faithful.
- Animaciones complejas (transiciones del hero, parallax, etc.) — sólo los efectos del DS (glow del botón, hover ghost border).
- Tema light en login — el diseño Pencil es dark; el login renderiza el mismo gradient hero y panel oscuro en ambos temas (las CSS vars del login están definidas idénticas en `:root`, `[data-theme="dark"]` y `[data-theme="light"]`). Light específico para login se considera en una iteración posterior si hace falta.

## 10. Modelo de datos

**No aplica — cambio exclusivamente UI/UX.**

Confirmado por DBA Agent (2026-04-26):
- Cero entidades nuevas, cero columnas nuevas, cero migraciones.
- La autenticación sigue corriendo sobre `auth.users` (Supabase Auth) + `public.users` ya existente.
- Adaptadores y puertos del dominio (`IAuthRepository`, `SupabaseAuthRepository`, `useAuth`) no se tocan.
- No hay nuevas RLS policies, índices, ni triggers.
- El cambio vive 100% en `apps/web/src/...` (componente del login + i18n keys + CSS vars si hicieran falta).
