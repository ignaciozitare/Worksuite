# WORK_STATE

_Última actualización: 2026-04-14_

---

## 🎯 Tarea en curso

**Vector Logic — Phase 1: Workflow Engine.** Nuevo módulo completo de orquestación de tareas dentro de WorkSuite.

## 📍 Punto exacto

Rama: `feat/vector-logic-phase1-workflow-engine`

**Hecho:**
- SPEC escrito en `specs/modules/vector-logic/SPEC.md`
- DB: tablas `vl_workflows`, `vl_states`, `vl_workflow_states`, `vl_transitions`, `vl_task_types` — creación en curso
- Domain: entidades + ports creados (Workflow, State, Transition, TaskType)
- Infra: 4 repos Supabase creados
- Container: `modules/vector-logic/container.ts`
- Index: `modules/vector-logic/index.ts`

**Pendiente:**
- UI shell (VectorLogicPage.tsx con sidebar Stitch)
- StateManagerView (4 columnas por categoría, CRUD estados)
- CanvasDesignerView (React Flow — necesita npm install @xyflow/react)
- AssignmentManagerView (tabla task types → workflows)
- i18n keys en es.json / en.json
- Integrar en WorkSuiteApp.tsx (ruta + nav)

## ✅ Decisiones tomadas

- Módulo dentro de WorkSuite (Vite + React + CSS vars), NO Next.js/Tailwind
- React Flow para canvas designer
- Hexagonal estricto: container.ts, zero infra in /ui/
- Prefijo DB: `vl_`
- Max 1 OPEN per workflow (unique conditional index)
- 4 fases: Workflow Engine → Schema Builder → Kanban → Email Intelligence

## ⏭ Siguiente paso inmediato

Construir VectorLogicPage.tsx (shell con sidebar Stitch) y StateManagerView.tsx

## 🚫 Bloqueos / notas

- @xyflow/react necesita instalarse antes del Canvas Designer
- Supabase CLI instalándose para DDL
