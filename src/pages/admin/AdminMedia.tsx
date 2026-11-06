import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../lib/useQuery';
import { check, errMsg, unwrap } from '../../lib/util';
import type { MediaUsageInfo } from '../../lib/types';
import { ErrorNotice, Loading, PageHeader } from '../../components/ui';
import MediaLibraryPanel from '../../components/media/MediaLibraryPanel';

const MB = 1048576;
const ALL = ['design', 'announcement', 'personnel', 'document', 'event'] as const;
const UPLOAD = ['design', 'announcement', 'personnel', 'event'] as const;

function Limits() {
  const q = useQuery(async () => unwrap<MediaUsageInfo>(await supabase.rpc('media_storage_usage')), []);
  const [v, setV] = useState({ img: '', doc: '', total: '', user: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const s = q.data?.settings;
    if (s) setV({ img: String(s.max_image_bytes / MB), doc: String(s.max_document_bytes / MB), total: String(s.quota_total_bytes / MB), user: String(s.quota_per_user_bytes / MB) });
  }, [q.data]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const img = Number(v.img), doc = Number(v.doc), total = Number(v.total), user = Number(v.user);
    setMsg(null);
    if (!(img >= 0.1 && img <= 25)) return setMsg({ ok: false, text: 'Image limit must be between 0.1 and 25 MB.' });
    if (!(doc >= 0.1 && doc <= 50)) return setMsg({ ok: false, text: 'Document limit must be between 0.1 and 50 MB.' });
    if (!(total >= 10)) return setMsg({ ok: false, text: 'Total quota must be at least 10 MB.' });
    if (!(user >= 1)) return setMsg({ ok: false, text: 'Per-user quota must be at least 1 MB.' });
    setBusy(true);
    try {
      check(await supabase.rpc('set_media_settings', { p_max_image: Math.round(img * MB), p_max_doc: Math.round(doc * MB), p_quota_total: Math.round(total * MB), p_quota_user: Math.round(user * MB) }));
      setMsg({ ok: true, text: 'Limits saved.' });
      q.reload();
    } catch (err) { setMsg({ ok: false, text: errMsg(err) }); } finally { setBusy(false); }
  }
  const f = (id: string, label: string, key: keyof typeof v, hint: string) => (
    <div><label className="label" htmlFor={id}>{label}</label>
      <input id={id} type="number" step="0.1" className="input" value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} /><p className="hint">{hint}</p></div>
  );
  return (
    <section className="card mt-8" aria-labelledby="lim-h">
      <h2 id="lim-h" className="text-lg font-bold">Upload limits and quotas</h2>
      <p className="mt-1 text-sm text-muted">Values are in megabytes. Your Supabase plan has its own storage limits that always apply on top of these.</p>
      {q.loading && <Loading />}
      {q.error && <ErrorNotice message={q.error} onRetry={q.reload} />}
      {q.data && (
        <form onSubmit={save} noValidate className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {f('lim-img', 'Largest image (MB)', 'img', '0.1 to 25')}
            {f('lim-doc', 'Largest document (MB)', 'doc', '0.1 to 50')}
            {f('lim-total', 'Total site storage (MB)', 'total', 'At least 10')}
            {f('lim-user', 'Per-user storage (MB)', 'user', 'At least 1. Administrators are exempt.')}
          </div>
          {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-sm text-[#1F6030]' : 'field-error'}>{msg.text}</p>}
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save limits'}</button>
        </form>
      )}
    </section>
  );
}

export default function AdminMedia() {
  return (
    <>
      <PageHeader title="Media & storage" intro="All uploaded images and their use. Files used by published or draft content cannot be deleted until they are replaced there." />
      <MediaLibraryPanel purposes={[...ALL]} canUpload={[...UPLOAD]} />
      <Limits />
    </>
  );
}
