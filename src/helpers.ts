import { APIRequestContext } from '@playwright/test';

export const BASE_URL = 'http://localhost:3000';

// ─── Credentials ────────────────────────────────────────────────────────────
export const ADMIN_CREDS    = { username: 'admin',   password: 'admin123' };
export const INVALID_CREDS  = { username: 'admin',   password: 'wrongpassword' };
export const API_KEY        = 'VT-EMP-KEY-123';
export const BAD_API_KEY    = 'wrong-key';

export const BASIC_USER     = 'admin';
export const BASIC_PASS     = 'admin123';
export const BASIC_WRONG    = 'wrongpassword';

// OAuth 2.0 clients
export const OAUTH_CLIENT_READ  = { client_id: 'vt-client-read',  client_secret: 'vt-secret-read-abc' };
export const OAUTH_CLIENT_WRITE = { client_id: 'vt-client-write', client_secret: 'vt-secret-write-xyz' };
export const OAUTH_BAD_CLIENT   = { client_id: 'vt-client-read',  client_secret: 'bad-secret' };

// ─── Auth helpers ────────────────────────────────────────────────────────────

/** Login and return a Bearer JWT */
export const getBearerToken = async (
  request: APIRequestContext,
  creds = ADMIN_CREDS
): Promise<string> => {
  const res = await request.post('/auth/login', { data: creds });
  const body = await res.json();
  return body.token as string;
};

/** Perform OAuth 2.0 client_credentials and return access_token */
export const getOAuthToken = async (
  request: APIRequestContext,
  client = OAUTH_CLIENT_WRITE
): Promise<string> => {
  const res = await request.post('/oauth/token', {
    data: { grant_type: 'client_credentials', ...client },
  });
  const body = await res.json();
  return body.access_token as string;
};

/** Encode Basic Auth header value */
export const basicAuthHeader = (username: string, password: string): string =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

// ─── Employee factory ────────────────────────────────────────────────────────

let emailCounter = Date.now();

/** Build a unique valid employee payload */
export const makeEmployee = (overrides: Record<string, unknown> = {}) => ({
  firstName:  'Test',
  lastName:   'User',
  email:      `test.user.${emailCounter++}@vibetest.local`,
  phone:      '+1-555-0100',
  department: 'Engineering',
  role:       'QA Engineer',
  salary:     60000,
  hireDate:   '2024-01-15',
  status:     'active',
  location:   'Remote',
  managerId:  null,
  skills:     ['Playwright'],
  ...overrides,
});

/** Create an employee using API Key auth and return the created object */
export const createEmployee = async (
  request: APIRequestContext,
  overrides: Record<string, unknown> = {}
) => {
  const res = await request.post('/api/employees', {
    headers: { 'x-api-key': API_KEY },
    data: makeEmployee(overrides),
  });
  return res.json();
};

/** Delete an employee by id using API Key auth (best-effort, ignores 404) */
export const cleanupEmployee = async (
  request: APIRequestContext,
  id: number
) => {
  await request.delete(`/api/employees/${id}`, {
    headers: { 'x-api-key': API_KEY },
  });
};
