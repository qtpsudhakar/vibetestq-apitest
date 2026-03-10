/**
 * Authentication tests — covers all 5 auth types supported by this API:
 *   1. API Key          — static secret in x-api-key header, no login step
 *   2. Bearer Token     — real JWT issued by POST /auth/login, sent in Authorization header
 *   3. Basic Auth       — Base64(username:password) in Authorization header, no login step
 *   4. Cookie / Session — server-side session created by POST /auth/session/login
 *   5. OAuth 2.0        — client_credentials flow via POST /oauth/token
 *
 * All write endpoints (POST / PUT / PATCH / DELETE) require auth.
 * All read endpoints (GET) are public — no credentials needed.
 */
import { test, expect, request as playwrightRequest } from '@playwright/test';
import {
  API_KEY, BAD_API_KEY,
  ADMIN_CREDS, INVALID_CREDS,
  BASIC_USER, BASIC_PASS, BASIC_WRONG,
  OAUTH_CLIENT_READ, OAUTH_CLIENT_WRITE, OAUTH_BAD_CLIENT,
  basicAuthHeader,
  getBearerToken, getOAuthToken,
  BASE_URL,
} from '../src/helpers';

// ────────────────────────────────────────────────────────────────────────────
// 1. API Key
// ────────────────────────────────────────────────────────────────────────────
test.describe('Auth — API Key', () => {
  test('valid key in header allows write access', async ({ request }) => {
    const res = await request.post('/api/employees', {
      headers: { 'x-api-key': API_KEY }, // API key goes in this custom header — not Authorization
      data: {
        firstName: 'Key', lastName: 'Test',
        email: `apikey.test.${Date.now()}@vibetest.local`,
        department: 'HR', role: 'Analyst',
        salary: 50000, hireDate: '2024-01-01', status: 'active',
      },
    });
    expect(res.status()).toBe(201); // 201 Created — not 200
    // Always clean up employees created during tests so the data file stays tidy
    const { id } = await res.json();
    await request.delete(`/api/employees/${id}`, { headers: { 'x-api-key': API_KEY } });
  });

  test('wrong key returns 401', async ({ request }) => {
    const res = await request.post('/api/employees', {
      headers: { 'x-api-key': BAD_API_KEY },
      data: { firstName: 'X', lastName: 'X', email: 'x@x.com', department: 'HR', role: 'X', salary: 1, hireDate: '2024-01-01', status: 'active' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    // The error code is AUTH_REQUIRED for both wrong key and missing key —
    // the server does not reveal which case it is
    expect(body.error.code).toBe('AUTH_REQUIRED');
  });

  test('missing key returns 401', async ({ request }) => {
    // Sending no x-api-key header at all is treated the same as a wrong key
    const res = await request.post('/api/employees', {
      data: { firstName: 'X', lastName: 'X', email: 'x@x.com', department: 'HR', role: 'X', salary: 1, hireDate: '2024-01-01', status: 'active' },
    });
    expect(res.status()).toBe(401);
  });

  test('read endpoints are public — no key needed', async ({ request }) => {
    // GET endpoints never require auth — only writes (POST/PUT/PATCH/DELETE) do
    const res = await request.get('/api/employees');
    expect(res.status()).toBe(200);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. Bearer Token (JWT)
// ────────────────────────────────────────────────────────────────────────────
test.describe('Auth — Bearer Token (JWT)', () => {
  test('POST /auth/login — valid credentials return a JWT', async ({ request }) => {
    const res = await request.post('/auth/login', { data: ADMIN_CREDS });

    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(typeof body.token).toBe('string');
    // A real JWT always has exactly 3 dot-separated parts: header.payload.signature
    expect(body.token.split('.').length).toBe(3);
    expect(body.tokenType).toBe('Bearer');  // tells the client how to send the token
    expect(body.expiresIn).toBe(3600);      // 3600 seconds = 1 hour
    expect(body.user.username).toBe('admin'); // login response includes user info
  });

  test('POST /auth/login — wrong password returns 401', async ({ request }) => {
    const res = await request.post('/auth/login', { data: INVALID_CREDS });

    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('POST /auth/login — missing fields returns 400', async ({ request }) => {
    const res = await request.post('/auth/login', { data: { username: 'admin' } });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  test('valid JWT allows access to protected endpoint', async ({ request }) => {
    // getBearerToken() calls POST /auth/login and returns just the token string
    const token = await getBearerToken(request);

    const res = await request.get('/auth/me', {
      headers: { Authorization: `Bearer ${token}` }, // must use exactly this header name and "Bearer " prefix
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.user.username).toBe('admin');  // server decoded the JWT and returned the user
    expect(body.authType).toBe('bearer');      // confirms the server recognised the auth method
  });

  test('tampered token returns 401', async ({ request }) => {
    // A JWT with a forged or corrupted signature fails jwt.verify() on the server.
    // This ensures an attacker cannot craft a fake token and gain access.
    const res = await request.get('/auth/me', {
      headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiZmFrZSJ9.invalidsignature' },
    });

    expect(res.status()).toBe(401);
  });

  test('missing Authorization header returns 401', async ({ request }) => {
    const res = await request.get('/auth/me');
    expect(res.status()).toBe(401);
  });

  test('valid JWT allows write to /api/employees', async ({ request }) => {
    // Confirms the Bearer token is accepted by the same requireAuth middleware
    // that also accepts API keys — both auth types share the same protected routes
    const token = await getBearerToken(request);

    const res = await request.post('/api/employees', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        firstName: 'JWT', lastName: 'User',
        email: `jwt.user.${Date.now()}@vibetest.local`,
        department: 'Finance', role: 'Analyst',
        salary: 55000, hireDate: '2024-03-01', status: 'active',
      },
    });
    expect(res.status()).toBe(201);
    const { id } = await res.json();
    await request.delete(`/api/employees/${id}`, { headers: { 'x-api-key': API_KEY } });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. Basic Auth
// ────────────────────────────────────────────────────────────────────────────
test.describe('Auth — Basic Auth', () => {
  test('valid credentials allow access to /auth/basic-test', async ({ request }) => {
    const res = await request.get('/auth/basic-test', {
      headers: { Authorization: basicAuthHeader(BASIC_USER, BASIC_PASS) },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('Basic Auth successful');
  });

  test('Playwright httpCredentials — valid credentials succeed', async ({ playwright }) => {
    // httpCredentials tells Playwright to encode the credentials automatically and
    // attach the correct "Authorization: Basic <base64>" header to every request
    // from this context — no manual encoding needed
    const ctx = await playwright.request.newContext({
      baseURL: BASE_URL,
      httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
    });

    const res = await ctx.get('/auth/basic-test');
    expect(res.status()).toBe(200);

    await ctx.dispose(); // always dispose custom contexts to free resources
  });

  test('wrong password returns 401', async ({ request }) => {
    const res = await request.get('/auth/basic-test', {
      headers: { Authorization: basicAuthHeader(BASIC_USER, BASIC_WRONG) },
    });

    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('missing Authorization header returns 401 with WWW-Authenticate', async ({ request }) => {
    const res = await request.get('/auth/basic-test');

    expect(res.status()).toBe(401);
    // The WWW-Authenticate response header is part of the HTTP Basic Auth spec —
    // browsers use it to decide whether to show a native login dialog
    expect(res.headers()['www-authenticate']).toContain('Basic');
    const body = await res.json();
    expect(body.error.code).toBe('AUTH_REQUIRED');
  });

  test('malformed Basic header returns 401', async ({ request }) => {
    const res = await request.get('/auth/basic-test', {
      headers: { Authorization: 'Basic not-valid-base64!!!' },
    });
    expect(res.status()).toBe(401);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. Cookie / Session
// ────────────────────────────────────────────────────────────────────────────
test.describe('Auth — Cookie / Session', () => {
  test('POST /auth/session/login — valid credentials create a session', async ({ request }) => {
    const loginRes = await request.post('/auth/session/login', { data: ADMIN_CREDS });

    expect(loginRes.status()).toBe(200);
    const body = await loginRes.json();
    expect(body.message).toBe('Logged in successfully');
  });

  test('session cookie allows access to protected endpoint', async ({ request }) => {
    // The Playwright request fixture maintains a cookie jar for the duration of the test.
    // After a successful login, the server sends Set-Cookie: connect.sid=...
    // and Playwright stores it — subsequent calls carry it automatically.
    await request.post('/auth/session/login', { data: ADMIN_CREDS });

    const res = await request.get('/auth/session/me');
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.user.username).toBe('admin');
  });

  test('access without login returns 401', async ({ request }) => {
    // A brand-new request context has no cookies, so no session cookie is sent.
    // This simulates a user who has never logged in.
    const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL });

    const res = await ctx.get('/auth/session/me');
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('AUTH_REQUIRED');

    await ctx.dispose();
  });

  test('access after logout returns 401', async ({ request }) => {
    await request.post('/auth/session/login', { data: ADMIN_CREDS });

    // Baseline: session is active, /auth/session/me should return the user
    const before = await request.get('/auth/session/me');
    expect(before.status()).toBe(200);

    // Logout destroys the session on the server side
    const logoutRes = await request.post('/auth/session/logout');
    expect(logoutRes.status()).toBe(200);

    // The cookie the request context still holds is now invalid —
    // the server has deleted the session it referenced
    const after = await request.get('/auth/session/me');
    expect(after.status()).toBe(401);
  });

  test('wrong password returns 401', async ({ request }) => {
    const res = await request.post('/auth/session/login', { data: INVALID_CREDS });

    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('missing credentials returns 400', async ({ request }) => {
    const res = await request.post('/auth/session/login', {
      data: { username: 'admin' },
    });
    expect(res.status()).toBe(400);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. OAuth 2.0 — Client Credentials
// ────────────────────────────────────────────────────────────────────────────
test.describe('Auth — OAuth 2.0 Client Credentials', () => {
  test('valid write client returns access token', async ({ request }) => {
    const res = await request.post('/oauth/token', {
      data: { grant_type: 'client_credentials', ...OAUTH_CLIENT_WRITE },
    });

    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(typeof body.access_token).toBe('string');
    // The token is a real signed JWT — three dot-separated parts
    expect(body.access_token.split('.').length).toBe(3);
    // OAuth 2.0 RFC 6749 mandates these exact field names in the token response
    expect(body.token_type).toBe('Bearer');  // tells the client how to send it
    expect(body.expires_in).toBe(3600);     // 1 hour, in seconds
    expect(body.scope).toBe('write');       // reflects the client's registered scope
  });

  test('valid read client returns access token with read scope', async ({ request }) => {
    const res = await request.post('/oauth/token', {
      data: { grant_type: 'client_credentials', ...OAUTH_CLIENT_READ },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.scope).toBe('read');
  });

  test('access token allows write to protected endpoint', async ({ request }) => {
    const token = await getOAuthToken(request, OAUTH_CLIENT_WRITE);

    const res = await request.post('/api/employees', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        firstName: 'OAuth', lastName: 'User',
        email: `oauth.user.${Date.now()}@vibetest.local`,
        department: 'Marketing', role: 'Designer',
        salary: 48000, hireDate: '2024-05-01', status: 'active',
      },
    });
    expect(res.status()).toBe(201);
    const { id } = await res.json();
    await request.delete(`/api/employees/${id}`, { headers: { 'x-api-key': API_KEY } });
  });

  test('invalid client_secret returns 401', async ({ request }) => {
    const res = await request.post('/oauth/token', {
      data: { grant_type: 'client_credentials', ...OAUTH_BAD_CLIENT },
    });

    expect(res.status()).toBe(401);
    const body = await res.json();
    // NOTE: OAuth 2.0 (RFC 6749) error responses use a flat string field "error",
    // not the nested { code, message } object used by the rest of this API.
    // Always check body.error, not body.error.code, for /oauth/token responses.
    expect(body.error).toBe('invalid_client');
  });

  test('wrong grant_type returns 400', async ({ request }) => {
    // This server only supports the client_credentials grant type.
    // Any other value (e.g. authorization_code, password) is rejected.
    const res = await request.post('/oauth/token', {
      data: { grant_type: 'authorization_code', ...OAUTH_CLIENT_WRITE },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('unsupported_grant_type'); // same flat RFC 6749 format
  });

  test('tampered OAuth access token returns 401', async ({ request }) => {
    const res = await request.get('/auth/me', {
      headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRfaWQiOiJmYWtlIn0.badsig' },
    });
    expect(res.status()).toBe(401);
  });
});
