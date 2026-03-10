# VibeTestAPI — Employee Management API & Test Suite

> © 2026 [VibeTestQ.com](https://vibetestq.com). All rights reserved.

A training-focused REST API built with Node.js and Express, paired with a full [Playwright](https://playwright.dev/) API test suite. Designed for hands-on API testing practice covering all major authentication types, CRUD operations, filtering, pagination, and error handling.

---

## Features

- **Express.js REST API** — 8 endpoints covering employee CRUD + health + auth
- **5 Authentication Types** — API Key, Bearer JWT, HTTP Basic Auth, Cookie/Session, OAuth 2.0 Client Credentials
- **Playwright Test Suite** — 69 tests covering happy paths, edge cases, and auth flows
- **File-based persistence** — No database required; data stored in `data/employees.json`
- **Realistic error responses** — Structured `{ error: { code, message }, requestId }` format

---

## Project Structure

```
├── server.js               # Express API server
├── playwright.config.ts    # Playwright configuration
├── data/
│   ├── employees.json      # Employee data store
│   └── users.json          # User credentials for auth
├── src/
│   └── helpers.ts          # Shared test utilities and factories
├── tests/
│   ├── health.spec.ts      # GET /health tests
│   ├── auth.spec.ts        # All 5 auth type tests (44 tests)
│   └── employees.spec.ts   # Employee CRUD tests (24 tests)
└── docs/
    ├── ait test guide.md   # Full API testing guide
    ├── api-testing-basics.md
    └── employee-api.md
```

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- npm

### Install & Run

```bash
npm install
npm start
```

The server starts on **http://localhost:3000**.

### Install Playwright browsers (first time only)

```bash
npx playwright install
```

### Run Tests

```bash
npm test              # run all 69 tests
npm run test:report   # open the HTML report
```

---

## API Endpoints

| Method | Path | Auth Required | Description |
|--------|------|:---:|-------------|
| `GET` | `/health` | No | Server health check |
| `GET` | `/api/employees` | No | List employees (filterable, paginated) |
| `GET` | `/api/employees/stats` | No | Aggregate statistics |
| `GET` | `/api/employees/:id` | No | Get one employee |
| `POST` | `/api/employees` | **Yes** | Create employee |
| `PUT` | `/api/employees/:id` | **Yes** | Replace employee |
| `PATCH` | `/api/employees/:id` | **Yes** | Partial update |
| `DELETE` | `/api/employees/:id` | **Yes** | Delete employee |

Full documentation is in [docs/ait test guide.md](docs/ait%20test%20guide.md).

---

## Authentication

All write endpoints require one of the following auth methods:

| Type | How to Use |
|------|-----------|
| **API Key** | `x-api-key: VT-EMP-KEY-123` header |
| **Bearer JWT** | `POST /auth/login` → use token in `Authorization: Bearer <token>` |
| **Basic Auth** | `Authorization: Basic <base64(username:password)>` |
| **Cookie/Session** | `POST /auth/session/login` → session cookie sent automatically |
| **OAuth 2.0** | `POST /oauth/token` (client_credentials) → use token in `Authorization: Bearer <token>` |

Demo credentials: `admin` / `admin123`

---

## Query Parameters (GET /api/employees)

| Parameter | Type | Description |
|-----------|------|-------------|
| `department` | string | Filter by department (case-insensitive) |
| `status` | string | `active`, `inactive`, or `on_leave` |
| `role` | string | Filter by role |
| `minSalary` / `maxSalary` | number | Salary range filter |
| `q` | string | Full-text search (firstName, lastName, email) |
| `page` | number | Page number (default: 1) |
| `limit` | number | Results per page (default: 10, max: 100) |
| `sortBy` | string | Field to sort by (default: `id`) |
| `sortOrder` | string | `asc` or `desc` (default: `asc`) |

---

## Error Response Format

All endpoints (except OAuth) return errors in this structure:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Employee not found"
  },
  "requestId": "uuid-v4"
}
```

OAuth errors follow [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749):

```json
{
  "error": "invalid_client",
  "error_description": "Invalid client credentials"
}
```

---

## License

© 2026 [VibeTestQ.com](https://vibetestq.com). All rights reserved.  
This project is provided for educational and training purposes.
