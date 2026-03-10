# API Testing with Playwright
### A Guided Learning Path Using the Employee Management API

---

## Who This Guide Is For

You have never tested an API before. You may have used Playwright to click buttons and fill forms — or you may be completely new to test automation. Either way, this guide starts from zero.

Here is the exact path this guide follows. For every endpoint, you will do three things in this order:

1. **Build it** — write the Express.js server code that makes the endpoint work
2. **Understand it** — see what it accepts, what it returns, and why
3. **Test it** — write the Playwright test that verifies it

By the end, you will understand both sides: how APIs are built and how they are tested.

---

## Part 1 — What Is an API?

Before writing any code, you need to understand what you are building and testing.

A web application has two sides. The **frontend** is what you see in the browser — buttons, forms, tables. The **backend** is the server that stores data and runs business logic. The frontend talks to the backend through an **API**.

API stands for Application Programming Interface. Think of it as a contract between two programs: the frontend agrees to send requests in a specific format, and the backend agrees to respond in a specific format. When you click "Add Employee" in a web app, the browser does not save the data itself. It sends a request to the backend API. The API saves the data and sends a response back.

That request and response travel over **HTTP** — the same protocol your browser uses to load web pages. Every request has a **method** (what action to take) and a **URL** (which resource to act on).

| Method | What It Does | Real-World Analogy |
|--------|-------------|-------------------|
| GET | Read data | Looking up a record in a filing cabinet |
| POST | Create new data | Adding a new file to a cabinet |
| PUT | Replace existing data | Swapping a file with a completely new version |
| PATCH | Partially update data | Crossing out one line and writing a new value |
| DELETE | Remove data | Removing a file from the cabinet |

Every response comes with a **status code** — a three-digit number that tells you what happened.

| Status Code | Meaning | When You See It |
|-------------|---------|-----------------|
| 200 | OK | A GET, PUT, or PATCH request succeeded |
| 201 | Created | A POST request created a new resource |
| 204 | No Content | A DELETE request succeeded — no body returned |
| 400 | Bad Request | Your request had invalid or missing data |
| 401 | Unauthorized | Missing or invalid credentials |
| 404 | Not Found | The resource does not exist |
| 409 | Conflict | The request conflicts with existing data (e.g. duplicate email) |
| 500 | Internal Server Error | Something went wrong on the server |

Data travels as **JSON** — a text format using key-value pairs. Here is what an employee looks like in JSON:

```json
{
  "id": 1,
  "firstName": "Ava",
  "lastName": "Sharma",
  "email": "ava.sharma@vibetest.local",
  "phone": "+1-555-0101",
  "department": "Engineering",
  "role": "QA Engineer",
  "salary": 62000,
  "hireDate": "2023-04-10",
  "status": "active",
  "location": "Bengaluru",
  "managerId": 4,
  "skills": ["Playwright", "API Testing", "TypeScript"],
  "createdAt": "2023-04-10T09:15:00.000Z",
  "updatedAt": "2024-11-12T08:20:00.000Z"
}
```

Notice `id`, `createdAt`, and `updatedAt` — the client never sends these. The server generates them. That detail shows up in both the API code and the tests throughout this guide.

---

## Part 2 — Project Setup

You will build two things side by side: the **API server** using Express.js, and the **test suite** using Playwright.

### Project Structure

```
VibeTestAPI/
├── server.js              ← the entire API lives here
├── package.json
├── playwright.config.ts   ← Playwright configuration
├── data/
│   ├── employees.json     ← persistent employee storage
│   └── users.json         ← user accounts for login
├── src/
│   └── helpers.ts         ← shared test utilities and factories
└── tests/
    ├── health.spec.ts
    ├── auth.spec.ts
    └── employees.spec.ts
```

### Setting Up the API Server

```bash
npm install express cors morgan express-session jsonwebtoken
```

Create `server.js`. Start with the foundation — imports, middleware, file-based storage, and shared validation. You will add endpoints one by one in Part 3.

```javascript
// server.js

const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');
const session = require('express-session');
const jwt     = require('jsonwebtoken');
const fs      = require('fs/promises');
const path    = require('path');
const crypto  = require('crypto');

const app      = express();
const PORT     = process.env.PORT || 3000;
const EMP_FILE = path.join(__dirname, 'data', 'employees.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');

// Authentication secrets — override with environment variables in production
const API_KEY   = process.env.API_KEY   || 'VT-EMP-KEY-123';
const JWT_SECRET = process.env.JWT_SECRET || 'vt-jwt-secret-key';

// OAuth 2.0 client registry
const clientRegistry = {
  'vt-client-read':  { secret: 'vt-secret-read-abc',  scope: 'read' },
  'vt-client-write': { secret: 'vt-secret-write-xyz', scope: 'write' },
};

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false })); // for OAuth form-encoded bodies
app.use(session({
  secret: process.env.SESSION_SECRET || 'vt-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 3600000 }, // 1 hour
}));

// Attach a unique requestId to every request and response
app.use((req, res, next) => {
  const requestId = crypto.randomUUID
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});

app.use(morgan('tiny')); // request logging

// ── File storage helpers ─────────────────────────────────────────────────────
// Data is stored in JSON files — no database setup required.

let writeChain = Promise.resolve();

const readJson = async (filePath, fallback) => {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
};

// All writes are queued to prevent race conditions with concurrent requests
const writeJsonQueued = async (filePath, data) => {
  writeChain = writeChain.then(() =>
    fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
  );
  return writeChain;
};

// ── Validation ───────────────────────────────────────────────────────────────
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^[0-9+\-()\s]{7,20}$/;

const normalizeString = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

// Required on POST/PUT. On PATCH, pass { partial: true } to skip presence checks.
function validateEmployee(payload, { partial = false } = {}) {
  const errors = [];
  const requiredFields = [
    'firstName', 'lastName', 'email',
    'department', 'role', 'salary', 'hireDate', 'status',
  ];

  if (!partial) {
    requiredFields.forEach((field) => {
      if (payload[field] === undefined || payload[field] === null) {
        errors.push(`${field} is required`);
      }
    });
  }

  if (payload.firstName !== undefined && !String(payload.firstName).trim())
    errors.push('firstName cannot be empty');
  if (payload.lastName  !== undefined && !String(payload.lastName).trim())
    errors.push('lastName cannot be empty');
  if (payload.email !== undefined && !emailRegex.test(payload.email))
    errors.push('email is invalid');
  if (payload.phone !== undefined && payload.phone !== '' && !phoneRegex.test(payload.phone))
    errors.push('phone is invalid');
  if (payload.salary !== undefined) {
    const salary = Number(payload.salary);
    if (Number.isNaN(salary) || salary < 0)
      errors.push('salary must be a positive number');
  }
  if (payload.hireDate !== undefined && Number.isNaN(new Date(payload.hireDate).valueOf()))
    errors.push('hireDate must be a valid date');
  if (payload.status !== undefined) {
    const allowed = ['active', 'inactive', 'on_leave', 'terminated'];
    if (!allowed.includes(payload.status))
      errors.push(`status must be one of ${allowed.join(', ')}`);
  }
  if (payload.skills !== undefined && !Array.isArray(payload.skills))
    errors.push('skills must be an array');

  return errors;
}

// Endpoints will be added here in Part 3

app.listen(PORT, () => {
  console.log(`Employee API running at http://localhost:${PORT}`);
});
```

**Key differences from a typical tutorial:**
- Data is stored in `data/employees.json` — it survives server restarts.
- IDs are **integers** (`1`, `2`, `3`…), not strings like `emp-001`.
- Every response includes a `requestId` field for tracing.
- Error responses use a structured format: `{ "error": { "code": "...", "message": "..." }, "requestId": "..." }`.

### Setting Up the Playwright Tests

```bash
npm install --save-dev @playwright/test
```

Create `playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://localhost:3000',
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
  },
});
```

Create `src/helpers.ts` with shared utilities that every test file imports:

```typescript
// src/helpers.ts
import { APIRequestContext } from '@playwright/test';

export const BASE_URL  = 'http://localhost:3000';
export const API_KEY   = 'VT-EMP-KEY-123';
export const BAD_API_KEY = 'wrong-key';

export const ADMIN_CREDS   = { username: 'admin',   password: 'admin123' };
export const INVALID_CREDS = { username: 'admin',   password: 'wrongpassword' };

export const BASIC_USER  = 'admin';
export const BASIC_PASS  = 'admin123';
export const BASIC_WRONG = 'wrongpassword';

export const OAUTH_CLIENT_READ  = { client_id: 'vt-client-read',  client_secret: 'vt-secret-read-abc' };
export const OAUTH_CLIENT_WRITE = { client_id: 'vt-client-write', client_secret: 'vt-secret-write-xyz' };
export const OAUTH_BAD_CLIENT   = { client_id: 'vt-client-read',  client_secret: 'bad-secret' };

/** Login and return a Bearer JWT */
export const getBearerToken = async (
  request: APIRequestContext,
  creds = ADMIN_CREDS
): Promise<string> => {
  const res  = await request.post('/auth/login', { data: creds });
  const body = await res.json();
  return body.token as string;
};

/** OAuth 2.0 client_credentials — return access_token */
export const getOAuthToken = async (
  request: APIRequestContext,
  client = OAUTH_CLIENT_WRITE
): Promise<string> => {
  const res  = await request.post('/oauth/token', {
    data: { grant_type: 'client_credentials', ...client },
  });
  const body = await res.json();
  return body.access_token as string;
};

/** Encode a Basic Auth header value */
export const basicAuthHeader = (username: string, password: string): string =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

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

/** Delete an employee by id (best-effort, ignores 404) */
export const cleanupEmployee = async (request: APIRequestContext, id: number) => {
  await request.delete(`/api/employees/${id}`, {
    headers: { 'x-api-key': API_KEY },
  });
};
```

**Running the server and tests:**

Start the API in one terminal:

```bash
node server.js
# Employee API running at http://localhost:3000
```

Run Playwright in a second terminal:

```bash
npx playwright test
```

---

## Part 3 — Endpoint by Endpoint

Every section below follows the same three-step pattern: **Build → Understand → Test**.

The API has nine endpoints. All employee endpoints are under the `/api/employees` prefix.

| Method | URL | Auth Required | Description |
|--------|-----|--------------|-------------|
| GET | `/health` | No | Server health check |
| GET | `/api/employees` | No | List employees (filterable, paginated) |
| GET | `/api/employees/stats` | No | Aggregate statistics |
| GET | `/api/employees/:id` | No | Get one employee |
| POST | `/api/employees` | Yes | Create employee |
| PUT | `/api/employees/:id` | Yes | Replace employee |
| PATCH | `/api/employees/:id` | Yes | Partially update employee |
| DELETE | `/api/employees/:id` | Yes | Delete employee |

Add each route to `server.js` above the `app.listen` line.

---

### Endpoint 1 — Health Check

```
GET /health
```

---

#### Build It

```javascript
app.get('/health', (req, res) => {
  res.json({
    status:    'ok',
    time:      new Date().toISOString(),
    version:   '1.0.0',
    requestId: req.requestId,
  });
});
```

---

#### Understand It

**What you send:**

```
GET /health
```

No auth required. No body.

**What you get back:**

```
Status: 200 OK
```

```json
{
  "status": "ok",
  "time": "2026-03-10T09:00:00.000Z",
  "version": "1.0.0",
  "requestId": "a1b2c3d4-..."
}
```

**What to know as a tester:**

- Health checks are used to confirm the server is running before running other tests.
- The `requestId` appears in every response in this API — it is a unique trace ID for that request.

---

#### Test It

```typescript
// tests/health.spec.ts
import { test, expect } from '@playwright/test';

test('GET /health — returns status ok', async ({ request }) => {
  const res = await request.get('/health');

  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body.status).toBe('ok');
  expect(body.version).toBe('1.0.0');
  expect(body.time).toBeTruthy();
  expect(body.requestId).toBeTruthy();
});
```

---

### Endpoint 2 — Create an Employee

```
POST /api/employees
```

---

#### Build It

```javascript
app.post('/api/employees', requireAuth, async (req, res, next) => {
  try {
    const payload = req.body || {};

    // Step 1: Validate all required fields
    const errors = validateEmployee(payload);
    if (errors.length) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: errors.join(', ') },
        requestId: req.requestId,
      });
    }

    const employees = await readJson(EMP_FILE, []);

    // Step 2: Reject duplicate email addresses
    const emailExists = employees.some(
      (emp) => normalizeString(emp.email) === normalizeString(payload.email)
    );
    if (emailExists) {
      return res.status(409).json({
        error: { code: 'DUPLICATE_EMAIL', message: 'Email already exists' },
        requestId: req.requestId,
      });
    }

    // Step 3: Build the employee — server generates id, createdAt, updatedAt
    const nextId = employees.reduce((max, emp) => Math.max(max, emp.id), 0) + 1;
    const now = new Date().toISOString();
    const newEmployee = {
      id:         nextId,
      firstName:  String(payload.firstName).trim(),
      lastName:   String(payload.lastName).trim(),
      email:      String(payload.email).trim(),
      phone:      payload.phone ? String(payload.phone).trim() : '',
      department: String(payload.department).trim(),
      role:       String(payload.role).trim(),
      salary:     Number(payload.salary),
      hireDate:   new Date(payload.hireDate).toISOString().slice(0, 10),
      status:     payload.status,
      location:   payload.location ? String(payload.location).trim() : '',
      managerId:  payload.managerId ? Number(payload.managerId) : null,
      skills:     Array.isArray(payload.skills) ? payload.skills : [],
      createdAt:  now,
      updatedAt:  now,
    };

    employees.push(newEmployee);
    await writeJsonQueued(EMP_FILE, employees);

    // Step 4: Respond with 201 and the created employee
    return res.status(201).json(newEmployee);
  } catch (error) {
    return next(error);
  }
});
```

---

#### Understand It

**What you send:**

```
POST /api/employees
Content-Type: application/json
x-api-key: VT-EMP-KEY-123
```

```json
{
  "firstName":  "Ava",
  "lastName":   "Sharma",
  "email":      "ava.sharma@vibetest.local",
  "phone":      "+1-555-0101",
  "department": "Engineering",
  "role":       "QA Engineer",
  "salary":     62000,
  "hireDate":   "2023-04-10",
  "status":     "active",
  "location":   "Bengaluru",
  "managerId":  4,
  "skills":     ["Playwright", "TypeScript"]
}
```

Required fields: `firstName`, `lastName`, `email`, `department`, `role`, `salary`, `hireDate`, `status`.
Optional fields: `phone`, `location`, `managerId`, `skills`.

You do not send `id`, `createdAt`, or `updatedAt` — the server generates them.

**What you get back on success:**

```
Status: 201 Created
```

```json
{
  "id": 7,
  "firstName": "Ava",
  "lastName": "Sharma",
  "email": "ava.sharma@vibetest.local",
  "phone": "+1-555-0101",
  "department": "Engineering",
  "role": "QA Engineer",
  "salary": 62000,
  "hireDate": "2023-04-10",
  "status": "active",
  "location": "Bengaluru",
  "managerId": 4,
  "skills": ["Playwright", "TypeScript"],
  "createdAt": "2026-03-10T09:00:00.000Z",
  "updatedAt": "2026-03-10T09:00:00.000Z"
}
```

**What you get back on validation failure:**

```
Status: 400 Bad Request
```

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "email is invalid"
  },
  "requestId": "a1b2c3..."
}
```

**What you get back on duplicate email:**

```
Status: 409 Conflict
```

```json
{
  "error": {
    "code": "DUPLICATE_EMAIL",
    "message": "Email already exists"
  },
  "requestId": "a1b2c3..."
}
```

**What to know as a tester:**

- The success code is **201**, not 200. This is the most common beginner mistake.
- `id` is a number, not a string. Never hardcode it — always read it from the response.
- Duplicate email returns **409**, not 400. These are two different error conditions with different error codes.
- `createdAt` and `updatedAt` are set to the same timestamp on creation.

---

#### Test It

```typescript
// tests/employees.spec.ts
import { test, expect } from '@playwright/test';
import { API_KEY, makeEmployee, cleanupEmployee } from '../src/helpers';

const AUTH = { 'x-api-key': API_KEY };

test('POST /api/employees — creates employee and returns 201', async ({ request }) => {
  const payload = makeEmployee();

  const res = await request.post('/api/employees', {
    headers: AUTH,
    data: payload,
  });

  // 201, not 200
  expect(res.status()).toBe(201);

  const body = await res.json();

  // Server must have generated these fields
  expect(typeof body.id).toBe('number');
  expect(body.createdAt).toBeTruthy();
  expect(body.updatedAt).toBeTruthy();

  // Fields sent must come back correctly
  expect(body.firstName).toBe(payload.firstName);
  expect(body.email).toBe(payload.email);
  expect(body.salary).toBe(payload.salary);

  await cleanupEmployee(request, body.id);
});

test('POST /api/employees — returns 400 when required field is missing', async ({ request }) => {
  const { email: _omit, ...noEmail } = makeEmployee();

  const res = await request.post('/api/employees', {
    headers: AUTH,
    data: noEmail,
  });

  expect(res.status()).toBe(400);

  const body = await res.json();
  expect(body.error.code).toBe('VALIDATION_ERROR');
  expect(body.error.message).toContain('email');
});

test('POST /api/employees — returns 409 for duplicate email', async ({ request }) => {
  const emp = await (await request.post('/api/employees', {
    headers: AUTH,
    data: makeEmployee(),
  })).json();

  const res = await request.post('/api/employees', {
    headers: AUTH,
    data: makeEmployee({ email: emp.email }), // same email
  });

  expect(res.status()).toBe(409);

  const body = await res.json();
  expect(body.error.code).toBe('DUPLICATE_EMAIL');

  await cleanupEmployee(request, emp.id);
});

test('POST /api/employees — returns 401 without credentials', async ({ request }) => {
  const res = await request.post('/api/employees', { data: makeEmployee() });
  expect(res.status()).toBe(401);
});
```

---

### Endpoint 3 — List Employees

```
GET /api/employees
GET /api/employees?department=Engineering&status=active&page=1&limit=10
```

---

#### Build It

```javascript
app.get('/api/employees', async (req, res, next) => {
  try {
    const {
      q, department, role, status,
      minSalary, maxSalary,
      page = 1, limit = 20,
      sortBy = 'id', sortOrder = 'asc',
    } = req.query;

    const employees = await readJson(EMP_FILE, []);
    let results = employees;

    // Full-text search across firstName, lastName, email
    if (q) {
      const needle = normalizeString(q);
      results = results.filter((emp) =>
        [emp.firstName, emp.lastName, emp.email].join(' ').toLowerCase().includes(needle)
      );
    }

    // Filter by department, role, status — all case-insensitive
    if (department)
      results = results.filter((emp) => normalizeString(emp.department) === normalizeString(department));
    if (role)
      results = results.filter((emp) => normalizeString(emp.role) === normalizeString(role));
    if (status)
      results = results.filter((emp) => normalizeString(emp.status) === normalizeString(status));

    // Salary range
    if (minSalary !== undefined) {
      const value = Number(minSalary);
      if (!Number.isNaN(value)) results = results.filter((emp) => emp.salary >= value);
    }
    if (maxSalary !== undefined) {
      const value = Number(maxSalary);
      if (!Number.isNaN(value)) results = results.filter((emp) => emp.salary <= value);
    }

    // Sorting
    const allowedSort = ['id', 'firstName', 'lastName', 'salary', 'hireDate'];
    const safeSortBy  = allowedSort.includes(sortBy) ? sortBy : 'id';
    const safeOrder   = String(sortOrder).toLowerCase() === 'desc' ? -1 : 1;
    results = results.slice().sort((a, b) => {
      if (a[safeSortBy] === b[safeSortBy]) return 0;
      return a[safeSortBy] > b[safeSortBy] ? safeOrder : -safeOrder;
    });

    // Pagination
    const pageNum  = Math.max(Number(page) || 1, 1);
    const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const total    = results.length;
    const start    = (pageNum - 1) * limitNum;

    res.json({
      data: results.slice(start, start + limitNum),
      meta: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
      requestId: req.requestId,
    });
  } catch (error) {
    next(error);
  }
});
```

---

#### Understand It

**What you send:**

No auth required. Query parameters are all optional:

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Full-text search on name and email |
| `department` | string | Filter by department (case-insensitive) |
| `role` | string | Filter by role (case-insensitive) |
| `status` | string | `active`, `inactive`, `on_leave`, `terminated` |
| `minSalary` | number | Minimum salary |
| `maxSalary` | number | Maximum salary |
| `page` | number | Page number, default `1` |
| `limit` | number | Results per page, default `20`, max `100` |
| `sortBy` | string | `id`, `firstName`, `lastName`, `salary`, `hireDate` |
| `sortOrder` | string | `asc` (default) or `desc` |

**What you get back:**

```
Status: 200 OK
```

```json
{
  "data": [
    { "id": 1, "firstName": "Ava", "lastName": "Sharma", "..." : "..." }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 6,
    "totalPages": 1
  },
  "requestId": "a1b2c3..."
}
```

**What to know as a tester:**

- The response is a **wrapper object** — not a bare array. The employees are in `body.data`.
- `meta.total` is the count before pagination. Use it to verify filter logic.
- All string filters are **case-insensitive**. `Engineering` and `engineering` return the same results.
- An empty result returns `{ data: [], meta: { total: 0, ... } }` with status 200 — not 404.

---

#### Test It

```typescript
test('GET /api/employees — returns paginated wrapper', async ({ request }) => {
  const res = await request.get('/api/employees');

  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(Array.isArray(body.data)).toBe(true);
  expect(body.meta).toMatchObject({
    page:       expect.any(Number),
    limit:      expect.any(Number),
    total:      expect.any(Number),
    totalPages: expect.any(Number),
  });
});

test('GET /api/employees — department filter is case-insensitive', async ({ request }) => {
  const emp = await createEmployee(request, { department: 'Engineering' });

  const res = await request.get('/api/employees', {
    params: { department: 'engineering' }, // lowercase — should still match
  });
  expect(res.status()).toBe(200);

  const body = await res.json();
  for (const item of body.data) {
    expect(item.department.toLowerCase()).toBe('engineering');
  }

  await cleanupEmployee(request, emp.id);
});

test('GET /api/employees — pagination works', async ({ request }) => {
  const res = await request.get('/api/employees', {
    params: { page: 1, limit: 2 },
  });

  const body = await res.json();
  expect(body.data.length).toBeLessThanOrEqual(2);
  expect(body.meta.page).toBe(1);
  expect(body.meta.limit).toBe(2);
});
```

---

### Endpoint 4 — Get Employee Statistics

```
GET /api/employees/stats
```

---

#### Build It

```javascript
app.get('/api/employees/stats', async (req, res, next) => {
  try {
    const employees = await readJson(EMP_FILE, []);
    const byDepartment = {};
    const byStatus     = {};
    let totalSalary    = 0;

    employees.forEach((emp) => {
      byDepartment[emp.department] = (byDepartment[emp.department] || 0) + 1;
      byStatus[emp.status]         = (byStatus[emp.status]         || 0) + 1;
      totalSalary += emp.salary;
    });

    res.json({
      totals: {
        employees: employees.length,
        avgSalary: employees.length ? Math.round(totalSalary / employees.length) : 0,
      },
      byDepartment,
      byStatus,
      requestId: req.requestId,
    });
  } catch (error) {
    next(error);
  }
});
```

---

#### Understand It

**What you get back:**

```
Status: 200 OK
```

```json
{
  "totals": {
    "employees": 6,
    "avgSalary": 68500
  },
  "byDepartment": {
    "Engineering": 3,
    "HR": 1,
    "Finance": 2
  },
  "byStatus": {
    "active": 4,
    "inactive": 1,
    "on_leave": 1
  },
  "requestId": "a1b2c3..."
}
```

**What to know as a tester:**

- No auth required.
- The stats reflect the live state of the data. Create or delete an employee and call this endpoint again — the counts will change.
- Use stats to validate side effects of other tests. After deleting an employee, `totals.employees` should decrease by 1.

---

#### Test It

```typescript
test('GET /api/employees/stats — returns totals and breakdowns', async ({ request }) => {
  const res = await request.get('/api/employees/stats');

  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(typeof body.totals.employees).toBe('number');
  expect(typeof body.totals.avgSalary).toBe('number');
  expect(typeof body.byDepartment).toBe('object');
  expect(typeof body.byStatus).toBe('object');
});

test('GET /api/employees/stats — total increases after creating an employee', async ({ request }) => {
  const before = await (await request.get('/api/employees/stats')).json();
  const emp    = await createEmployee(request);

  const after = await (await request.get('/api/employees/stats')).json();
  expect(after.totals.employees).toBe(before.totals.employees + 1);

  await cleanupEmployee(request, emp.id);
});
```

---

### Endpoint 5 — Get One Employee

```
GET /api/employees/:id
```

---

#### Build It

```javascript
app.get('/api/employees/:id', async (req, res, next) => {
  try {
    const id        = Number(req.params.id); // IDs are integers
    const employees = await readJson(EMP_FILE, []);
    const employee  = employees.find((emp) => emp.id === id);

    if (!employee) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Employee not found' },
        requestId: req.requestId,
      });
    }

    return res.json(employee);
  } catch (error) {
    return next(error);
  }
});
```

---

#### Understand It

**What you send:**

```
GET /api/employees/1
```

The `id` is part of the URL path and must be an integer. No auth required.

**What you get back — found:**

```
Status: 200 OK
```

```json
{
  "id": 1,
  "firstName": "Ava",
  "lastName": "Sharma",
  "...": "..."
}
```

**What you get back — not found:**

```
Status: 404 Not Found
```

```json
{
  "error": { "code": "NOT_FOUND", "message": "Employee not found" },
  "requestId": "a1b2c3..."
}
```

**What to know as a tester:**

- Never hardcode an ID in a test. Create the employee first, then read the `id` from the response.
- The error response uses `body.error.code` and `body.error.message` — not a flat `body.error` string.

---

#### Test It

```typescript
test('GET /api/employees/:id — returns the correct employee', async ({ request }) => {
  const emp = await createEmployee(request);

  const res  = await request.get(`/api/employees/${emp.id}`);
  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body.id).toBe(emp.id);
  expect(body.email).toBe(emp.email);

  await cleanupEmployee(request, emp.id);
});

test('GET /api/employees/:id — returns 404 for non-existent id', async ({ request }) => {
  const res  = await request.get('/api/employees/999999');
  expect(res.status()).toBe(404);

  const body = await res.json();
  expect(body.error.code).toBe('NOT_FOUND');
});
```

---

### Endpoint 6 — Replace an Employee (PUT)

```
PUT /api/employees/:id
```

---

#### Build It

```javascript
app.put('/api/employees/:id', requireAuth, async (req, res, next) => {
  try {
    const id      = Number(req.params.id);
    const payload = req.body || {};

    // Step 1: Validate — all required fields must be present
    const errors = validateEmployee(payload);
    if (errors.length) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: errors.join(', ') },
        requestId: req.requestId,
      });
    }

    const employees = await readJson(EMP_FILE, []);
    const index     = employees.findIndex((emp) => emp.id === id);

    // Step 2: 404 if not found
    if (index === -1) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Employee not found' },
        requestId: req.requestId,
      });
    }

    // Step 3: Check for email conflict with a different employee
    const emailExists = employees.some(
      (emp) => emp.id !== id && normalizeString(emp.email) === normalizeString(payload.email)
    );
    if (emailExists) {
      return res.status(409).json({
        error: { code: 'DUPLICATE_EMAIL', message: 'Email already exists' },
        requestId: req.requestId,
      });
    }

    // Step 4: Replace the record — preserve id, createdAt; update updatedAt
    const existing = employees[index];
    const updated  = {
      ...existing,
      firstName:  String(payload.firstName).trim(),
      lastName:   String(payload.lastName).trim(),
      email:      String(payload.email).trim(),
      phone:      payload.phone ? String(payload.phone).trim() : '',
      department: String(payload.department).trim(),
      role:       String(payload.role).trim(),
      salary:     Number(payload.salary),
      hireDate:   new Date(payload.hireDate).toISOString().slice(0, 10),
      status:     payload.status,
      location:   payload.location ? String(payload.location).trim() : '',
      managerId:  payload.managerId ? Number(payload.managerId) : null,
      skills:     Array.isArray(payload.skills) ? payload.skills : [],
      updatedAt:  new Date().toISOString(),
    };

    employees[index] = updated;
    await writeJsonQueued(EMP_FILE, employees);

    return res.json(updated);
  } catch (error) {
    return next(error);
  }
});
```

---

#### Understand It

**What to know as a tester:**

- PUT **replaces** the entire record. Send all fields — if you omit a field, it becomes empty or the default value.
- `id` and `createdAt` are always preserved. Your test should verify neither changed after a PUT.
- `updatedAt` always changes to the time of the update.
- A PUT to a non-existent ID returns 404 before validation runs.

---

#### Test It

```typescript
test('PUT /api/employees/:id — updates the role', async ({ request }) => {
  const emp = await createEmployee(request);

  const res = await request.put(`/api/employees/${emp.id}`, {
    headers: AUTH,
    data: { ...makeEmployee({ email: emp.email }), role: 'Staff Engineer' },
  });

  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body.role).toBe('Staff Engineer');
  expect(body.id).toBe(emp.id);
  expect(body.createdAt).toBe(emp.createdAt); // must not change

  await cleanupEmployee(request, emp.id);
});

test('PUT /api/employees/:id — returns 404 for non-existent employee', async ({ request }) => {
  const res = await request.put('/api/employees/999999', {
    headers: AUTH,
    data: makeEmployee(),
  });
  expect(res.status()).toBe(404);
});

test('PUT /api/employees/:id — returns 409 when email belongs to another employee', async ({ request }) => {
  const emp1 = await createEmployee(request);
  const emp2 = await createEmployee(request);

  const res = await request.put(`/api/employees/${emp2.id}`, {
    headers: AUTH,
    data: makeEmployee({ email: emp1.email }),
  });
  expect(res.status()).toBe(409);

  await cleanupEmployee(request, emp1.id);
  await cleanupEmployee(request, emp2.id);
});
```

---

### Endpoint 7 — Partially Update an Employee (PATCH)

```
PATCH /api/employees/:id
```

---

#### Build It

```javascript
app.patch('/api/employees/:id', requireAuth, async (req, res, next) => {
  try {
    const id      = Number(req.params.id);
    const payload = req.body || {};

    // partial: true — only validates fields that are present in the payload
    const errors = validateEmployee(payload, { partial: true });
    if (errors.length) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: errors.join(', ') },
        requestId: req.requestId,
      });
    }

    const employees = await readJson(EMP_FILE, []);
    const index     = employees.findIndex((emp) => emp.id === id);

    if (index === -1) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Employee not found' },
        requestId: req.requestId,
      });
    }

    if (payload.email !== undefined) {
      const emailExists = employees.some(
        (emp) => emp.id !== id && normalizeString(emp.email) === normalizeString(payload.email)
      );
      if (emailExists) {
        return res.status(409).json({
          error: { code: 'DUPLICATE_EMAIL', message: 'Email already exists' },
          requestId: req.requestId,
        });
      }
    }

    // Merge: spread existing record, then overlay only the sent fields
    const existing = employees[index];
    const updated  = {
      ...existing,
      ...payload,
      salary:    payload.salary    !== undefined ? Number(payload.salary)    : existing.salary,
      managerId: payload.managerId !== undefined ? Number(payload.managerId) : existing.managerId,
      updatedAt: new Date().toISOString(),
    };
    if (payload.hireDate !== undefined) {
      updated.hireDate = new Date(payload.hireDate).toISOString().slice(0, 10);
    }

    employees[index] = updated;
    await writeJsonQueued(EMP_FILE, employees);

    return res.json(updated);
  } catch (error) {
    return next(error);
  }
});
```

---

#### Understand It

**PATCH vs PUT:**

| | PUT | PATCH |
|---|---|---|
| What you send | All fields | Only the fields you want to change |
| Fields not sent | Become empty | Kept as-is |
| Validation | All required fields checked | Only sent fields checked |

**What to know as a tester:**

- You can send just `{ "status": "inactive" }` and only the status changes. All other fields stay the same.
- `updatedAt` always changes — verify this in tests to confirm the update was applied.
- Validation still runs on the fields you do send. A PATCH with `{ "salary": -1 }` returns 400.

---

#### Test It

```typescript
test('PATCH /api/employees/:id — updates only sent fields', async ({ request }) => {
  const emp = await createEmployee(request);

  const res = await request.patch(`/api/employees/${emp.id}`, {
    headers: AUTH,
    data: { status: 'on_leave', salary: 70000 },
  });

  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body.status).toBe('on_leave');
  expect(body.salary).toBe(70000);

  // Other fields are unchanged
  expect(body.firstName).toBe(emp.firstName);
  expect(body.email).toBe(emp.email);

  await cleanupEmployee(request, emp.id);
});

test('PATCH /api/employees/:id — updatedAt changes', async ({ request }) => {
  const emp = await createEmployee(request);

  await new Promise(r => setTimeout(r, 10));

  await request.patch(`/api/employees/${emp.id}`, {
    headers: AUTH,
    data: { status: 'inactive' },
  });

  const updated = await (await request.get(`/api/employees/${emp.id}`)).json();
  expect(updated.updatedAt).not.toBe(emp.updatedAt);

  await cleanupEmployee(request, emp.id);
});
```

---

### Endpoint 8 — Delete an Employee

```
DELETE /api/employees/:id
```

---

#### Build It

```javascript
app.delete('/api/employees/:id', requireAuth, async (req, res, next) => {
  try {
    const id        = Number(req.params.id);
    const employees = await readJson(EMP_FILE, []);
    const index     = employees.findIndex((emp) => emp.id === id);

    if (index === -1) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Employee not found' },
        requestId: req.requestId,
      });
    }

    employees.splice(index, 1);
    await writeJsonQueued(EMP_FILE, employees);

    // 204 = success with no body
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});
```

---

#### Understand It

**What you get back on success:**

```
Status: 204 No Content
(no response body)
```

**What to know as a tester:**

- `204` intentionally has no body. If you call `response.json()` after a 204, it throws an error. Assert the status code and stop.
- Always do a follow-up `GET` to confirm the record is actually gone — do not trust the 204 alone.
- Deleting the same employee twice returns 404 on the second call.

---

#### Test It

```typescript
test('DELETE /api/employees/:id — removes the employee', async ({ request }) => {
  const emp = await createEmployee(request);

  const deleteRes = await request.delete(`/api/employees/${emp.id}`, {
    headers: AUTH,
  });

  // 204 — no body. Do NOT call .json() here.
  expect(deleteRes.status()).toBe(204);

  // Confirm the record is gone
  const getRes = await request.get(`/api/employees/${emp.id}`);
  expect(getRes.status()).toBe(404);
});

test('DELETE /api/employees/:id — deleting twice returns 404', async ({ request }) => {
  const emp = await createEmployee(request);

  await request.delete(`/api/employees/${emp.id}`, { headers: AUTH });

  const second = await request.delete(`/api/employees/${emp.id}`, { headers: AUTH });
  expect(second.status()).toBe(404);
  const body = await second.json();
  expect(body.error.code).toBe('NOT_FOUND');
});
```

---

## Part 4 — UI + API Hybrid Patterns

Every test so far has talked only to the API. In real projects, the application has a UI and an API working together. Playwright lets you use both in a single test.

### Pattern 1 — Set Up State via API, Verify via UI

If you need an employee to exist before testing a UI page, create that employee through the API — not by filling a form. An API call takes under one second. Navigating forms takes 10–15 seconds per test. At scale, that difference is significant.

```typescript
import { test, expect } from '@playwright/test';
import { makeEmployee } from '../src/helpers';

test('employee created via API appears on the list page', async ({ request, page }) => {
  // Create the employee through the API — fast and controlled
  const res = await request.post('/api/employees', {
    headers: { 'x-api-key': 'VT-EMP-KEY-123' },
    data: makeEmployee({ firstName: 'Diana', lastName: 'Prince', role: 'Tech Lead' }),
  });
  expect(res.status()).toBe(201);
  const { id } = await res.json();

  // Open the UI and verify the employee appears
  await page.goto('/employees');
  await expect(page.getByText('Diana Prince')).toBeVisible();
  await expect(page.getByText('Tech Lead')).toBeVisible();

  // Cleanup
  await request.delete(`/api/employees/${id}`, {
    headers: { 'x-api-key': 'VT-EMP-KEY-123' },
  });
});
```

### Pattern 2 — Perform Action via UI, Verify via API

Use the UI to trigger an action, then call the API to confirm the backend actually processed it. The UI may show a success message even when the backend failed. The API does not lie.

```typescript
test('deleting via the UI removes the employee from the API', async ({ request, page }) => {
  const res = await request.post('/api/employees', {
    headers: { 'x-api-key': 'VT-EMP-KEY-123' },
    data: makeEmployee(),
  });
  const { id } = await res.json();

  // Use the UI to delete
  await page.goto(`/employees/${id}`);
  await page.getByRole('button', { name: 'Delete Employee' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();

  // Verify the backend actually deleted the record
  const getRes = await request.get(`/api/employees/${id}`);
  expect(getRes.status()).toBe(404);
});
```

---

## Part 5 — Best Practices and Common Mistakes

### Best Practices

**1. Assert the status code before the body.**
If the status code is wrong, the body may not have the shape you expect. Asserting the code first gives you a clear failure message.

```typescript
// ✅ Status first, body second
expect(res.status()).toBe(201);
const body = await res.json();
expect(body.id).toBeTruthy();
```

**2. Make every test self-contained.**
Each test creates the data it needs. Never rely on a previous test having run first, and never depend on pre-existing data in the server.

**3. Clean up after your tests.**
If a test creates an employee, delete it when the test finishes. Use `afterEach` to keep the server state clean between runs.

```typescript
let createdId: number;

test.afterEach(async ({ request }) => {
  if (createdId) {
    await request.delete(`/api/employees/${createdId}`, {
      headers: { 'x-api-key': 'VT-EMP-KEY-123' },
    });
    createdId = 0;
  }
});
```

**4. Test the sad path, not just the happy path.**
Every `if` block in `server.js` is a test case. The validation check, the 404 check, the duplicate email check — each one is a branch your tests should cover.

**5. Use helpers to keep tests readable.**
The `makeEmployee()` factory in `src/helpers.ts` generates a unique valid payload every time. Import it rather than repeating the same object literal in every test.

---

### Common Mistakes

**Mistake 1 — Expecting 200 from a POST.**

```typescript
// ❌ Wrong — create returns 201
expect(res.status()).toBe(200);

// ✅ Correct
expect(res.status()).toBe(201);
```

**Mistake 2 — Calling response.json() after a 204.**

```typescript
// ❌ Wrong — DELETE returns no body. This throws an error.
const body = await res.json();

// ✅ Correct — assert the status and stop
expect(res.status()).toBe(204);
```

**Mistake 3 — Hardcoding an ID.**

```typescript
// ❌ Fragile — breaks when the server restarts or IDs shift
const res = await request.get('/api/employees/1');

// ✅ Resilient — always uses a real ID from the server
const created = await createEmployee(request);
const res     = await request.get(`/api/employees/${created.id}`);
```

**Mistake 4 — Sending only the changed field in a PUT.**

```typescript
// ❌ Wrong — all other fields become empty in the stored record
await request.put(`/api/employees/${id}`, {
  headers: AUTH,
  data: { role: 'Staff Engineer' },
});

// ✅ Correct — send the full object
await request.put(`/api/employees/${id}`, {
  headers: AUTH,
  data: { ...existingEmployee, role: 'Staff Engineer' },
});
```

**Mistake 5 — Expecting 400 for a duplicate email.**

```typescript
// ❌ Wrong — duplicate email returns 409, not 400
expect(res.status()).toBe(400);

// ✅ Correct
expect(res.status()).toBe(409);
const body = await res.json();
expect(body.error.code).toBe('DUPLICATE_EMAIL');
```

**Mistake 6 — Checking body.error as a string.**

```typescript
// ❌ Wrong — error is an object, not a string
expect(body.error).toBe('Employee not found');

// ✅ Correct — use the nested code and message fields
expect(body.error.code).toBe('NOT_FOUND');
expect(body.error.message).toBe('Employee not found');
```

---

## Part 6 — Authentication

Every write endpoint requires authentication. Read endpoints (`GET`) are public. When a protected request is rejected, the server returns:

```
Status: 401 Unauthorized
```

```json
{
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Authentication required. Use Bearer token or x-api-key header."
  },
  "requestId": "a1b2c3..."
}
```

Authentication is enforced by **middleware** — a function that runs before the route handler. If the middleware rejects the request, the route handler never runs.

This API supports five authentication types. Each one uses a different mechanism to identify the caller.

---

### Auth Type 1 — API Key

An API key is a static secret string sent on every request in the `x-api-key` header. There is no login step.

---

#### Build It

```javascript
const API_KEY = process.env.API_KEY || 'VT-EMP-KEY-123';

const getAuthContext = (req) => {
  // Check for API key first
  const apiKey = req.header('x-api-key');
  if (apiKey && apiKey === API_KEY) {
    return { type: 'apiKey', role: 'service', name: 'Service Client' };
  }
  // ... other auth types checked below
  return null;
};

const requireAuth = (req, res, next) => {
  const auth = getAuthContext(req);
  if (!auth) {
    return res.status(401).json({
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required. Use Bearer token or x-api-key header.' },
      requestId: req.requestId,
    });
  }
  req.auth = auth;
  return next();
};
```

---

#### Understand It

**Sending the key:**

```
POST /api/employees
x-api-key: VT-EMP-KEY-123
```

**What to know as a tester:**

- Add the header to every write request. GET endpoints do not require it.
- A wrong key and a missing key both return 401.
- API Key and Bearer Token both use the same `requireAuth` middleware and return the same error structure on failure.

---

#### Test It

```typescript
import { test, expect } from '@playwright/test';
import { API_KEY, BAD_API_KEY, makeEmployee, cleanupEmployee } from '../src/helpers';

test('API Key — valid key allows write access', async ({ request }) => {
  const res = await request.post('/api/employees', {
    headers: { 'x-api-key': API_KEY },
    data: makeEmployee(),
  });
  expect(res.status()).toBe(201);
  const { id } = await res.json();
  await cleanupEmployee(request, id);
});

test('API Key — wrong key returns 401', async ({ request }) => {
  const res = await request.post('/api/employees', {
    headers: { 'x-api-key': BAD_API_KEY },
    data: makeEmployee(),
  });
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body.error.code).toBe('AUTH_REQUIRED');
});

test('API Key — missing key returns 401', async ({ request }) => {
  const res = await request.post('/api/employees', { data: makeEmployee() });
  expect(res.status()).toBe(401);
});

test('API Key — read endpoints are public, no key needed', async ({ request }) => {
  const res = await request.get('/api/employees');
  expect(res.status()).toBe(200);
});
```

---

### Auth Type 2 — Bearer Token (JWT)

A **Bearer Token** is sent in the `Authorization` header. The client logs in with a username and password and receives a **JWT** (JSON Web Token) in return. The JWT is then sent on every subsequent request.

A JWT is a signed token in three dot-separated parts: `header.payload.signature`. The payload contains user information. The server verifies the signature — if it matches, the payload is trusted. No database lookup is needed.

---

#### Build It

```javascript
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'vt-jwt-secret-key';

// Issues a signed JWT — 1 hour expiry
const issueToken = (user) => {
  const payload = { id: user.id, username: user.username, role: user.role, name: user.name };
  const token   = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
  return { token, expiresAt: Date.now() + 60 * 60 * 1000 };
};

// Login endpoint
app.post('/auth/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'username and password are required' },
        requestId: req.requestId,
      });
    }

    const users = await readJson(USERS_FILE, []);
    const user  = users.find(
      (u) => normalizeString(u.username) === normalizeString(username) && u.password === password
    );

    if (!user) {
      return res.status(401).json({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' },
        requestId: req.requestId,
      });
    }

    const { token, expiresAt } = issueToken(user);
    return res.json({
      token,
      tokenType: 'Bearer',
      expiresIn: Math.floor((expiresAt - Date.now()) / 1000),
      user: { id: user.id, username: user.username, role: user.role, name: user.name },
    });
  } catch (error) {
    return next(error);
  }
});

// GET /auth/me — returns the currently authenticated user
app.get('/auth/me', requireAuth, (req, res) => {
  res.json({
    authType: req.auth.type,
    user: { id: req.auth.id, username: req.auth.username, role: req.auth.role, name: req.auth.name },
    requestId: req.requestId,
  });
});

// In getAuthContext — verify JWT from Authorization header
const authHeader = req.header('authorization') || '';
const [scheme, token] = authHeader.split(' ');
if (scheme?.toLowerCase() === 'bearer' && token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return { type: 'bearer', ...decoded };
  } catch {
    return null; // expired or tampered
  }
}
```

---

#### Understand It

**Step 1 — Login:**

```
POST /auth/login
Content-Type: application/json
```

```json
{ "username": "admin", "password": "admin123" }
```

**Login response:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "user": { "id": 1, "username": "admin", "role": "admin", "name": "Admin User" }
}
```

**Step 2 — Use the token:**

```
POST /api/employees
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**What to know as a tester:**

- JWT testing always has two steps: login to get a token, then use it. The `getBearerToken()` helper in `src/helpers.ts` handles step 1.
- A tampered token — one where any character is changed — fails `jwt.verify()` and returns 401.
- The token has a three-part structure (`header.payload.signature`). You can verify this in a test by checking `body.token.split('.').length === 3`.
- Credentials are stored in `data/users.json`. Default accounts: `admin` / `admin123`, `trainer` / `trainer123`.

---

#### Test It

```typescript
import { getBearerToken, ADMIN_CREDS, INVALID_CREDS } from '../src/helpers';

test('Bearer Token — login with valid credentials returns a JWT', async ({ request }) => {
  const res  = await request.post('/auth/login', { data: ADMIN_CREDS });
  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(typeof body.token).toBe('string');
  expect(body.token.split('.').length).toBe(3); // valid JWT structure
  expect(body.tokenType).toBe('Bearer');
  expect(body.expiresIn).toBe(3600);
  expect(body.user.username).toBe('admin');
});

test('Bearer Token — valid JWT allows access to protected endpoint', async ({ request }) => {
  const token = await getBearerToken(request);

  const res = await request.get('/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body.user.username).toBe('admin');
  expect(body.authType).toBe('bearer');
});

test('Bearer Token — wrong password returns 401', async ({ request }) => {
  const res  = await request.post('/auth/login', { data: INVALID_CREDS });
  expect(res.status()).toBe(401);

  const body = await res.json();
  expect(body.error.code).toBe('INVALID_CREDENTIALS');
});

test('Bearer Token — tampered token returns 401', async ({ request }) => {
  const res = await request.get('/auth/me', {
    headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiZmFrZSJ9.invalidsignature' },
  });
  expect(res.status()).toBe(401);
});

test('Bearer Token — missing Authorization header returns 401', async ({ request }) => {
  const res = await request.get('/auth/me');
  expect(res.status()).toBe(401);
});
```

---

### Auth Type 3 — Basic Auth

**Basic Auth** sends a username and password Base64-encoded in the `Authorization` header on every request. There is no login step. It is the oldest HTTP authentication scheme and is built into Playwright's `httpCredentials` option.

The format is: `Authorization: Basic <base64(username:password)>`

---

#### Build It

```javascript
const requireBasicAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'] || '';

  if (!authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Employee API"');
    return res.status(401).json({
      error: { code: 'AUTH_REQUIRED', message: 'Basic authentication required' },
      requestId: req.requestId,
    });
  }

  // Decode the Base64 string and split on the first colon
  const decoded    = Buffer.from(authHeader.split(' ')[1], 'base64').toString('utf8');
  const colonIndex = decoded.indexOf(':');
  const username   = decoded.slice(0, colonIndex);
  const password   = decoded.slice(colonIndex + 1);

  if (username !== 'admin' || password !== 'admin123') {
    return res.status(401).json({
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' },
      requestId: req.requestId,
    });
  }
  return next();
};

// Apply to specific routes
app.get('/auth/basic-test', requireBasicAuth, (req, res) => {
  res.json({ message: 'Basic Auth successful', requestId: req.requestId });
});
```

---

#### Understand It

**Sending credentials manually:**

```
GET /auth/basic-test
Authorization: Basic YWRtaW46YWRtaW4xMjM=
```

`YWRtaW46YWRtaW4xMjM=` is `admin:admin123` encoded in Base64.

**How encoding works:**

```
"admin:admin123"  →  Base64 encode  →  "YWRtaW46YWRtaW4xMjM="
```

**Playwright shortcut — httpCredentials:**

Playwright can handle the encoding for you. Instead of constructing the header manually, create a request context with credentials:

```typescript
const ctx = await playwright.request.newContext({
  baseURL: 'http://localhost:3000',
  httpCredentials: { username: 'admin', password: 'admin123' },
});
```

Every request from `ctx` automatically includes the correct `Authorization: Basic ...` header.

**What to know as a tester:**

- Basic Auth credentials travel in every request — there is no login step.
- The `WWW-Authenticate` header in the 401 response tells the browser to show a login popup.
- Credentials: `admin` / `admin123`. The endpoint protected with Basic Auth in this server is `GET /auth/basic-test`.

---

#### Test It

```typescript
import { basicAuthHeader, BASIC_USER, BASIC_PASS, BASIC_WRONG, BASE_URL } from '../src/helpers';

test('Basic Auth — valid credentials allow access', async ({ request }) => {
  const res = await request.get('/auth/basic-test', {
    headers: { Authorization: basicAuthHeader(BASIC_USER, BASIC_PASS) },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.message).toBe('Basic Auth successful');
});

test('Basic Auth — Playwright httpCredentials handles encoding automatically', async ({ playwright }) => {
  const ctx = await playwright.request.newContext({
    baseURL: BASE_URL,
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
  });

  const res = await ctx.get('/auth/basic-test');
  expect(res.status()).toBe(200);

  await ctx.dispose();
});

test('Basic Auth — wrong password returns 401', async ({ request }) => {
  const res = await request.get('/auth/basic-test', {
    headers: { Authorization: basicAuthHeader(BASIC_USER, BASIC_WRONG) },
  });
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body.error.code).toBe('INVALID_CREDENTIALS');
});

test('Basic Auth — missing header returns 401 with WWW-Authenticate', async ({ request }) => {
  const res = await request.get('/auth/basic-test');
  expect(res.status()).toBe(401);
  expect(res.headers()['www-authenticate']).toContain('Basic');
});
```

---

### Auth Type 4 — Cookie / Session

**Cookie-based auth** is how most browser-facing applications work. The client logs in, the server creates a session, and the server sends back a `Set-Cookie` header. The browser stores the cookie and automatically sends it on every subsequent request.

---

#### Build It

```javascript
const session = require('express-session');

app.use(session({
  secret:            process.env.SESSION_SECRET || 'vt-session-secret',
  resave:            false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 3600000 }, // 1 hour
}));

// POST /auth/session/login — creates a session
app.post('/auth/session/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'username and password are required' },
        requestId: req.requestId,
      });
    }

    const users = await readJson(USERS_FILE, []);
    const user  = users.find(
      (u) => normalizeString(u.username) === normalizeString(username) && u.password === password
    );

    if (!user) {
      return res.status(401).json({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' },
        requestId: req.requestId,
      });
    }

    req.session.user = { id: user.id, username: user.username, role: user.role, name: user.name };
    return res.json({ message: 'Logged in successfully', requestId: req.requestId });
  } catch (error) {
    return next(error);
  }
});

// POST /auth/session/logout — destroys the session
app.post('/auth/session/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Logout failed' } });
    res.clearCookie('connect.sid');
    return res.json({ message: 'Logged out successfully', requestId: req.requestId });
  });
});

// GET /auth/session/me — returns the session user
app.get('/auth/session/me', requireSession, (req, res) => {
  res.json({ user: req.session.user, requestId: req.requestId });
});

// Middleware: check that a valid session exists
const requireSession = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({
      error: { code: 'AUTH_REQUIRED', message: 'Not authenticated. Please log in.' },
      requestId: req.requestId,
    });
  }
  return next();
};
```

---

#### Understand It

**Step 1 — Login:**

```
POST /auth/session/login
Content-Type: application/json
```

```json
{ "username": "admin", "password": "admin123" }
```

**Login response:**

```
Status: 200 OK
Set-Cookie: connect.sid=s%3Axxx...; Path=/; HttpOnly
```

```json
{ "message": "Logged in successfully", "requestId": "a1b2c3..." }
```

**Step 2 — Subsequent requests:**

The browser (or Playwright's request context) stores the cookie and sends it automatically:

```
GET /auth/session/me
Cookie: connect.sid=s%3Axxx...
```

**Session endpoints:**

| Endpoint | Description |
|---|---|
| `POST /auth/session/login` | Create a session |
| `POST /auth/session/logout` | Destroy the session |
| `GET /auth/session/me` | Get the session user (protected) |

**What to know as a tester:**

- A single `request` fixture in Playwright shares a cookie jar across all calls in the same test. Log in once and subsequent calls automatically carry the cookie.
- After logout, the session is destroyed on the server. The same cookie is no longer valid.
- Credentials: `admin` / `admin123` or `trainer` / `trainer123` (from `data/users.json`).

---

#### Test It

```typescript
import { test, expect, request as playwrightRequest } from '@playwright/test';
import { ADMIN_CREDS, INVALID_CREDS, BASE_URL } from '../src/helpers';

test('Cookie Auth — login creates a session', async ({ request }) => {
  const res  = await request.post('/auth/session/login', { data: ADMIN_CREDS });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.message).toBe('Logged in successfully');
});

test('Cookie Auth — session cookie allows access to protected endpoint', async ({ request }) => {
  // Login — the request fixture stores the cookie automatically
  await request.post('/auth/session/login', { data: ADMIN_CREDS });

  const res  = await request.get('/auth/session/me');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.user.username).toBe('admin');
});

test('Cookie Auth — access without login returns 401', async () => {
  // Fresh context — no session cookie
  const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL });
  const res = await ctx.get('/auth/session/me');
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body.error.code).toBe('AUTH_REQUIRED');
  await ctx.dispose();
});

test('Cookie Auth — access after logout returns 401', async ({ request }) => {
  await request.post('/auth/session/login', { data: ADMIN_CREDS });

  const before = await request.get('/auth/session/me');
  expect(before.status()).toBe(200);

  await request.post('/auth/session/logout');

  const after = await request.get('/auth/session/me');
  expect(after.status()).toBe(401);
});

test('Cookie Auth — wrong password returns 401', async ({ request }) => {
  const res  = await request.post('/auth/session/login', { data: INVALID_CREDS });
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body.error.code).toBe('INVALID_CREDENTIALS');
});
```

---

### Auth Type 5 — OAuth 2.0 Client Credentials

**OAuth 2.0** is the industry standard for API authorization. The Client Credentials flow is the simplest variant — it is used for machine-to-machine communication where there is no human user. A client application exchanges its `client_id` and `client_secret` for an `access_token`.

---

#### Build It

```javascript
// Client registry — maps client_id to its secret and allowed scope
const clientRegistry = {
  'vt-client-read':  { secret: 'vt-secret-read-abc',  scope: 'read' },
  'vt-client-write': { secret: 'vt-secret-write-xyz', scope: 'write' },
};

// POST /oauth/token — Client Credentials flow
app.post('/oauth/token', (req, res) => {
  const { grant_type, client_id, client_secret } = req.body || {};

  if (grant_type !== 'client_credentials') {
    return res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: 'Only client_credentials grant type is supported',
    });
  }

  const client = clientRegistry[client_id];
  if (!client || client.secret !== client_secret) {
    return res.status(401).json({
      error: 'invalid_client',
      error_description: 'Invalid client_id or client_secret',
    });
  }

  // Issue a signed JWT as the access token
  const token = jwt.sign(
    { client_id, scope: client.scope, token_type: 'oauth2' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  return res.json({
    access_token: token,
    token_type:   'Bearer',
    expires_in:   3600,
    scope:        client.scope,
  });
});
```

---

#### Understand It

OAuth 2.0 error responses use a different format (RFC 6749) from the rest of this API:

```json
{ "error": "invalid_client", "error_description": "Invalid client_id or client_secret" }
```

**Step 1 — Get an access token:**

```
POST /oauth/token
Content-Type: application/json
```

```json
{
  "grant_type":    "client_credentials",
  "client_id":     "vt-client-write",
  "client_secret": "vt-secret-write-xyz"
}
```

**Token response:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type":   "Bearer",
  "expires_in":   3600,
  "scope":        "write"
}
```

**Step 2 — Use the access token:**

```
POST /api/employees
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Available clients:**

| client_id | client_secret | scope |
|---|---|---|
| `vt-client-read` | `vt-secret-read-abc` | `read` |
| `vt-client-write` | `vt-secret-write-xyz` | `write` |

**What to know as a tester:**

- This is a two-step flow: get a token from `/oauth/token`, then use it on protected endpoints as `Authorization: Bearer <access_token>`.
- The `getOAuthToken()` helper in `src/helpers.ts` handles step 1.
- The issued token is a JWT — you can verify the three-dot structure.
- On error, check `body.error` (not `body.error.code`) — OAuth responses follow the RFC 6749 error format.

---

#### Test It

```typescript
import { OAUTH_CLIENT_READ, OAUTH_CLIENT_WRITE, OAUTH_BAD_CLIENT, getOAuthToken } from '../src/helpers';

test('OAuth 2.0 — valid write client returns an access token', async ({ request }) => {
  const res  = await request.post('/oauth/token', {
    data: { grant_type: 'client_credentials', ...OAUTH_CLIENT_WRITE },
  });
  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(typeof body.access_token).toBe('string');
  expect(body.access_token.split('.').length).toBe(3); // JWT structure
  expect(body.token_type).toBe('Bearer');
  expect(body.expires_in).toBe(3600);
  expect(body.scope).toBe('write');
});

test('OAuth 2.0 — access token allows write to protected endpoint', async ({ request }) => {
  const token = await getOAuthToken(request, OAUTH_CLIENT_WRITE);

  const res = await request.post('/api/employees', {
    headers: { Authorization: `Bearer ${token}` },
    data: makeEmployee(),
  });
  expect(res.status()).toBe(201);
  const { id } = await res.json();
  await cleanupEmployee(request, id);
});

test('OAuth 2.0 — invalid client_secret returns 401', async ({ request }) => {
  const res  = await request.post('/oauth/token', {
    data: { grant_type: 'client_credentials', ...OAUTH_BAD_CLIENT },
  });
  expect(res.status()).toBe(401);

  const body = await res.json();
  expect(body.error).toBe('invalid_client'); // OAuth RFC format — not body.error.code
});

test('OAuth 2.0 — wrong grant_type returns 400', async ({ request }) => {
  const res  = await request.post('/oauth/token', {
    data: { grant_type: 'authorization_code', ...OAUTH_CLIENT_WRITE },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toBe('unsupported_grant_type');
});

test('OAuth 2.0 — tampered access token returns 401', async ({ request }) => {
  const res = await request.get('/auth/me', {
    headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRfaWQiOiJmYWtlIn0.badsig' },
  });
  expect(res.status()).toBe(401);
});
```

---

### Comparing the Five Auth Types

| | API Key | Bearer JWT | Basic Auth | Cookie / Session | OAuth 2.0 |
|---|---|---|---|---|---|
| **Where credentials go** | `x-api-key` header | `Authorization: Bearer` | `Authorization: Basic` | Cookie (automatic) | `Authorization: Bearer` |
| **Login step needed?** | No | Yes | No | Yes | Yes (token exchange) |
| **Server stores state?** | No | No | No | Yes (session) | No |
| **Token expiry?** | No | Yes (1 hour) | No | Yes (1 hour) | Yes (1 hour) |
| **Best used for** | Simple integrations | User-authenticated apps | Legacy systems | Browser apps | Machine-to-machine |
| **Playwright sends via** | `headers: { 'x-api-key' }` | `headers: { Authorization }` | `httpCredentials` | Automatic cookie jar | `headers: { Authorization }` |

**As a tester, what changes between them:**

- **API Key** — add `x-api-key` header to every write request. Test with valid key, wrong key, no key.
- **Bearer JWT** — call `/auth/login`, extract `token`, then send `Authorization: Bearer <token>`. Test login success, wrong password, valid token, tampered token, missing header.
- **Basic Auth** — use `httpCredentials` in a new context or construct the header manually. Test valid credentials, wrong credentials, missing header + `WWW-Authenticate`.
- **Cookie / Session** — login with `/auth/session/login`, then the cookie is automatic. Test session access, unauthenticated access, post-logout 401.
- **OAuth 2.0** — call `/oauth/token` with `client_credentials`, extract `access_token`, then send `Authorization: Bearer <access_token>`. Test valid client, bad secret, wrong grant type, tampered token.

---

## What You Have Learned

You started this guide knowing nothing about APIs. You have now built one from scratch — with file-based persistence, a rich validation layer, pagination, filtering, sorting, and five different authentication mechanisms — and written 69 tests that verify every bit of it.

For each endpoint and each auth type you followed the same path: you wrote the server code, you understood what it accepts and returns, and you wrote the Playwright tests that verify it. That connection between the implementation and the tests is what makes API testing click. When a test fails, you know exactly which line in `server.js` to look at.

The same pattern applies to any REST API you will ever test. The field names change. The auth scheme changes. The approach stays the same.
