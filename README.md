# TJ & MAUI STUDIO Dashboard

## Package contents
- `dashboard.html` — dashboard page
- `css/dashboard.css` — Elegant Sage responsive styling
- `js/dashboard.js` — Supabase data loading, charts, client and event forms
- `sql/dashboard_schema.sql` — clients/events schema and Row Level Security policies

## Install
1. Keep your existing `js/supabase.js` file. It must initialize the Supabase client as `window.supabaseClient`.
2. Copy `dashboard.html` into your project root.
3. Copy `css/dashboard.css` and `js/dashboard.js` into the matching folders.
4. Run `sql/dashboard_schema.sql` in the Supabase SQL Editor.
5. Ensure your dashboard login account has a row in `public.profiles` with `account_status = 'active'` and a `userlevel` of `owner`, `admin`, or `staff`.
6. Open `dashboard.html` after signing in. If your login page is not `index.html`, change the two redirects in `js/dashboard.js`.

## Existing Supabase client contract
Your `js/supabase.js` must load after the Supabase CDN script and expose:
`window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);`

## Access model
- `auth.users` and `profiles`: dashboard login accounts only (owner/admin/staff).
- `clients`: business client records; no login credentials.
- `events`: multiple events can belong to one client.
- RLS: active dashboard users can read/create/update; owner/admin can delete.

## Notes
- The charts use Chart.js from jsDelivr.
- All displayed totals and tables are queried from Supabase; there are no hardcoded demo records.
- This is a dashboard foundation. It does not yet include event editing, guest lists, invitation designs, payment tracking, or file uploads.
- The SQL migration changes the `profiles.userlevel` check constraint to remove the old `client` dashboard role. Check for existing profile rows with `userlevel='client'` before running it. If any exist, reassign them first.
