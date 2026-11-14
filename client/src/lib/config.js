/**
 * Mocks are on by default. Step 05 flips the default to the real API; until
 * then, setting VITE_USE_MOCKS=false in client/.env.local points the services
 * at the Express endpoints instead.
 */
export const USE_MOCKS = (import.meta.env.VITE_USE_MOCKS ?? 'true') !== 'false';
