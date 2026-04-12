// Ticket status vocabulary used by Deploy Planner's Planning + Detail views.

export const TICKET_STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  in_progress: { label: 'In Progress', color: '#64748b', bg: 'rgba(100,116,139,.12)', icon: '○' },
  in_review:   { label: 'In Review',   color: '#f59e0b', bg: 'rgba(245,158,11,.12)',  icon: '◑' },
  done:        { label: 'Done',        color: '#adc6ff', bg: 'rgba(77,142,255,.12)',  icon: '◉' },
  merged:      { label: 'Merged',      color: '#34d399', bg: 'rgba(52,211,153,.12)',  icon: '✓' },
};

export const TICKET_STATUSES = Object.keys(TICKET_STATUS_CFG);
export const MERGE_READY = ['done', 'merged'];
