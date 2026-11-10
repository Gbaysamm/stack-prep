/**
 * The question bank as the public site describes it, counted live by the API
 * (apps/api/src/app/routers/site.py), and the plans on sale (billing.py). The site names the
 * subjects and says "thousands of questions": no counts and no years, for the bank or any subject.
 */
import { useEffect, useState } from 'react';

import { request } from '../lib/friendlyError.js';
import { billingApi, type Catalogue } from '../prep/billingApi.js';

export interface SiteSubject {
  name: string;
}

export interface Site {
  subjects: SiteSubject[];
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
