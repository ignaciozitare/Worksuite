# WORK_STATE

_Última actualización: 2026-04-15_

---

## 🎯 Tarea en curso

**Vector Logic — Final QA + merge prep.** El módulo completo (las 4 fases) está construido en la rama `feat/vector-logic-phase1-workflow-engine` esperando merge a main. QA Agent ejecutándose.

## 📍 Punto exacto

Rama: `feat/vector-logic-phase1-workflow-engine` (10 commits, pusheados)

**Hecho (todas las fases completas):**
- SPEC completo en `specs/modules/vector-logic/SPEC.md`
- DB: 10 tablas `vl_*` (workflows, states, transitions, task_types, tasks, ai_settings, ai_conversations, ai_messages, ai_rules, workflow_states)
- Domain: 8 entidades + 7 ports (Workflow, State, Transition, TaskType, Task, FieldType, AI*, ILLMService)
- Infra frontend: 7 repos Supabase + LLMService HTTP client
- Infra backend: ILLMService port + LLMServiceAdapter + aiRoutes (Fastify)
- Container frontend: wiring completo, zero infra en UI
- UI: VectorLogicPage + 8 vistas (Kanban, Chat, StateManager, CanvasDesigner, AssignmentManager, SchemaBuilder, AIRules, Settings)
- React Flow integrado (`@xyflow/react`) para el Canvas Designer con StateNode custom
- i18n: 122 claves en vectorLogic namespace (es + en), 1029 total en sync
- Integrado en WorkSuiteApp.tsx con ruta `/vector-logic`
- Backend proxy `/ai/chat` para que API keys nunca vayan al navegador
- 6 agentes en `.claude/commands/` (spec, dba, scaffold, review, qa, deploy)
- CLAUDE.md actualizado con sección "Project Structure" y regla dura "secrets → apps/api"
- ARCHITECTURE.md actualizado con Vector Logic y AI proxy route

**QA Agent en curso:**
- Step 1 Review Agent: ✓ limpio
- Step 3 Deep Architecture: ✓ limpio
- Step 4 Deep Security: ✓ limpio
- Step 5 Shared Packages: ⚠️ Modal duplicado en 5 módulos (preexistente, recomendación)
- Step 6 i18n: ✓ 1029 keys en sync
- Step 7 Documentation: ✓ ARCHITECTURE.md actualizado en este commit
- Step 8 WORK_STATE: ✓ este archivo
- Step 2 Spec Compliance: pendiente — esperando mode block/warn del usuario
- Step 9 Final build: pendiente
- Step 10 Light/Dark manual: pendiente
- Step 11 Pre-merge checklist: pendiente

## ✅ Decisiones tomadas

- Módulo dentro de WorkSuite (Vite + React + CSS vars), NO Next.js/Tailwind
- React Flow para Canvas Designer
- Hexagonal estricto: container.ts, zero infra in /ui/
- Prefijo DB: `vl_`
- Max 1 OPEN per workflow (domain validation, no DB constraint por limitación PG)
- 4 fases: Workflow Engine → Schema Builder → Kanban → Email Intelligence
- LLM calls proxied por backend (`/ai/chat`) — API keys nunca en el navegador
- ChatView tiene tool use con `create_task` y `list_task_types`
- AI Rules en lenguaje natural se inyectan en el system prompt

## ⏭ Siguiente paso inmediato

Esperar respuesta del usuario para spec compliance mode (block/warn), luego terminar QA y proponer merge.

## 🚫 Bloqueos / notas

- **Modal duplicado**: 5 módulos (environments x2, chrono, vector-logic x2) tienen función `Modal` inline. El shared `@worksuite/ui` Modal existe pero usa `--ws-*` vars en vez de `--bg/--sf` del app. Refactor requiere 5 archivos, preexistente, flag como recomendación no blocker.
- **MCP endpoint real no implementado**: está configurable en Settings pero el cliente MCP desde navegador requiere backend adicional, documentado como extension point.
- **Llamadas LLM desde frontend**: el LLMService es HTTP client al backend; build correcto, no expone keys.
