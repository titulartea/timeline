export interface TimelineEvent {
  id: string;
  title: string;
  description?: string;
  year: number; // Numeric year: -500 = 500 BCE, 1 = 1 CE, 2026 = 2026 CE
  endYear?: number | null; // Optional end year for range events
  color?: string;
  updatedAt?: number;
}

export interface TimelineSettings {
  minYear?: number;
  maxYear?: number;
  zoomLevel?: number;
}

export interface RoomState {
  roomId: string;
  settings: TimelineSettings;
  events: TimelineEvent[];
}
