// Every screen navigates through this, never through expo-router's own `router`
// (tests/a-tap-while-android-redraws-the-phone-app-does-not-crash-it).
import { router as expoRouter } from 'expo-router';
import { patientRouter } from './patient-router';

export const router = patientRouter(expoRouter);
