# Notifications: what is still to do

Written 18 Nov 2026. The notifications are built (in-app, email, parents, push); this is what
they still need before they reach anyone, and what was left for later.

## Settings each server needs (in `.env.local`, then restart the api and the worker)

Nothing is emailed or pushed until these are set. Without them the app still works: the bell,
the Notifications page and parent links all run; emails are only logged.

| Setting | What it is | Where it comes from |
|---|---|---|
| `SMTP_HOST` | The mail server that sends our email | The email provider (e.g. Zoho, Google Workspace, Mailgun, Brevo) |
| `SMTP_PORT` | Usually `587` (or `465` with `SMTP_SSL=true`) | The email provider |
| `SMTP_USER`, `SMTP_PASSWORD` | The sending account | The email provider |
| `MAIL_FROM` | Who emails come from; default `Stack Prep <no-reply@stackjunior.com>` | Our choice; the domain must allow the provider (SPF and DKIM records) |
| `PUBLIC_URL` | The student app's address, for every link and the logo in emails | `https://stackprep.binaax.app` on the review server; the Stack Junior address on the other |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | The key pair for phone push | Made on each server: `docker compose exec api python -m app.cli vapid-keys`, which prints both lines to paste |
| `VAPID_SUBJECT` | Optional; who push services can contact; default `mailto:support@stackjunior.com` | Our choice |

Checks once set:
- Admin dashboard → System health: the Email line should say it is sending.
- Sign up a test account: the welcome email arrives within a minute.
- On an Android phone in Chrome: bell → Turn on → a test notification arrives at the next
  reminder.

## Email deliverability (with the email provider)

- SPF and DKIM records for the sending domain, or Gmail will put our email in spam.
- A DMARC record (`p=none` to start) once SPF and DKIM pass.

## Left for later

- **Delete my account**: students cannot delete their account yet (admins can only pause one).
  Needs a page, a goodbye email, and a decision on what happens to their data. On the tracker.
- **Parents by WhatsApp or SMS**: email only for now; WhatsApp and SMS cost per message.
- **Changing a confirmed parent**: goes through us (Messages); there is no admin screen for it
  yet.
- **Topic mastered** and **score up** rewards: part of gamification.
- **Review of the email designs**: every email is at `/dev/emails` on a local setup.
