/**
 * /terms and /privacy, in plain words. What they say about data is what the code does: the
 * account and profile (migrations 007, 032), answers and coach turns, voice transcribed and the
 * recording dropped (routers/practice.py), cards handled by Paystack (billing.py), a 30-day
 * sign-in cookie (auth.py), no analytics or advertising scripts (index.html). A lawyer should
 * read both before launch; change the date when either changes.
 */
import { Link } from 'react-router-dom';

import { SiteHero, SiteShell, useSiteSettings, useSiteTitle } from './SiteShell.js';

const UPDATED = '28 October 2026';

interface Part {
  id: string;
  title: string;
  body: React.ReactNode;
}

function LegalPage({ title, intro, parts }: { title: string; intro: React.ReactNode; parts: Part[] }) {
  return (
    <SiteShell hero={<SiteHero eyebrow="The small print" title={title} sub={`Last updated ${UPDATED}. In plain words, written from what the app does.`} />}>
      <div className="ps-legal first">
        <nav className="ps-faq-index" aria-label="On this page">
          {parts.map((part) => (
            <a key={part.id} href={`#${part.id}`}>
              {part.title}
            </a>
          ))}
        </nav>
        <article className="ps-card ps-legal-body">
          <div className="ps-legal-intro">{intro}</div>
          {parts.map((part, index) => (
            <section key={part.id} id={part.id}>
              <h2 className="sj-display">
                {index + 1}. {part.title}
              </h2>
              {part.body}
            </section>
          ))}
        </article>
      </div>
    </SiteShell>
  );
}

function Reach() {
  const settings = useSiteSettings();
  return (
    <>
      through the <Link to="/contact">contact page</Link>
      {settings?.support_email ? (
        <>
          , or by email at <a href={`mailto:${settings.support_email}`}>{settings.support_email}</a>
        </>
      ) : null}
    </>
  );
}

export function TermsPage() {
  useSiteTitle('Terms of use');
  return (
    <LegalPage
      title="Terms of use"
      intro={
        <p>
          These terms are the agreement between you and StackJunior, who make Stack Prep. By creating an account or using
          Stack Prep you agree to them. If you are under 18, please read them with a parent or guardian.
        </p>
      }
      parts={[
        {
          id: 'service',
          title: 'What Stack Prep is',
          body: (
            <p>
              Stack Prep helps you prepare for the UTME with past questions, check-ups, practice, lessons from a coach and
              mock exams. It helps you prepare; it can’t promise a particular score, and it isn’t connected to JAMB.
            </p>
          ),
        },
        {
          id: 'account',
          title: 'Your account',
          body: (
            <ul>
              <li>One account is for one person. Don’t share it or use someone else’s.</li>
              <li>Keep your password to yourself. You’re responsible for what happens on your account.</li>
              <li>Tell us the truth when you sign up, and keep your email or phone number up to date so we can reach you.</li>
            </ul>
          ),
        },
        {
          id: 'fair',
          title: 'Using it fairly',
          body: (
            <ul>
              <li>Don’t copy, sell or republish the questions, worked solutions or lessons, and don’t use tools to download them.</li>
              <li>Don’t try to break into, overload or get around the limits of the service.</li>
              <li>Be polite to the people who answer your messages.</li>
            </ul>
          ),
        },
        {
          id: 'content',
          title: 'The questions and the lessons',
          body: (
            <p>
              Past questions come from UTME papers. The worked solutions, lessons, explanations and the app itself are ours.
              We check every answer, and when a student reports a problem we look at it and fix the question for everyone.
              The coach explains the checked working; like any teacher it can phrase something badly, so if anything it says
              looks wrong, report it.
            </p>
          ),
        },
        {
          id: 'plans',
          title: 'Plans and payments',
          body: (
            <ul>
              <li>You can use Stack Prep free. Paid plans give you more, as shown on the Pricing page when you buy.</li>
              <li>Prices are in naira. You pay once for a set length; nothing renews by itself.</li>
              <li>Payments are handled by Paystack. We never see or keep your card details.</li>
              <li>
                Your plan starts when the payment goes through. If a payment goes wrong, for example you were charged but
                your plan didn’t start, write to us and we’ll put it right.
              </li>
              <li>We may change prices and plans for the future; a plan you have already bought keeps what you paid for until it ends.</li>
            </ul>
          ),
        },
        {
          id: 'ending',
          title: 'Ending',
          body: (
            <p>
              You can stop using Stack Prep at any time and ask us to delete your account. We may suspend or close an account
              that breaks these terms, and we’ll tell you why.
            </p>
          ),
        },
        {
          id: 'liability',
          title: 'Our responsibility',
          body: (
            <p>
              We work hard to keep Stack Prep running and correct, but we can’t promise it will never be unavailable or never
              contain a mistake. As far as the law allows, we aren’t responsible for losses that come from using it, beyond
              what you paid us in the last twelve months.
            </p>
          ),
        },
        {
          id: 'changes',
          title: 'Changes and the law',
          body: (
            <p>
              We may update these terms; when we make an important change we’ll tell you in the app. These terms are governed
              by the laws of the Federal Republic of Nigeria.
            </p>
          ),
        },
        {
          id: 'contact',
          title: 'Questions',
          body: (
            <p>
              Write to us <Reach />.
            </p>
          ),
        },
      ]}
    />
  );
}

export function PrivacyPage() {
  useSiteTitle('Privacy');
  return (
    <LegalPage
      title="Privacy"
      intro={
        <p>
          This explains what Stack Prep keeps about you, why, who else sees it, and what you can ask us to do with it. We
          follow the Nigeria Data Protection Act 2023. We don’t sell your information, and there’s no advertising in Stack
          Prep.
        </p>
      }
      parts={[
        {
          id: 'what',
          title: 'What we keep',
          body: (
            <ul>
              <li>
                <strong>Your account:</strong> your name, your email address or phone number, and your password, which we
                keep only in a scrambled form we can’t read.
              </li>
              <li>
                <strong>About your exam, if you tell us:</strong> your class, school and state, the university and course
                you’re aiming for, your target score, your exam date and your subjects.
              </li>
              <li>
                <strong>Your work:</strong> every answer you give and when, your check-ups, practice runs and mocks, what
                you tell us after a lesson, your bookmarks, the questions you ask the coach, and any question you report.
              </li>
              <li>
                <strong>Messages</strong> you send us, and our replies.
              </li>
              <li>
                <strong>Payments:</strong> the plan, the amount, the date and Paystack’s reference. Not your card details.
              </li>
            </ul>
          ),
        },
        {
          id: 'why',
          title: 'Why we keep it',
          body: (
            <ul>
              <li>To run your account and keep you signed in.</li>
              <li>To work out your scores, choose your next questions and show your progress. This is the service itself.</li>
              <li>To answer your messages and fix questions you report.</li>
              <li>To take payments and start your plan.</li>
              <li>To see, in totals, how Stack Prep is used, so we can make it better.</li>
            </ul>
          ),
        },
        {
          id: 'voice',
          title: 'Your voice',
          body: (
            <p>
              If you speak to the coach, the recording is turned into words and then thrown away; we never store it. We keep
              the words, the same as if you had typed them.
            </p>
          ),
        },
        {
          id: 'who',
          title: 'Who else sees it',
          body: (
            <ul>
              <li>
                <strong>Our team</strong>, only as far as their work needs: for example, the person answering your message,
                or a reviewer reading a question you reported.
              </li>
              <li>
                <strong>OpenAI</strong>, which powers the coach: it receives the question you’re on and what you ask, to
                write the answer, and turns spoken words into text and text into speech. It doesn’t receive your name or
                contact details.
              </li>
              <li>
                <strong>Paystack</strong>, which takes payments: it receives your email address and the amount.
              </li>
              <li>
                <strong>Our email and hosting providers</strong>, to send password codes and replies, and to run the service.
              </li>
              <li>Anyone the law requires us to tell.</li>
            </ul>
          ),
        },
        {
          id: 'cookies',
          title: 'Cookies and your device',
          body: (
            <p>
              We use one cookie, to keep you signed in for up to 30 days. Your browser also remembers a few settings, such as
              which subject you last chose. There are no advertising or tracking cookies.
            </p>
          ),
        },
        {
          id: 'young',
          title: 'If you’re under 18',
          body: (
            <p>
              Many of our students are under 18. If you are, a parent or guardian should know you’re using Stack Prep and
              agree to it. A parent or guardian can write to us at any time to see or delete their child’s information.
            </p>
          ),
        },
        {
          id: 'rights',
          title: 'What you can ask us',
          body: (
            <ul>
              <li>To see what we keep about you, or have a copy of it.</li>
              <li>To correct anything that’s wrong. You can change most of it yourself in Profile and Settings.</li>
              <li>To delete your account and everything in it.</li>
              <li>To stop using your information for anything beyond running your account.</li>
            </ul>
          ),
        },
        {
          id: 'how-long',
          title: 'How long we keep it',
          body: (
            <p>
              For as long as you have an account. When you ask us to delete it, we delete your account and your work. We
              keep payment records for as long as the law requires.
            </p>
          ),
        },
        {
          id: 'safe',
          title: 'Keeping it safe',
          body: (
            <p>
              Your connection to Stack Prep is encrypted, passwords are stored scrambled, and only the people who need it can
              see your information. If something ever went wrong, we would tell you and the authorities as the law requires.
            </p>
          ),
        },
        {
          id: 'contact',
          title: 'Questions and requests',
          body: (
            <p>
              Write to us <Reach />. If you aren’t happy with our answer, you can complain to the Nigeria Data Protection
              Commission.
            </p>
          ),
        },
      ]}
    />
  );
}
