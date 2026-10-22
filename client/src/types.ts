export type Role = 'OWNER' | 'MANAGER' | 'EMPLOYEE';
export interface User {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: Role;
  hourlyRate: string;
  maxWeeklyHours: number;
  active?: boolean;
  emailNotifications?: boolean;
  mustChangePassword?: boolean;
  organization?: { name: string; timezone: string };
  locations?: { locationId: string }[];
}
export interface Location {
  id: string;
  name: string;
  timezone: string;
  lat?: number | null;
  lng?: number | null;
  geofenceRadiusM: number;
  clockInGraceMin: number;
}
export interface Warning {
  type: string;
  message: string;
  shiftId?: string;
}
export interface Shift {
  id: string;
  userId: string | null;
  locationId: string;
  startsAt: string;
  endsAt: string;
  position: string;
  notes: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  warnings: Warning[];
  location?: { name: string; timezone: string };
}
export interface Availability {
  weekday: number;
  startMinute: number;
  endMinute: number;
}
