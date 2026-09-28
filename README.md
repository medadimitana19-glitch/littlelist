# Littlelist

A small, responsive task dashboard. Each person signs in with their own account, and the database keeps their tasks and notes private to that account.

## What it includes

- Email registration and login
- Tasks with notes, categories, priority, and due date and time
- Complete, reopen, edit, delete, and reorder tasks
- Search task titles, notes, and categories
- Views for all tasks, today, upcoming, and completed
- Category and priority filters
- Responsive desktop, tablet, and mobile layouts

## One-time setup

The website files are static, while Supabase provides the accounts and PostgreSQL database. The public project key is safe to use in the browser when Row Level Security is enabled. The included SQL turns that on and limits every task row to the person who owns it.

1. Create a project at [supabase.com](https://supabase.com/).
2. In that project's SQL Editor, open and run [`supabase/schema.sql`](supabase/schema.sql).
3. In the Supabase project settings, copy the Project URL and its **publishable** key (older projects may call it the `anon` key).
4. Open Littlelist from a web address or a local web server. Paste the URL and public key into the first setup screen.
5. Create an account. If email confirmation is enabled for the project, follow the link Supabase emails you, then log in.

Never paste a `service_role` or secret key into Littlelist. Those keys bypass database protections and must stay on a trusted server.

## Run a local preview

Littlelist does not need a build step or a Node.js server. It loads the Supabase browser library from a CDN, so an internet connection is needed. From this folder, start a basic static web server, then open the address it prints. For example, if Python is installed:

```powershell
py -m http.server 8000
```

Then visit `http://localhost:8000`. Press `Ctrl+C` in the terminal when you are finished.

For email confirmation links, add the address you are using (for example, `http://localhost:8000`) to the Supabase project's Auth URL configuration. When you host the site, use the final website address instead.

## Files

- `index.html` — screens and page structure
- `styles.css` — responsive layout and styling
- `app.js` — account flow, task features, and database connection
- `supabase/schema.sql` — task table, indexes, and per-user database access rules

GitHub stores the source code. Supabase stores the accounts and task data.
