const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const EMP_FILE = path.join(DATA_DIR, "employees.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const API_KEY = process.env.API_KEY || "VT-EMP-KEY-123";

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  const requestId = crypto.randomUUID
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString("hex");
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
});
app.use(morgan("tiny"));

let writeChain = Promise.resolve();

const readJson = async (filePath, fallback) => {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
};

const writeJsonQueued = async (filePath, data) => {
  writeChain = writeChain.then(() =>
    fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8")
  );
  return writeChain;
};

const normalizeString = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toLowerCase();
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^[0-9+\-()\s]{7,20}$/;

const validateEmployee = (payload, { partial = false } = {}) => {
  const errors = [];
  const requiredFields = [
    "firstName",
    "lastName",
    "email",
    "department",
    "role",
    "salary",
    "hireDate",
    "status"
  ];

  if (!partial) {
    requiredFields.forEach((field) => {
      if (payload[field] === undefined || payload[field] === null) {
        errors.push(`${field} is required`);
      }
    });
  }

  if (payload.firstName !== undefined && !String(payload.firstName).trim()) {
    errors.push("firstName cannot be empty");
  }
  if (payload.lastName !== undefined && !String(payload.lastName).trim()) {
    errors.push("lastName cannot be empty");
  }
  if (payload.email !== undefined && !emailRegex.test(payload.email)) {
    errors.push("email is invalid");
  }
  if (payload.phone !== undefined && payload.phone !== "" && !phoneRegex.test(payload.phone)) {
    errors.push("phone is invalid");
  }
  if (payload.salary !== undefined) {
    const salary = Number(payload.salary);
    if (Number.isNaN(salary) || salary < 0) {
      errors.push("salary must be a positive number");
    }
  }
  if (payload.hireDate !== undefined) {
    const date = new Date(payload.hireDate);
    if (Number.isNaN(date.valueOf())) {
      errors.push("hireDate must be a valid date");
    }
  }
  if (payload.status !== undefined) {
    const allowed = ["active", "inactive", "on_leave", "terminated"];
    if (!allowed.includes(payload.status)) {
      errors.push(`status must be one of ${allowed.join(", ")}`);
    }
  }
  if (payload.skills !== undefined && !Array.isArray(payload.skills)) {
    errors.push("skills must be an array");
  }

  return errors;
};

const tokenStore = new Map();

const issueToken = (user) => {
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = Date.now() + 60 * 60 * 1000;
  tokenStore.set(token, {
    id: user.id,
    username: user.username,
    role: user.role,
    name: user.name,
    expiresAt
  });
  return { token, expiresAt };
};

const getAuthContext = (req) => {
  const apiKey = req.header("x-api-key");
  if (apiKey && apiKey === API_KEY) {
    return { type: "apiKey", role: "service", name: "Service Client" };
  }

  const authHeader = req.header("authorization") || "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() === "bearer" && tokenStore.has(token)) {
    const session = tokenStore.get(token);
    if (session.expiresAt < Date.now()) {
      tokenStore.delete(token);
      return null;
    }
    return { type: "bearer", ...session };
  }

  return null;
};

const requireAuth = (req, res, next) => {
  const auth = getAuthContext(req);
  if (!auth) {
    return res.status(401).json({
      error: {
        code: "AUTH_REQUIRED",
        message:
          "Authentication required. Use Bearer token or x-api-key header."
      },
      requestId: req.requestId
    });
  }
  req.auth = auth;
  return next();
};

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    time: new Date().toISOString(),
    version: "1.0.0",
    requestId: req.requestId
  });
});

app.post("/auth/login", async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "username and password are required"
        },
        requestId: req.requestId
      });
    }

    const users = await readJson(USERS_FILE, []);
    const user = users.find(
      (item) =>
        normalizeString(item.username) === normalizeString(username) &&
        item.password === password
    );

    if (!user) {
      return res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid username or password"
        },
        requestId: req.requestId
      });
    }

    const { token, expiresAt } = issueToken(user);

    return res.json({
      token,
      tokenType: "Bearer",
      expiresIn: Math.floor((expiresAt - Date.now()) / 1000),
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name
      }
    });
  } catch (error) {
    return next(error);
  }
});

app.get("/auth/me", requireAuth, (req, res) => {
  res.json({
    authType: req.auth.type,
    user: {
      id: req.auth.id,
      username: req.auth.username,
      role: req.auth.role,
      name: req.auth.name
    },
    requestId: req.requestId
  });
});

app.get("/api/employees", async (req, res, next) => {
  try {
    const {
      q,
      department,
      role,
      status,
      minSalary,
      maxSalary,
      page = 1,
      limit = 20,
      sortBy = "id",
      sortOrder = "asc"
    } = req.query;

    const employees = await readJson(EMP_FILE, []);
    let results = employees;

    if (q) {
      const needle = normalizeString(q);
      results = results.filter((employee) => {
        const haystack = [
          employee.firstName,
          employee.lastName,
          employee.email
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      });
    }

    if (department) {
      results = results.filter(
        (employee) =>
          normalizeString(employee.department) === normalizeString(department)
      );
    }

    if (role) {
      results = results.filter(
        (employee) => normalizeString(employee.role) === normalizeString(role)
      );
    }

    if (status) {
      results = results.filter(
        (employee) =>
          normalizeString(employee.status) === normalizeString(status)
      );
    }

    if (minSalary !== undefined) {
      const value = Number(minSalary);
      if (!Number.isNaN(value)) {
        results = results.filter((employee) => employee.salary >= value);
      }
    }

    if (maxSalary !== undefined) {
      const value = Number(maxSalary);
      if (!Number.isNaN(value)) {
        results = results.filter((employee) => employee.salary <= value);
      }
    }

    const allowedSort = ["id", "firstName", "lastName", "salary", "hireDate"];
    const safeSortBy = allowedSort.includes(sortBy) ? sortBy : "id";
    const safeOrder = String(sortOrder).toLowerCase() === "desc" ? -1 : 1;

    results = results.slice().sort((a, b) => {
      const left = a[safeSortBy];
      const right = b[safeSortBy];
      if (left === right) return 0;
      if (left > right) return safeOrder;
      return -safeOrder;
    });

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const total = results.length;
    const totalPages = Math.ceil(total / limitNumber);
    const start = (pageNumber - 1) * limitNumber;
    const data = results.slice(start, start + limitNumber);

    res.json({
      data,
      meta: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/employees/stats", async (req, res, next) => {
  try {
    const employees = await readJson(EMP_FILE, []);
    const byDepartment = {};
    const byStatus = {};
    let totalSalary = 0;

    employees.forEach((employee) => {
      byDepartment[employee.department] =
        (byDepartment[employee.department] || 0) + 1;
      byStatus[employee.status] = (byStatus[employee.status] || 0) + 1;
      totalSalary += employee.salary;
    });

    const avgSalary = employees.length
      ? Math.round(totalSalary / employees.length)
      : 0;

    res.json({
      totals: {
        employees: employees.length,
        avgSalary
      },
      byDepartment,
      byStatus,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/employees/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const employees = await readJson(EMP_FILE, []);
    const employee = employees.find((item) => item.id === id);

    if (!employee) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Employee not found" },
        requestId: req.requestId
      });
    }

    return res.json(employee);
  } catch (error) {
    return next(error);
  }
});

app.post("/api/employees", requireAuth, async (req, res, next) => {
  try {
    const payload = req.body || {};
    const errors = validateEmployee(payload);
    if (errors.length) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: errors.join(", ") },
        requestId: req.requestId
      });
    }

    const employees = await readJson(EMP_FILE, []);
    const emailExists = employees.some(
      (employee) => normalizeString(employee.email) === normalizeString(payload.email)
    );
    if (emailExists) {
      return res.status(409).json({
        error: { code: "DUPLICATE_EMAIL", message: "Email already exists" },
        requestId: req.requestId
      });
    }

    const nextId =
      employees.reduce((max, employee) => Math.max(max, employee.id), 0) + 1;

    const now = new Date().toISOString();
    const newEmployee = {
      id: nextId,
      firstName: String(payload.firstName).trim(),
      lastName: String(payload.lastName).trim(),
      email: String(payload.email).trim(),
      phone: payload.phone ? String(payload.phone).trim() : "",
      department: String(payload.department).trim(),
      role: String(payload.role).trim(),
      salary: Number(payload.salary),
      hireDate: new Date(payload.hireDate).toISOString().slice(0, 10),
      status: payload.status,
      location: payload.location ? String(payload.location).trim() : "",
      managerId: payload.managerId ? Number(payload.managerId) : null,
      skills: Array.isArray(payload.skills) ? payload.skills : [],
      createdAt: now,
      updatedAt: now
    };

    employees.push(newEmployee);
    await writeJsonQueued(EMP_FILE, employees);

    return res.status(201).json(newEmployee);
  } catch (error) {
    return next(error);
  }
});

app.put("/api/employees/:id", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const payload = req.body || {};
    const errors = validateEmployee(payload);
    if (errors.length) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: errors.join(", ") },
        requestId: req.requestId
      });
    }

    const employees = await readJson(EMP_FILE, []);
    const index = employees.findIndex((item) => item.id === id);
    if (index === -1) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Employee not found" },
        requestId: req.requestId
      });
    }

    const emailExists = employees.some(
      (employee) =>
        employee.id !== id &&
        normalizeString(employee.email) === normalizeString(payload.email)
    );
    if (emailExists) {
      return res.status(409).json({
        error: { code: "DUPLICATE_EMAIL", message: "Email already exists" },
        requestId: req.requestId
      });
    }

    const existing = employees[index];
    const now = new Date().toISOString();
    const updated = {
      ...existing,
      firstName: String(payload.firstName).trim(),
      lastName: String(payload.lastName).trim(),
      email: String(payload.email).trim(),
      phone: payload.phone ? String(payload.phone).trim() : "",
      department: String(payload.department).trim(),
      role: String(payload.role).trim(),
      salary: Number(payload.salary),
      hireDate: new Date(payload.hireDate).toISOString().slice(0, 10),
      status: payload.status,
      location: payload.location ? String(payload.location).trim() : "",
      managerId: payload.managerId ? Number(payload.managerId) : null,
      skills: Array.isArray(payload.skills) ? payload.skills : [],
      updatedAt: now
    };

    employees[index] = updated;
    await writeJsonQueued(EMP_FILE, employees);

    return res.json(updated);
  } catch (error) {
    return next(error);
  }
});

app.patch("/api/employees/:id", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const payload = req.body || {};
    const errors = validateEmployee(payload, { partial: true });
    if (errors.length) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: errors.join(", ") },
        requestId: req.requestId
      });
    }

    const employees = await readJson(EMP_FILE, []);
    const index = employees.findIndex((item) => item.id === id);
    if (index === -1) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Employee not found" },
        requestId: req.requestId
      });
    }

    if (payload.email !== undefined) {
      const emailExists = employees.some(
        (employee) =>
          employee.id !== id &&
          normalizeString(employee.email) === normalizeString(payload.email)
      );
      if (emailExists) {
        return res.status(409).json({
          error: { code: "DUPLICATE_EMAIL", message: "Email already exists" },
          requestId: req.requestId
        });
      }
    }

    const existing = employees[index];
    const updated = {
      ...existing,
      ...payload,
      salary:
        payload.salary !== undefined ? Number(payload.salary) : existing.salary,
      managerId:
        payload.managerId !== undefined
          ? Number(payload.managerId)
          : existing.managerId,
      updatedAt: new Date().toISOString()
    };

    if (payload.hireDate !== undefined) {
      updated.hireDate = new Date(payload.hireDate)
        .toISOString()
        .slice(0, 10);
    }

    employees[index] = updated;
    await writeJsonQueued(EMP_FILE, employees);

    return res.json(updated);
  } catch (error) {
    return next(error);
  }
});

app.delete("/api/employees/:id", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const employees = await readJson(EMP_FILE, []);
    const index = employees.findIndex((item) => item.id === id);
    if (index === -1) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Employee not found" },
        requestId: req.requestId
      });
    }

    employees.splice(index, 1);
    await writeJsonQueued(EMP_FILE, employees);

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "Route not found" },
    requestId: req.requestId
  });
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({
    error: {
      code: err.code || "SERVER_ERROR",
      message: err.message || "Unexpected server error"
    },
    requestId: req.requestId
  });
});

app.listen(PORT, () => {
  console.log(`Employee API running on http://localhost:${PORT}`);
});
