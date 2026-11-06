import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Tone } from '../lib/types';
import { errMsg, revisionStatusInfo } from '../lib/util';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="py-12 text-center text-sm text-muted">
      {label}
    </div>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="alert alert-error flex flex-wrap items-center justify-between gap-3">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-gray-400 bg-surface p-8 text-center">
      <p className="font-serif text-lg text-maroon-strong">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

/** Shown wherever institutional content has not been supplied yet. Never fabricated. */
export function Placeholder({ what }: { what?: string }) {
  return (
    <p className="rounded border border-dashed border-gray-400 bg-surface px-3 py-2 text-sm italic text-muted">
      {what ? `${what}: ` : ''}not yet provided. A campus administrator can add this in the dashboard.
    </p>
  );
}

export function ContentBlock({ value, what }: { value?: string; what?: string }) {
  return value ? <p className="prose-plain">{value}</p> : <Placeholder what={what} />;
}

export function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
  return <span className={`badge badge-${tone}`}>{label}</span>;
}

export function PageHeader({ title, intro, actions }: { title: string; intro?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {intro && <p className="mt-1 max-w-2xl text-sm text-muted">{intro}</p>}
      </div>
      {actions}
    </div>
  );
}

export type Pending = {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  requireReason?: boolean;
  reasonLabel?: string;
  run: (reason: string) => Promise<void>;
};

/** Confirmation step for consequential actions. Optional required reason. */
export function ConfirmDialog({ pending, onClose, onDone }: { pending: Pending | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pending) {
      setReason('');
      setErr(null);
      ref.current?.focus();
    }
  }, [pending]);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, busy, onClose]);

  if (!pending) return null;

  async function go() {
    if (!pending) return;
    if (pending.requireReason && !reason.trim()) {
      setErr('A reason is required.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await pending.run(reason.trim());
      onDone();
      onClose();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="dlg-title" className="w-full max-w-md rounded-md bg-white p-5 shadow-lg">
        <h2 id="dlg-title" className="text-lg font-bold">{pending.title}</h2>
        <p className="mt-2 text-sm">{pending.message}</p>
        {pending.requireReason && (
          <div className="mt-3">
            <label htmlFor="dlg-reason" className="label">{pending.reasonLabel ?? 'Reason'}</label>
            <textarea id="dlg-reason" className="input" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
        {err && <p role="alert" className="field-error">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={`btn ${pending.danger ? 'btn-danger' : 'btn-primary'}`} onClick={go} disabled={busy}>
            {busy ? 'Working…' : pending.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Revision / approval status chip used by designs, link versions and similar workflows. */
export function RevisionBadge({ status }: { status: import('../lib/types').RevisionStatus }) {
  const i = revisionStatusInfo(status);
  return <StatusBadge label={i.label} tone={i.tone} />;
}
