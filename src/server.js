require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");

const { query, initDb } = require("./db");
const { signToken, requireAuth, requireRole } = require("./auth");
const {
  signupSchema,
  loginSchema,
  projectSchema,
  taskSchema,
  validate,
} = require("./validation");

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

function normalizeTask(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    projectId: row.project_id,
    projectName: row.project_name,
    assignedTo: row.assigned_to,
    assignedToName: row.assigned_to_name,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

async function getAccessibleProjectIds(user) {
  const result = await query(
    `
      SELECT DISTINCT p.id
      FROM projects p
      LEFT JOIN project_members pm ON pm.project_id = p.id
      WHERE p.owner_id = $1 OR pm.user_id = $1
    `,
    [user.id]
  );

  return result.rows.map((row) => row.id);
}

async function ensureProjectAccess(projectId, user) {
  const result = await query(
    `
      SELECT p.id
      FROM projects p
      LEFT JOIN project_members pm ON pm.project_id = p.id
      WHERE p.id = $1 AND (p.owner_id = $2 OR pm.user_id = $2)
      LIMIT 1
    `,
    [projectId, user.id]
  );

  return result.rows[0];
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/signup", async (req, res) => {
  const parsed = validate(signupSchema, req.body);
  if (!parsed.ok) {
    return res.status(400).json({ message: parsed.errors.join(", ") });
  }

  const { name, email, password, role } = parsed.data;
  const existing = await query("SELECT id FROM users WHERE email = $1", [email]);

  if (existing.rows[0]) {
    return res.status(409).json({ message: "Email already exists." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const created = await query(
    `
      INSERT INTO users (name, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, email, role
    `,
    [name, email, passwordHash, role]
  );

  const user = created.rows[0];
  return res.status(201).json({ token: signToken(user), user });
});

app.post("/api/auth/login", async (req, res) => {
  const parsed = validate(loginSchema, req.body);
  if (!parsed.ok) {
    return res.status(400).json({ message: parsed.errors.join(", ") });
  }

  const { email, password } = parsed.data;
  const result = await query(
    "SELECT id, name, email, role, password_hash FROM users WHERE email = $1",
    [email]
  );
  const user = result.rows[0];

  if (!user) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  return res.json({
    token: signToken(user),
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  const result = await query(
    "SELECT id, name, email, role, created_at FROM users WHERE id = $1",
    [req.user.id]
  );

  return res.json(result.rows[0]);
});

app.get("/api/users", requireAuth, requireRole("ADMIN"), async (_req, res) => {
  const result = await query(
    "SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC"
  );
  res.json(result.rows);
});

app.get("/api/projects", requireAuth, async (req, res) => {
  const result = await query(
    `
      SELECT DISTINCT p.id, p.name, p.description, p.owner_id, p.created_at,
        u.name AS owner_name
      FROM projects p
      JOIN users u ON u.id = p.owner_id
      LEFT JOIN project_members pm ON pm.project_id = p.id
      WHERE p.owner_id = $1 OR pm.user_id = $1
      ORDER BY p.created_at DESC
    `,
    [req.user.id]
  );

  const projects = await Promise.all(
    result.rows.map(async (project) => {
      const members = await query(
        `
          SELECT DISTINCT u.id, u.name, u.email, u.role
          FROM users u
          LEFT JOIN project_members pm
            ON pm.user_id = u.id AND pm.project_id = $1
          WHERE u.id = $2 OR pm.project_id = $1
          ORDER BY u.name
        `,
        [project.id, project.owner_id]
      );

      return {
        id: project.id,
        name: project.name,
        description: project.description,
        ownerId: project.owner_id,
        ownerName: project.owner_name,
        createdAt: project.created_at,
        members: members.rows,
      };
    })
  );

  res.json(projects);
});

app.post("/api/projects", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = validate(projectSchema, req.body);
  if (!parsed.ok) {
    return res.status(400).json({ message: parsed.errors.join(", ") });
  }

  const { name, description, memberIds } = parsed.data;
  const created = await query(
    `
      INSERT INTO projects (name, description, owner_id)
      VALUES ($1, $2, $3)
      RETURNING id, name, description, owner_id, created_at
    `,
    [name, description, req.user.id]
  );

  const project = created.rows[0];
  const uniqueMemberIds = [...new Set([req.user.id, ...memberIds])];

  for (const memberId of uniqueMemberIds) {
    await query(
      `
        INSERT INTO project_members (project_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (project_id, user_id) DO NOTHING
      `,
      [project.id, memberId]
    );
  }

  res.status(201).json({
    id: project.id,
    name,
    description,
    ownerId: req.user.id,
    ownerName: req.user.name,
    createdAt: project.created_at,
    members: [],
  });
});

app.post(
  "/api/projects/:projectId/members",
  requireAuth,
  requireRole("ADMIN"),
  async (req, res) => {
    const projectId = Number(req.params.projectId);
    const memberId = Number(req.body.userId);

    if (!projectId || !memberId) {
      return res.status(400).json({ message: "Valid projectId and userId are required." });
    }

    const access = await query(
      "SELECT id FROM projects WHERE id = $1 AND owner_id = $2",
      [projectId, req.user.id]
    );
    if (!access.rows[0]) {
      return res.status(404).json({ message: "Project not found." });
    }

    await query(
      `
        INSERT INTO project_members (project_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (project_id, user_id) DO NOTHING
      `,
      [projectId, memberId]
    );

    res.status(201).json({ message: "Member added." });
  }
);

app.get("/api/projects/:projectId/tasks", requireAuth, async (req, res) => {
  const projectId = Number(req.params.projectId);
  const allowed = await ensureProjectAccess(projectId, req.user);

  if (!allowed) {
    return res.status(404).json({ message: "Project not found." });
  }

  const result = await query(
    `
      SELECT t.*, p.name AS project_name, u.name AS assigned_to_name
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN users u ON u.id = t.assigned_to
      WHERE t.project_id = $1
      ORDER BY t.created_at DESC
    `,
    [projectId]
  );

  res.json(result.rows.map(normalizeTask));
});

app.post("/api/projects/:projectId/tasks", requireAuth, async (req, res) => {
  const projectId = Number(req.params.projectId);
  const allowed = await ensureProjectAccess(projectId, req.user);

  if (!allowed) {
    return res.status(404).json({ message: "Project not found." });
  }

  const parsed = validate(taskSchema, req.body);
  if (!parsed.ok) {
    return res.status(400).json({ message: parsed.errors.join(", ") });
  }

  const { title, description, status, priority, dueDate, assignedTo } = parsed.data;
  const result = await query(
    `
      INSERT INTO tasks (title, description, status, priority, due_date, project_id, created_by, assigned_to)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
    [
      title,
      description,
      status,
      priority,
      dueDate || null,
      projectId,
      req.user.id,
      assignedTo,
    ]
  );

  res.status(201).json(normalizeTask(result.rows[0]));
});

app.patch("/api/tasks/:taskId", requireAuth, async (req, res) => {
  const taskId = Number(req.params.taskId);
  const parsed = validate(taskSchema.partial(), req.body);
  if (!parsed.ok) {
    return res.status(400).json({ message: parsed.errors.join(", ") });
  }

  const existing = await query("SELECT * FROM tasks WHERE id = $1", [taskId]);
  const task = existing.rows[0];
  if (!task) {
    return res.status(404).json({ message: "Task not found." });
  }

  const allowed = await ensureProjectAccess(task.project_id, req.user);
  if (!allowed) {
    return res.status(404).json({ message: "Task not found." });
  }

  const updated = {
    title: parsed.data.title ?? task.title,
    description: parsed.data.description ?? task.description,
    status: parsed.data.status ?? task.status,
    priority: parsed.data.priority ?? task.priority,
    dueDate:
      parsed.data.dueDate === undefined
        ? task.due_date
        : parsed.data.dueDate || null,
    assignedTo:
      parsed.data.assignedTo === undefined ? task.assigned_to : parsed.data.assignedTo,
  };

  const result = await query(
    `
      UPDATE tasks
      SET title = $1,
          description = $2,
          status = $3,
          priority = $4,
          due_date = $5,
          assigned_to = $6
      WHERE id = $7
      RETURNING *
    `,
    [
      updated.title,
      updated.description,
      updated.status,
      updated.priority,
      updated.dueDate,
      updated.assignedTo,
      taskId,
    ]
  );

  res.json(normalizeTask(result.rows[0]));
});

app.get("/api/dashboard", requireAuth, async (req, res) => {
  const projectIds = await getAccessibleProjectIds(req.user);
  const scopedIds = projectIds.length ? projectIds : [0];

  const tasks = await query(
    `
      SELECT t.*, p.name AS project_name, u.name AS assigned_to_name
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN users u ON u.id = t.assigned_to
      WHERE t.project_id = ANY($1::int[])
      ORDER BY t.created_at DESC
    `,
    [scopedIds]
  );

  const summary = {
    totalTasks: tasks.rows.length,
    todo: tasks.rows.filter((task) => task.status === "TODO").length,
    inProgress: tasks.rows.filter((task) => task.status === "IN_PROGRESS").length,
    done: tasks.rows.filter((task) => task.status === "DONE").length,
    overdue: tasks.rows.filter(
      (task) => task.due_date && new Date(task.due_date) < new Date() && task.status !== "DONE"
    ).length,
  };

  res.json({
    summary,
    tasks: tasks.rows.map(normalizeTask),
  });
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }

  return res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: "Something went wrong." });
});

async function start() {
  await initDb();
  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start app", error);
  process.exit(1);
});
