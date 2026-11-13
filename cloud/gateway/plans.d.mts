export interface Plan {
  agents: number;
  hoursPerMonth: number;
  dollarsPerMonth?: number;
  unlimited?: boolean;
}
export const PLANS: Readonly<{ none: Plan; pro: Plan & { dollarsPerMonth: number }; plus: Plan & { dollarsPerMonth: number }; max: Plan & { dollarsPerMonth: number } }>;
export const FREE: Readonly<{ agents: number; hours: number }>;
export const TEAM: Readonly<{ trialDays: number; trialHoursPerMember: number; hoursPerSeat: number; dollarsPerSeat: number }>;
export const RUN_CEILING_MS: number;
export const SIGNIN_CEILING_MS: number;
export const SIGNINS_AT_ONCE: number;
