# Team Task Manager

A lightweight full-stack web app for managing projects, assigning tasks, and tracking progress with role-based access control.

## Features

- Signup and login with JWT authentication
- Role-based access control for `ADMIN` and `MEMBER`
- Project creation and team member assignment
- Task creation, assignment, and status updates
- Dashboard with task totals, status breakdown, and overdue count
- Railway-ready deployment config

## Tech Stack

- Backend: Node.js, Express, PostgreSQL
- Frontend: HTML, CSS, Vanilla JavaScript
- Auth: JWT + bcrypt
- Validation: Zod

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and update:

   ```env
   PORT=3000
   NODE_ENV=development
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/team_task_manager
   JWT_SECRET=replace-with-a-strong-secret
   ```

3. Start the app:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000)

## API Endpoints

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/users`
- `GET /api/projects`
- `POST /api/projects`
- `POST /api/projects/:projectId/members`
- `GET /api/projects/:projectId/tasks`
- `POST /api/projects/:projectId/tasks`
- `PATCH /api/tasks/:taskId`
- `GET /api/dashboard`

## Railway Deployment

1. Push the repo to GitHub.
2. Create a new Railway project from the GitHub repo.
3. Add a PostgreSQL service in Railway.
4. Set environment variables in Railway:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `NODE_ENV=production`
5. Deploy. Railway will run `npm start`.


- Live Railway URL: https://team-task-manager-production-8480.up.railway.app/

