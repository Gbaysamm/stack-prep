/**
 * The question bank as the public site describes it, counted live by the API
 * (apps/api/src/app/routers/site.py), and the plans on sale (billing.py).
 */
import { useEffect, useState } from 'react';

import { request } from '../lib/friendlyError.js';
import { billingApi, type Catalogue } from '../prep/billingApi.js';

export interface SiteSubject {
  name: string;
  questions: number;
  first_year: number | null;
  last_year: number | null;
}

export interface Site {
  subjects: SiteSubject[];
  questions: number;
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

/** 5137 → "5,100+": a count rounded down for a headline, so it stays true as it grows. */
export function roughly(n: number): string {
  if (n < 100) return String(n);
  const step = n < 1000 ? 50 : 100;
  return `${(Math.floor(n / step) * step).toLocaleString('en-NG')}+`;
}

export const yearsOf = (s: SiteSubject) =>
  s.first_year && s.last_year ? (s.first_year === s.last_year ? `${s.first_year}` : `${s.first_year} to ${s.last_year}`) : '';
