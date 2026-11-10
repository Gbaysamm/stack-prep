/**
 * The question writer's AI (routers/admin_ai.py): which provider and model the reviewers'
 * "Add with AI" uses, its API key, prices, and an optional monthly spending cap.
 *
 * The key is write-only: the server never sends it back, only its last four characters.
 * Checking a key lists the provider's models, which costs nothing.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { friendly, request } from '../lib/friendlyError.js';
import { Select } from '../lib/Select.js';
import { StaffPageHead } from '../staff/StaffShell.js';

type Provider = 'anthropic' | 'openai';

interface KnownModel {
  id: string;
  label: string;
  input_usd_per_million: number;
  output_usd_per_million: number;
  note: string;
}

interface WriterSettings {
  provider: Provider;
  model: string;
  key_set: boolean;
  key_hint: string | null;
  key_unreadable: boolean;
  input_usd_per_million: number;
  output_usd_per_million: number;
  monthly_cap_usd: number | null;
  spent_this_month_usd: number;
  runs_this_month: number;
  updated_at: string | null;
  updated_by_name: string | null;
  anthropic_models: KnownModel[];
}

interface KeyCheck {
  ok: boolean;
  message: string;
  models: string[];
}

const PATH = '/v1/admin/ai-writer';
const usd = (n: number) => `US$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PROVIDERS: { id: Provider; name: string; line: string }[] = [
  { id: 'anthropic', name: 'Anthropic', line: 'Claude models' },
  { id: 'openai', name: 'OpenAI', line: 'GPT models' },
];

export function AiWriterPage() {
  const [saved, setSaved] = useState<WriterSettings | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [model, setModel] = useState('');
  const [key, setKey] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [priceIn, setPriceIn] = useState('');
  const [priceOut, setPriceOut] = useState('');
  const [capped, setCapped] = useState(false);
  const [cap, setCap] = useState('');
  const [check, setCheck] = useState<KeyCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const adopt = (s: WriterSettings) => {
    setSaved(s);
    setProvider(s.provider);
    setModel(s.model);
    setPriceIn(String(s.input_usd_per_million));
    setPriceOut(String(s.output_usd_per_million));
    setCapped(s.monthly_cap_usd !== null);
    setCap(s.monthly_cap_usd === null ? '' : String(s.monthly_cap_usd));
    setKey('');
    setReplacing(false);
  };
  useEffect(() => {
    request<WriterSettings>(PATH)
      .then(adopt)
      .catch((error) => setProblem(friendly(error)));
  }, []);

  const known = saved?.anthropic_models ?? [];
  const switching = saved !== null && provider !== saved.provider;
  const keyField = !saved?.key_set || replacing || switching || saved.key_unreadable;

  const choose = (next: Provider) => {
    setProvider(next);
    setCheck(null);
    if (next === saved?.provider) {
      setModel(saved.model);
      setPriceIn(String(saved.input_usd_per_million));
      setPriceOut(String(saved.output_usd_per_million));
    } else if (next === 'anthropic' && known[0]) {
      pickKnown(known[0].id);
    } else {
      setModel('');
      setPriceIn('');
      setPriceOut('');
    }
  };
  const pickKnown = (id: string) => {
    setModel(id);
    const found = known.find((m) => m.id === id);
    if (found) {
      setPriceIn(String(found.input_usd_per_million));
      setPriceOut(String(found.output_usd_per_million));
    }
  };

  const runCheck = async () => {
    setChecking(true);
    setCheck(null);
    try {
      setCheck(
        await request<KeyCheck>(`${PATH}/check`, {
          method: 'POST',
          body: JSON.stringify({ provider, api_key: keyField ? key.trim() || null : null }),
        }),
      );
    } catch (error) {
      setCheck({ ok: false, message: friendly(error), models: [] });
    } finally {
      setChecking(false);
    }
  };

  const number = (text: string) => (text.trim() === '' ? NaN : Number(text));
  const valid =
    model.trim().length > 0 &&
    number(priceIn) >= 0 &&
    number(priceOut) >= 0 &&
    (!capped || number(cap) >= 0) &&
    (!switching || key.trim().length > 0 || !saved?.key_set);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const next = await request<WriterSettings>(PATH, {
        method: 'PUT',
        body: JSON.stringify({
          provider,
          model: model.trim(),
          api_key: keyField && key.trim() ? key.trim() : null,
          input_usd_per_million: number(priceIn),
          output_usd_per_million: number(priceOut),
          monthly_cap_usd: capped ? number(cap) : null,
        }),
      });
      adopt(next);
      setCheck(null);
      setNotice({ ok: true, text: 'Saved.' });
    } catch (error) {
      setNotice({ ok: false, text: friendly(error) });
    } finally {
      setBusy(false);
    }
  };

  const removeKey = async () => {
    if (!saved || !window.confirm('Remove the saved API key? "Add with AI" stops until a new one is saved.')) return;
    try {
      adopt(
        await request<WriterSettings>(PATH, {
          method: 'PUT',
          body: JSON.stringify({
            provider: saved.provider,
            model: saved.model,
            api_key: '',
            input_usd_per_million: saved.input_usd_per_million,
            output_usd_per_million: saved.output_usd_per_million,
            monthly_cap_usd: saved.monthly_cap_usd,
          }),
        }),
      );
      setNotice({ ok: true, text: 'The key is removed.' });
    } catch (error) {
      setNotice({ ok: false, text: friendly(error) });
    }
  };

  const openaiChoices = useMemo(
    () => (provider === 'openai' && check?.ok ? check.models : []),
    [provider, check],
  );
  const spent = saved?.spent_this_month_usd ?? 0;
  const capNow = saved?.monthly_cap_usd ?? null;
  const share = capNow ? Math.min(spent / capNow, 1) : 0;

  return (
    <>
      <StaffPageHead
        title="AI for questions"
        sub="What the reviewers' “Add with AI” uses to read papers and draft questions. A reviewer still checks every draft before it goes live."
      />
      {problem && <p className="st-error">{problem}</p>}
      {!saved && !problem && <p className="st-muted">Loading…</p>}
      {saved && (
        <form onSubmit={save} className="ai-form">
          <section className="st-panel ai-month">
            <div>
              <span className="ai-label">Spent this month</span>
              <strong>{usd(spent)}</strong>
              <span className="st-muted">
                {saved.runs_this_month === 1 ? '1 run' : `${saved.runs_this_month.toLocaleString('en-NG')} runs`}
                {capNow !== null ? ` · cap ${usd(capNow)}` : ' · no cap'}
              </span>
            </div>
            {capNow !== null ? (
              <span className={`ai-bar${share >= 0.9 ? ' warn' : ''}`} aria-hidden="true">
                <i style={{ width: `${Math.round(share * 100)}%` }} />
              </span>
            ) : null}
          </section>

          <section className="st-panel">
            <h2>Provider and model</h2>
            <div className="ai-providers" role="radiogroup" aria-label="Provider">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={provider === p.id}
                  className={`ai-provider${provider === p.id ? ' on' : ''}`}
                  onClick={() => choose(p.id)}
                >
                  <strong>{p.name}</strong>
                  <span>{p.line}</span>
                </button>
              ))}
            </div>
            <div className="st-field">
              <span>Model</span>
              {provider === 'anthropic' ? (
                <Select
                  aria-label="Model"
                  value={known.some((m) => m.id === model) ? model : ''}
                  onChange={pickKnown}
                  placeholder="Choose a model"
                  options={known.map((m) => ({
                    value: m.id,
                    label: m.label,
                    hint: `US$${m.input_usd_per_million} in · US$${m.output_usd_per_million} out per million tokens. ${m.note}`,
                  }))}
                />
              ) : openaiChoices.length ? (
                <Select
                  aria-label="Model"
                  value={openaiChoices.includes(model) ? model : ''}
                  onChange={setModel}
                  placeholder="Choose a model"
                  searchable
                  options={openaiChoices.map((id) => ({ value: id, label: id }))}
                />
              ) : (
                <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="The model's name" />
              )}
              {provider === 'openai' ? (
                <small className="st-muted">Check the key below to choose from the models it can use.</small>
              ) : null}
            </div>
            <div className="ai-prices">
              <label className="st-field">
                <span>Input price</span>
                <span className="ai-money">
                  <i>US$</i>
                  <input inputMode="decimal" value={priceIn} onChange={(e) => setPriceIn(e.target.value)} placeholder="0.00" />
                </span>
                <small className="st-muted">per million tokens</small>
              </label>
              <label className="st-field">
                <span>Output price</span>
                <span className="ai-money">
                  <i>US$</i>
                  <input inputMode="decimal" value={priceOut} onChange={(e) => setPriceOut(e.target.value)} placeholder="0.00" />
                </span>
                <small className="st-muted">per million tokens</small>
              </label>
            </div>
            {provider === 'openai' ? (
              <p className="st-muted ai-tip">Enter the model's prices from OpenAI's price list, so each run's cost can be shown before it starts.</p>
            ) : null}
          </section>

          <section className="st-panel">
            <h2>API key</h2>
            {saved.key_unreadable ? (
              <p className="st-error">The saved key can no longer be read on this server. Enter it again.</p>
            ) : null}
            {!keyField ? (
              <div className="ai-keyline">
                <span>
                  A key ending <code>{saved.key_hint}</code> is saved.
                </span>
                <span className="ai-keyline-actions">
                  <button type="button" className="sj-btn ghost sm" onClick={() => void runCheck()} disabled={checking}>
                    {checking ? 'Checking…' : 'Check it'}
                  </button>
                  <button type="button" className="sj-btn ghost sm" onClick={() => setReplacing(true)}>
                    Replace
                  </button>
                  <button type="button" className="sj-btn ghost sm ai-danger" onClick={() => void removeKey()}>
                    Remove
                  </button>
                </span>
              </div>
            ) : (
              <div className="st-field">
                <span>{switching ? `Your ${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} key` : 'Paste the key'}</span>
                <div className="ai-keyrow">
                  <input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={key}
                    onChange={(e) => {
                      setKey(e.target.value);
                      setCheck(null);
                    }}
                    placeholder={provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
                  />
                  <button
                    type="button"
                    className="sj-btn ghost"
                    onClick={() => void runCheck()}
                    disabled={checking || key.trim().length < 20}
                  >
                    {checking ? 'Checking…' : 'Check'}
                  </button>
                </div>
                <small className="st-muted">
                  Stored encrypted and never shown again. Checking is free: it only asks the provider which models the key can use.
                </small>
              </div>
            )}
            {check ? <p className={check.ok ? 'st-pill good ai-check' : 'st-error'}>{check.message}</p> : null}
          </section>

          <section className="st-panel">
            <h2>Monthly spending cap</h2>
            <label className="ai-toggle">
              <input type="checkbox" checked={capped} onChange={(e) => setCapped(e.target.checked)} />
              <span>Stop runs once a month's spend reaches a limit</span>
            </label>
            {capped ? (
              <label className="st-field ai-cap">
                <span>Limit each month</span>
                <span className="ai-money">
                  <i>US$</i>
                  <input inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="50.00" />
                </span>
                <small className="st-muted">A run that would go past it is refused, with the cost shown first. The month starts on the 1st, Lagos time.</small>
              </label>
            ) : (
              <p className="st-muted ai-tip">No cap: every run still shows its cost before it starts.</p>
            )}
          </section>

          <div className="ai-save">
            {notice ? <p className={notice.ok ? 'st-pill good' : 'st-error'}>{notice.text}</p> : null}
            <button type="submit" className="sj-btn" disabled={!valid || busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
          {saved.updated_by_name && saved.updated_at ? (
            <p className="st-muted ai-tip">
              Last changed by {saved.updated_by_name} on{' '}
              {new Date(saved.updated_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}.
            </p>
          ) : null}
        </form>
      )}
    </>
  );
}
