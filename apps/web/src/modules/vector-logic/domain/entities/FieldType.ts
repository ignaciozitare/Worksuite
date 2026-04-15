/** All supported field types for the Task Type Schema Builder */
export type FieldTypeId =
  | 'short_text'
  | 'long_text'
  | 'rich_text'
  | 'single_select'
  | 'multi_select'
  | 'checkbox'
  | 'radio_group'
  | 'date'
  | 'time'
  | 'datetime_range'
  | 'number'
  | 'currency'
  | 'url'
  | 'email'
  | 'phone'
  | 'user_picker'
  | 'file_upload'
  | 'tags'
  | 'status_ref'
  | 'logic_connector';

export interface FieldTypeDefinition {
  id: FieldTypeId;
  labelKey: string;
  icon: string;
  category: 'text' | 'selection' | 'system' | 'date' | 'media' | 'relation';
  hasOptions?: boolean;
}

export const FIELD_TYPES: FieldTypeDefinition[] = [
  // Text
  { id: 'short_text',     labelKey: 'vectorLogic.fieldShortText',    icon: 'short_text',      category: 'text' },
  { id: 'long_text',      labelKey: 'vectorLogic.fieldLongText',     icon: 'notes',            category: 'text' },
  { id: 'rich_text',      labelKey: 'vectorLogic.fieldRichText',     icon: 'edit_note',        category: 'text' },
  // Selection
  { id: 'single_select',  labelKey: 'vectorLogic.fieldSingleSelect', icon: 'arrow_drop_down',  category: 'selection', hasOptions: true },
  { id: 'multi_select',   labelKey: 'vectorLogic.fieldMultiSelect',  icon: 'checklist',        category: 'selection', hasOptions: true },
  { id: 'checkbox',       labelKey: 'vectorLogic.fieldCheckbox',     icon: 'check_box',        category: 'selection' },
  { id: 'radio_group',    labelKey: 'vectorLogic.fieldRadioGroup',   icon: 'radio_button_checked', category: 'selection', hasOptions: true },
  // Date & Time
  { id: 'date',           labelKey: 'vectorLogic.fieldDate',         icon: 'calendar_today',   category: 'date' },
  { id: 'time',           labelKey: 'vectorLogic.fieldTime',         icon: 'schedule',         category: 'date' },
  { id: 'datetime_range', labelKey: 'vectorLogic.fieldDatetimeRange',icon: 'date_range',       category: 'date' },
  // Data
  { id: 'number',         labelKey: 'vectorLogic.fieldNumber',       icon: 'tag',              category: 'system' },
  { id: 'currency',       labelKey: 'vectorLogic.fieldCurrency',     icon: 'payments',         category: 'system' },
  { id: 'url',            labelKey: 'vectorLogic.fieldUrl',          icon: 'link',             category: 'system' },
  { id: 'email',          labelKey: 'vectorLogic.fieldEmail',        icon: 'mail',             category: 'system' },
  { id: 'phone',          labelKey: 'vectorLogic.fieldPhone',        icon: 'phone',            category: 'system' },
  // People & Media
  { id: 'user_picker',    labelKey: 'vectorLogic.fieldUserPicker',   icon: 'person_search',    category: 'media' },
  { id: 'file_upload',    labelKey: 'vectorLogic.fieldFileUpload',   icon: 'attach_file',      category: 'media' },
  { id: 'tags',           labelKey: 'vectorLogic.fieldTags',         icon: 'sell',             category: 'media' },
  // Relations
  { id: 'status_ref',     labelKey: 'vectorLogic.fieldStatusRef',    icon: 'swap_horiz',       category: 'relation' },
  { id: 'logic_connector',labelKey: 'vectorLogic.fieldLogicConnector',icon:'hub',               category: 'relation' },
];

/** A single field instance within a task type schema */
export interface SchemaField {
  id: string;
  fieldType: FieldTypeId;
  label: string;
  required: boolean;
  showOnCreate: boolean;
  showOnDetail: boolean;
  options?: string[];
  defaultValue?: unknown;
  order: number;
}
