// @ts-nocheck
import { useState } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { supabase } from '@/shared/lib/supabaseClient';
import { AdminFichajeSupabaseRepository } from '../infra/supabase/AdminFichajeSupabaseRepository';
import { AdminVacacionSupabaseRepository } from '../infra/supabase/AdminVacacionSupabaseRepository';
import { EquipoHoyView } from './views/EquipoHoyView';
import { FichajesEquipoView } from './views/FichajesEquipoView';
import { AprobacionesView } from './views/AprobacionesView';
import { GestionVacacionesView } from './views/GestionVacacionesView';
import { InformesEmpresaView } from './views/InformesEmpresaView';

const fichajeRepo = new AdminFichajeSupabaseRepository(supabase);
const vacacionRepo = new AdminVacacionSupabaseRepository(supabase);

const TABS = [
  { id: 'equipo',      key: 'chronoAdmin.equipoHoy' },
  { id: 'fichajes',    key: 'chronoAdmin.fichajesEquipo' },
  { id: 'aprobaciones', key: 'chronoAdmin.aprobaciones' },
  { id: 'vacaciones',  key: 'chronoAdmin.gestionVacaciones' },
  { id: 'informes',    key: 'chronoAdmin.informesEmpresa' },
];

export function ChronoAdminPage({ currentUser }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('equipo');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg,#0e0e12)' }}>
      {/* ── Header + pill tabs ─────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px',
        borderBottom: '1px solid var(--bd,#2a2a38)', background: 'var(--sf,#141418)', flexShrink: 0,
      }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--tx,#e4e4ef)', marginRight: 12 }}>
          Chrono Admin
        </h2>
        <div style={{
          display: 'flex', gap: 2, background: 'var(--sf2,#1b1b22)',
          border: '1px solid var(--bd,#2a2a38)', borderRadius: 8, padding: 3,
        }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '4px 12px', fontSize: 12, borderRadius: 6,
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontWeight: activeTab === tab.id ? 600 : 400,
                background: activeTab === tab.id ? 'var(--ac,#4f6ef7)' : 'transparent',
                color: activeTab === tab.id ? '#fff' : 'var(--tx3,#50506a)',
                boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,.15)' : 'none',
                transition: 'all .15s',
              }}
            >
              {t(tab.key)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {activeTab === 'equipo' && (
          <EquipoHoyView fichajeRepo={fichajeRepo} />
        )}
        {activeTab === 'fichajes' && (
          <FichajesEquipoView fichajeRepo={fichajeRepo} />
        )}
        {activeTab === 'aprobaciones' && (
          <AprobacionesView
            fichajeRepo={fichajeRepo}
            vacacionRepo={vacacionRepo}
            currentUser={currentUser}
          />
        )}
        {activeTab === 'vacaciones' && (
          <GestionVacacionesView vacacionRepo={vacacionRepo} />
        )}
        {activeTab === 'informes' && (
          <InformesEmpresaView />
        )}
      </div>
    </div>
  );
}
