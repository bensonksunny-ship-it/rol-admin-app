# River Of Life Admin App – Deployment Guide

Follow these steps to create the Firebase project, add config, push to GitHub, connect to Vercel, and go live.

---

## 1. Create Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** (or **Create a project**).
3. Enter project name (e.g. `rol-admin-app`) and continue.
4. Disable Google Analytics if you don’t need it, then **Create project**.

### Enable services

- **Authentication**
  - In the left menu: **Build → Authentication**.
  - Click **Get started**.
  - Under **Sign-in method**, enable **Email/Password**.

- **Firestore**
  - **Build → Firestore Database**.
  - Click **Create database**.
  - Choose **Start in test mode** (later lock down with security rules).
  - Pick a region and **Enable**.

- **Storage** (optional, for future uploads)
  - **Build → Storage**.
  - **Get started** → **Next** → **Done**.

### Get Firebase config

1. Project **Settings** (gear) → **Project settings**.
2. Under **Your apps**, click the **</>** (Web) icon.
3. Register app (e.g. name: `ROL Admin App`).
4. Copy the `firebaseConfig` object. You’ll use these values in step 2.

---

## 2. Add Firebase config to the app

1. In the project root, copy the example env file:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and set these variables (from the Firebase config you copied):
   ```env
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```
3. Save the file. Do **not** commit `.env` (it’s in `.gitignore`).

### Create the first user and role (Firestore)

1. In Firebase Console: **Authentication → Users** → **Add user**.
   - Enter email and password. This will be your first admin login.

2. Copy the new user’s **UID** (from the Users table).

3. In **Firestore Database**, create a document:
   - Collection ID: `users`
   - Document ID: **the UID you copied**
   - Fields:
     - `role` (string): e.g. `Founder` or `Admin`
     - `displayName` (string, optional): e.g. `Admin User`
     - `email` (string, optional): same as in Auth

4. Sign in to the app with that email/password. The app will read the `users/{uid}` document to determine role and permissions.

---

## 3. Push the project to GitHub

1. Initialize Git (if not already):
   ```bash
   git init
   ```
2. Stage and commit:
   ```bash
   git add .
   git commit -m "Initial commit: River Of Life Admin App"
   ```
3. Create a new repository on [GitHub](https://github.com/new) (e.g. `rol-admin-app`). Do **not** add a README or .gitignore if the project already has them.
4. Add the remote and push:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/rol-admin-app.git
   git branch -M main
   git push -u origin main
   ```
   Replace `YOUR_USERNAME` and `rol-admin-app` with your GitHub username and repo name.

---

## 4. Connect GitHub to Vercel

1. Go to [Vercel](https://vercel.com) and sign in (e.g. with GitHub).
2. Click **Add New… → Project**.
3. Import the GitHub repository (`rol-admin-app` or your repo name).
4. Leave **Framework Preset** as **Vite** (or set it to Vite if needed).
5. **Build and Output Settings** (optional; `vercel.json` already sets these):
   - Build Command: `npm run build`
   - Output Directory: `dist`

---

## 5. Add environment variables on Vercel

1. In the Vercel project: **Settings → Environment Variables**.
2. Add each variable from your `.env` (for **Production**, and optionally Preview/Development):
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
3. Save. Redeploy the project so the new env vars are applied (e.g. **Deployments → … → Redeploy**).

---

## 6. Deploy and get the live URL

1. After the first deploy (or redeploy), open the **Deployments** tab.
2. Click the latest deployment.
3. Use the **Visit** link (e.g. `https://rol-admin-app.vercel.app`) as your **live production URL**.

---

## Optional: Firestore security rules

For production, replace test-mode rules with something like this (adjust to your auth/role model):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /departments/{id} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    match /tasks/{id} {
      allow read, write: if request.auth != null;
    }
    match /attendance/{id} {
      allow read, write: if request.auth != null;
    }
    match /finance_income/{id} {
      allow read, write: if request.auth != null;
    }
    match /finance_expense/{id} {
      allow read, write: if request.auth != null;
    }
    match /reports/{id} {
      allow read, write: if request.auth != null;
    }
  }
}
```

In Firestore: **Rules** tab → paste → **Publish**.

---

## Summary checklist

- [ ] Firebase project created; Auth (Email/Password), Firestore (and optionally Storage) enabled.
- [ ] `.env` created and filled with Firebase config.
- [ ] First user created in Authentication; `users/{uid}` document created in Firestore with `role`.
- [ ] Git repo initialized; project pushed to GitHub.
- [ ] Vercel project created and connected to GitHub.
- [ ] Same env vars added in Vercel; project redeployed.
- [ ] Live production URL opened and login tested.

---

## Deploy current changes to Vercel (after you've pushed to GitHub)

1. **Commit and push your code** (in terminal, from project folder):
   ```bash
   cd "d:\ROL Admin app"
   git add .
   git status
   git commit -m "Sunday Planning, Office Secretary role, permissions doc"
   git push origin main
   ```
   Use your GitHub repo and branch name if different.

2. **Vercel** will auto-deploy if the project is already connected to GitHub. Otherwise: go to [vercel.com](https://vercel.com) → **Add New** → **Project** → import your repo → add all **VITE_FIREBASE_*** env vars → **Deploy**.

3. **Open the live URL** from the Vercel dashboard. Log in and confirm Sunday Planning and the combined view work.
