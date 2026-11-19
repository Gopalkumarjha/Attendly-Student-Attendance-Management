
# Attendly Student Attendance Management System

Attendly is a role-based attendance management application for a university demonstration. Administrators manage student and teacher accounts, courses and enrollments. Teachers create and submit class registers. Students can review their own course attendance and history.

## Features

- Separate Admin, Teacher and Student sign-in and dashboard views.
- JWT authentication, bcrypt password hashing and API role checks.
- MongoDB models for users, student profiles, courses, class sessions and attendance records.
- Teacher course assignment and course student enrollment.
- Present, Absent and Late attendance records with duplicate-session protection.
- Database-derived dashboard metrics, daily and monthly charts, and course comparisons.
- Searchable student directory, account/course administration and date-filtered CSV reporting.
- Responsive React interface with Recharts, Lucide React and Axios.
- The older transport API models remain in the repository for reference; Attendly uses `/api/attendance` and separate attendance models.

## Requirements

- Node.js 20 or later and npm.
- A running MongoDB instance or MongoDB Atlas database.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Edit `.env`. For local MongoDB, set:

   ```env
   PORT=5001
   NODE_ENV=development
   MONGODB_URI=mongodb://127.0.0.1:27017/attendly_attendance
   JWT_SECRET=replace-with-a-long-random-secret
   CLIENT_URL=http://127.0.0.1:5173,http://127.0.0.1:4173,http://127.0.0.1:5180,http://localhost:5173,http://localhost:4173,http://localhost:5180
   VITE_API_URL=http://127.0.0.1:5001/api/attendance
   ```

   Make sure MongoDB is running before seeding. Keep `.env` private and use a unique, high-entropy `JWT_SECRET` outside local development.

4. Seed demonstration accounts and attendance records **once on an empty Attendly database**:

   ```bash
   npm run seed:attendance
   ```

   The seeder refuses to run if the database already contains users, to avoid overwriting existing data.

5. Start the API and Vite frontend:

   ```bash
   npm run dev
   ```

   Open `http://127.0.0.1:5173`. API health: `http://127.0.0.1:5001/api/health`.

## Demo accounts

All seeded demo accounts use the development password `Attendly@2026`:

| Role | Email | Name |
|---|---|---|
| Admin | `admin@attendly.demo` | Gopal Kumar Jha |
| Teacher | `teacher@attendly.demo` | Dr. Riya Sen |
| Student | `rahul@attendly.demo` | Rahul Dhatwalia |

These credentials are for local demonstration only. Change them before using any non-demo environment.

## API outline

All attendance routes are prefixed with `/api/attendance`.

| Method | Path | Access |
|---|---|---|
| POST | `/auth/login` | Public |
| GET | `/auth/me` | Signed-in user |
| GET | `/dashboard` | Signed-in user; data scoped to role |
| GET, POST, PUT, DELETE | `/students` | List: Admin/Teacher; changes: Admin |
| GET, POST, PUT, DELETE | `/teachers` | Admin |
| GET, POST, PUT, DELETE | `/courses` | List: signed-in and scoped; changes: Admin |
| POST | `/sessions` | Admin/assigned Teacher |
| GET | `/sessions?courseId=...&date=YYYY-MM-DD` | Signed-in and course-scoped |
| GET | `/sessions/:id` | Admin/assigned Teacher |
| PUT | `/sessions/:id/attendance` | Admin/assigned Teacher |
| GET | `/reports/attendance.csv?from=...&to=...` | Admin/Teacher, course-scoped |

## Security and scope

The backend verifies JWTs and checks each route’s role and course scope. Passwords are stored as bcrypt hashes. The frontend role display is derived from the signed-in account; changing a UI control cannot grant API permissions. Attendance history and dashboard metrics come from MongoDB.

This project is intended for coursework and local demonstration. Before deployment, configure HTTPS, a strong secret, production CORS origins, backups, account recovery and operational logging. Review existing npm audit findings before deploying.

## Build

```bash
npm run build
```
