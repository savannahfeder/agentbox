export interface Plan {
  agents: number;
  hoursPerMonth: number;
  dollarsPerMonth?: number;
  unlimited?: boolean;
}
export const PLANS: Readonly<{ none: Plan; pro: Plan & { dollarsPerMonth: number }; plus: Plan & { dollarsPerMonth: number }; max: Plan & { dollarsPerMonth: number } }>;
export const RUN_CEILING_MS: number;
export const SIGNIN_CEILING_MS: number;
export const SIGNINS_AT_ONCE: number;
