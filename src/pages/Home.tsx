import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useQuery } from '../lib/useQuery';
import { usePageTitle } from '../lib/usePageTitle';
import { formatDateTime, isHttpsUrl, unwrap } from '../lib/util';
import { useContent } from '../context/ContentContext';
import { useDesign } from '../context/DesignContext';
import { SITE } from '../config/site';
import { HERO_HEIGHT, type SectionKey } from '../lib/design';
import type { AcademicProgram, PublicAnnouncement, PublicEvent } from '../lib/types';
import AnnouncementCard from '../components/AnnouncementCard';
import BackgroundLayer from '../components/design/BackgroundLayer';
import Carousel from '../components/design/Carousel';
import ResponsiveImage from '../components/media/ResponsiveImage';
import { ContentBlock, EmptyState, ErrorNotice, Loading, Placeholder } from '../components/ui';

export default function Home() {
  usePageTitle(null);
  const { content } = useContent();
  const { design, resolve } = useDesign();
  const ann = useQuery(
    async () => unwrap<PublicAnnouncement[]>(await supabase.from('public_announcements').select('*').order('published_at', { ascending: false }).limit(5)),
    [],
  );
  const progs = useQuery(
    async () => unwrap<AcademicProgram[]>(await supabase.from('academic_programs').select('*').eq('is_published', true).order('display_order').order('name').limit(6)),
    [],
  );
  const events = useQuery(
    async () => unwrap<PublicEvent[]>(await supabase.from('public_events').select('id,title,description,location,starts_at,ends_at,all_day,category').gte('starts_at', new Date().toISOString()).order('starts_at').limit(3)),
    [],
  );

  const admissions = isHttpsUrl(content.admissions_url ?? '') ? content.admissions_url : null;
  const calendar = isHttpsUrl(content.academic_calendar_url ?? '') ? content.academic_calendar_url : null;
  const hero = design.hero;
  const heroImg = hero.showImage && hero.imageAssetId ? resolve(hero.imageAssetId) : null;
  const center = design.layout.heroAlign === 'center';
  const subtitle = hero.subtitle || content.welcome_message;

  const sections: Record<SectionKey, ReactNode> = {
    announcements: (
      <section key="announcements" className="page mt-12" aria-labelledby="latest-h">
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 id="latest-h" className="text-2xl font-bold">Latest announcements</h2>
          <Link to="/announcements">View all announcements</Link>
        </div>
        {ann.loading && <Loading />}
        {ann.error && <ErrorNotice message="Announcements could not be loaded." onRetry={ann.reload} />}
        {ann.data && ann.data.length === 0 && <EmptyState title="No announcements yet">Published announcements will appear here.</EmptyState>}
        {ann.data && ann.data.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">{ann.data.map((a) => <AnnouncementCard key={a.id} a={a} />)}</div>
        )}
      </section>
    ),
    events: (
      <section key="events" className="page mt-14" aria-labelledby="events-h">
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 id="events-h" className="text-2xl font-bold">Upcoming events</h2>
          <Link to="/events">Open the events calendar</Link>
        </div>
        {events.loading && <Loading />}
        {events.error && <ErrorNotice message="Events could not be loaded." onRetry={events.reload} />}
        {events.data && events.data.length === 0 && <EmptyState title="No upcoming events">Campus events will be listed here.</EmptyState>}
        {events.data && events.data.length > 0 && (
          <ul className="grid gap-3 md:grid-cols-3">
            {events.data.map((e) => (
              <li key={e.id} className="card">
                <p className="text-xs text-muted">{formatDateTime(e.starts_at)}</p>
                <h3 className="mt-1 text-lg font-bold"><Link to={`/events/${e.id}`}>{e.title}</Link></h3>
                {e.location && <p className="text-sm text-muted">{e.location}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    ),
    about: (
      <section key="about" className="page mt-14" aria-labelledby="intro-h">
        <h2 id="intro-h" className="mb-4 text-2xl font-bold">About the campus</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="card"><h3 className="mb-2 text-lg font-bold">History</h3><ContentBlock value={content.history} /></div>
          <div className="card"><h3 className="mb-2 text-lg font-bold">Vision</h3><ContentBlock value={content.vision} /></div>
          <div className="card"><h3 className="mb-2 text-lg font-bold">Mission</h3><ContentBlock value={content.mission} /></div>
        </div>
        <p className="mt-3"><Link to="/about">More about the campus</Link></p>
      </section>
    ),
    academics: (
      <section key="academics" className="page mt-14" aria-labelledby="acad-h">
        <h2 id="acad-h" className="mb-4 text-2xl font-bold">Academic information</h2>
        {progs.loading && <Loading />}
        {progs.data && progs.data.length === 0 && <Placeholder what="Academic programs" />}
        {progs.data && progs.data.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{progs.data.map((p) => <li key={p.id} className="card py-3 font-medium">{p.name}</li>)}</ul>
        )}
        <p className="mt-3 flex flex-wrap gap-4">
          <Link to="/academics">All academic programs</Link>
          <Link to="/faculty">Faculty and staff directory</Link>
        </p>
      </section>
    ),
    links: (
      <section key="links" className="page mt-14" aria-labelledby="links-h">
        <h2 id="links-h" className="mb-4 text-2xl font-bold">Quick links</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <li className="card py-3">{admissions ? <a href={admissions} target="_blank" rel="noopener noreferrer">Admissions information</a> : <Link to="/contact">Admissions inquiries</Link>}</li>
          {calendar && <li className="card py-3"><a href={calendar} target="_blank" rel="noopener noreferrer">Academic calendar</a></li>}
          <li className="card py-3"><Link to="/announcements">Announcements</Link></li>
          <li className="card py-3"><Link to="/faculty">Faculty and staff directory</Link></li>
          <li className="card py-3"><Link to="/links">Links directory</Link></li>
          <li className="card py-3"><Link to="/documents">Forms &amp; downloads</Link></li>
          <li className="card py-3"><Link to="/contact">Contact information</Link></li>
        </ul>
      </section>
    ),
  };

  return (
    <>
      <section className="on-dark relative isolate overflow-hidden bg-maroon text-white">
        <BackgroundLayer cfg={hero.background} resolve={resolve} />
        <div className={`page relative ${HERO_HEIGHT[hero.minHeight]} ${heroImg ? 'grid items-center gap-8 md:grid-cols-2' : ''}`}>
          <div className={center && !heroImg ? 'mx-auto text-center' : ''}>
            <h1 className={`max-w-3xl text-3xl font-bold text-white sm:text-5xl ${center && !heroImg ? 'mx-auto' : ''}`}>{hero.headline || SITE.campusName}</h1>
            <div className={`mt-4 max-w-2xl text-lg text-white/90 ${center && !heroImg ? 'mx-auto' : ''}`}>
              {subtitle ? <p className="prose-plain">{subtitle}</p> : <p>Welcome to the campus information website.</p>}
            </div>
            <div className={`mt-8 flex flex-wrap gap-3 ${center && !heroImg ? 'justify-center' : ''}`}>
              <Link to="/announcements" className="btn btn-gold">Read announcements</Link>
              <Link to="/academics" className="btn btn-light">Academic programs</Link>
            </div>
          </div>
          {heroImg && <ResponsiveImage image={heroImg} alt="" eager sizes="(min-width: 768px) 45vw, 100vw" className="rounded-[var(--radius)]" />}
        </div>
      </section>

      <Carousel cfg={design.carousel} resolve={resolve} />

      {design.layout.sections.filter((s) => !design.layout.hiddenSections.includes(s)).map((s) => sections[s])}
    </>
  );
}
