// @ts-nocheck
import { useState } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { supabase } from '@/shared/lib/supabaseClient';
import { FichajeSupabaseRepository } from '../infra/supabase/FichajeSupabaseRepository';
import { BolsaHorasSupabaseRepository } from '../infra/supabase/BolsaHorasSupabaseRepository';
import { VacacionSupabaseRepository } from '../infra/supabase/VacacionSupabaseRepository';
import { IncidenciaSupabaseRepository } from '../infra/supabase/IncidenciaSupabaseRepository';
import { AlarmaSupabaseRepository } from '../infra/supabase/AlarmaSupabaseRepository';
import { DashboardView } from './views/DashboardView';
import { RegistrosView } from './views/RegistrosView';
import { IncompletosView } from './views/IncompletosView';
import { VacacionesView } from './views/VacacionesView';
import { AlarmasView } from './views/AlarmasView';

const fichajeRepo = new FichajeSupabaseRepository(supabase);
const bolsaRepo = new BolsaHorasSupabaseRepository(supabase);
const vacacionRepo = new VacacionSupabaseRepository(supabase);
const incidenciaRepo = new IncidenciaSupabaseRepository(supabase);
const alarmaRepo = new AlarmaSupabaseRepository(supabase);

type Tab = 'dashboard' | 'registros' | 'incompletos' | 'vacaciones' | 'alarmas';

const TABS: { key: Tab; labelKey: string }[] = [
  { key: 'dashboard', labelKey: 'chrono.dashboard' },
  { key: 'registros', labelKey: 'chrono.registros' },
  { key: 'incompletos', labelKey: 'chrono.incompletos' },
  { key: 'vacaciones', labelKey: 'chrono.vacaciones' },
  { key: 'alarmas', labelKey: 'chrono.alarmas' },
];

interface ChronoPageProps {
  currentUser: { id: string; email: string; [key: string]: unknown };
}

export function ChronoPage({ currentUser }: ChronoPageProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  const renderView = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardView
            fichajeRepo={fichajeRepo}
            bolsaRepo={bolsaRepo}
            currentUser={currentUser}
          />
        );
      case 'registros':
        return <RegistrosView fichajeRepo={fichajeRepo} currentUser={currentUser} />;
      case 'incompletos':
        return <IncompletosView fichajeRepo={fichajeRepo} currentUser={currentUser} />;
      case 'vacaciones':
        return <VacacionesView vacacionRepo={vacacionRepo} currentUser={currentUser} />;
      case 'alarmas':
        return <AlarmasView alarmaRepo={alarmaRepo} currentUser={currentUser} />;
      default:
        return null;
    }
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx,#e4e4ef)', margin: '0 0 20px' }}>
        {t('chrono.title')}
      </h1>

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          marginBottom: 24,
          background: 'var(--sf2,#1b1b22)',
          borderRadius: 12,
          padding: 4,
          border: '1px solid var(--bd,#2a2a38)',
          width: 'fit-content',
        }}
      >
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
                border: 'none',
                transition: 'all .15s',
                background: isActive ? 'var(--ac,#4f6ef7)' : 'transparent',
                color: isActive ? '#fff' : 'var(--tx3,#50506a)',
              }}
            >
              {t(tab.labelKey)}
            </button>
          );
        })}
      </div>

      {/* Active view */}
      {renderView()}
    </div>
  );
}
