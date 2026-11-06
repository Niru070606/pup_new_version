import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useQuery } from '../lib/useQuery';
import { usePageTitle } from '../lib/usePageTitle';
import { formatDate, PH_MONTHS, unwrap } from '../lib/util';
import type { ImageRef, PublicPerson } from '../lib/types';
import ResponsiveImage from '../components/media/ResponsiveImage';
import { EmptyState, ErrorNotice, Loading, StatusBadge } from '../components/ui';

const SECTION_TITLE = { administration: 'Campus Administration', teaching: 'Teaching Personnel', non_teaching: 'Non-Teaching Personnel' } as const;
const OTHER = 'Other teaching personnel';

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
const photoRef = (p: PublicPerson): ImageRef | null =>
  p.photo_path_medium || p.photo_path_thumb
    ? { id: p.photo_asset_id, path_original: null, path_medium: p.photo_path_medium, path_thumb: p.photo_path_thumb, width: null, height: null, width_medium: 600, width_thumb: 200 }
    : null;
const byOrder = (a: PublicPerson, b: PublicPerson) => (a.is_director === b.is_director ? 0 : a.is_director ? -1 : 1) || a.display_order - b.display_order || a.full_name.localeCompare(b.full_name);

function PersonCard({ p }: { p: PublicPerson }) {
  const img = photoRef(p);
  return (
    <li className="card flex gap-4">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-surface">
        {img ? <ResponsiveImage image={img} alt={`Photo of ${p.full_name}`} sizes="80px" className="h-20 w-20" fit="cover" />
          : <span aria-hidden="true" className="flex h-full w-full items-center justify-center font-serif text-xl font-bold text-maroon-strong">{initials(p.full_name)}</span>}
      </div>
      <div className="min-w-0">
        <h3 className="break-words text-lg font-bold">{p.full_name}</h3>
        {p.job_title && <p className="text-sm font-medium">{p.job_title}</p>}
        {p.department && <p className="text-sm text-muted">{p.department}</p>}
        <div className="mt-1 flex flex-wrap gap-1">
          {p.is_new_member && <StatusBadge label="New member" tone="info" />}
          {p.years_of_service !== null && p.years_of_service >= 1 && <StatusBadge label={`${p.years_of_service} year${p.years_of_service === 1 ? '' : 's'} of service`} tone="neutral" />}
          {p.employment_status && <StatusBadge label={p.employment_status.replace(/_/g, ' ')} tone="neutral" />}
        </div>
        {p.retirement_date && <p className="mt-1 text-xs text-muted">Retirement: {formatDate(p.retirement_date)}</p>}
        {p.public_email && <p className="mt-1 break-all text-sm"><a href={`mailto:${p.public_email}`}>{p.public_email}</a></p>}
        {p.public_phone && <p className="text-sm">{p.public_phone}</p>}
      </div>
    </li>
  );
}

function Grid({ people }: { people: PublicPerson[] }) {
  return <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{people.map((p) => <PersonCard key={p.id} p={p} />)}</ul>;
}

/** Days from today until the next occurrence of month/day (0 = today). */
function daysUntil(month: number, day: number): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(today.getFullYear(), month - 1, day);
  if (next < today) next = new Date(today.getFullYear() + 1, month - 1, day);
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

export default function FacultyDirectory() {
  usePageTitle('Faculty and staff directory');
  const [sp] = useSearchParams();
  const [term, setTerm] = useState(sp.get('q') ?? '');
  const [section, setSection] = useState('');
  const [program, setProgram] = useState('');
  const q = useQuery(
    async () => unwrap<PublicPerson[]>(await supabase.from('public_directory').select('*').order('display_order').order('full_name')),
    [],
  );
  const all = q.data ?? [];
  const programs = useMemo(() => [...new Set(all.filter((p) => p.section === 'teaching').map((p) => p.program_name || OTHER))].sort(), [all]);

  const shown = useMemo(() => {
    const t = term.trim().toLowerCase();
    return all.filter((p) => {
      if (section && p.section !== section) return false;
      if (program && (p.section !== 'teaching' || (p.program_name || OTHER) !== program)) return false;
      if (!t) return true;
      return [p.full_name, p.job_title, p.department, p.program_name].some((x) => (x ?? '').toLowerCase().includes(t));
    });
  }, [all, term, section, program]);

  const admin = shown.filter((p) => p.section === 'administration').sort(byOrder);
  const nonTeaching = shown.filter((p) => p.section === 'non_teaching').sort(byOrder);
  const teaching = shown.filter((p) => p.section === 'teaching');
  const groups = new Map<string, PublicPerson[]>();
  for (const p of teaching.sort(byOrder)) {
    const k = p.program_name || OTHER;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const groupNames = [...groups.keys()].sort((a, b) => (a === OTHER ? 1 : b === OTHER ? -1 : a.localeCompare(b)));

  const thisMonth = new Date().getMonth() + 1;
  const bdays = all.filter((p) => p.birth_month && p.birth_day);
  const monthList = bdays.filter((p) => p.birth_month === thisMonth).sort((a, b) => (a.birth_day ?? 0) - (b.birth_day ?? 0));
  const upcoming = bdays.map((p) => ({ p, d: daysUntil(p.birth_month!, p.birth_day!) })).filter((x) => x.d <= 30).sort((a, b) => a.d - b.d);
  const newcomers = all.filter((p) => p.is_new_member);

  return (
    <div className="page mt-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Faculty and staff directory</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">Only information approved for public display is shown.</p>
        </div>
        <button type="button" className="btn btn-outline no-print" onClick={() => window.print()}>Print directory</button>
      </div>
      <p className="print-only mt-2 text-sm">Printed {formatDate(new Date().toISOString())}</p>

      {q.loading && <Loading />}
      {q.error && <ErrorNotice message="The directory could not be loaded." onRetry={q.reload} />}
      {q.data && all.length === 0 && <div className="mt-6"><EmptyState title="No directory entries yet">Approved faculty and staff records will appear here.</EmptyState></div>}

      {all.length > 0 && (
        <>
          <form role="search" className="no-print mt-6 grid gap-3 sm:grid-cols-3" onSubmit={(e) => e.preventDefault()}>
            <div>
              <label className="label" htmlFor="dir-q">Search by name, position or department</label>
              <input id="dir-q" type="search" className="input" value={term} onChange={(e) => setTerm(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="dir-s">Section</label>
              <select id="dir-s" className="input" value={section} onChange={(e) => { setSection(e.target.value); setProgram(''); }}>
                <option value="">All sections</option>
                {(Object.keys(SECTION_TITLE) as (keyof typeof SECTION_TITLE)[]).map((k) => <option key={k} value={k}>{SECTION_TITLE[k]}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="dir-p">Program / course</label>
              <select id="dir-p" className="input" value={program} onChange={(e) => { setProgram(e.target.value); if (e.target.value) setSection('teaching'); }}>
                <option value="">All programs</option>
                {programs.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </form>
          <p role="status" className="no-print mt-2 text-sm text-muted">{shown.length} of {all.length} people shown.</p>

          {(monthList.length > 0 || upcoming.length > 0 || newcomers.length > 0) && (
            <section aria-labelledby="hl-h" className="no-print card mt-6 bg-gold-soft">
              <h2 id="hl-h" className="text-xl font-bold">Highlights</h2>
              <div className="mt-3 grid gap-4 md:grid-cols-3 text-sm">
                {monthList.length > 0 && (
                  <div><h3 className="font-bold">Birthdays in {PH_MONTHS[thisMonth - 1]}</h3>
                    <ul className="mt-1 space-y-0.5">{monthList.map((p) => <li key={p.id}>{p.full_name} – {PH_MONTHS[p.birth_month! - 1]} {p.birth_day}</li>)}</ul></div>
                )}
                {upcoming.length > 0 && (
                  <div><h3 className="font-bold">Upcoming birthdays (next 30 days)</h3>
                    <ul className="mt-1 space-y-0.5">{upcoming.map(({ p, d }) => <li key={p.id}>{p.full_name} – {PH_MONTHS[p.birth_month! - 1]} {p.birth_day}{d === 0 ? ' (today)' : ''}</li>)}</ul></div>
                )}
                {newcomers.length > 0 && (
                  <div><h3 className="font-bold">Welcome, new members</h3>
                    <ul className="mt-1 space-y-0.5">{newcomers.map((p) => <li key={p.id}>{p.full_name}{p.job_title ? ` – ${p.job_title}` : ''}</li>)}</ul></div>
                )}
              </div>
            </section>
          )}

          {shown.length === 0 && <div className="mt-6"><EmptyState title="No one matches your search">Try a different name or clear the filters.</EmptyState></div>}

          {admin.length > 0 && (
            <section className="mt-8" aria-labelledby="sec-admin"><h2 id="sec-admin" className="mb-3 text-2xl font-bold">{SECTION_TITLE.administration}</h2><Grid people={admin} /></section>
          )}
          {groupNames.length > 0 && (
            <section className="mt-8" aria-labelledby="sec-teach">
              <h2 id="sec-teach" className="mb-3 text-2xl font-bold">{SECTION_TITLE.teaching}</h2>
              {groupNames.map((g, i) => (
                <div key={g} className={i ? 'mt-6' : ''}><h3 className="mb-2 text-lg font-bold text-maroon-strong">{g}</h3><Grid people={groups.get(g)!} /></div>
              ))}
            </section>
          )}
          {nonTeaching.length > 0 && (
            <section className="mt-8" aria-labelledby="sec-non"><h2 id="sec-non" className="mb-3 text-2xl font-bold">{SECTION_TITLE.non_teaching}</h2><Grid people={nonTeaching} /></section>
          )}
        </>
      )}
    </div>
  );
}
