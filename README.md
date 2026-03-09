# River Of Life Admin App

A centralized admin dashboard for **River Of Life Church** to manage departments, tasks, Sunday ministry attendance, and church finance. Built with React, Vite, Tailwind CSS, Recharts, and Firebase.

## Features

- **Dashboard** – Total attendance, income, expense, pending tasks; charts for trends and department activity
- **Departments** – 14 departments (Worship, Cell Ministry, Caring, Sunday Ministry, Junior Church, Outreach, Media, Accounts, HR, General Affairs, Thunderstorm Youth, ROL's School of Music, RFF, ROLF) with activity and task views
- **Task Management** – Replaces the Excel “SP Office” coordination system; task title, department, assignee, priority, deadline, status, notes
- **Sunday Ministry** – Weekly attendance (English, Tamil, Junior Church, Combined); auto totals; monthly/yearly analytics and charts
- **Church Finance** – Income types (Offering 1–5, Tithe, Contribution, RSM, RFF, Donations) and expense categories; monthly/quarterly/annual totals and charts
- **Reports** – Export attendance, finance, and task reports to **Excel** and **PDF**
- **Roles** – Founder, Director, Admin, Finance Team, Ministry Leaders, Viewer with permission-based access

## Tech Stack

- **Frontend:** React 19, Vite 7, Tailwind CSS, Recharts
- **Backend:** Firebase (Authentication, Firestore, Storage)
- **Deploy:** Vercel, GitHub

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure Firebase**
   - Copy `.env.example` to `.env`
   - Add your Firebase config (see [DEPLOYMENT.md](./DEPLOYMENT.md))

3. **Run locally**
   ```bash
   npm run dev
   ```

4. **Build**
   ```bash
   npm run build
   ```

## Firebase Setup & Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for:

1. Creating the Firebase project and enabling Auth, Firestore, Storage  
2. Adding Firebase config to the app  
3. Pushing the project to GitHub  
4. Connecting GitHub to Vercel and adding environment variables  
5. Deploying and accessing the live URL  

## User Roles & Permissions

| Role            | Dashboard | Departments | Tasks | Attendance | Finance | Reports | Notes                    |
|----------------|-----------|-------------|-------|------------|---------|---------|--------------------------|
| Founder        | ✓         | ✓           | ✓     | ✓          | ✓       | ✓       | Full control             |
| Director       | ✓         | ✓           | ✓     | ✓          | ✓       | ✓       | View all, export         |
| Admin          | ✓         | ✓           | ✓     | ✓          | —       | ✓       | Manage depts, enter attendance |
| Finance Team   | ✓         | —           | —     | —          | ✓       | ✓       | Finance & export only    |
| Ministry Leaders | ✓       | ✓           | ✓     | ✓          | —       | ✓       | Enter attendance, no export |
| Viewer         | ✓         | ✓           | ✓     | ✓          | ✓       | ✓       | Read-only                |

## Firestore Collections

- `users` – User profiles and roles (document ID = Firebase Auth UID)
- `departments` – Department metadata
- `tasks` – Task records
- `attendance` – Sunday ministry attendance
- `finance_income` – Income entries
- `finance_expense` – Expense entries
- `reports` – (Optional) generated report metadata

## License

Private – River Of Life Church.
