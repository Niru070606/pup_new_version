import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../lib/useQuery';
import { check, errMsg, formatDateTime, isSafeHref, moveItem, unwrap } from '../../lib/util';
import type { LinkEntryRow, LinkGroupRow, LinkIcon, LinkRevision } from '../../lib/types';
import { ConfirmDialog, EmptyState, ErrorNotice, Loading, PageHeader, RevisionBadge, StatusBadge, type Pending } from '../../components/ui';

const ICONS: LinkIcon[] = ['globe', 'document', 'people', 'book', 'mail', 'building', 'calendar', 'school', 'download', 'star'];
interface LinkForm { id?: string; group_id: string; title: string; url: string; description: string; icon: string; is_hidden: boolean }

/** Edits the DRAFT working copy of the links directory. Nothing here is public until an administrator approves a submission. */
export default function LinksEditor({ base }: { base: '/designer' | '/admin' }) {
  const q = useQuery(async () => {
    const groups = unwrap<LinkGroupRow[]>(await supabase.from('link_groups').select('*').order('display_order').order('title'));
    const links = unwrap<LinkEntryRow[]>(await supabase.from('link_entries').select('*').order('display_order').order('title'));
    const revs = unwrap<LinkRevision[]>(
      await supabase
        .from("link_revisions")
        .select(
          "id,version,author_id,status,submitted_at,reviewed_at,review_reason,approved_at,note,snapshot",
        )
        .order("submitted_at", { ascending: false })
        .limit(20),
    );
    const st = unwrap<{ live_revision_id: string | null }[]>(await supabase.from('site_links_state').select('live_revision_id'));
    return { groups, links, revs, live: st[0]?.live_revision_id ?? null };
  }, []);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [gForm, setGForm] = useState<{ id?: string; title: string; description: string; is_hidden: boolean } | null>(null);
  const [lForm, setLForm] = useState<LinkForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const groups = q.data?.groups ?? [];
  const linksOf = (gid: string) => (q.data?.links ?? []).filter((l) => l.group_id === gid);
  const latest = q.data?.revs[0] ?? null;
  const awaiting = latest?.status === 'pending';

  async function run(fn: () => Promise<void>, ok?: string) {
    setBusy(true); setError(null); setNotice(null);
    try { await fn(); if (ok) setNotice(ok); q.reload(); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }

  async function saveGroup(e: FormEvent) {
    e.preventDefault();
    if (!gForm) return;
    if (!gForm.title.trim()) { setError('Enter a group name.'); return; }
    const p = { title: gForm.title.trim(), description: gForm.description.trim() || null, is_hidden: gForm.is_hidden };
    await run(async () => {
      if (gForm.id) check(await supabase.from('link_groups').update(p).eq('id', gForm.id));
      else check(await supabase.from('link_groups').insert({ ...p, display_order: (groups[groups.length - 1]?.display_order ?? 0) + 10 }));
      setGForm(null);
    }, 'Group saved to your draft.');
  }

  async function saveLink(e: FormEvent) {
    e.preventDefault();
    if (!lForm) return;
    if (!lForm.title.trim()) { setError('Enter a link title.'); return; }
    if (!isSafeHref(lForm.url.trim())) { setError('The address must start with https://, http:// or mailto: and contain no spaces.'); return; }
    const p = { group_id: lForm.group_id, title: lForm.title.trim(), url: lForm.url.trim(), description: lForm.description.trim() || null, icon: lForm.icon || null, is_hidden: lForm.is_hidden };
    await run(async () => {
      if (lForm.id) check(await supabase.from('link_entries').update(p).eq('id', lForm.id));
      else check(await supabase.from('link_entries').insert({ ...p, display_order: (linksOf(lForm.group_id).slice(-1)[0]?.display_order ?? 0) + 10 }));
      setLForm(null);
    }, 'Link saved to your draft.');
  }

  async function reorderGroups(from: number, to: number) {
    const next = moveItem(groups, from, to);
    if (next === groups) return;
    await run(async () => { for (let i = 0; i < next.length; i++) if (next[i].display_order !== (i + 1) * 10) check(await supabase.from('link_groups').update({ display_order: (i + 1) * 10 }).eq('id', next[i].id)); });
  }
  async function reorderLinks(gid: string, from: number, to: number) {
    const list = linksOf(gid);
    const next = moveItem(list, from, to);
    if (next === list) return;
    await run(async () => { for (let i = 0; i < next.length; i++) if (next[i].display_order !== (i + 1) * 10) check(await supabase.from('link_entries').update({ display_order: (i + 1) * 10 }).eq('id', next[i].id)); });
  }

  const del = (kind: 'group' | 'link', id: string, name: string) => setPending({
    title: `Delete "${name}"?`, message: kind === 'group' ? 'The group and all its links are removed from your draft (the public site is not affected until you submit and it is approved).' : 'The link is removed from your draft.',
    confirmLabel: 'Delete', danger: true,
    run: async () => check(await supabase.from(kind === 'group' ? 'link_groups' : 'link_entries').delete().eq('id', id)),
  });

  const submit = () => setPending({
    title: 'Submit link changes for approval?', message: 'An administrator reviews a snapshot of your draft. Nothing changes publicly until it is approved.', confirmLabel: 'Submit for approval',
    run: async () => { check(await supabase.rpc('submit_link_changes', { p_note: note.trim() || null })); setNote(''); },
  });
  const restore = () => setPending({
    title: 'Discard your draft edits?', message: 'Your working copy is replaced by the currently live (approved) links directory.', confirmLabel: 'Restore from live', danger: true,
    run: async () => check(await supabase.rpc('restore_links_working_copy', { p_id: q.data!.live })),
  });

  return (
    <>
      <PageHeader title="Links directory (draft)" intro="Organize link groups and links. Changes stay private to designers and administrators until an administrator approves your submission."
        actions={<button type="button" className="btn btn-primary" disabled={busy} onClick={() => { setGForm({ title: '', description: '', is_hidden: false }); setError(null); }}>Add group</button>} />
      {error && <div role="alert" className="alert alert-error mb-4">{error}</div>}
      {notice && <div role="status" className="alert alert-success mb-4">{notice}</div>}

      <section className="card mb-6" aria-labelledby="le-status">
        <h2 id="le-status" className="text-lg font-bold">Approval status</h2>
        <p className="mt-1 text-sm">{q.data?.live ? 'An approved version of the links directory is live.' : 'No links directory has been approved yet, so visitors see none.'}</p>
        {latest && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">Latest submission: <RevisionBadge status={latest.status} /> <span className="text-muted">{formatDateTime(latest.submitted_at)}</span></p>
        )}
        {latest?.review_reason && latest.status !== 'approved' && <div className="alert alert-warning mt-2">Administrator’s note: {latest.review_reason}</div>}
        {awaiting && <p className="mt-2 text-sm text-muted">Your latest submission is awaiting review. Submitting again replaces it.</p>}
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div><label className="label" htmlFor="le-note">Note for the administrator (optional)</label><input id="le-note" className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>Submit for approval</button>
            {q.data?.live && <button type="button" className="btn btn-outline" disabled={busy} onClick={restore}>Discard my edits</button>}
          </div>
        </div>
        {base === '/admin' && <p className="mt-2 text-sm"><Link to="/admin/links">Open approvals</Link></p>}
      </section>

      {gForm && (
        <form onSubmit={saveGroup} noValidate className="card mb-6 space-y-3">
          <h2 className="text-lg font-bold">{gForm.id ? 'Rename or edit group' : 'New group'}</h2>
          <div><label className="label" htmlFor="g-title">Group name</label><input id="g-title" className="input" maxLength={80} value={gForm.title} onChange={(e) => setGForm({ ...gForm, title: e.target.value })} /></div>
          <div><label className="label" htmlFor="g-desc">Description (optional)</label><input id="g-desc" className="input" maxLength={240} value={gForm.description} onChange={(e) => setGForm({ ...gForm, description: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={gForm.is_hidden} onChange={(e) => setGForm({ ...gForm, is_hidden: e.target.checked })} /> Hide this group (kept in the draft, not shown publicly)</label>
          <div className="flex gap-3"><button type="submit" className="btn btn-primary" disabled={busy}>Save group</button><button type="button" className="btn btn-outline" onClick={() => setGForm(null)}>Cancel</button></div>
        </form>
      )}
      {lForm && (
        <form onSubmit={saveLink} noValidate className="card mb-6 space-y-3">
          <h2 className="text-lg font-bold">{lForm.id ? 'Edit link' : 'New link'}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="l-group">Group</label>
              <select id="l-group" className="input" value={lForm.group_id} onChange={(e) => setLForm({ ...lForm, group_id: e.target.value })}>{groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</select></div>
            <div><label className="label" htmlFor="l-title">Title</label><input id="l-title" className="input" maxLength={120} value={lForm.title} onChange={(e) => setLForm({ ...lForm, title: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="l-url">Web address</label><input id="l-url" className="input" maxLength={500} placeholder="https://…" value={lForm.url} onChange={(e) => setLForm({ ...lForm, url: e.target.value })} />
              <p className="hint">Only https://, http:// and mailto: addresses are accepted. Links open in a new tab.</p></div>
            <div><label className="label" htmlFor="l-desc">Description (optional)</label><input id="l-desc" className="input" maxLength={240} value={lForm.description} onChange={(e) => setLForm({ ...lForm, description: e.target.value })} /></div>
            <div><label className="label" htmlFor="l-icon">Icon (optional)</label>
              <select id="l-icon" className="input" value={lForm.icon} onChange={(e) => setLForm({ ...lForm, icon: e.target.value })}><option value="">No icon</option>{ICONS.map((i) => <option key={i} value={i}>{i}</option>)}</select></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lForm.is_hidden} onChange={(e) => setLForm({ ...lForm, is_hidden: e.target.checked })} /> Hide this link</label>
          <div className="flex gap-3"><button type="submit" className="btn btn-primary" disabled={busy}>Save link</button><button type="button" className="btn btn-outline" onClick={() => setLForm(null)}>Cancel</button></div>
        </form>
      )}

      {q.loading && <Loading />}
      {q.error && <ErrorNotice message={q.error} onRetry={q.reload} />}
      {q.data && groups.length === 0 && <EmptyState title="No groups yet">Add a group to start organizing links.</EmptyState>}
      <ul className="space-y-3">
        {groups.map((g, gi) => {
          const ls = linksOf(g.id);
          const isOpen = open[g.id] ?? false;
          return (
            <li key={g.id} className="card p-0" draggable onDragStart={() => setDragId(g.id)} onDragOver={(e) => e.preventDefault()}
              onDrop={() => { const from = groups.findIndex((x) => x.id === dragId); if (from >= 0) void reorderGroups(from, gi); setDragId(null); }}>
              <div className="flex flex-wrap items-center gap-2 p-3">
                <button type="button" className="flex-1 text-left font-serif text-lg font-bold" aria-expanded={isOpen} aria-controls={`grp-${g.id}`} onClick={() => setOpen({ ...open, [g.id]: !isOpen })}>
                  {isOpen ? '▾' : '▸'} {g.title} <span className="text-xs font-normal text-muted">({ls.length})</span>
                </button>
                {g.is_hidden && <StatusBadge label="Hidden" tone="neutral" />}
                <button type="button" className="btn btn-outline btn-sm" aria-label={`Move ${g.title} up`} disabled={gi === 0 || busy} onClick={() => reorderGroups(gi, gi - 1)}>↑</button>
                <button type="button" className="btn btn-outline btn-sm" aria-label={`Move ${g.title} down`} disabled={gi === groups.length - 1 || busy} onClick={() => reorderGroups(gi, gi + 1)}>↓</button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => { setGForm({ id: g.id, title: g.title, description: g.description ?? '', is_hidden: g.is_hidden }); setError(null); }}>Rename / edit</button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => del('group', g.id, g.title)}>Delete</button>
              </div>
              {isOpen && (
                <div id={`grp-${g.id}`} className="border-t border-line p-3">
                  {ls.length === 0 && <p className="text-sm text-muted">No links in this group yet.</p>}
                  <ul className="space-y-2">
                    {ls.map((l, li) => (
                      <li key={l.id} className="flex flex-wrap items-center gap-2 rounded border border-line p-2 text-sm" draggable
                        onDragStart={(e) => { e.stopPropagation(); setDragId(l.id); }} onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.stopPropagation(); const from = ls.findIndex((x) => x.id === dragId); if (from >= 0) void reorderLinks(g.id, from, li); setDragId(null); }}>
                        <span className="min-w-0 flex-1"><span className="font-medium">{l.title}</span> <span className="break-all text-xs text-muted">{l.url}</span></span>
                        {l.is_hidden && <StatusBadge label="Hidden" tone="neutral" />}
                        <button type="button" className="btn btn-outline btn-sm" aria-label={`Move ${l.title} up`} disabled={li === 0 || busy} onClick={() => reorderLinks(g.id, li, li - 1)}>↑</button>
                        <button type="button" className="btn btn-outline btn-sm" aria-label={`Move ${l.title} down`} disabled={li === ls.length - 1 || busy} onClick={() => reorderLinks(g.id, li, li + 1)}>↓</button>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => { setLForm({ id: l.id, group_id: l.group_id, title: l.title, url: l.url, description: l.description ?? '', icon: l.icon ?? '', is_hidden: l.is_hidden }); setError(null); }}>Edit</button>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => del('link', l.id, l.title)}>Delete</button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3"><button type="button" className="btn btn-primary btn-sm" onClick={() => { setLForm({ group_id: g.id, title: '', url: 'https://', description: '', icon: '', is_hidden: false }); setError(null); }}>Add link</button></p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <ConfirmDialog pending={pending} onClose={() => setPending(null)} onDone={q.reload} />
    </>
  );
}
