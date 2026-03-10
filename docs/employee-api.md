# Employee Management REST API

Sample API for teaching API testing fundamentals. Data is stored in JSON files so no database setup is required.

## Quick Start

```bash
npm install
npm start
```

Base URL: `http://localhost:3000`

## Authentication

Two options are supported:

- **Bearer token** from `POST /auth/login`
- **API key** header: `x-api-key: VT-EMP-KEY-123` (or `API_KEY` env var)

Only create/update/delete operations require auth. Read-only endpoints are public.

### Login (Bearer token)

```bash
curl -X POST http://localhost:3000/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"username\":\"admin\",\"password\":\"admin123\"}"
```

Response:
```json
{
  "token": "YOUR_TOKEN",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "name": "Admin User"
  }
}
```

## Endpoints

### Health Check

```bash
curl http://localhost:3000/health
```

### Get Current User

```bash
curl http://localhost:3000/auth/me ^
  -H "Authorization: Bearer YOUR_TOKEN"
```

### List Employees

Query params:
- `q` (search name/email)
- `department`
- `role`
- `status` (`active`, `inactive`, `on_leave`, `terminated`)
- `minSalary`, `maxSalary`
- `page` (default 1)
- `limit` (default 20, max 100)
- `sortBy` (`id`, `firstName`, `lastName`, `salary`, `hireDate`)
- `sortOrder` (`asc`, `desc`)

```bash
curl "http://localhost:3000/api/employees?department=Engineering&sortBy=salary&sortOrder=desc"
```

### Get Employee By ID

```bash
curl http://localhost:3000/api/employees/2
```

### Get Employee Stats

```bash
curl http://localhost:3000/api/employees/stats
```

### Create Employee

```bash
curl -X POST http://localhost:3000/api/employees ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_TOKEN" ^
  -d "{\"firstName\":\"Priya\",\"lastName\":\"Rao\",\"email\":\"priya.rao@vibetest.local\",\"phone\":\"+1-555-0199\",\"department\":\"Engineering\",\"role\":\"QA Intern\",\"salary\":38000,\"hireDate\":\"2024-07-01\",\"status\":\"active\",\"location\":\"Chennai\",\"managerId\":4,\"skills\":[\"API Testing\",\"Playwright\"]}"
```

### Replace Employee (PUT)

```bash
curl -X PUT http://localhost:3000/api/employees/2 ^
  -H "Content-Type: application/json" ^
  -H "x-api-key: VT-EMP-KEY-123" ^
  -d "{\"firstName\":\"Liam\",\"lastName\":\"Chen\",\"email\":\"liam.chen@vibetest.local\",\"phone\":\"+1-555-0102\",\"department\":\"Engineering\",\"role\":\"Senior SDET\",\"salary\":82000,\"hireDate\":\"2022-09-18\",\"status\":\"active\",\"location\":\"Singapore\",\"managerId\":4,\"skills\":[\"Cypress\",\"CI/CD\",\"JavaScript\",\"API\"]}"
```

### Partial Update (PATCH)

```bash
curl -X PATCH http://localhost:3000/api/employees/3 ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_TOKEN" ^
  -d "{\"status\":\"inactive\",\"salary\":56000}"
```

### Delete Employee

```bash
curl -X DELETE http://localhost:3000/api/employees/6 ^
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Validation Rules

Required fields on create/replace:

- `firstName`, `lastName`, `email`, `department`, `role`, `salary`, `hireDate`, `status`

Rules:

- `email` must be valid format
- `salary` must be a positive number
- `status` must be `active`, `inactive`, `on_leave`, or `terminated`
- `skills` must be an array if provided
- `phone` must be a valid phone-like pattern

## Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "email is invalid"
  },
  "requestId": "f3b2..."
}
```

Common error codes:

- `AUTH_REQUIRED`
- `INVALID_CREDENTIALS`
- `VALIDATION_ERROR`
- `DUPLICATE_EMAIL`
- `NOT_FOUND`
- `SERVER_ERROR`

## Sample Assignment Ideas

1. Create a new employee and then verify it appears in list.
2. Try creating a duplicate email and assert `409`.
3. Update status to `inactive` and validate stats endpoint changes.
4. Delete an employee and confirm `404` on subsequent fetch.
5. Test pagination with `page=1&limit=2` and validate meta.
