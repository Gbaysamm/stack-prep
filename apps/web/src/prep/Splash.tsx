/**
 * What shows for the moment the app asks the API who is signed in. It takes the colour of the
 * page most likely to follow (paper for someone we have met on this device, ink for a newcomer),
 * so the hand-over is calm rather than a flash.
 */

import './auth.css';

export function Splash({ name }: { name: string | null }) {
  const first = name?.trim().split(/\s+/)[0];
  return (
    <div className="sj">
      <div className={`auth-splash ${first ? 'paper' : 'ink'}`} role="status" aria-live="polite">
        <div className="auth-splash-in">
          <img src="/brand/mark-96.png" alt="" width={48} height={48} />
          <span className="auth-splash-word">Stack Prep</span>
          <span className="auth-splash-line">{first ? `Welcome back, ${first}` : 'Getting things ready'}</span>
          <span className="auth-splash-bar" aria-hidden="true">
            <span />
          </span>
        </div>
      </div>
    </div>
  );
}
