
export type LayoutItemType = "desk"|"circle"|"zone"|"room"|"wall"|"door"|"window";

export interface LayoutItem {
  id:        string;
  type:      LayoutItemType;
  x: number; y: number;
  w: number; h: number;
  label?:    string;
  prefix?:   string;
  angle?:    number;
  double?:   boolean;
  pts?:      { x: number; y: number }[];
  disabled?: string[];
  occupants?: Record<string, string>;
  shape?:    "circle";
}

export interface Blueprint {
  id:         string;
  buildingId: string;
  floorName:  string;
  floorOrder: number;
  layout:     LayoutItem[];
  updatedAt:  string;
}

export interface Building {
  id:       string;
  name:     string;
  address?: string;
  active:   boolean;
}
