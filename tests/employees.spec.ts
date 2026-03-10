/**
 * Employee CRUD tests — covers all 7 employee endpoints:
 *   GET  /api/employees          (list + filters + pagination)
 *   GET  /api/employees/stats
 *   GET  /api/employees/:id
 *   POST /api/employees
 *   PUT  /api/employees/:id
 *   PATCH /api/employees/:id
 *   DELETE /api/employees/:id
 */
import { test, expect } from '@playwright/test';
import {
  API_KEY,
  makeEmployee, createEmployee, cleanupEmployee,
} from '../src/helpers';

// Shorthand header object used on every write request.
// GET endpoints are public and never need this.
const AUTH = { 'x-api-key': API_KEY };

// ────────────────────────────────────────────────────────────────────────────
// GET /api/employees — list
// ────────────────────────────────────────────────────────────────────────────
test.describe('GET /api/employees', () => {
  test('returns paginated wrapper with data and meta', async ({ request }) => {
    // The list response is NOT a bare array — it is wrapped:
    //   { data: Employee[], meta: { page, limit, total, totalPages }, requestId }
    const res = await request.get('/api/employees');

    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true); // employees live under body.data
    expect(body.meta).toMatchObject({
      page: expect.any(Number),
      limit: expect.any(Number),
      total: expect.any(Number),      // total records matching the current filters
      totalPages: expect.any(Number),
    });
    expect(body.requestId).toBeTruthy(); // unique trace ID on every response
  });

  test('no auth required for GET', async ({ request }) => {
    const res = await request.get('/api/employees');
    expect(res.status()).toBe(200);
  });

  test('department filter — case-insensitive', async ({ request }) => {
    // Create a known employee so there is definitely at least one result to verify
    const emp = await createEmployee(request, { department: 'Engineering' });

    // The server normalises both sides before comparing, so "engineering" matches "Engineering"
    const res = await request.get('/api/employees', {
      params: { department: 'engineering' },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    // All returned employees must belong to the filtered department
    for (const item of body.data) {
      expect(item.department.toLowerCase()).toBe('engineering');
    }

    await cleanupEmployee(request, emp.id);
  });

  test('status filter returns only matching employees', async ({ request }) => {
    const emp = await createEmployee(request, { status: 'inactive' });

    const res = await request.get('/api/employees', {
      params: { status: 'inactive' },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    for (const item of body.data) {
      expect(item.status).toBe('inactive');
    }

    await cleanupEmployee(request, emp.id);
  });

  test('salary range filter — minSalary and maxSalary', async ({ request }) => {
    const emp = await createEmployee(request, { salary: 75000 });

    const res = await request.get('/api/employees', {
      params: { minSalary: 70000, maxSalary: 80000 },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    for (const item of body.data) {
      expect(item.salary).toBeGreaterThanOrEqual(70000);
      expect(item.salary).toBeLessThanOrEqual(80000);
    }

    await cleanupEmployee(request, emp.id);
  });

  test('full text search via q param', async ({ request }) => {
    const unique = `uniquesearch${Date.now()}`;
    const emp = await createEmployee(request, { firstName: unique });

    const res = await request.get('/api/employees', { params: { q: unique } });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0].firstName).toBe(unique);

    await cleanupEmployee(request, emp.id);
  });

  test('pagination — page and limit respected', async ({ request }) => {
    const res = await request.get('/api/employees', {
      params: { page: 1, limit: 2 },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.data.length).toBeLessThanOrEqual(2);
    expect(body.meta.page).toBe(1);
    expect(body.meta.limit).toBe(2);
  });

  test('sortBy salary desc — first result has highest salary', async ({ request }) => {
    const res = await request.get('/api/employees', {
      params: { sortBy: 'salary', sortOrder: 'desc', limit: 100 },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    const salaries: number[] = body.data.map((e: { salary: number }) => e.salary);
    // Walk through the list and verify each salary is >= the one after it.
    // Any violation means the sort order is wrong.
    for (let i = 1; i < salaries.length; i++) {
      expect(salaries[i - 1]).toBeGreaterThanOrEqual(salaries[i]);
    }
  });

  test('role filter returns only matching role', async ({ request }) => {
    const emp = await createEmployee(request, { role: 'UniqueRoleXYZ' });

    const res = await request.get('/api/employees', {
      params: { role: 'uniquerolexyz' },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.data.some((e: { id: number }) => e.id === emp.id)).toBe(true);

    await cleanupEmployee(request, emp.id);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/employees/stats
// ────────────────────────────────────────────────────────────────────────────
test.describe('GET /api/employees/stats', () => {
  test('returns totals, byDepartment and byStatus', async ({ request }) => {
    const res = await request.get('/api/employees/stats');

    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(typeof body.totals.employees).toBe('number');
    expect(typeof body.totals.avgSalary).toBe('number');
    expect(typeof body.byDepartment).toBe('object');
    expect(typeof body.byStatus).toBe('object');
  });

  test('no auth required', async ({ request }) => {
    const res = await request.get('/api/employees/stats');
    expect(res.status()).toBe(200);
  });

  test('stats reflect a newly created employee', async ({ request }) => {
    // Stats are computed live from the stored data, not cached.
    // Snapshot the count before, create a record, then confirm the count went up by exactly 1.
    const before = await (await request.get('/api/employees/stats')).json();
    const countBefore: number = before.totals.employees;

    const emp = await createEmployee(request);

    const after = await (await request.get('/api/employees/stats')).json();
    expect(after.totals.employees).toBe(countBefore + 1);

    await cleanupEmployee(request, emp.id);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/employees/:id
// ────────────────────────────────────────────────────────────────────────────
test.describe('GET /api/employees/:id', () => {
  test('returns the correct employee', async ({ request }) => {
    const emp = await createEmployee(request);

    const res = await request.get(`/api/employees/${emp.id}`);

    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.id).toBe(emp.id);
    expect(body.email).toBe(emp.email);

    await cleanupEmployee(request, emp.id);
  });

  test('returns 404 for non-existent id', async ({ request }) => {
    const res = await request.get('/api/employees/999999');

    expect(res.status()).toBe(404);

    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('no auth required', async ({ request }) => {
    const emp = await createEmployee(request);
    const res = await request.get(`/api/employees/${emp.id}`);
    expect(res.status()).toBe(200);
    await cleanupEmployee(request, emp.id);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/employees
// ────────────────────────────────────────────────────────────────────────────
test.describe('POST /api/employees', () => {
  test('creates employee and returns 201 with all fields', async ({ request }) => {
    const payload = makeEmployee();
    const res = await request.post('/api/employees', {
      headers: AUTH,
      data: payload,
    });

    expect(res.status()).toBe(201); // 201 Created — not 200 OK

    const body = await res.json();
    // id is generated server-side as an auto-incrementing integer
    expect(typeof body.id).toBe('number');
    // Echo back the fields the client sent
    expect(body.firstName).toBe(payload.firstName);
    expect(body.email).toBe(payload.email);
    expect(body.salary).toBe(payload.salary);
    expect(body.status).toBe(payload.status);
    // createdAt and updatedAt are generated by the server — just check they exist
    expect(body.createdAt).toBeTruthy();
    expect(body.updatedAt).toBeTruthy();

    await cleanupEmployee(request, body.id);
  });

  test('returns 400 when required field is missing', async ({ request }) => {
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

  test('returns 400 for invalid email format', async ({ request }) => {
    const res = await request.post('/api/employees', {
      headers: AUTH,
      data: makeEmployee({ email: 'not-an-email' }),
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain('email is invalid');
  });

  test('returns 400 for invalid status value', async ({ request }) => {
    const res = await request.post('/api/employees', {
      headers: AUTH,
      data: makeEmployee({ status: 'retired' }),
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain('status must be one of');
  });

  test('returns 400 for negative salary', async ({ request }) => {
    const res = await request.post('/api/employees', {
      headers: AUTH,
      data: makeEmployee({ salary: -1 }),
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain('salary must be a positive number');
  });

  test('returns 400 for invalid hireDate', async ({ request }) => {
    const res = await request.post('/api/employees', {
      headers: AUTH,
      data: makeEmployee({ hireDate: 'not-a-date' }),
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain('hireDate must be a valid date');
  });

  test('returns 400 when skills is not an array', async ({ request }) => {
    const res = await request.post('/api/employees', {
      headers: AUTH,
      data: makeEmployee({ skills: 'Playwright' }),
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain('skills must be an array');
  });

  test('returns 409 for duplicate email', async ({ request }) => {
    const emp = await createEmployee(request);

    // Re-using an existing email is a conflict (409), not a validation error (400) —
    // the payload is valid, but it collides with existing data
    const res = await request.post('/api/employees', {
      headers: AUTH,
      data: makeEmployee({ email: emp.email }),
    });

    expect(res.status()).toBe(409); // 409 Conflict — NOT 400 Bad Request
    const body = await res.json();
    expect(body.error.code).toBe('DUPLICATE_EMAIL');

    await cleanupEmployee(request, emp.id);
  });

  test('requires auth — returns 401 without credentials', async ({ request }) => {
    const res = await request.post('/api/employees', {
      data: makeEmployee(),
    });
    expect(res.status()).toBe(401);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// PUT /api/employees/:id
// ────────────────────────────────────────────────────────────────────────────
test.describe('PUT /api/employees/:id', () => {
  test('replaces the employee record and returns updated data', async ({ request }) => {
    const emp = await createEmployee(request);

    // PUT requires ALL fields — spread makeEmployee to satisfy validation,
    // then override the specific fields we want to change
    const res = await request.put(`/api/employees/${emp.id}`, {
      headers: AUTH,
      data: {
        ...makeEmployee({ email: emp.email }), // reuse same email to avoid 409
        role: 'Staff Engineer',
        salary: 90000,
      },
    });

    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.id).toBe(emp.id);              // id must never change
    expect(body.role).toBe('Staff Engineer');  // the field we updated
    expect(body.salary).toBe(90000);           // the field we updated
    // createdAt is set once on creation and must never be overwritten by a PUT
    expect(body.createdAt).toBe(emp.createdAt);

    await cleanupEmployee(request, emp.id);
  });

  test('returns 404 for non-existent id', async ({ request }) => {
    const res = await request.put('/api/employees/999999', {
      headers: AUTH,
      data: makeEmployee(),
    });

    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('returns 400 when required field is missing', async ({ request }) => {
    const emp = await createEmployee(request);
    const { role: _omit, ...noRole } = makeEmployee({ email: emp.email });

    const res = await request.put(`/api/employees/${emp.id}`, {
      headers: AUTH,
      data: noRole,
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');

    await cleanupEmployee(request, emp.id);
  });

  test('returns 409 when updating to an email that belongs to another employee', async ({ request }) => {
    const emp1 = await createEmployee(request);
    const emp2 = await createEmployee(request);

    const res = await request.put(`/api/employees/${emp2.id}`, {
      headers: AUTH,
      data: makeEmployee({ email: emp1.email }),
    });

    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('DUPLICATE_EMAIL');

    await cleanupEmployee(request, emp1.id);
    await cleanupEmployee(request, emp2.id);
  });

  test('requires auth', async ({ request }) => {
    const emp = await createEmployee(request);
    const res = await request.put(`/api/employees/${emp.id}`, {
      data: makeEmployee(),
    });
    expect(res.status()).toBe(401);
    await cleanupEmployee(request, emp.id);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// PATCH /api/employees/:id
// ────────────────────────────────────────────────────────────────────────────
test.describe('PATCH /api/employees/:id', () => {
  test('partially updates only the sent fields', async ({ request }) => {
    const emp = await createEmployee(request);

    // PATCH only requires the fields you want to change — everything else is kept as-is
    const res = await request.patch(`/api/employees/${emp.id}`, {
      headers: AUTH,
      data: { status: 'on_leave', salary: 70000 },
    });

    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('on_leave'); // updated
    expect(body.salary).toBe(70000);     // updated
    // Fields not included in the PATCH body must remain exactly as they were
    expect(body.firstName).toBe(emp.firstName);
    expect(body.email).toBe(emp.email);

    await cleanupEmployee(request, emp.id);
  });

  test('returns 404 for non-existent id', async ({ request }) => {
    const res = await request.patch('/api/employees/999999', {
      headers: AUTH,
      data: { status: 'inactive' },
    });

    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('returns 400 for invalid partial field', async ({ request }) => {
    const emp = await createEmployee(request);

    const res = await request.patch(`/api/employees/${emp.id}`, {
      headers: AUTH,
      data: { salary: -500 },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain('salary must be a positive number');

    await cleanupEmployee(request, emp.id);
  });

  test('returns 409 when PATCH email conflicts with another employee', async ({ request }) => {
    const emp1 = await createEmployee(request);
    const emp2 = await createEmployee(request);

    const res = await request.patch(`/api/employees/${emp2.id}`, {
      headers: AUTH,
      data: { email: emp1.email },
    });

    expect(res.status()).toBe(409);

    await cleanupEmployee(request, emp1.id);
    await cleanupEmployee(request, emp2.id);
  });

  test('updatedAt changes after PATCH', async ({ request }) => {
    const emp = await createEmployee(request);
    const originalUpdatedAt = emp.updatedAt;

    // A small delay ensures the new timestamp will be measurably different.
    // Without this, a fast machine could produce the same millisecond.
    await new Promise(r => setTimeout(r, 10));

    await request.patch(`/api/employees/${emp.id}`, {
      headers: AUTH,
      data: { status: 'inactive' },
    });

    const updated = await (await request.get(`/api/employees/${emp.id}`)).json();
    expect(updated.updatedAt).not.toBe(originalUpdatedAt);

    await cleanupEmployee(request, emp.id);
  });

  test('requires auth', async ({ request }) => {
    const emp = await createEmployee(request);
    const res = await request.patch(`/api/employees/${emp.id}`, {
      data: { status: 'inactive' },
    });
    expect(res.status()).toBe(401);
    await cleanupEmployee(request, emp.id);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// DELETE /api/employees/:id
// ────────────────────────────────────────────────────────────────────────────
test.describe('DELETE /api/employees/:id', () => {
  test('returns 204 and removes the employee', async ({ request }) => {
    const emp = await createEmployee(request);

    const deleteRes = await request.delete(`/api/employees/${emp.id}`, {
      headers: AUTH,
    });

    // 204 No Content — success with no response body.
    // Do NOT call .json() here — there is nothing to parse and it will throw.
    expect(deleteRes.status()).toBe(204);

    // A 204 only means the server accepted the request.
    // A follow-up GET is the definitive proof the record is actually gone.
    const getRes = await request.get(`/api/employees/${emp.id}`);
    expect(getRes.status()).toBe(404);
  });

  test('deleting twice returns 404 on second attempt', async ({ request }) => {
    const emp = await createEmployee(request);

    await request.delete(`/api/employees/${emp.id}`, { headers: AUTH });

    const second = await request.delete(`/api/employees/${emp.id}`, { headers: AUTH });
    expect(second.status()).toBe(404);
    const body = await second.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('returns 404 for non-existent id', async ({ request }) => {
    const res = await request.delete('/api/employees/999999', { headers: AUTH });

    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('requires auth', async ({ request }) => {
    const emp = await createEmployee(request);

    const res = await request.delete(`/api/employees/${emp.id}`);
    expect(res.status()).toBe(401);

    await cleanupEmployee(request, emp.id);
  });

  test('deleted employee no longer appears in list', async ({ request }) => {
    const emp = await createEmployee(request);

    await request.delete(`/api/employees/${emp.id}`, { headers: AUTH });

    const listRes = await request.get('/api/employees', {
      params: { q: emp.email },
    });
    const body = await listRes.json();
    expect(body.data.every((e: { id: number }) => e.id !== emp.id)).toBe(true);
  });
});
