// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// Vector Logic — Admin panel
// Hosts the configuration views that aren't meant for day-to-day user use:
// workflow state machines, canvas designer, schema builder, assignment,
// priorities, AI chat rules, email intelligence rules, and provider settings.
//
// Rendered from AdminShell when mod === 'vectorlogic'. Reuses the existing
// view components from apps/web/src/modules/vector-logic/ui/views so there's
// no duplication; this file is purely the tabs shell.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { StateManagerView } from '../../modules/vector-logic/ui/views/StateManagerView';
import { CanvasDesignerView } from '../../modules/vector-logic/ui/views/CanvasDesignerView';
import { AssignmentManagerView } from '../../modules/vector-logic/ui/views/AssignmentManagerView';
import { SchemaBuilderView } from '../../modules/vector-logic/ui/views/SchemaBuilderView';
import { AIRulesView } from '../../modules/vector-logic/ui/views/AIRulesView';
import { EmailRulesView } from '../../modules/vector-logic/ui/views/EmailRulesView';
import { SettingsView } from '../../modules/vector-logic/ui/views/SettingsView';
import { MCPInfoView } from '../../modules/vector-logic/ui/views/MCPInfoView';

type Tab =
  | 'settings'
  | 'workflows'
  | 'states'
  | 'schema'
  | 'assignment'
  | 'email-rules'
  | 'ai-rules'
  | 'mcp';

interface Props {
  currentUser: { id: string; name?: string; email: string; [k: string]: unknown };
  wsUsers?: Array<{ id: string; name?: string; email: string; avatar?: string }>;
}

export function AdminVectorLogic({ currentUser, wsUsers = [] }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('settings');

  const TABS: Array<{ id: Tab; label: string; icon: string }> = [
    { id: 'settings',    label: t('vectorLogic.settings'),          icon: 'settings' },
    { id: 'states',      label: t('vectorLogic.stateManager'),      icon: 'account_tree' },
    { id: 'workflows',   label: t('vectorLogic.canvasDesigner'),    icon: 'schema' },
    { id: 'schema',      label: t('vectorLogic.taskEntities'),      icon: 'category' },
    { id: 'assignment',  label: t('vectorLogic.assignmentManager'), icon: 'assignment' },
    { id: 'email-rules', label: t('vectorLogic.emailRules'),        icon: 'rule' },
    { id: 'ai-rules',    label: t('vectorLogic.aiRules'),           icon: 'psychology' },
    { id: 'mcp',         label: t('vectorLogic.mcpAccess'),         icon: 'hub' },
  ];

  return (
    <div className="avl" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <style>{`
        .avl-tabs {
          display: flex; gap: 2px;
          padding: 14px 20px 0;
          border-bottom: 1px solid var(--bd);
          flex-shrink: 0;
          overflow-x: auto;
        }
        .avl-tab {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 16px;
          border: none; background: transparent; color: var(--tx3);
          border-bottom: 2px solid transparent;
          font-family: inherit; font-size: 13px; font-weight: 500;
          cursor: pointer;
          letter-spacing: .01em;
          transition: all .15s;
          white-space: nowrap;
        }
        .avl-tab:hover { color: var(--tx); }
        .avl-tab.active {
          color: var(--ac);
          border-bottom-color: var(--ac);
          font-weight: 600;
        }
        .avl-tab .material-symbols-outlined { font-size: 18px; }
        .avl-content {
          flex: 1; min-height: 0;
          overflow: ${tab === 'workflows' ? 'hidden' : 'auto'};
          padding: ${tab === 'workflows' ? '0' : '24px 28px'};
          display: flex; flex-direction: column;
        }
      `}</style>

      <div className="avl-tabs">
        {TABS.map(x => (
          <button key={x.id}
            className={`avl-tab${tab === x.id ? ' active' : ''}`}
            onClick={() => setTab(x.id)}>
            <span className="material-symbols-outlined">{x.icon}</span>
            {x.label}
          </button>
        ))}
      </div>

      <div className="avl-content">
        {tab === 'settings'    && <SettingsView         currentUser={currentUser} />}
        {tab === 'workflows'   && <CanvasDesignerView   currentUser={currentUser} />}
        {tab === 'states'      && <StateManagerView     currentUser={currentUser} />}
        {tab === 'schema'      && <SchemaBuilderView    currentUser={currentUser} wsUsers={wsUsers} />}
        {tab === 'assignment'  && <AssignmentManagerView />}
        {tab === 'email-rules' && <EmailRulesView       currentUser={currentUser} />}
        {tab === 'ai-rules'    && <AIRulesView          currentUser={currentUser} />}
        {tab === 'mcp'         && <MCPInfoView          currentUser={currentUser} />}
      </div>
    </div>
  );
}
