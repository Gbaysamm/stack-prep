# Flexible plans and discounts, a fuller admin dashboard, and the public site (28 October 2026)

The founder's follow-up after seeing phases 6 and 7 locally. Each part is its own commit with a
worklog entry, checked at 390 and 1440, and pushed only on his "push".

## What the founder asked for

- **Plans by benefit, not by month.** A higher plan gives more. The length (1 month, 3 months,
  exam season) is a separate choice that applies to any plan. The admin decides what each plan
  includes: switch a feature on or off for a plan, set its amounts, create a plan with whatever
  it should offer.
- **Give a plan to a student** at a discount, at 100% off, or for a set period.
- **The plans page:** no half-empty row of cards; no separate "everything is open" card (say it
  in the hero if at all).
- **A much fuller admin dashboard.** A reference dashboard was shared for its functions, not its
  text: the dashboard should have everything needed to run the app.
- **Public pages:** home (landing), about, and the others a product site needs.

## A. Flexible plans and discounts

- Every plan, Free included, is a row the admin edits. Features, each enforced by the API:
  practice questions a day; mocks per day, week, month or in total; lessons explained aloud;
  questions to the coach a day; custom runs (choosing topics and years); revising bookmarks as
  a run. Plus free-text selling points, shown on the plan's card and not enforced.
- Plans have a rank (their order). A student with two running plans gets the higher plan's
  allowance. More time on the same plan follows on from the time they have.
- Lengths (label, days) are their own list; each plan has a price per length.
- Discounts: a **promo code** (percent off, optionally only for one plan or length, a usage
  cap, start and expiry) entered at checkout; a **personal offer** for one student, shown on
  their plans page; **100% off** grants the plan without Paystack. Gifts of a plan for N days
  stay.
- `/plans`: status in the hero; a length switch; the plans side by side across the full width,
  Free first, each with its features ticked or crossed; the featured plan marked.

## B. The admin dashboard

Built in this order, each a page in the admin sidebar, grouped:

1. **Main:** Dashboard: totals with links, quick actions, subjects at a glance, newest
   students, latest payments, open reports, and the system's status.
2. **People:** Students (done), Staff (done).
3. **Content:** Subjects & topics (questions and lessons per topic, gaps), Question bank
   (search every question, see its stats, open it for review), Question quality (most missed,
   most reported, lessons students said didn't help).
4. **Activity:** Mocks (every sitting, scores, integrity flags), Check-ups, Question reports
   (done), Support (messages students send from the app, answered here).
5. **Reports:** Analytics (done, the overview), Engagement (daily, weekly and monthly active,
   retention by week joined, streaks), Feature usage (practice, check-ups, mocks, lessons,
   coach, bookmarks), AI usage (coach questions and voice, with an estimated cost), Revenue
   (by plan, by month, by length, discounts given) and Payments (done).
6. **Communication:** Announcements: a banner or a pop-up after sign-in, to everyone or to a
   group (free, a plan, a class), with start and end dates.
7. **System:** Pricing & plans and Discounts (part A), System health (database, migrations,
   email, Paystack, voice, version), Audit log (every admin action: who, what, when), Settings
   (support email, sign-ups open, the coach on or off).

## C. The public site

Home (what Stack Prep does, how it works, subjects, plans, FAQ, sign-up), About, Pricing (the
live plans), FAQ, Contact (a form that reaches Support), Terms and Privacy. Signed-out visitors
see these; signed-in students go straight to their home.
