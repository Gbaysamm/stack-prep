/**
 * The help button, bottom right on every page (founder, 17 Nov 2026): a tap opens a popup to
 * write to the team at once, wherever the student is. Sending opens the conversation; the
 * student's earlier ones are a tap away on Messages. Not shown on Messages itself.
 */

import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { IconArrowRight, IconMail } from './icons.js';
import { WriteForm } from './pages/Support.js';
import { Dialog, useToast } from './ui.js';
import './HelpFab.css';

export function HelpFab() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const { pathname } = useLocation();
  if (pathname.startsWith('/messages') || pathname.startsWith('/help/messages')) return null;

  return (
    <>
      <button type="button" className="hf-btn" onClick={() => setOpen(true)} aria-label="Write to us" title="Write to us">
        <IconMail size={22} />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} icon={<IconMail size={24} />} title="Write to us">
        <p className="hf-lede">A person at Stack Prep reads every message and replies, usually within a day.</p>
        <WriteForm
          compact
          onSent={(id) => {
            setOpen(false);
            toast('Sent. We will reply in Messages.');
            navigate(`/messages/${id}`);
          }}
        />
        <button
          type="button"
          className="hf-all"
          onClick={() => {
            setOpen(false);
            navigate('/messages');
          }}
        >
          See your conversations <IconArrowRight size={14} />
        </button>
      </Dialog>
    </>
  );
}
