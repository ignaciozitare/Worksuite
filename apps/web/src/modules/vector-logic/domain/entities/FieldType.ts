/** All supported field types for the Task Type Schema Builder */
export type FieldTypeId =
  | 'title'
  | 'short_text'
  | 'long_text'
  | 'rich_text'
  | 'single_select'
  | 'multi_select'
  | 'checkbox'
  | 'radio_group'
  | 'date'
  | 'start_date'
  | 'due_date'
  | 'time'
  | 'datetime_range'
  | 'number'
  | 'currency'
  | 'url'
  | 'email'
  | 'phone'
  | 'user_picker'
  | 'assignee'
  | 'file_upload'
  | 'tags'
  | 'status_ref'
  | 'logic_connector';

export interface FieldTypeDefinition {
  id: FieldTypeId;
  labelKey: string;
  icon: string;
  category: 'core' | 'text' | 'selection' | 'system' | 'date' | 'media' | 'relation';
  hasOptions?: boolean;
}

export const FIELD_TYPES: FieldTypeDefinition[] = [
  // Core (always-useful starter fields)
  { id: 'title',          labelKey: 'vectorLogic.fieldTitle',         icon: 'title',            category: 'core' },
  { id: 'rich_text',      labelKey: 'vectorLogic.fieldRichText',      icon: 'edit_note',        category: 'core' },
  { id: 'assignee',       labelKey: 'vectorLogic.fieldAssignee',      icon: 'person',           category: 'core' },
  { id: 'start_date',     labelKey: 'vectorLogic.fieldStartDate',     icon: 'event_available',  category: 'core' },
  { id: 'due_date',       labelKey: 'vectorLogic.fieldDueDate',       icon: 'event_busy',       category: 'core' },
  // Text
  { id: 'short_text',     labelKey: 'vectorLogic.fieldShortText',     icon: 'short_text',       category: 'text' },
  { id: 'long_text',      labelKey: 'vectorLogic.fieldLongText',      icon: 'notes',            category: 'text' },
  // Selection
  { id: 'single_select',  labelKey: 'vectorLogic.fieldSingleSelect',  icon: 'arrow_drop_down',  category: 'selection', hasOptions: true },
  { id: 'multi_select',   labelKey: 'vectorLogic.fieldMultiSelect',   icon: 'checklist',        category: 'selection', hasOptions: true },
  { id: 'checkbox',       labelKey: 'vectorLogic.fieldCheckbox',      icon: 'check_box',        category: 'selection' },
  { id: 'radio_group',    labelKey: 'vectorLogic.fieldRadioGroup',    icon: 'radio_button_checked', category: 'selection', hasOptions: true },
  // Date & Time
  { id: 'date',           labelKey: 'vectorLogic.fieldDate',          icon: 'calendar_today',   category: 'date' },
  { id: 'time',           labelKey: 'vectorLogic.fieldTime',          icon: 'schedule',         category: 'date' },
  { id: 'datetime_range', labelKey: 'vectorLogic.fieldDatetimeRange', icon: 'date_range',       category: 'date' },
  // Data
  { id: 'number',         labelKey: 'vectorLogic.fieldNumber',        icon: 'tag',              category: 'system' },
  { id: 'currency',       labelKey: 'vectorLogic.fieldCurrency',      icon: 'payments',         category: 'system' },
  { id: 'url',            labelKey: 'vectorLogic.fieldUrl',           icon: 'link',             category: 'system' },
  { id: 'email',          labelKey: 'vectorLogic.fieldEmail',         icon: 'mail',             category: 'system' },
  { id: 'phone',          labelKey: 'vectorLogic.fieldPhone',         icon: 'phone',            category: 'system' },
  // People & Media
  { id: 'user_picker',    labelKey: 'vectorLogic.fieldUserPicker',    icon: 'person_search',    category: 'media' },
  { id: 'file_upload',    labelKey: 'vectorLogic.fieldFileUpload',    icon: 'attach_file',      category: 'media' },
  { id: 'tags',           labelKey: 'vectorLogic.fieldTags',          icon: 'sell',             category: 'media' },
  // Relations
  { id: 'status_ref',     labelKey: 'vectorLogic.fieldStatusRef',     icon: 'swap_horiz',       category: 'relation' },
  { id: 'logic_connector',labelKey: 'vectorLogic.fieldLogicConnector',icon: 'hub',              category: 'relation' },
];

/** A single field instance within a task type schema */
export interface SchemaField {
  id: string;
  fieldType: FieldTypeId;
  label: string;
  required: boolean;
  showOnCreate: boolean;
  showOnDetail: boolean;
  /**
   * Which column of the detail modal the field renders in.
   * Optional for backward-compat: legacy fields without this value
   * are treated as 'main'.
   */
  column?: 'main' | 'sidebar';
  /** Render this field on Kanban task cards. Enforced max 4 per task type in UI. */
  showOnCard?: boolean;
  options?: string[];
  defaultValue?: unknown;
  order: number;
}

/** Maximum number of fields that can be toggled into the Kanban card. */
export const MAX_CARD_FIELDS = 4;

/** Field types that shadow a native column on `vl_tasks` — writes go to the native column, not task.data. */
export const NATIVE_FIELD_TYPES: FieldTypeId[] = ['assignee', 'due_date', 'start_date'];

/**
 * Default fields automatically added when a new task type is created.
 * Title and a rich-text Description field are always present out of the box.
 */
export function defaultFieldsForNewTaskType(): SchemaField[] {
  return [
    {
      id: 'fld_title',
      fieldType: 'title',
      label: 'Title',
      required: true,
      showOnCreate: true,
      showOnDetail: true,
      column: 'main',
      order: 0,
    },
    {
      id: 'fld_description',
      fieldType: 'rich_text',
      label: 'Description',
      required: false,
      showOnCreate: true,
      showOnDetail: true,
      column: 'main',
      order: 1,
    },
    {
      id: 'fld_assignee',
      fieldType: 'assignee',
      label: 'Assignee',
      required: false,
      showOnCreate: true,
      showOnDetail: true,
      column: 'sidebar',
      showOnCard: true,
      order: 2,
    },
    {
      id: 'fld_start_date',
      fieldType: 'start_date',
      label: 'Start date',
      required: false,
      showOnCreate: false,
      showOnDetail: true,
      column: 'sidebar',
      order: 3,
    },
    {
      id: 'fld_due_date',
      fieldType: 'due_date',
      label: 'Due date',
      required: false,
      showOnCreate: true,
      showOnDetail: true,
      column: 'sidebar',
      showOnCard: true,
      order: 4,
    },
  ];
}
