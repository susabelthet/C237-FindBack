# FindBack — Campus Lost & Found System

C237 Software Application Development — CA2
Team 5 | Class C237_018

FindBack is a web application that helps students and staff report lost and found
items on campus, search for items, submit claims for items they believe are theirs,
and have those claims verified by an administrator before an item is returned.

---

## Tech Stack

- Node.js + Express
- EJS templating
- MySQL (mysql2)
- bcrypt (password hashing)
- express-session (authentication)
- multer (image upload)

---

## Setup Instructions

### 1. Install Node.js
Download and install from https://nodejs.org if not already installed.

### 2. Install dependencies
In the project folder, run:

```
npm install
```

This installs everything listed in package.json (express, ejs, mysql2, bcrypt,
express-session, multer, dotenv).

### 3. Set up the database

Open MySQL Workbench and run the included `.sql` file. This creates the database,
the tables (users, items, claims), and loads the existing data.

### 4. Configure environment variables

Create a file named `.env` in the project root with the following values:

```
DB_HOST=your-database-host
DB_USER=your-database-user
DB_PASSWORD=your-database-password
DB_NAME=c237_018_team5
DB_PORT=3306
SESSION_SECRET=any-random-string
```

If a `.env` file is already included in this submission, no changes are needed.

### 5. Run the application

```
node app.js
```

Then open http://localhost:3000 in your browser.

---

## Test Accounts

| Role  | Email                  | Password  |
|-------|------------------------|-----------|
| Admin | admin1@findback.com    | 88888888  |
| User  | test1@gmail.com  |  12345678         |

Admin accounts are created directly in the database. Accounts created through the
registration page are always assigned the "user" role.

---

## Features

1. **Registration, Login and Access Control** — user accounts with hashed passwords,
   sessions, and role-based access (user / admin).
2. **Report Lost and Found Items** — users submit item reports with details and an
   optional photo upload.
3. **Browse, Item Details, Search and Filter** — users browse active reports and
   filter by type, category, location, or keyword.
4. **Edit and Delete Own Reports** — users can only modify reports they created.
5. **Submit Claims and Personal Dashboard** — users claim found items and track the
   status of their claims (pending, approved, rejected).
6. **Admin Claim Approval and Returned Status** — admins review claims, approve or
   reject them, and mark returned items.

---

## Application Flow

A user reports an item → other users search for it → someone submits a claim →
an admin reviews the claim → the item is marked as returned.

---

## Notes

- `node_modules` is excluded from this submission. Run `npm install` to restore it.
- Uploaded item images are stored in `public/uploads/` and served as static files.
- Item photos are optional; items without a photo display a placeholder image.
