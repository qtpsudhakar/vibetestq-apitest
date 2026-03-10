# API Testing Basics (Beginner Friendly)

This guide is designed for freshers who are learning API testing with Playwright and Cypress. It uses the Employee Management API in this repo as the practice target.

## 1) What is API Testing?

API testing verifies that a service correctly processes requests and returns expected responses without relying on the UI. It focuses on:

- Request inputs (method, URL, headers, body)
- Response outputs (status, headers, body, time)
- Data integrity and business rules

## 2) REST API Architecture (Simple View)

**REST** is a style for building APIs. Key ideas:

- **Client-Server**: UI (client) and API (server) are separate.
- **Stateless**: Each request has all needed info; server does not store session state.
- **Resource-Based**: URLs represent resources, e.g., `/api/employees/3`.
- **Uniform Interface**: Consistent use of methods and formats (JSON).

## 3) HTTP Basics

### Methods (CRUD)

- **POST** = Create
- **GET** = Read
- **PUT** = Replace
- **PATCH** = Update part
- **DELETE** = Remove

### Status Codes (Examples)

- `200 OK` success
- `201 Created` new resource created
- `204 No Content` delete success
- `400 Bad Request` validation failure
- `401 Unauthorized` missing/invalid auth
- `404 Not Found` resource missing
- `409 Conflict` duplicate data
- `500 Server Error` unexpected issue

### Request Structure

```
METHOD /path?query=value
Headers
Body (JSON)
```

### Response Structure

```
Status code
Headers
Body (JSON)
```

## 4) API Testing Terminology

- **Endpoint**: A URL + method, e.g., `GET /api/employees`.
- **Payload**: Request body data sent to server.
- **Schema**: Expected JSON structure and types.
- **Contract**: Agreed behavior between client and API.
- **Idempotent**: Same request can be repeated with same result (GET/PUT).
- **Negative Test**: Invalid input to check error handling.
- **Fixture/Test Data**: Sample data used in tests.

## 5) What Should Be Tested?

### Functional checks

- Correct status code
- Response body matches expected values
- Required fields are present
- Filtering, sorting, pagination work

### Negative checks

- Missing required fields
- Invalid data types
- Duplicate data (e.g., email)
- Unauthorized access

### Reliability checks

- Same request multiple times
- Concurrency (multiple requests at once)
- Data consistency after CRUD

### Security checks (basic level)

- Auth required for protected endpoints
- Sensitive data not exposed
- Proper error messages (no stack traces)

## 6) CRUD Examples (Employee API)

### Create (POST)

```bash
curl -X POST http://localhost:3000/api/employees ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_TOKEN" ^
  -d "{\"firstName\":\"Riya\",\"lastName\":\"Sen\",\"email\":\"riya.sen@vibetest.local\",\"department\":\"HR\",\"role\":\"Recruiter\",\"salary\":45000,\"hireDate\":\"2024-06-10\",\"status\":\"active\"}"
```

### Read (GET)

```bash
curl http://localhost:3000/api/employees/1
```

### Update (PATCH)

```bash
curl -X PATCH http://localhost:3000/api/employees/1 ^
  -H "Authorization: Bearer YOUR_TOKEN" ^
  -H "Content-Type: application/json" ^
  -d "{\"status\":\"on_leave\"}"
```

### Delete (DELETE)

```bash
curl -X DELETE http://localhost:3000/api/employees/1 ^
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 7) Authentication Concepts

Common approaches:

- **Basic Auth**: Base64 user:pass (simple, not very secure)
- **Bearer Token**: Login to get token, send in header
- **API Key**: Static key sent in header
- **OAuth**: Token-based system with authorization server (advanced)

This API supports Bearer token and API key to practice both.

## 8) Schema Validation (Simple Example)

Schema validation ensures response has correct types and structure.

Example (partial JSON schema idea):

```json
{
  "type": "object",
  "required": ["id", "firstName", "email", "department", "salary"],
  "properties": {
    "id": { "type": "number" },
    "firstName": { "type": "string" },
    "email": { "type": "string" },
    "department": { "type": "string" },
    "salary": { "type": "number" }
  }
}
```

For beginner tests, you can also validate key fields manually:

- `typeof id === "number"`
- `email` contains `@`
- `salary > 0`

## 9) Playwright API Test Example

```ts
import { test, expect } from "@playwright/test";

test("create employee and read back", async ({ request }) => {
  const login = await request.post("http://localhost:3000/auth/login", {
    data: { username: "admin", password: "admin123" }
  });
  const { token } = await login.json();

  const create = await request.post("http://localhost:3000/api/employees", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      firstName: "Sara",
      lastName: "Paul",
      email: "sara.paul@vibetest.local",
      department: "Engineering",
      role: "QA Intern",
      salary: 35000,
      hireDate: "2024-05-15",
      status: "active"
    }
  });

  expect(create.status()).toBe(201);
  const created = await create.json();
  const get = await request.get(
    `http://localhost:3000/api/employees/${created.id}`
  );
  expect(get.status()).toBe(200);
});
```

## 10) Cypress API Test Example

```ts
describe("employee api", () => {
  it("lists employees filtered by department", () => {
    cy.request("http://localhost:3000/api/employees?department=Engineering")
      .then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body.data.length).to.be.greaterThan(0);
        res.body.data.forEach((item) => {
          expect(item.department).to.eq("Engineering");
        });
      });
  });
});
```

## 11) Assignments (Practice Tasks)

1. Call `GET /health` and assert `status` is `ok`.
2. Login with correct credentials and assert a token is returned.
3. Login with wrong password and assert `401`.
4. Create a new employee and verify it appears in list.
5. Try creating a duplicate email and assert `409`.
6. Update an employee's `status` using PATCH.
7. Replace an employee using PUT and confirm all fields updated.
8. Delete an employee and confirm `404` on fetch.
9. Verify pagination metadata `page`, `limit`, `total`.
10. Validate schema for `GET /api/employees/:id`.

## 12) Tips for Freshers

- Always check **status code** and **response body**.
- Log request and response when a test fails.
- Use small, clear test data to keep results predictable.
- Start with positive tests, then add negative tests.
- Keep tests independent (clean up data if needed).
