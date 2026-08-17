# CampusConnect

A hackathon-ready Student Community Platform using:
- HTML / CSS / JavaScript
- Supabase Auth + Postgres + Storage + RLS
- GSAP + ScrollTrigger
- CRUD for posts, events, study profiles and polls
- Admin dashboard
- Notifications
- Responsive UI

## Fast setup

1. Open Supabase and create a new project.
2. Open SQL Editor and run `supabase.sql`.
3. In `app.js`, paste:
   - Supabase Project URL
   - Supabase anon/public key
4. Open `index.html` with Live Server.
5. Sign up.
6. If you need admin access, run the final commented SQL line in `supabase.sql` with your email.
7. Login again. Admin Panel will appear.

## Demo flow for presentation

Login → Dashboard → Create post → Like/comment → Events → Join event → Study Partners → Poll → Notifications → Admin Panel.

## Important

The app is intentionally written in straightforward JavaScript with normal functions and variable names so you can explain it in a presentation. The database and RLS rules are in one SQL file.
