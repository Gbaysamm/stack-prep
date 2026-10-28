/**
 * /faq: what people ask before they sign up, in groups, each answer written from what the app
 * does. The home page shows the first few. Students' own questions about their numbers are in
 * the app's Help & guides (prep/pages/Help.tsx).
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { IconArrowRight } from '../prep/icons.js';
import { Disclosure } from '../prep/pages/Disclosure.js';
import '../prep/pages/Help.css';
import { SiteShell, useSiteTitle } from './SiteShell.js';

export interface FaqItem {
  id: string;
  q: string;
  a: ReactNode;
}

export const SITE_FAQ: { id: string; title: string; items: FaqItem[] }[] = [
  {
    id: 'about',
    title: 'About Stack Prep',
    items: [
      {
        id: 'what',
        q: 'What is Stack Prep?',
        a: (
          <p>
            A way to prepare for the UTME. A short check-up shows your score in every topic and predicts your exam score;
            practice works on the topics holding you back; and when you miss a question twice, a coach teaches it to you
            step by step. When you’re ready, you sit a full mock exam.
          </p>
        ),
      },
      {
        id: 'real',
        q: 'Are these real past questions?',
        a: (
          <p>
            Yes. They come from real UTME papers, and each one shows its year. Where an old question was broken, say its
            diagram was missing, we rebuilt it on the same idea so it still teaches what the examiners were testing.
          </p>
        ),
      },
      {
        id: 'right',
        q: 'How do I know the answers are right?',
        a: (
          <p>
            Every question has a full worked solution, and people check each one before it goes live. If you still think
            something is wrong, flag it from the question in the app: a person reads every report and fixes the question for
            everyone.
          </p>
        ),
      },
      {
        id: 'who',
        q: 'Who is it for?',
        a: (
          <p>
            Anyone preparing for the UTME: SS3 students, SS1 and SS2 students starting early, and candidates who have
            finished school and are writing again.
          </p>
        ),
      },
    ],
  },
  {
    id: 'using',
    title: 'Using it',
    items: [
      {
        id: 'device',
        q: 'Do I need to install anything?',
        a: (
          <p>
            No. Stack Prep runs in the browser on your phone or computer. Sign in with your email or phone number and your
            progress follows you to any device.
          </p>
        ),
      },
      {
        id: 'score',
        q: 'How is my predicted score worked out?',
        a: (
          <p>
            From your latest check-up: the average of your topic scores, where a topic score is the share of its questions
            you got right with no help. A new check-up is due every 7 days, and that’s when the prediction moves. The app’s
            Help & guides explains every number with a worked example.
          </p>
        ),
      },
      {
        id: 'coach',
        q: 'Does the coach really talk?',
        a: (
          <p>
            Yes. On the board it explains each step out loud, and every word is also written on screen. You can ask it about
            any step, by typing or by speaking. Lessons out loud come with the plans that include them.
          </p>
        ),
      },
      {
        id: 'mock',
        q: 'What is a mock exam like?',
        a: (
          <p>
            Like the UTME: Use of English and three subjects, 180 questions in two hours, one question at a time. You can
            also make a shorter mock with fewer subjects. Afterwards you see your score and every answer explained.
          </p>
        ),
      },
    ],
  },
  {
    id: 'paying',
    title: 'Plans and paying',
    items: [
      {
        id: 'free',
        q: 'Is it free?',
        a: (
          <p>
            You can start free and keep using it free. Paid plans give you more each day, such as more practice, more mocks
            and lessons out loud. <Link to="/pricing">Pricing</Link> shows exactly what each plan gives.
          </p>
        ),
      },
      {
        id: 'pay',
        q: 'How do I pay?',
        a: (
          <p>
            Inside the app, under Plans. Payment goes through Paystack, so your card details go to them, never to us. Your
            plan starts as soon as the payment goes through.
          </p>
        ),
      },
      {
        id: 'renew',
        q: 'Will I be charged again automatically?',
        a: (
          <p>
            No. You pay once for a set length, such as a month or three months. Nothing is taken again; when it ends, you
            choose whether to buy more.
          </p>
        ),
      },
      {
        id: 'problem',
        q: 'Something went wrong with my payment. What do I do?',
        a: (
          <p>
            If money left your account but your plan didn’t start, or you were charged twice, write to us from Help & guides
            in the app, or through the <Link to="/contact">contact page</Link>. Tell us the date and the amount and we’ll
            sort it out.
          </p>
        ),
      },
    ],
  },
  {
    id: 'account',
    title: 'Your account',
    items: [
      {
        id: 'keep',
        q: 'What do you keep about me?',
        a: (
          <p>
            Your name, your email or phone number, what you tell us about your exam, and your answers, so we can work out
            your scores. We don’t sell it to anyone. <Link to="/privacy">Privacy</Link> has the details.
          </p>
        ),
      },
      {
        id: 'forgot',
        q: 'I forgot my password.',
        a: (
          <p>
            On the log-in page choose “Forgot password?”. If you signed up with an email address we send a code to it.
            If you signed up with a phone number, write to us and we’ll help you back in.
          </p>
        ),
      },
      {
        id: 'delete',
        q: 'Can I delete my account?',
        a: (
          <p>
            Yes. Write to us from the email or phone number on the account, and we’ll delete it and everything in it.
          </p>
        ),
      },
    ],
  },
];

export function FaqList({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <div className="hp-faq ps-faq">
      {items.map((item) => (
        <Disclosure
          key={item.id}
          as="h3"
          open={open.has(item.id)}
          onToggle={() => toggle(item.id)}
          summary={item.q}
          className="hp-faq-item"
        >
          {item.a}
        </Disclosure>
      ))}
    </div>
  );
}

export function FaqPage() {
  useSiteTitle('FAQ');
  return (
    <SiteShell>
      <section className="ps-page-head">
        <span className="ps-eyebrow">FAQ</span>
        <h1 className="sj-display">Questions people ask</h1>
        <p>Straight answers, written from how Stack Prep works.</p>
      </section>
      <div className="ps-faq-page">
        <nav className="ps-faq-index" aria-label="Topics">
          {SITE_FAQ.map((group) => (
            <a key={group.id} href={`#${group.id}`}>
              {group.title}
            </a>
          ))}
        </nav>
        <div className="ps-faq-groups">
          {SITE_FAQ.map((group) => (
            <section key={group.id} id={group.id} aria-labelledby={`${group.id}-h`}>
              <h2 id={`${group.id}-h`} className="sj-display">
                {group.title}
              </h2>
              <FaqList items={group.items} />
            </section>
          ))}
          <div className="ps-still">
            <p>
              <strong>Didn’t find your answer?</strong> A person reads every message.
            </p>
            <Link to="/contact" className="ps-textlink">
              Contact us <IconArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
