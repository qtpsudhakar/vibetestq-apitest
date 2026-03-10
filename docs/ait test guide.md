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
| PUT | Update existing data | Replacing a file with a new version |
| DELETE | Remove data | Removing a file from the cabinet |

Every response comes with a **status code** — a three-digit number that tells you what happened.

| Status Code | Meaning | When You See It |
|-------------|---------|-----------------|
| 200 | OK | A GET or PUT request succeeded |
| 201 | Created | A POST request created a new resource |
| 204 | No Content | A DELETE request succeeded — no body returned |
| 400 | Bad Request | Your request had invalid or missing data |
| 404 | Not Found | The resource does not exist |
| 500 | Internal Server Error | Something went wrong on the server |

Data travels as **JSON** — a text format using key-value pairs. Here is what an employee looks like in JSON:

```json
{
  "id": "emp-001",
  "firstName": "Sarah",
  "lastName": "Connor",
  "email": "sarah.connor@company.com",
  "department": "Engineering",
  "role": "Senior Engineer",
  "createdAt": "2025-03-10T09:00:00Z"
}
```

Notice `id` and `createdAt` — the client never sends these. The server generates them. That detail shows up in both the API code and the tests throughout this guide.

---

## Part 2 — Project Setup

You will build two things side by side: the **API server** using Express.js, and the **test suite** using Playwright. Set both up now before writing any endpoint code.

### Setting Up the API Server

```bash
mkdir employee-api
cd employee-api
npm init -y
npm install express
```

Create a file called `server.js`. This is where the entire API lives. Start with the foundation — the server setup, storage, and shared validation logic. You will add endpoints one by one in Part 3.

```javascript
// server.js

const express = require('express');
const app = express();

// Parse incoming request bodies as JSON.
// Without this line, req.body is always undefined on POST and PUT requests.
app.use(express.json());

// In-memory storage — replaces a real database for this guide.
// The array resets every time you restart the server.
let employees = [];
let nextId = 1;

// Valid department names. Any other value is rejected by the validator.
const VALID_DEPARTMENTS = ['Engineering', 'HR', 'Finance', 'Marketing'];

// Shared validation — called by POST and PUT before saving anything.
// Returns an array of error messages. Empty array means all fields are valid.
function validateEmployee(data) {
  const errors = [];
  if (!data.firstName)  errors.push('firstName is required');
  if (!data.lastName)   errors.push('lastName is required');
  if (!data.email)      errors.push('email is required');
  if (!data.department) errors.push('department is required');
  if (!data.role)       errors.push('role is required');
  if (data.department && !VALID_DEPARTMENTS.includes(data.department)) {
    errors.push(`department must be one of: ${VALID_DEPARTMENTS.join(', ')}`);
  }
  return errors;
}

// Endpoints will be added here in Part 3

app.listen(3000, () => {
  console.log('Employee API running at http://localhost:3000');
});
```

### Setting Up the Playwright Test Project

In a separate folder:

```bash
mkdir employee-tests
cd employee-tests
npm init playwright@latest
```

Choose TypeScript when prompted. Open `playwright.config.ts` and point it at the local server:

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    baseURL: 'http://localhost:3000',
  },
});
```

Create your test file at `tests/employees.spec.ts`. All test code in this guide goes there.

**Running the two together:**

Start the API server in one terminal:

```bash
cd employee-api
node server.js
# Employee API running at http://localhost:3000
```

Run Playwright in a second terminal:

```bash
cd employee-tests
npx playwright test
```

---

## Part 3 — Endpoint by Endpoint

Every section below follows the same three-step pattern: **Build → Understand → Test**.

Add each route to `server.js` above the `app.listen` line.

---

### Endpoint 1 — Create an Employee

```
POST /employees
```

---

#### Build It

```javascript
// POST /employees — create a new employee
app.post('/employees', (req, res) => {
  const data = req.body;

  // Step 1: Validate all required fields
  const errors = validateEmployee(data);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  // Step 2: Reject duplicate email addresses
  const emailExists = employees.some(emp => emp.email === data.email);
  if (emailExists) {
    return res.status(400).json({
      error: 'Validation failed',
      details: ['email already exists'],
    });
  }

  // Step 3: Build the full employee object with server-generated fields
  const newEmployee = {
    id:         `emp-${String(nextId).padStart(3, '0')}`, // emp-001, emp-002, ...
    firstName:  data.firstName,
    lastName:   data.lastName,
    email:      data.email,
    department: data.department,
    role:       data.role,
    createdAt:  new Date().toISOString(),                  // e.g. "2025-03-10T09:00:00.000Z"
  };

  nextId++;
  employees.push(newEmployee);

  // Step 4: Respond with 201 and the created employee
  res.status(201).json(newEmployee);
});
```

---

#### Understand It

**What you send:**

```
POST /employees
Content-Type: application/json
```

```json
{
  "firstName": "Sarah",
  "lastName": "Connor",
  "email": "sarah.connor@company.com",
  "department": "Engineering",
  "role": "Senior Engineer"
}
```

You do not send `id` or `createdAt`. The server generates `id` from the counter (`nextId`) and `createdAt` from the current timestamp.

**What you get back on success:**

```
Status: 201 Created
```

```json
{
  "id": "emp-001",
  "firstName": "Sarah",
  "lastName": "Connor",
  "email": "sarah.connor@company.com",
  "department": "Engineering",
  "role": "Senior Engineer",
  "createdAt": "2025-03-10T09:00:00.000Z"
}
```

**What you get back on failure:**

```
Status: 400 Bad Request
```

```json
{
  "error": "Validation failed",
  "details": ["email is required"]
}
```

**What to know as a tester:**

- The success code is **201**, not 200. This is the most common beginner mistake.
- `id` is unpredictable from outside. Always read it from the response — never assume it.
- Both the field check and the duplicate email check return 400. The `details` array tells you which rule failed.
- Looking at the code: `validateEmployee` runs first, then the duplicate check. If email is missing AND a duplicate exists, you get "email is required" — not "email already exists". Order matters.

---

#### Test It

```typescript
// tests/employees.spec.ts
import { test, expect } from '@playwright/test';

test('POST /employees — creates a new employee', async ({ request }) => {
  const response = await request.post('/employees', {
    data: {
      firstName:  'Sarah',
      lastName:   'Connor',
      email:      'sarah.connor@company.com',
      department: 'Engineering',
      role:       'Senior Engineer',
    },
  });

  // 201, not 200
  expect(response.status()).toBe(201);

  const body = await response.json();

  // Server must have generated an id and createdAt
  expect(body.id).toBeTruthy();
  expect(body.createdAt).toBeTruthy();

  // Fields sent must come back correctly
  expect(body.firstName).toBe('Sarah');
  expect(body.email).toBe('sarah.connor@company.com');
  expect(body.department).toBe('Engineering');
});

test('POST /employees — returns 400 when email is missing', async ({ request }) => {
  const response = await request.post('/employees', {
    data: {
      firstName:  'No',
      lastName:   'Email',
      // email intentionally omitted
      department: 'HR',
      role:       'Manager',
    },
  });

  expect(response.status()).toBe(400);

  const body = await response.json();
  expect(body.error).toBe('Validation failed');
  expect(body.details).toContain('email is required');
});

test('POST /employees — returns 400 for an invalid department', async ({ request }) => {
  const response = await request.post('/employees', {
    data: {
      firstName:  'Bad',
      lastName:   'Dept',
      email:      'bad.dept@company.com',
      department: 'Sales',     // not a valid value
      role:       'Manager',
    },
  });

  expect(response.status()).toBe(400);

  const body = await response.json();
  expect(body.details[0]).toContain('department must be one of');
});
```

---

### Endpoint 2 — Get All Employees

```
GET /employees
GET /employees?department=Engineering
```

---

#### Build It

```javascript
// GET /employees — return all employees, with an optional department filter
app.get('/employees', (req, res) => {
  const { department } = req.query;

  // req.query holds any query parameters from the URL
  // e.g. /employees?department=Engineering → req.query.department = "Engineering"
  if (department) {
    const filtered = employees.filter(emp => emp.department === department);
    return res.status(200).json(filtered);
  }

  // No filter — return everything (may be an empty array)
  res.status(200).json(employees);
});
```

---

#### Understand It

**What you send:**

```
GET /employees
```

No body. No required parameters. To filter by department, add a query parameter:

```
GET /employees?department=Engineering
```

`req.query` is where query parameters land automatically. Express parses the URL and makes `?department=Engineering` available as `req.query.department`.

**What you get back:**

```
Status: 200 OK
```

```json
[
  {
    "id": "emp-001",
    "firstName": "Sarah",
    "lastName": "Connor",
    "email": "sarah.connor@company.com",
    "department": "Engineering",
    "role": "Senior Engineer",
    "createdAt": "2025-03-10T09:00:00.000Z"
  }
]
```

**What to know as a tester:**

- The response is always a JSON **array**, even when there is only one employee.
- An empty database returns `[]` with status 200 — not a 404. Never treat an empty array as a failure.
- The department filter is case-sensitive. `Engineering` works. `engineering` returns an empty array.

---

#### Test It

```typescript
test('GET /employees — returns an array', async ({ request }) => {
  const response = await request.get('/employees');

  expect(response.status()).toBe(200);

  const body = await response.json();

  // Always an array — even if empty
  expect(Array.isArray(body)).toBe(true);
});

test('GET /employees?department=Engineering — returns only Engineering employees', async ({ request }) => {
  // Create an Engineering employee first so the filter has data to return
  await request.post('/employees', {
    data: {
      firstName:  'Diana',
      lastName:   'Prince',
      email:      'diana.prince@company.com',
      department: 'Engineering',
      role:       'Tech Lead',
    },
  });

  // Pass the filter as params — Playwright appends it to the URL automatically
  const response = await request.get('/employees', {
    params: { department: 'Engineering' },
  });

  expect(response.status()).toBe(200);

  const body = await response.json();

  // Every employee in the result must be from Engineering
  for (const employee of body) {
    expect(employee.department).toBe('Engineering');
  }
});
```

---

### Endpoint 3 — Get One Employee

```
GET /employees/:id
```

---

#### Build It

```javascript
// GET /employees/:id — return a single employee by ID
app.get('/employees/:id', (req, res) => {
  const { id } = req.params; // reads the :id segment from the URL path

  const employee = employees.find(emp => emp.id === id);

  if (!employee) {
    return res.status(404).json({ error: 'Employee not found', id });
  }

  res.status(200).json(employee);
});
```

---

#### Understand It

**What you send:**

```
GET /employees/emp-001
```

The `id` is part of the URL path — not a query parameter. `req.params.id` captures whatever appears after `/employees/`.

**What you get back — found:**

```
Status: 200 OK
```

```json
{
  "id": "emp-001",
  "firstName": "Sarah",
  "lastName": "Connor",
  "email": "sarah.connor@company.com",
  "department": "Engineering",
  "role": "Senior Engineer",
  "createdAt": "2025-03-10T09:00:00.000Z"
}
```

**What you get back — not found:**

```
Status: 404 Not Found
```

```json
{
  "error": "Employee not found",
  "id": "emp-999"
}
```

**What to know as a tester:**

- There is no partial result. The code either finds the employee (200) or does not (404). Both branches are in the code — both must be covered in your tests.
- Never hardcode an ID like `emp-001` in a test. Create the employee first, then read the ID from the response. Hardcoded IDs break when the server restarts or tests run in a different order.

---

#### Test It

```typescript
test('GET /employees/:id — returns the correct employee', async ({ request }) => {
  // Create an employee to give us a real, known ID
  const createResponse = await request.post('/employees', {
    data: {
      firstName:  'James',
      lastName:   'Rhodes',
      email:      'james.rhodes@company.com',
      department: 'HR',
      role:       'HR Manager',
    },
  });
  const created = await createResponse.json();
  const employeeId = created.id;   // read the real ID — do not assume it

  // Fetch that specific employee
  const getResponse = await request.get(`/employees/${employeeId}`);

  expect(getResponse.status()).toBe(200);

  const body = await getResponse.json();
  expect(body.id).toBe(employeeId);
  expect(body.firstName).toBe('James');
  expect(body.email).toBe('james.rhodes@company.com');
});

test('GET /employees/:id — returns 404 for a non-existent ID', async ({ request }) => {
  const response = await request.get('/employees/emp-999');

  expect(response.status()).toBe(404);

  const body = await response.json();
  expect(body.error).toBe('Employee not found');
});
```

---

### Endpoint 4 — Update an Employee

```
PUT /employees/:id
```

---

#### Build It

```javascript
// PUT /employees/:id — replace an employee record entirely
app.put('/employees/:id', (req, res) => {
  const { id } = req.params;
  const data = req.body;

  // Step 1: Find the employee — 404 if not found
  const index = employees.findIndex(emp => emp.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Employee not found', id });
  }

  // Step 2: Validate the new data
  const errors = validateEmployee(data);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  // Step 3: Overwrite the record — preserve only id and createdAt
  employees[index] = {
    id:         employees[index].id,        // never changes
    firstName:  data.firstName,
    lastName:   data.lastName,
    email:      data.email,
    department: data.department,
    role:       data.role,
    createdAt:  employees[index].createdAt, // never changes
  };

  res.status(200).json(employees[index]);
});
```

---

#### Understand It

**What you send:**

```
PUT /employees/emp-001
Content-Type: application/json
```

```json
{
  "firstName": "Sarah",
  "lastName": "Connor",
  "email": "sarah.connor@company.com",
  "department": "Engineering",
  "role": "Staff Engineer"
}
```

**What you get back on success:**

```
Status: 200 OK
```

```json
{
  "id": "emp-001",
  "firstName": "Sarah",
  "lastName": "Connor",
  "email": "sarah.connor@company.com",
  "department": "Engineering",
  "role": "Staff Engineer",
  "createdAt": "2025-03-10T09:00:00.000Z"
}
```

**What to know as a tester:**

- PUT **replaces** the full record. Look at the code: `employees[index] = { ... }`. Every field comes from `data` (your request body) — except `id` and `createdAt`. If you send only `{ role: 'Staff Engineer' }` and nothing else, the stored `firstName` and `email` become `undefined`. Always send all fields in a PUT.
- `id` and `createdAt` are preserved regardless of what you send. Your test should verify neither changed.
- A PUT to a non-existent ID returns 404 before validation even runs.

---

#### Test It

```typescript
test('PUT /employees/:id — updates the employee role', async ({ request }) => {
  // Create an employee to update
  const createResponse = await request.post('/employees', {
    data: {
      firstName:  'Sarah',
      lastName:   'Connor',
      email:      'sarah.put@company.com',
      department: 'Engineering',
      role:       'Senior Engineer',
    },
  });
  const created = await createResponse.json();
  const employeeId = created.id;

  // Send a PUT with all fields — only role has changed
  const updateResponse = await request.put(`/employees/${employeeId}`, {
    data: {
      firstName:  'Sarah',
      lastName:   'Connor',
      email:      'sarah.put@company.com',
      department: 'Engineering',
      role:       'Staff Engineer',   // ← the only change
    },
  });

  expect(updateResponse.status()).toBe(200);

  const body = await updateResponse.json();

  // The role must reflect the update
  expect(body.role).toBe('Staff Engineer');

  // id and createdAt must not have changed
  expect(body.id).toBe(employeeId);
  expect(body.createdAt).toBe(created.createdAt);
});

test('PUT /employees/:id — returns 404 for a non-existent employee', async ({ request }) => {
  const response = await request.put('/employees/emp-999', {
    data: {
      firstName:  'Ghost',
      lastName:   'Employee',
      email:      'ghost@company.com',
      department: 'Finance',
      role:       'Analyst',
    },
  });

  expect(response.status()).toBe(404);
});
```

---

### Endpoint 5 — Delete an Employee

```
DELETE /employees/:id
```

---

#### Build It

```javascript
// DELETE /employees/:id — remove an employee record
app.delete('/employees/:id', (req, res) => {
  const { id } = req.params;

  const index = employees.findIndex(emp => emp.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Employee not found', id });
  }

  // Remove the employee from the array
  employees.splice(index, 1);

  // 204 = success with no body — this is the correct response for a DELETE
  res.status(204).send();
});
```

---

#### Understand It

**What you send:**

```
DELETE /employees/emp-001
```

No body. No required headers beyond authorization.

**What you get back on success:**

```
Status: 204 No Content
(no response body)
```

**What you get back when not found:**

```
Status: 404 Not Found
```

```json
{
  "error": "Employee not found",
  "id": "emp-999"
}
```

**What to know as a tester:**

- `res.status(204).send()` intentionally sends no body. The code never calls `.json()` here. If you call `response.json()` in your test after a 204, it throws an error. Assert only the status code.
- A 204 confirms the server accepted the delete request. A follow-up GET that returns 404 confirms the record is actually gone. Test both to be certain.
- Deleting the same employee twice returns 404 on the second call. This is expected and worth testing explicitly.

---

#### Test It

```typescript
test('DELETE /employees/:id — removes the employee', async ({ request }) => {
  // Create an employee to delete
  const createResponse = await request.post('/employees', {
    data: {
      firstName:  'Temp',
      lastName:   'Employee',
      email:      'temp.delete@company.com',
      department: 'Finance',
      role:       'Analyst',
    },
  });
  const { id } = await createResponse.json();

  // Delete the employee
  const deleteResponse = await request.delete(`/employees/${id}`);

  // 204 = success. No body. Do NOT call response.json() here.
  expect(deleteResponse.status()).toBe(204);

  // Confirm the record is truly gone with a follow-up GET
  const getResponse = await request.get(`/employees/${id}`);
  expect(getResponse.status()).toBe(404);
});

test('DELETE /employees/:id — returns 404 when deleting twice', async ({ request }) => {
  const createResponse = await request.post('/employees', {
    data: {
      firstName:  'Once',
      lastName:   'Only',
      email:      'once.only@company.com',
      department: 'Marketing',
      role:       'Designer',
    },
  });
  const { id } = await createResponse.json();

  // First delete succeeds
  await request.delete(`/employees/${id}`);

  // Second delete — employee is already gone
  const secondDelete = await request.delete(`/employees/${id}`);
  expect(secondDelete.status()).toBe(404);
});
```

---

### Complete server.js

Here is the full server file with all five endpoints in place. This is what you have built step by step:

```javascript
const express = require('express');
const app = express();

app.use(express.json());

let employees = [];
let nextId = 1;

const VALID_DEPARTMENTS = ['Engineering', 'HR', 'Finance', 'Marketing'];

function validateEmployee(data) {
  const errors = [];
  if (!data.firstName)  errors.push('firstName is required');
  if (!data.lastName)   errors.push('lastName is required');
  if (!data.email)      errors.push('email is required');
  if (!data.department) errors.push('department is required');
  if (!data.role)       errors.push('role is required');
  if (data.department && !VALID_DEPARTMENTS.includes(data.department)) {
    errors.push(`department must be one of: ${VALID_DEPARTMENTS.join(', ')}`);
  }
  return errors;
}

app.post('/employees', (req, res) => {
  const data = req.body;
  const errors = validateEmployee(data);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }
  if (employees.some(emp => emp.email === data.email)) {
    return res.status(400).json({ error: 'Validation failed', details: ['email already exists'] });
  }
  const newEmployee = {
    id:         `emp-${String(nextId).padStart(3, '0')}`,
    firstName:  data.firstName,
    lastName:   data.lastName,
    email:      data.email,
    department: data.department,
    role:       data.role,
    createdAt:  new Date().toISOString(),
  };
  nextId++;
  employees.push(newEmployee);
  res.status(201).json(newEmployee);
});

app.get('/employees', (req, res) => {
  const { department } = req.query;
  if (department) {
    return res.status(200).json(employees.filter(e => e.department === department));
  }
  res.status(200).json(employees);
});

app.get('/employees/:id', (req, res) => {
  const employee = employees.find(e => e.id === req.params.id);
  if (!employee) {
    return res.status(404).json({ error: 'Employee not found', id: req.params.id });
  }
  res.status(200).json(employee);
});

app.put('/employees/:id', (req, res) => {
  const { id } = req.params;
  const data = req.body;
  const index = employees.findIndex(e => e.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Employee not found', id });
  }
  const errors = validateEmployee(data);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }
  employees[index] = {
    id:         employees[index].id,
    firstName:  data.firstName,
    lastName:   data.lastName,
    email:      data.email,
    department: data.department,
    role:       data.role,
    createdAt:  employees[index].createdAt,
  };
  res.status(200).json(employees[index]);
});

app.delete('/employees/:id', (req, res) => {
  const index = employees.findIndex(e => e.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Employee not found', id: req.params.id });
  }
  employees.splice(index, 1);
  res.status(204).send();
});

app.listen(3000, () => {
  console.log('Employee API running at http://localhost:3000');
});
```

---

## Part 4 — UI + API Hybrid Patterns

Every test so far has talked only to the API. In real projects, the application has a UI and an API working together. Playwright lets you use both in a single test.

### Pattern 1 — Set Up State via API, Verify via UI

If you need an employee to exist before testing a UI page, create that employee through the API — not by filling a form. An API call takes under one second. Navigating forms takes 10–15 seconds per test. At scale, that difference is significant.

```typescript
import { test, expect } from '@playwright/test';

test('employee created via API appears on the list page', async ({ request, page }) => {
  // Create the employee through the API — fast and controlled
  const createResponse = await request.post('/employees', {
    data: {
      firstName:  'Diana',
      lastName:   'Prince',
      email:      'diana.prince@company.com',
      department: 'Engineering',
      role:       'Tech Lead',
    },
  });
  expect(createResponse.status()).toBe(201);

  // Open the UI and verify the employee appears
  await page.goto('/employees');
  await expect(page.getByText('Diana Prince')).toBeVisible();
  await expect(page.getByText('Tech Lead')).toBeVisible();
});
```

### Pattern 2 — Perform Action via UI, Verify via API

Use the UI to trigger an action, then call the API to confirm the backend actually processed it. The UI may show a success message even when the backend failed. The API does not lie.

```typescript
test('deleting via the UI removes the employee from the API', async ({ request, page }) => {
  // Create a known employee via the API
  const createResponse = await request.post('/employees', {
    data: {
      firstName:  'Test',
      lastName:   'Delete',
      email:      'test.delete@company.com',
      department: 'Finance',
      role:       'Analyst',
    },
  });
  const { id } = await createResponse.json();

  // Use the UI to delete the employee
  await page.goto(`/employees/${id}`);
  await page.getByRole('button', { name: 'Delete Employee' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();

  // Verify the backend actually deleted the record
  const getResponse = await request.get(`/employees/${id}`);
  expect(getResponse.status()).toBe(404);
});
```

---

## Part 5 — Best Practices and Common Mistakes

### Best Practices

**1. Assert the status code before the body.**
If the status code is wrong, the body may not have the shape you expect. Asserting the code first gives you a clear failure message.

```typescript
// ✅ Status first, body second
expect(response.status()).toBe(201);
const body = await response.json();
expect(body.id).toBeTruthy();
```

**2. Make every test self-contained.**
Each test creates the data it needs. Never rely on a previous test having run first, and never depend on pre-existing data in the server.

**3. Clean up after your tests.**
If a test creates an employee, delete it when the test finishes. Use `afterEach` to keep the server state clean between runs.

```typescript
let createdId: string;

test.afterEach(async ({ request }) => {
  if (createdId) {
    await request.delete(`/employees/${createdId}`);
    createdId = '';
  }
});
```

**4. Test the sad path, not just the happy path.**
Every `if` block in `server.js` is a test case. The `if (errors.length > 0)` check, the `if (index === -1)` check, the duplicate email check — each one is a branch your tests should cover.

---

### Common Mistakes

**Mistake 1 — Expecting 200 from a POST.**

```typescript
// ❌ Wrong — create returns 201
expect(response.status()).toBe(200);

// ✅ Correct
expect(response.status()).toBe(201);
```

**Mistake 2 — Calling response.json() after a 204.**

```typescript
// ❌ Wrong — DELETE returns no body. This throws an error.
const body = await response.json();

// ✅ Correct — assert the status and stop
expect(response.status()).toBe(204);
```

**Mistake 3 — Hardcoding an ID.**

```typescript
// ❌ Fragile — breaks when the server restarts
const response = await request.get('/employees/emp-001');

// ✅ Resilient — always uses a real ID from the server
const created = await request.post('/employees', { data: { ... } });
const { id } = await created.json();
const response = await request.get(`/employees/${id}`);
```

**Mistake 4 — Sending only the changed field in a PUT.**

```typescript
// ❌ Wrong — all other fields become undefined in the stored record
await request.put(`/employees/${id}`, {
  data: { role: 'Staff Engineer' },
});

// ✅ Correct — send the full object
await request.put(`/employees/${id}`, {
  data: {
    firstName:  'Sarah',
    lastName:   'Connor',
    email:      'sarah@company.com',
    department: 'Engineering',
    role:       'Staff Engineer',  // only this changed
  },
});
```

---

## Part 6 — Authentication

Every endpoint you built so far is open — anyone who knows the URL can call it. Real APIs are not like that. They require the caller to prove who they are before allowing access. That proof is called **authentication**.

This part covers four authentication types that you will encounter in real projects. For each one, you will build the protection into Express, understand how it works and why, and write Playwright tests that send requests both with and without valid credentials.

---

### What Authentication Actually Does

When an API receives a request, it checks: "Do I know who is sending this?" If the answer is no, or if the credentials are wrong, it stops the request before any business logic runs and returns:

```
Status: 401 Unauthorized
```

A `401` means the caller did not provide valid credentials. It is different from `403 Forbidden`, which means the caller is authenticated but does not have permission for that specific action.

Authentication is enforced by **middleware** — a function that runs on every request before the route handler. If the middleware rejects the request, the route handler never runs. This is exactly the pattern you will use in Express.

---

### Auth Type 1 — API Key

An API key is a static secret string that the client sends on every request. It is the simplest form of authentication. The server holds a list of valid keys and rejects any request whose key is not on that list.

API keys can be sent in two places: an HTTP header, or a URL query parameter.

---

#### Build It

Add this middleware to `server.js`, above your route definitions:

```javascript
// Valid API keys — in a real system these would come from a database
const VALID_API_KEYS = ['key-abc-123', 'key-xyz-789'];

// Middleware: check for a valid API key on every request
function requireApiKey(req, res, next) {
  // Check the X-API-Key header first
  const keyFromHeader = req.headers['x-api-key'];

  // Fall back to ?apiKey= query parameter
  const keyFromQuery = req.query.apiKey;

  const key = keyFromHeader || keyFromQuery;

  if (!key || !VALID_API_KEYS.includes(key)) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }

  // Key is valid — pass control to the next handler
  next();
}

// Apply the middleware to all /employees routes
app.use('/employees', requireApiKey);
```

Now every request to `/employees` must carry a valid API key — whether in the `X-API-Key` header or the `?apiKey=` query string. Without it, the request stops at the middleware and the route handler never runs.

---

#### Understand It

**Sending the key as a header:**

```
GET /employees
X-API-Key: key-abc-123
```

**Sending the key as a query parameter:**

```
GET /employees?apiKey=key-abc-123
```

**What you get back — valid key:**

```
Status: 200 OK
[ ...employees... ]
```

**What you get back — missing or wrong key:**

```
Status: 401 Unauthorized
```

```json
{ "error": "Invalid or missing API key" }
```

**What to know as a tester:**

- The middleware runs before the route handler. A request with the wrong key never reaches the `employees.find()` or `employees.push()` logic. Your test verifies the wall, not the room behind it.
- Headers are the standard way to send API keys. Query parameters work but are less secure because URLs are often logged by servers and browsers.
- A test without any key should get 401. A test with a wrong key should also get 401. A test with the right key should proceed normally.

---

#### Test It

```typescript
// tests/employees.spec.ts
import { test, expect } from '@playwright/test';

const VALID_KEY   = 'key-abc-123';
const INVALID_KEY = 'wrong-key';

test('API Key — request with valid key in header succeeds', async ({ request }) => {
  const response = await request.get('/employees', {
    headers: { 'X-API-Key': VALID_KEY },
  });

  expect(response.status()).toBe(200);
});

test('API Key — request with valid key as query param succeeds', async ({ request }) => {
  const response = await request.get('/employees', {
    params: { apiKey: VALID_KEY },
  });

  expect(response.status()).toBe(200);
});

test('API Key — request with wrong key returns 401', async ({ request }) => {
  const response = await request.get('/employees', {
    headers: { 'X-API-Key': INVALID_KEY },
  });

  expect(response.status()).toBe(401);

  const body = await response.json();
  expect(body.error).toBe('Invalid or missing API key');
});

test('API Key — request with no key returns 401', async ({ request }) => {
  // No headers, no query params — completely unauthenticated
  const response = await request.get('/employees');

  expect(response.status()).toBe(401);
});
```

---

### Auth Type 2 — Bearer Token / JWT

A **Bearer Token** is sent in the `Authorization` header with the word `Bearer` followed by a space and the token value. The most common type of bearer token in modern APIs is a **JWT** (JSON Web Token).

A JWT is a self-contained token. It encodes a payload — like a user ID and role — and signs it with a secret key. The server does not need to look the token up in a database. It just verifies the signature. If the signature is valid, the payload is trusted.

---

#### Build It

Install the `jsonwebtoken` library:

```bash
npm install jsonwebtoken
```

Add this to `server.js`:

```javascript
const jwt = require('jsonwebtoken');

// Secret used to sign and verify tokens — never expose this in real code
const JWT_SECRET = 'my-super-secret-key';

// Login endpoint — issues a JWT when credentials are correct
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  // Hardcoded credentials for this guide — a real app checks a database
  if (username !== 'admin' || password !== 'password123') {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  // Sign a token that expires in 1 hour
  const token = jwt.sign(
    { username, role: 'admin' },   // payload — embedded in the token
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  res.status(200).json({ token });
});

// Middleware: verify a JWT on every request
function requireBearerToken(req, res, next) {
  const authHeader = req.headers['authorization'];

  // The header must look like: "Bearer <token>"
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.split(' ')[1]; // extract the token after "Bearer "

  try {
    const decoded = jwt.verify(token, JWT_SECRET); // throws if invalid or expired
    req.user = decoded; // attach decoded payload to the request for use in routes
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Apply bearer token auth to all /employees routes
app.use('/employees', requireBearerToken);
```

Remove the `requireApiKey` middleware from the previous section if you are switching auth types, or keep both and chain them if you want to explore both at once.

---

#### Understand It

**Step 1 — Login to get a token:**

```
POST /login
Content-Type: application/json
```

```json
{
  "username": "admin",
  "password": "password123"
}
```

**Login response — success:**

```
Status: 200 OK
```

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

The token is a long string in three dot-separated parts: header, payload, signature. The payload holds whatever the server embedded — here it is `{ username: "admin", role: "admin" }`. It is Base64-encoded but not encrypted. Anyone can decode it. The signature is what prevents tampering.

**Step 2 — Use the token on every subsequent request:**

```
GET /employees
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

The word `Bearer` is required. The space between `Bearer` and the token is required. The middleware splits on the space to extract the token: `authHeader.split(' ')[1]`.

**What you get back — valid token:**

```
Status: 200 OK
[ ...employees... ]
```

**What you get back — missing header:**

```
Status: 401 Unauthorized
```

```json
{ "error": "Missing or malformed Authorization header" }
```

**What you get back — expired or tampered token:**

```
Status: 401 Unauthorized
```

```json
{ "error": "Invalid or expired token" }
```

**What to know as a tester:**

- JWT testing always has two steps: call the login endpoint to get a token, then use that token in subsequent requests. Your test must do both.
- `jwt.verify()` throws an exception when the token is invalid or expired. The `try/catch` in the middleware converts that exception into a clean 401 response.
- A tampered token — one where any character is changed — will always fail verification because the signature no longer matches the payload.

---

#### Test It

```typescript
test('Bearer Token — login returns a token', async ({ request }) => {
  const response = await request.post('/login', {
    data: { username: 'admin', password: 'password123' },
  });

  expect(response.status()).toBe(200);

  const body = await response.json();

  // Token must exist and be a non-empty string
  expect(typeof body.token).toBe('string');
  expect(body.token.length).toBeGreaterThan(0);
});

test('Bearer Token — valid token allows access to /employees', async ({ request }) => {
  // Step 1: Login to get a token
  const loginResponse = await request.post('/login', {
    data: { username: 'admin', password: 'password123' },
  });
  const { token } = await loginResponse.json();

  // Step 2: Use the token on a protected endpoint
  const response = await request.get('/employees', {
    headers: { Authorization: `Bearer ${token}` },
  });

  expect(response.status()).toBe(200);
});

test('Bearer Token — wrong password returns 401', async ({ request }) => {
  const response = await request.post('/login', {
    data: { username: 'admin', password: 'wrongpassword' },
  });

  expect(response.status()).toBe(401);

  const body = await response.json();
  expect(body.error).toBe('Invalid username or password');
});

test('Bearer Token — request without token returns 401', async ({ request }) => {
  // No Authorization header at all
  const response = await request.get('/employees');

  expect(response.status()).toBe(401);
});

test('Bearer Token — tampered token returns 401', async ({ request }) => {
  // A deliberately broken token — valid structure, invalid signature
  const fakeToken = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiZmFrZSJ9.invalidsignature';

  const response = await request.get('/employees', {
    headers: { Authorization: `Bearer ${fakeToken}` },
  });

  expect(response.status()).toBe(401);

  const body = await response.json();
  expect(body.error).toBe('Invalid or expired token');
});
```

---

### Auth Type 3 — Basic Auth

**Basic Auth** is the oldest HTTP authentication scheme. The client sends a username and password encoded in Base64, in the `Authorization` header. It is built into the HTTP spec and supported natively by browsers and tools.

The format is: `Authorization: Basic <base64(username:password)>`

---

#### Build It

No extra libraries needed. Node.js can decode Base64 natively with `Buffer`.

```javascript
// Middleware: verify Basic Auth credentials
function requireBasicAuth(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    // Send WWW-Authenticate header — tells the client what auth scheme is expected
    res.setHeader('WWW-Authenticate', 'Basic realm="Employee API"');
    return res.status(401).json({ error: 'Basic authentication required' });
  }

  // Decode the Base64 string after "Basic "
  const base64Credentials = authHeader.split(' ')[1];
  const decoded = Buffer.from(base64Credentials, 'base64').toString('utf8');

  // Decoded string is "username:password"
  const [username, password] = decoded.split(':');

  // Validate against known credentials
  const validUsername = 'admin';
  const validPassword = 'password123';

  if (username !== validUsername || password !== validPassword) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  next();
}

// Apply Basic Auth to all /employees routes
app.use('/employees', requireBasicAuth);
```

---

#### Understand It

**What you send:**

```
GET /employees
Authorization: Basic YWRtaW46cGFzc3dvcmQxMjM=
```

`YWRtaW46cGFzc3dvcmQxMjM=` is the Base64 encoding of `admin:password123`. You never construct this string manually in tests — Playwright handles it.

**How encoding works under the hood:**

```
"admin:password123"
       ↓ Base64 encode
"YWRtaW46cGFzc3dvcmQxMjM="
```

The server reverses this: it takes the string after `Basic `, decodes it from Base64, splits on `:`, and checks the username and password. This is exactly what `Buffer.from(..., 'base64').toString('utf8')` does in the middleware.

**What to know as a tester:**

- Basic Auth credentials travel in every request — there is no login step like JWT. The downside is that if the connection is not HTTPS, the credentials are exposed (Base64 is encoding, not encryption).
- Playwright has native support for Basic Auth through `httpCredentials`. You pass the username and password as plain text — Playwright encodes them automatically.
- The `WWW-Authenticate` header in the 401 response is part of the HTTP spec. It tells the client which auth scheme to use. Browsers use it to show a login popup.

---

#### Test It

```typescript
test('Basic Auth — valid credentials allow access', async ({ playwright }) => {
  // Create a new request context with Basic Auth credentials built in
  // Playwright handles the Base64 encoding automatically
  const authContext = await playwright.request.newContext({
    baseURL: 'http://localhost:3000',
    httpCredentials: {
      username: 'admin',
      password: 'password123',
    },
  });

  const response = await authContext.get('/employees');

  expect(response.status()).toBe(200);

  await authContext.dispose();
});

test('Basic Auth — wrong password returns 401', async ({ playwright }) => {
  const authContext = await playwright.request.newContext({
    baseURL: 'http://localhost:3000',
    httpCredentials: {
      username: 'admin',
      password: 'wrongpassword',
    },
  });

  const response = await authContext.get('/employees');

  expect(response.status()).toBe(401);

  await authContext.dispose();
});

test('Basic Auth — no credentials returns 401', async ({ request }) => {
  // The default request fixture sends no credentials
  const response = await request.get('/employees');

  expect(response.status()).toBe(401);

  const body = await response.json();
  expect(body.error).toBe('Basic authentication required');
});
```

---

### Auth Type 4 — Cookie / Session

**Cookie-based auth** is how most browser-facing applications work. The client logs in, the server creates a session, and the server sends back a `Set-Cookie` header. The browser stores the cookie and automatically sends it on every subsequent request. The server reads the cookie to identify the session.

---

#### Build It

Install the required libraries:

```bash
npm install express-session
```

Add this to `server.js`:

```javascript
const session = require('express-session');

// Configure the session middleware
app.use(session({
  secret:            'session-secret-key', // signs the session cookie — keep private
  resave:            false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,  // cookie is not accessible from JavaScript
    maxAge:   3600000, // 1 hour in milliseconds
  },
}));

// Login endpoint — creates a session on success
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (username !== 'admin' || password !== 'password123') {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  // Store the user in the session
  req.session.user = { username, role: 'admin' };

  res.status(200).json({ message: 'Logged in successfully' });
  // Express-session automatically sends Set-Cookie in the response
});

// Logout endpoint — destroys the session
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid'); // clear the session cookie from the browser
    res.status(200).json({ message: 'Logged out successfully' });
  });
});

// Middleware: check that a valid session exists
function requireSession(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated. Please log in.' });
  }
  next();
}

// Apply session auth to all /employees routes
app.use('/employees', requireSession);
```

---

#### Understand It

**Step 1 — Login to create a session:**

```
POST /login
Content-Type: application/json
```

```json
{
  "username": "admin",
  "password": "password123"
}
```

**Login response — success:**

```
Status: 200 OK
Set-Cookie: connect.sid=s%3Axxx...; Path=/; HttpOnly
```

```json
{ "message": "Logged in successfully" }
```

The server sends `Set-Cookie` in the response. The browser (or Playwright's request context) stores this cookie. From this point, every request automatically includes the cookie in its headers.

**Step 2 — Use the session on subsequent requests:**

```
GET /employees
Cookie: connect.sid=s%3Axxx...
```

The client does not need to do anything extra. The cookie is sent automatically.

**What the server does on each request:**

The session middleware reads the `connect.sid` cookie, looks up the session data in server memory, and attaches it to `req.session`. The `requireSession` middleware then checks `req.session.user`. If it exists, the request proceeds. If not, it returns 401.

**What to know as a tester:**

- Cookie-based auth requires the test to maintain state across requests — the cookie from the login response must be carried forward to the protected request. Playwright's `APIRequestContext` handles this automatically because it has a built-in cookie jar. A single `request` instance shares cookies across all calls within the same test.
- This is Playwright's biggest advantage over tools like curl or raw HTTP libraries for testing cookie auth. You do not manage cookies manually.
- After logout, the session is destroyed server-side. The cookie in the client is no longer valid. A request made after logout should return 401.

---

#### Test It

```typescript
test('Cookie Auth — login creates a session and allows access', async ({ request }) => {
  // Step 1: Login — the response sets the session cookie
  const loginResponse = await request.post('/login', {
    data: { username: 'admin', password: 'password123' },
  });

  expect(loginResponse.status()).toBe(200);

  // Step 2: Call a protected endpoint
  // The request fixture automatically sends the session cookie from Step 1
  const getResponse = await request.get('/employees');

  expect(getResponse.status()).toBe(200);
});

test('Cookie Auth — request without logging in returns 401', async ({ request }) => {
  // No login step — no cookie — no session
  const response = await request.get('/employees');

  expect(response.status()).toBe(401);

  const body = await response.json();
  expect(body.error).toBe('Not authenticated. Please log in.');
});

test('Cookie Auth — request after logout returns 401', async ({ request }) => {
  // Step 1: Login
  await request.post('/login', {
    data: { username: 'admin', password: 'password123' },
  });

  // Step 2: Confirm access works before logout
  const beforeLogout = await request.get('/employees');
  expect(beforeLogout.status()).toBe(200);

  // Step 3: Logout — destroys the session on the server
  const logoutResponse = await request.post('/logout');
  expect(logoutResponse.status()).toBe(200);

  // Step 4: Try to access /employees again — session is gone
  const afterLogout = await request.get('/employees');
  expect(afterLogout.status()).toBe(401);
});

test('Cookie Auth — wrong password returns 401', async ({ request }) => {
  const response = await request.post('/login', {
    data: { username: 'admin', password: 'wrongpassword' },
  });

  expect(response.status()).toBe(401);

  const body = await response.json();
  expect(body.error).toBe('Invalid username or password');
});
```

---

### Comparing the Four Auth Types

| | API Key | Bearer Token / JWT | Basic Auth | Cookie / Session |
|---|---|---|---|---|
| **Where credentials go** | Header or query param | `Authorization` header | `Authorization` header | Cookie (automatic) |
| **Login step needed?** | No | Yes | No | Yes |
| **State stored on server?** | No | No | No | Yes |
| **Token expiry?** | No (until revoked) | Yes (built into JWT) | No | Yes (session timeout) |
| **Best used for** | Machine-to-machine, public APIs | Mobile apps, SPAs | Simple scripts, legacy systems | Browser-based web apps |
| **Playwright sends it via** | `headers:` or `params:` | `headers: { Authorization }` | `httpCredentials:` | Automatic cookie jar |

**As a tester, what changes between them:**

- **API Key** — add one header or query param to every request. No login step. Test with a valid key, wrong key, and no key.
- **Bearer Token** — call the login endpoint first, extract the token, then attach it as `Authorization: Bearer <token>` on subsequent calls. Test login success, login failure, valid token, expired/tampered token, and missing token.
- **Basic Auth** — use Playwright's `httpCredentials` in a new request context. No login endpoint. Test valid credentials, wrong credentials, and no credentials.
- **Cookie / Session** — login once per test using the same `request` fixture. Playwright carries the cookie automatically. Test logged-in access, unauthenticated access, and post-logout access.

---

## What You Have Learned

You started this guide knowing nothing about APIs. You have now built one from scratch, tested every endpoint, and secured it with four different authentication mechanisms.

For each endpoint and each auth type you followed the same path — you wrote the server code, you understood what it accepts and returns, and you wrote the Playwright tests that verify it. That connection between the implementation and the tests is what makes API testing click. When a test fails, you know exactly which line in `server.js` to look at.

The same pattern applies to any REST API you will ever test. The field names change. The auth scheme changes. The approach stays the same.
