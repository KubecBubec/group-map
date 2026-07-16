export type Role = "ADMIN" | "MAIN_LEADER" | "LEADER" | "MEMBER";
export type Priority = "INFO" | "MEET" | "URGENT";
export type MeetingScope = "GLOBAL" | "GROUP" | "SELECTED";
export type PingScope = "ALL" | "GROUP" | "SELECTED" | "USER";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  googleId?: string | null;
}

export interface Membership {
  id: string;
  userId: string;
  groupId: string;
}

export interface Group {
  id: string;
  name: string;
  creatorId: string;
  memberships?: Membership[];
}

export interface LocationRow {
  id: string;
  userId: string;
  latitude: number;
  longitude: number;
  heading?: number | null;
  accuracy?: number | null;
  updatedAt: string;
  status: "online" | "last_known";
  user: AuthUser;
}

export interface MeetingPoint {
  id: string;
  title: string;
  creatorId: string;
  latitude: number;
  longitude: number;
  scope: MeetingScope;
  targetIds: string[];
  activeUntil?: string | null;
  createdAt: string;
}

export interface FeatureConfig {
  routesEnabled: boolean;
  placesEnabled: boolean;
  auditTrailEnabled: boolean;
  incidentEnabled: boolean;
  monthlyBudgetUsd?: number | null;
  warningThresholdPct?: number;
}

export interface ApiUsageReport {
  pricing: {
    mapsPer1000: number;
    routesPer1000: number;
    placesPer1000: number;
    monthlyFreeCreditUsd: number;
  };
  note: string;
  today: {
    mapsLoads: number;
    routesCalls: number;
    placesCalls: number;
    grossUsd: number;
    creditAppliedUsd: number;
    estimatedBillUsd: number;
  };
  monthToDate: {
    mapsLoads: number;
    routesCalls: number;
    placesCalls: number;
    grossUsd: number;
    creditAppliedUsd: number;
    estimatedBillUsd: number;
  };
  forecast: {
    grossUsd: number;
    estimatedBillUsd: number;
  };
  daily: {
    day: string;
    mapsLoads: number;
    routesCalls: number;
    placesCalls: number;
    grossUsd: number;
    creditAppliedUsd: number;
    estimatedBillUsd: number;
  }[];
  limits: {
    monthlyBudgetUsd: number | null;
    warningThresholdPct: number;
    warningLevel: "ok" | "warn" | "critical";
    budgetUsedPct: number | null;
  };
}

export interface SearchUser extends AuthUser {
  memberships: Membership[];
}

export interface LatLng {
  lat: number;
  lng: number;
}
