/**
 * The app's icons: one outline family (24-unit grid, 1.9 stroke, round caps), drawn inline so
 * they take the text colour and cost no requests. Decorative unless given a `label`.
 */

import type { ReactNode, SVGProps } from 'react';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number; label?: string };

function make(paths: ReactNode) {
  return function Icon({ size = 20, label, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={label ? undefined : true}
        role={label ? 'img' : undefined}
        aria-label={label}
        {...rest}
      >
        {paths}
      </svg>
    );
  };
}

export const IconHome = make(
  <>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
  </>,
);
export const IconBolt = make(<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />);
export const IconTarget = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
  </>,
);
export const IconChart = make(
  <>
    <path d="M4 20V10" />
    <path d="M10 20V4" />
    <path d="M16 20v-7" />
    <path d="M22 20H2" />
  </>,
);
export const IconUser = make(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>,
);
export const IconBook = make(
  <>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" />
    <path d="M4 19a2 2 0 0 1 2-2h13" />
  </>,
);
export const IconArrowRight = make(
  <>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </>,
);
export const IconArrowLeft = make(
  <>
    <path d="M19 12H5" />
    <path d="m11 18-6-6 6-6" />
  </>,
);
export const IconArrowUp = make(
  <>
    <path d="M12 19V5" />
    <path d="m6 11 6-6 6 6" />
  </>,
);
export const IconChevronRight = make(<path d="m9 6 6 6-6 6" />);
export const IconChevronLeft = make(<path d="m15 6-6 6 6 6" />);
export const IconChevronDown = make(<path d="m6 9 6 6 6-6" />);
export const IconClose = make(
  <>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </>,
);
export const IconCheck = make(<path d="m5 12.5 4.5 4.5L19 7" />);
export const IconClock = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);
export const IconFlame = make(
  <path d="M12 22c4 0 7-2.8 7-7 0-3.5-2.2-5.7-4-7.5-.3 2-1.3 3.3-2.7 3.8C12.9 8 12 5 9.5 2.5 9.8 6.6 5 9.3 5 15c0 4.2 3 7 7 7Z" />,
);
export const IconSparkles = make(
  <>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    <path d="m6.3 6.3 2.1 2.1M15.6 15.6l2.1 2.1M6.3 17.7l2.1-2.1M15.6 8.4l2.1-2.1" />
  </>,
);
export const IconSpark = make(
  <path d="M12 3c.5 4.6 2.4 6.5 7 7-4.6.5-6.5 2.4-7 7-.5-4.6-2.4-6.5-7-7 4.6-.5 6.5-2.4 7-7Z" />,
);
export const IconPlay = make(<path d="M7 4.5v15l12-7.5-12-7.5Z" />);
export const IconPause = make(
  <>
    <path d="M8 5v14" />
    <path d="M16 5v14" />
  </>,
);
export const IconReplay = make(
  <>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </>,
);
export const IconCalendar = make(
  <>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </>,
);
export const IconTrophy = make(
  <>
    <path d="M8 21h8M12 17v4" />
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
    <path d="M17 6h3a3 3 0 0 1-3 4M7 6H4a3 3 0 0 0 3 4" />
  </>,
);
export const IconLogout = make(
  <>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
    <path d="M10 17l-5-5 5-5M5 12h11" />
  </>,
);
export const IconLock = make(
  <>
    <rect x="4" y="10" width="16" height="11" rx="3" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </>,
);
export const IconSettings = make(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </>,
);
/** Pass fill="currentColor" for a kept bookmark. */
export const IconBookmark = make(<path d="M7 3.5h10a1 1 0 0 1 1 1V21l-6-4-6 4V4.5a1 1 0 0 1 1-1z" />);
export const IconFlag = make(
  <>
    <path d="M5 21V4" />
    <path d="M5 4h11l-2 4 2 4H5" />
  </>,
);
export const IconBulb = make(
  <>
    <path d="M9 18h6M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3Z" />
  </>,
);
export const IconSend = make(
  <>
    <path d="M4 12 20 4l-4 16-4-7-8-1Z" />
    <path d="m12 13 8-9" />
  </>,
);
export const IconMic = make(
  <>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </>,
);
export const IconHelp = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" />
    <circle cx="12" cy="17" r="0.6" fill="currentColor" />
  </>,
);
export const IconLayers = make(
  <>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </>,
);
export const IconBrain = make(
  <>
    <path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1Z" />
    <path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1" />
  </>,
);
export const IconMenu = make(
  <>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </>,
);
export const IconVolume = make(
  <>
    <path d="M4 9v6h4l5 4V5L8 9H4Z" />
    <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />
  </>,
);
export const IconSearch = make(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </>,
);
export const IconMail = make(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m4 7 8 6 8-6" />
  </>,
);
export const IconMegaphone = make(
  <>
    <path d="M4 10v4a1 1 0 0 0 1 1h3l8 4V5L8 9H5a1 1 0 0 0-1 1Z" />
    <path d="M8 15v3.5a1.5 1.5 0 0 0 3 0V16M19.5 9.5a3.5 3.5 0 0 1 0 5" />
  </>,
);
