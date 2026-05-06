const state = {
  token: localStorage.getItem("ttm_token") || "",
  user: JSON.parse(localStorage.getItem("ttm_user") || "null"),
  projects: [],
  users: [],
  tasks: [],
  dashboard: null,
  currentView: "dashboard",
};

const authPanel = document.getElementById("auth-panel");
const navPanel = document.getElementById("nav-panel");
const flashMessage = document.getElementById("flash-message");
const dashboardView = document.getElementById("dashboard-view");
const projectsView = document.getElementById("projects-view");
const tasksView = document.getElementById("tasks-view");

function setFlash(message, isError = false) {
  flashMessage.textContent = message;
  flashMessage.classList.remove("hidden");
  flashMessage.style.background = isError ? "#b91c1c" : "#1d4ed8";
}

function clearFlash() {
  flashMessage.classList.add("hidden");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || "Request failed.");
  }

  return payload;
}

function saveSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem("ttm_token", token);
  localStorage.setItem("ttm_user", JSON.stringify(user));
}

function logout() {
  state.token = "";
  state.user = null;
  localStorage.removeItem("ttm_token");
  localStorage.removeItem("ttm_user");
  render();
}

function renderAuth() {
  if (state.user) {
    authPanel.innerHTML = `
      <h3>${state.user.name}</h3>
      <p class="muted">${state.user.email}</p>
      <p><span class="pill">${state.user.role}</span></p>
    `;
    navPanel.classList.remove("hidden");
    return;
  }

  navPanel.classList.add("hidden");
  authPanel.innerHTML = `
    <div class="row">
      <button id="show-login">Login</button>
      <button id="show-signup" class="secondary">Signup</button>
    </div>
    <div id="auth-forms"></div>
  `;

  const authForms = document.getElementById("auth-forms");

  const showLogin = () => {
    authForms.innerHTML = `
      <form id="login-form">
        <input name="email" type="email" placeholder="Email" required />
        <input name="password" type="password" placeholder="Password" required />
        <button type="submit">Login</button>
      </form>
    `;

    document.getElementById("login-form").onsubmit = async (event) => {
      event.preventDefault();
      clearFlash();
      const form = new FormData(event.target);
      try {
        const result = await api("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: form.get("email"),
            password: form.get("password"),
          }),
        });
        saveSession(result.token, result.user);
        await bootstrapApp();
      } catch (error) {
        setFlash(error.message, true);
      }
    };
  };

  const showSignup = () => {
    authForms.innerHTML = `
      <form id="signup-form">
        <input name="name" placeholder="Full name" required />
        <input name="email" type="email" placeholder="Email" required />
        <input name="password" type="password" placeholder="Password" required />
        <select name="role">
          <option value="MEMBER">Member</option>
          <option value="ADMIN">Admin</option>
        </select>
        <button type="submit">Create account</button>
      </form>
    `;

    document.getElementById("signup-form").onsubmit = async (event) => {
      event.preventDefault();
      clearFlash();
      const form = new FormData(event.target);
      try {
        const result = await api("/api/auth/signup", {
          method: "POST",
          body: JSON.stringify({
            name: form.get("name"),
            email: form.get("email"),
            password: form.get("password"),
            role: form.get("role"),
          }),
        });
        saveSession(result.token, result.user);
        await bootstrapApp();
      } catch (error) {
        setFlash(error.message, true);
      }
    };
  };

  document.getElementById("show-login").onclick = showLogin;
  document.getElementById("show-signup").onclick = showSignup;
  showLogin();
}

function renderDashboard() {
  if (!state.dashboard) {
    dashboardView.innerHTML = `<div class="panel">Login to view the dashboard.</div>`;
    return;
  }

  const { summary, tasks } = state.dashboard;
  dashboardView.innerHTML = `
    <div class="stats">
      <div class="stat"><h3>${summary.totalTasks}</h3><p class="muted">Total tasks</p></div>
      <div class="stat"><h3>${summary.todo}</h3><p class="muted">To do</p></div>
      <div class="stat"><h3>${summary.inProgress}</h3><p class="muted">In progress</p></div>
      <div class="stat"><h3>${summary.done}</h3><p class="muted">Done</p></div>
      <div class="stat"><h3>${summary.overdue}</h3><p class="muted">Overdue</p></div>
    </div>
    <div class="panel">
      <h2>Recent Tasks</h2>
      <div class="list">
        ${
          tasks.length
            ? tasks
                .slice(0, 8)
                .map(
                  (task) => `
              <div class="list-item">
                <div class="row">
                  <strong>${task.title}</strong>
                  <span class="pill">${task.status}</span>
                  <span class="pill">${task.priority}</span>
                </div>
                <p class="muted">${task.projectName || "Unknown project"}</p>
                <p>${task.description || "No description"}</p>
              </div>
            `
                )
                .join("")
            : "<p class='muted'>No tasks yet.</p>"
        }
      </div>
    </div>
  `;
}

function renderProjects() {
  const projectOptions = state.users
    .map((user) => `<option value="${user.id}">${user.name} (${user.role})</option>`)
    .join("");

  projectsView.innerHTML = `
    <div class="grid two">
      ${
        state.user && state.user.role === "ADMIN"
          ? `
          <div class="panel">
            <h2>Create Project</h2>
            <form id="project-form">
              <input name="name" placeholder="Project name" required />
              <textarea name="description" placeholder="Project description"></textarea>
              <select name="members" multiple size="6">${projectOptions}</select>
              <button type="submit">Create project</button>
            </form>
          </div>
        `
          : ""
      }
      <div class="panel">
        <h2>Projects</h2>
        <div class="list">
          ${
            state.projects.length
              ? state.projects
                  .map(
                    (project) => `
                <div class="list-item">
                  <div class="row">
                    <strong>${project.name}</strong>
                    <span class="pill">Owner: ${project.ownerName}</span>
                  </div>
                  <p>${project.description || "No description"}</p>
                  <p class="muted">Members: ${
                    project.members.length
                      ? project.members.map((member) => member.name).join(", ")
                      : "No members assigned"
                  }</p>
                </div>
              `
                  )
                  .join("")
              : "<p class='muted'>No projects yet.</p>"
          }
        </div>
      </div>
    </div>
  `;

  const projectForm = document.getElementById("project-form");
  if (projectForm) {
    projectForm.onsubmit = async (event) => {
      event.preventDefault();
      clearFlash();
      const form = new FormData(event.target);
      const memberIds = Array.from(projectForm.querySelector('[name="members"]').selectedOptions).map(
        (option) => Number(option.value)
      );

      try {
        await api("/api/projects", {
          method: "POST",
          body: JSON.stringify({
            name: form.get("name"),
            description: form.get("description"),
            memberIds,
          }),
        });
        setFlash("Project created.");
        await loadProjects();
        await loadDashboard();
        renderProjects();
      } catch (error) {
        setFlash(error.message, true);
      }
    };
  }
}

function renderTasks() {
  const assigneeMap = new Map();
  state.projects.forEach((project) => {
    assigneeMap.set(project.ownerId, { id: project.ownerId, name: project.ownerName });
    project.members.forEach((member) => assigneeMap.set(member.id, member));
  });

  const assignees = state.users.length ? state.users : Array.from(assigneeMap.values());
  const hasProjects = state.projects.length > 0;

  const projectOptions = state.projects
    .map((project) => `<option value="${project.id}">${project.name}</option>`)
    .join("");
  const assigneeOptions = assignees
    .map((user) => `<option value="${user.id}">${user.name}${user.role ? ` (${user.role})` : ""}</option>`)
    .join("");

  tasksView.innerHTML = `
    <div class="grid two">
      <div class="panel">
        <h2>Create Task</h2>
        <form id="task-form">
          <select name="projectId" required ${hasProjects ? "" : "disabled"}>
            <option value="">Select project</option>
            ${projectOptions}
          </select>
          ${hasProjects ? "" : "<p class='muted'>Create a project first to add tasks.</p>"}
          <input name="title" placeholder="Task title" required />
          <textarea name="description" placeholder="Task description"></textarea>
          <div class="grid two">
            <select name="status">
              <option value="TODO">TODO</option>
              <option value="IN_PROGRESS">IN PROGRESS</option>
              <option value="DONE">DONE</option>
            </select>
            <select name="priority">
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
            </select>
          </div>
          <input name="dueDate" type="datetime-local" />
          <select name="assignedTo">
            <option value="">Unassigned</option>
            ${assigneeOptions}
          </select>
          <button type="submit" ${hasProjects ? "" : "disabled"}>Create task</button>
        </form>
      </div>
      <div class="panel">
        <h2>Tasks</h2>
        <div class="list">
          ${
            state.tasks.length
              ? state.tasks
                  .map(
                    (task) => `
                <div class="list-item">
                  <div class="row">
                    <strong>${task.title}</strong>
                    <span class="pill">${task.status}</span>
                    <span class="pill">${task.priority}</span>
                  </div>
                  <p>${task.description || "No description"}</p>
                  <p class="muted">Project: ${task.projectName || "Unknown"}</p>
                  <p class="muted">Assigned to: ${task.assignedToName || "Unassigned"}</p>
                  <div class="row">
                    <button data-task="${task.id}" data-status="TODO" class="secondary">Todo</button>
                    <button data-task="${task.id}" data-status="IN_PROGRESS" class="secondary">In Progress</button>
                    <button data-task="${task.id}" data-status="DONE" class="secondary">Done</button>
                  </div>
                </div>
              `
                  )
                  .join("")
              : "<p class='muted'>No tasks yet.</p>"
          }
        </div>
      </div>
    </div>
  `;

  document.getElementById("task-form").onsubmit = async (event) => {
    event.preventDefault();
    clearFlash();
    const form = new FormData(event.target);
    const projectId = Number(form.get("projectId"));
    try {
      await api(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        body: JSON.stringify({
          title: form.get("title"),
          description: form.get("description"),
          status: form.get("status"),
          priority: form.get("priority"),
          dueDate: form.get("dueDate") ? new Date(form.get("dueDate")).toISOString() : "",
          assignedTo: form.get("assignedTo") ? Number(form.get("assignedTo")) : null,
        }),
      });
      setFlash("Task created.");
      await bootstrapAppData();
      renderTasks();
    } catch (error) {
      setFlash(error.message, true);
    }
  };

  tasksView.querySelectorAll("[data-task]").forEach((button) => {
    button.onclick = async () => {
      try {
        await api(`/api/tasks/${button.dataset.task}`, {
          method: "PATCH",
          body: JSON.stringify({ status: button.dataset.status }),
        });
        await bootstrapAppData();
        renderTasks();
      } catch (error) {
        setFlash(error.message, true);
      }
    };
  });
}

function showView(viewName) {
  state.currentView = viewName;
  [dashboardView, projectsView, tasksView].forEach((view) => view.classList.add("hidden"));
  document.getElementById(`${viewName}-view`).classList.remove("hidden");
}

async function loadUsers() {
  if (!state.user || state.user.role !== "ADMIN") {
    state.users = [];
    return;
  }

  state.users = await api("/api/users");
}

async function loadProjects() {
  state.projects = await api("/api/projects");
}

async function loadDashboard() {
  state.dashboard = await api("/api/dashboard");
  state.tasks = state.dashboard.tasks;
}

async function bootstrapAppData() {
  await Promise.all([loadUsers(), loadProjects(), loadDashboard()]);
}

async function bootstrapApp() {
  try {
    if (state.token) {
      state.user = await api("/api/auth/me");
      localStorage.setItem("ttm_user", JSON.stringify(state.user));
      await bootstrapAppData();
    }
  } catch (_error) {
    logout();
    setFlash("Session expired. Please login again.", true);
  }

  render();
}

function render() {
  renderAuth();
  renderDashboard();
  renderProjects();
  renderTasks();
  showView(state.user ? state.currentView : "dashboard");

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.onclick = async () => {
      clearFlash();
      try {
        if (state.user) {
          await bootstrapAppData();
        }
      } catch (error) {
        setFlash(error.message, true);
      }

      renderAuth();
      renderDashboard();
      renderProjects();
      renderTasks();
      showView(button.dataset.view);
    };
  });

  const logoutButton = document.getElementById("logout-btn");
  if (logoutButton) {
    logoutButton.onclick = () => {
      clearFlash();
      logout();
    };
  }
}

bootstrapApp();
