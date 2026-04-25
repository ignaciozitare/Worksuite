// ─── @worksuite/ui — public API ───────────────────────────────────────────────
// Import tokens in your app entry:
//   import '@worksuite/ui/tokens';

// ── Atoms ──────────────────────────────────────────────────────────────────────
export { Btn }                           from './components/Btn';
export type { BtnVariant, BtnSize }     from './components/Btn';

export { Avatar, Badge, StatBox, Divider, Chip } from './components/Atoms';
export type { }                         from './components/Atoms';

// ── Overlay ────────────────────────────────────────────────────────────────────
export { Modal, ConfirmModal }           from './components/Modal';

// ── Dialog Provider ───────────────────────────────────────────────────────────
export { DialogProvider, useDialog }     from './components/DialogProvider';

// ── Gantt Timeline ────────────────────────────────────────────────────────────
export { GanttTimeline }                 from './components/GanttTimeline';
export type { GanttBar, GanttGroup, GanttZoom, GanttTimelineProps } from './components/GanttTimeline';

// ── Timer ──────────────────────────────────────────────────────────────────────
export { TimerBar }                      from './components/TimerBar';

// ── Jira Ticket Search ────────────────────────────────────────────────────────
export { JiraTicketSearch }              from './components/JiraTicketSearch';
export type { JiraIssueOption, JiraTicketSearchProps } from './components/JiraTicketSearch';

// ── Jira Ticket Picker ────────────────────────────────────────────────────────
export { JiraTicketPicker }              from './components/JiraTicketPicker';
export type { JiraTicketOption, JiraTicketPickerProps } from './components/JiraTicketPicker';

// ── Status Manager ────────────────────────────────────────────────────────────
export { StatusManager }                 from './components/StatusManager';
export type { StatusItem, StatusCategoryOption, StatusManagerProps } from './components/StatusManager';

// ── Dual Panel Picker ─────────────────────────────────────────────────────────
export { DualPanelPicker }               from './components/DualPanelPicker';
export type { DualPanelItem, DualPanelPickerProps } from './components/DualPanelPicker';

// ── Date Range Picker ─────────────────────────────────────────────────────────
export { DateRangePicker }               from './components/DateRangePicker';
export type { DateRangePickerProps }     from './components/DateRangePicker';

// ── Card ──────────────────────────────────────────────────────────────────────
export { Card }                          from './components/Card';
export type { CardVariant, CardProps }   from './components/Card';

// ── MultiSelect Dropdown ──────────────────────────────────────────────────────
export { MultiSelectDropdown }           from './components/MultiSelectDropdown';
export type { MultiSelectDropdownItem, MultiSelectDropdownProps } from './components/MultiSelectDropdown';

// ── User Avatar ───────────────────────────────────────────────────────────────
export { UserAvatar, AVATAR_PRESETS, PRESET_GRADIENT_MAP, getAvatarInitials, isPresetAvatarUrl, getPresetFromAvatarUrl } from './components/UserAvatar';
export type { UserAvatarProps, UserAvatarUser, AvatarPreset } from './components/UserAvatar';

// ── Icons ─────────────────────────────────────────────────────────────────────
export { BugIcon }                       from './components/BugIcon';
