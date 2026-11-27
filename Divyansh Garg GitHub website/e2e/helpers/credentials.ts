export interface AdminCredentials {
  email: string;
  password: string;
}

/** Read the admin credentials exported by playwright.config.ts from .env.local. */
export function adminCredentials(): AdminCredentials {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be present in .env.local');
  }
  return { email, password };
}
