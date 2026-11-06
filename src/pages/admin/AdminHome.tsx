import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../lib/useQuery';
import { unwrap } from '../../lib/util';
import { ErrorNotice, Loading, PageHeader } from '../../components/ui';

interface Counts { pending_registrations: number; pending_announcements: number; unread_messages: number; pending_designs?: number; pending_links?: number }

export default function AdminHome() {
  const q = useQuery(async () => unwrap<Counts>(await supabase.rpc('admin_overview_counts')), []);
  const items = q.data
    ? [
        { label: 'Registrations awaiting approval', n: q.data.pending_registrations, to: '/admin/registrations', cta: 'Review registrations' },
        { label: 'Announcements awaiting review', n: q.data.pending_announcements, to: '/admin/review', cta: 'Open review queue' },
        { label: 'Unread contact messages', n: q.data.unread_messages, to: '/admin/messages', cta: 'Read messages' },
        { label: 'Designs awaiting approval', n: q.data.pending_designs ?? 0, to: '/admin/design', cta: 'Review designs' },
        { label: 'Link changes awaiting approval', n: q.data.pending_links ?? 0, to: '/admin/links', cta: 'Review links' },
      ]
    : [];
  return (
    <>
      <PageHeader title="Administrator overview" intro="Pending tasks come first. Every approval and publishing action is recorded in the activity log." />
      {q.loading && <Loading />}
      {q.error && <ErrorNotice message={q.error} onRetry={q.reload} />}
      <ul className="grid gap-4 md:grid-cols-3">
        {items.map((i) => (
          <li key={i.to} className="card">
            <p className="text-3xl font-bold text-maroon-strong">{i.n}</p>
            <p className="text-sm">{i.label}</p>
            <p className="mt-3"><Link to={i.to} className={i.n > 0 ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}>{i.cta}</Link></p>
          </li>
        ))}
      </ul>
      <section className="mt-8">
        <h2 className="mb-2 text-xl font-bold">Other tasks</h2>
        <ul className="flex flex-wrap gap-4 text-sm">
          <li><Link to="/admin/announcements">Manage published announcements</Link></li>
          <li><Link to="/admin/directory">Faculty &amp; staff</Link></li>
          <li><Link to="/admin/events">Events</Link></li>
          <li><Link to="/admin/documents">Documents</Link></li>
          <li><Link to="/admin/design">Design approvals</Link></li>
          <li><Link to="/admin/links">Links approvals</Link></li>
          <li><Link to="/admin/media">Media &amp; storage</Link></li>
          <li><Link to="/admin/analytics">Analytics</Link></li>
          <li><Link to="/admin/history">Content history</Link></li>
          <li><Link to="/admin/content">Campus content</Link></li>
          <li><Link to="/admin/logs">Activity logs</Link></li>
        </ul>
      </section>
    </>
  );
}
