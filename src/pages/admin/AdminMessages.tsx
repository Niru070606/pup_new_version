import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../lib/useQuery';
import { check, formatDateTime, unwrap } from '../../lib/util';
import type { ContactMessage } from '../../lib/types';
import { ConfirmDialog, EmptyState, ErrorNotice, Loading, PageHeader, StatusBadge, type Pending } from '../../components/ui';

export default function AdminMessages() {
  const q = useQuery(async () => unwrap<ContactMessage[]>(await supabase.from('contact_messages').select('*').order('created_at', { ascending: false }).limit(100)), []);
  const [pending, setPending] = useState<Pending | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function toggle(m: ContactMessage) {
    setErr(null);
    try { check(await supabase.from('contact_messages').update({ is_read: !m.is_read }).eq('id', m.id)); q.reload(); }
    catch { setErr('Could not update the message.'); }
  }

  return (
    <>
      <PageHeader title="Contact messages" intro="Messages sent through the public contact form. Reply using the sender's email address." />
      {err && <div role="alert" className="alert alert-error mb-3">{err}</div>}
      {q.loading && <Loading />}
      {q.error && <ErrorNotice message={q.error} onRetry={q.reload} />}
      {q.data && q.data.length === 0 && <EmptyState title="No messages yet" />}
      <ul className="space-y-3">
        {q.data?.map((m) => (
          <li key={m.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-bold">{m.subject || '(No subject)'}</h2>
                <p className="text-xs text-muted">{m.name} · <a href={`mailto:${m.email}`}>{m.email}</a> · {formatDateTime(m.created_at)}</p>
              </div>
              <StatusBadge label={m.is_read ? 'Read' : 'Unread'} tone={m.is_read ? 'neutral' : 'warning'} />
            </div>
            <p className="prose-plain mt-3 text-sm">{m.message}</p>
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => toggle(m)}>{m.is_read ? 'Mark unread' : 'Mark read'}</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setPending({ title: 'Delete this message?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true, run: async () => check(await supabase.from('contact_messages').delete().eq('id', m.id)) })}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog pending={pending} onClose={() => setPending(null)} onDone={q.reload} />
    </>
  );
}
