export interface Plan {
  agents: number;
  hoursPerMonth: number;
  dollarsPerMonth?: number;
  unlimited?: boolean;
  /** Files kept in the cloud, in GB; 0 keeps them on the computer. */
  filesGB: number;
}
export const PLANS: Readonly<{ none: Plan; pro: Plan & { dollarsPerMonth: number }; plus: Plan & { dollarsPerMonth: number }; max: Plan & { dollarsPerMonth: number } }>;
export const FREE: Readonly<{ agents: number; hours: number }>;
export const TEAM: Readonly<{ trialDays: number; trialHoursPerMember: number; hoursPerSeat: number; dollarsPerSeat: number; filesGBPerSeat: number }>;
export const FILES_LAPSE_DAYS: number;
export const RUN_CEILING_MS: number;
export const SIGNIN_CEILING_MS: number;
export const SIGNINS_AT_ONCE: number;
