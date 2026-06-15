# shunliuzx_web

Personal website for shunliuzx.com.

Routes:

- `/`
- `/quotes/`
- `/schedule/`
- `/blog/`
- `/review/` admin only

`/status/` is deprecated and hidden from navigation.

Cloud data setup:

1. Create a Cloudflare D1 database named `shunliuzx_site`.
2. Apply `schema.sql` to the database.
3. In the Pages project, bind the D1 database as `SITE_DB`.
4. Add environment variables:
   - `ADMIN_PASSWORD`
   - `SESSION_SECRET`
5. Redeploy the Pages project.

If the database already exists, run the `review_subjects` and `review_days`
statements from `schema.sql` to enable the review planner.
