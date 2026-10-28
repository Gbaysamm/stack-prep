/**
 * The question bank as the public site describes it, counted live by the API
 * (apps/api/src/app/routers/site.py), and the plans on sale (billing.py). The site names the
 * subjects but never says how many questions each has: only the rounded total.
 */
import { useEffect, useState } from 'react';

import { request } from '../lib/friendlyError.js';
import { billingApi, type Catalogue } from '../prep/billingApi.js';

export interface SiteSubject {
  name: string;
  first_year: number | null;
  last_year: number | null;
}

export interface Site {
  subjects: SiteSubject[];
  /** Rounded down to the thousand, so "5,000+" stays true as the bank grows. */
  questions_at_least: number;
  worked_percent: number;
}

export function useSite(): Site | null {
  const [site, setSite] = useState<Site | null>(null);
  useEffect(() => {
    request<Site>('/v1/app/site')
      .then(setSite)
      .catch(() => undefined);
  }, []);
  return site;
}

export function useCatalogue(): { catalogue: Catalogue | null; failed: boolean } {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    billingApi
      .plans()
      .then(setCatalogue)
      .catch(() => setFailed(true));
  }, []);
  return { catalogue, failed };
}

/** "5,000+" from the rounded total; "Thousands of" before it has loaded. */
export const questionsWord = (site: Site | null) =>
  site && site.questions_at_least > 0 ? `${site.questions_at_least.toLocaleString('en-NG')}+` : 'Thousands of';

export const yearsOf = (s: SiteSubject) =>
  s.first_year && s.last_year ? (s.first_year === s.last_year ? `${s.first_year}` : `${s.first_year} to ${s.last_year}`) : '';
