/**
 * /help/numbers — how every number in Stack Prep is worked out, one card per number.
 *
 * Each card leads with the answer in one plain sentence and a small worked picture, and keeps
 * the rest (the words the ⓘ shows, and anything more) behind "More detail". The words are
 * METRICS in HowItsWorkedOut.tsx, written from the code; this page only lays them out.
 *
 * Every card keeps its number's id as its anchor (#predicted, #range, …) because each ⓘ in the
 * app links to `/help/numbers#<id>`; arriving on one scrolls to that card and opens its detail.
 * The old /how-its-worked-out address redirects here with its hash.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';

import { IconArrowRight } from '../icons.js';
import { usePageTitle } from '../store.js';
import { Button, PageHero, cx } from '../ui.js';
import { Disclosure } from './Disclosure.js';
import { METRIC_GROUPS, METRICS, type MetricId } from './HowItsWorkedOut.js';
import { VIZ } from './NumbersViz.js';
import './Help.css';

const ALL_IDS = new Set<string>(Object.keys(METRICS));

function MetricCard({ id, open, onToggle, lit }: { id: MetricId; open: boolean; onToggle: () => void; lit: boolean }) {
  const metric = METRICS[id];
  const Viz = VIZ[id];
  return (
    <article id={id} className={cx('sj-card hn-card', lit && 'lit')} aria-labelledby={`${id}-title`} tabIndex={-1}>
      <div className="hn-card-text">
        <h3 id={`${id}-title`} className="hn-card-name">
          <a href={`#${id}`} className="hn-card-anchor">
            {metric.title}
          </a>
        </h3>
        <p className="hn-plain">{metric.plain}</p>
        <Disclosure
          open={open}
          onToggle={onToggle}
          summary={open ? 'Less detail' : 'More detail'}
          className="hn-more"
        >
          <p>{metric.short}</p>
          {metric.more?.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </Disclosure>
      </div>
      <figure className="hn-viz">
        <div className="nv" aria-hidden="true">
          <Viz />
        </div>
        <figcaption>
          <span className="sj-mono">For example</span>
          {metric.example}
        </figcaption>
      </figure>
    </article>
  );
}

export function HelpNumbers() {
  usePageTitle('How your numbers are worked out');
  const location = useLocation();
  const [open, setOpen] = useState<Set<MetricId>>(() => new Set());
  const [lit, setLit] = useState<string | null>(null);
  const [active, setActive] = useState<string>(METRIC_GROUPS[0]!.id);

  const toggle = useCallback((id: MetricId) => {
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Arriving from an ⓘ (or a link on this page) lands on that card, with its detail open.
  useEffect(() => {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (!hash) return;
    if (ALL_IDS.has(hash)) {
      setOpen((was) => new Set(was).add(hash as MetricId));
      setLit(hash);
    }
    const timer = window.setTimeout(() => {
      const el = document.getElementById(hash);
      if (!el) return;
      el.scrollIntoView({ block: 'start' });
      if (ALL_IDS.has(hash)) el.focus({ preventScroll: true });
    }, 60);
    const unlit = window.setTimeout(() => setLit(null), 2600);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(unlit);
    };
  }, [location.hash, location.key]);

  // Which group is on screen, for the rail and the chips.
  useEffect(() => {
    const sections = METRIC_GROUPS.map((group) => document.getElementById(group.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (sections.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) seen.set(entry.target.id, entry.isIntersecting);
        const first = METRIC_GROUPS.find((group) => seen.get(group.id));
        if (first) setActive(first.id);
      },
      { rootMargin: '-140px 0px -55% 0px' },
    );
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="sj-page hn">
      <PageHero
        back={{ to: '/help', label: 'Help & guides' }}
        eyebrow="Help & guides"
        title="How your numbers are worked out"
        sub="Every score, count and label in Stack Prep, each in one sentence and a small worked example. Nothing is curved."
      />

      <nav className="hn-chips" aria-label="Groups of numbers">
        {METRIC_GROUPS.map((group) => (
          <a key={group.id} href={`#${group.id}`} className={cx('hn-chip', active === group.id && 'on')}>
            {group.label}
            <span className="sj-mono">{group.metrics.length}</span>
          </a>
        ))}
      </nav>

      <div className="hn-layout">
        <nav className="hn-rail" aria-label="Numbers on this page">
          {METRIC_GROUPS.map((group) => (
            <div key={group.id} className={cx('hn-rail-group', active === group.id && 'on')}>
              <a href={`#${group.id}`} className="hn-rail-head">
                {group.label}
              </a>
              <ul>
                {group.metrics.map((id) => (
                  <li key={id}>
                    <a href={`#${id}`}>{METRICS[id].title}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="hn-main">
          {METRIC_GROUPS.map((group) => (
            <section key={group.id} id={group.id} className="hn-group" aria-labelledby={`${group.id}-h`}>
              <header className="hx-sechead">
                <span className="sj-eyebrow">
                  {group.metrics.length} numbers
                </span>
                <h2 id={`${group.id}-h`} className="sj-display sj-h2">
                  {group.title}
                </h2>
                <p>{group.sub}</p>
              </header>
              <div className="hn-cards">
                {group.metrics.map((id) => (
                  <MetricCard key={id} id={id} open={open.has(id)} onToggle={() => toggle(id)} lit={lit === id} />
                ))}
              </div>
            </section>
          ))}

          <section className="hn-end" aria-labelledby="hn-end-title">
            <div>
              <h2 id="hn-end-title" className="sj-display sj-h3">
                Want your numbers to move?
              </h2>
              <p>Practice builds what you know. A fresh check-up is what updates your predicted score.</p>
            </div>
            <div className="hn-end-actions">
              <Button to="/practice" tone="lime" trailing={<IconArrowRight size={18} />}>
                Practise now
              </Button>
              <Link className="hn-end-link" to="/checkup">
                Take a check-up <IconArrowRight size={14} />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/** /how-its-worked-out, the old address: every ⓘ link and bookmark lands on the same card. */
export function HowItsWorkedOutRedirect() {
  const location = useLocation();
  return <Navigate to={{ pathname: '/help/numbers', search: location.search, hash: location.hash }} replace />;
}
