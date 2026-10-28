/**
 * Premium in the student app: where the student stands, and the prompt shown when a free limit
 * is reached.
 *
 * Any call that comes back 402 (lib/friendlyError PREMIUM_NEEDED) opens the prompt with the
 * server's own sentence, so every page that can hit a limit gets it without code of its own.
 * `usePremium().voice` says whether the lesson's voice and the coach are open: the board's
 * written working is free, the voice and coach are Premium once the limits are on.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { PREMIUM_NEEDED } from '../lib/friendlyError.js';
import { PREMIUM_CHANGED, billingApi, type Standing } from './billingApi.js';
import { IconArrowRight, IconSparkles } from './icons.js';
import { useIdentity } from './store.js';
import { Button, Dialog } from './ui.js';

interface Premium {
  /** Null until loaded, and for nobody signed in. */
  standing: Standing | null;
  /** The lesson's voice. True until known otherwise, so nothing flickers off. */
  voice: boolean;
  /** Asking the coach. */
  coach: boolean;
  reload: () => void;
}

const PremiumContext = createContext<Premium>({ standing: null, voice: true, coach: true, reload: () => undefined });

export const usePremium = () => useContext(PremiumContext);

/** Free and limited: the limits are on and this student has no Premium. */
export const isLimited = (standing: Standing | null) =>
  Boolean(standing && standing.limits_on && !standing.premium);

export function PremiumProvider({ children }: { children: ReactNode }) {
  const { identity } = useIdentity();
  const studentId = identity?.studentId ?? null;
  const [standing, setStanding] = useState<Standing | null>(null);
  const [needed, setNeeded] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!studentId) {
      setStanding(null);
      return;
    }
    billingApi
      .standing(studentId)
      .then(setStanding)
      .catch(() => undefined); // a blip: pages carry on, the server still enforces
  }, [studentId]);

  useEffect(reload, [reload]);
  useEffect(() => {
    window.addEventListener(PREMIUM_CHANGED, reload);
    return () => window.removeEventListener(PREMIUM_CHANGED, reload);
  }, [reload]);
  useEffect(() => {
    const onNeeded = (event: Event) => {
      setNeeded((event as CustomEvent<string>).detail || 'This is part of Premium.');
      reload();
    };
    window.addEventListener(PREMIUM_NEEDED, onNeeded);
    return () => window.removeEventListener(PREMIUM_NEEDED, onNeeded);
  }, [reload]);

  return (
    <PremiumContext.Provider
      value={{
        standing,
        voice: standing ? standing.allowance.voice : true,
        coach: standing ? standing.allowance.coach_per_day !== 0 : true,
        reload,
      }}
    >
      {children}
      <UpgradeDialog message={needed} onClose={() => setNeeded(null)} />
    </PremiumContext.Provider>
  );
}

/** Where the board's ask box would be, for a free account: the working is all there to read. */
export function VoiceLocked() {
  return (
    <>
      <span>Ask the coach about any step you don't follow with a plan.</span>
      <Button size="sm" to="/plans" icon={<IconSparkles size={16} />}>
        See the plans
      </Button>
    </>
  );
}

function UpgradeDialog({ message, onClose }: { message: string | null; onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <Dialog
      open={message !== null}
      onClose={onClose}
      icon={<IconSparkles size={24} />}
      title="Choose a plan"
      actions={
        <>
          <Button tone="ghost" onClick={onClose}>
            Not now
          </Button>
          <Button
            trailing={<IconArrowRight size={18} />}
            onClick={() => {
              onClose();
              navigate('/plans');
            }}
          >
            See the plans
          </Button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{message}</p>
      <p style={{ margin: '10px 0 0' }}>
        A plan gives you more practice and mocks, lessons explained aloud, and a coach to ask. The higher the
        plan, the more you get.
      </p>
    </Dialog>
  );
}
