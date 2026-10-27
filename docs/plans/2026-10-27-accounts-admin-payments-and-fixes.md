# Accounts, roles, admin dashboard, payments and the audit fixes (27 October 2026)

The founder's brief after the functionality audit, with his decisions. Built in phases; each phase
is its own commit with a worklog entry, checked at 390 and 1440, and pushed only on his "push".

## Decisions (founder, 27 Oct 2026)

- **Roles.** Three: student, reviewer, admin. An admin can use the admin dashboard, the reviewer
  dashboard and the student app. A reviewer can use only the reviewer dashboard. A student can use
  only the student app. Nobody is promoted by signing up: roles are granted by an admin.
- **Where things live.** The student app moves to the bare address (`/`). The reviewer dashboard
  is `/review`, the admin dashboard `/admin`. Old `/student/...` links redirect to `/...`.
- **Password reset: email only.** Phone-only students add an email in account settings to be able
  to recover; until then an admin resets them from the dashboard. Mail goes out over SMTP
  (any provider: Resend, Brevo, Zoho), configured on the server; locally the code is printed to
  the API log instead of sent.
- **Payments: Paystack.** Built against test mode; keys live on the server only.
- **Pricing: free basics, paid premium.** Free: check-ups, a daily allowance of practice
  questions, one full mock. Premium: unlimited practice, board lessons, unlimited mocks. Limits
  and prices are set by an admin, not in code.
- **Weekly check-up lock: unchanged.**
- **Mock scoring.** A skipped question counts as wrong: the score is right over questions set.
  A setting lets a student see results as a percentage or as a UTME aggregate out of 400, scaled
  to 400 whatever the number of subjects; the percentage is always shown beside the aggregate.

## Phases

1. **Roles and sign-in for staff.** Accounts gain a role; admin and reviewer sign in with the same
   sign-in as students and land on their dashboard. `/v1/review/*` needs a reviewer or admin
   session (the pick-a-name reviewer list goes); a new `/v1/admin/*` needs an admin. A command
   creates the first admin. Routes: `/` student app, `/review`, `/admin`.
2. **Student experience fixes.** Friendly error messages everywhere (no raw server text); an
   expired session sends the student to sign in and back to where they were; Mock in the phone's
   bottom bar; mocks counted in Progress and Profile.
3. **Mock scoring and the aggregate.** Skips count as wrong; the percentage / aggregate setting;
   an overall UTME target out of 400 beside the per-subject targets.
4. **Account settings, profile and recovery.** Change name, email, phone and password; forgot
   password by emailed code; profile adds school, state, class, target institution, course and
   UTME subject combination; onboarding asks for them.
5. **Report a question and bookmarks.** A "Report a problem" control on every question (practice,
   check-up review, mock review, lessons) that goes to the admin and reviewer queues; bookmark any
   question and revise bookmarks as a practice run.
6. **Payments.** Plans and prices set by admin; Paystack checkout; verified webhook; subscription
   state and receipts; the free allowance enforced on the API; a Plans page and upgrade prompts.
7. **Admin dashboard.** Overview with charts (sign-ups, active students, questions answered,
   mocks, revenue, subject popularity, score distribution); students list with search and filters
   and a full profile (details, goals, activity, scores, mocks, payments) with actions (reset
   password, change role, deactivate); question reports; payments and plans; reviewers and admins;
   content statistics.
8. **Reviewer dashboard redesign.** The queue, the decision screen and the reports tidied into the
   same design as the rest of the app.
