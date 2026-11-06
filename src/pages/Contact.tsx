import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useContent } from '../context/ContentContext';
import { isEmail } from '../lib/util';
import { Placeholder } from '../components/ui';

const MAP_PREFIX = 'https://www.google.com/maps/embed';

export default function Contact() {
  const { content } = useContent();
  const [f, setF] = useState({ name: '', email: '', subject: '', message: '', website: '' });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const hasInfo = content.contact_address || content.contact_phone || content.contact_email || content.contact_hours;
  const mapUrl = (content.map_embed_url ?? '').startsWith(MAP_PREFIX) ? content.map_embed_url : '';
  const formOn = content.contact_form_enabled === 'true';

  async function submit(e: FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!f.name.trim()) er.name = 'Enter your name.';
    if (!isEmail(f.email.trim())) er.email = 'Enter a valid email address.';
    if (f.message.trim().length < 10) er.message = 'Write at least 10 characters.';
    setErrs(er);
    if (Object.keys(er).length) return;
    if (f.website) { setState('sent'); return; } // honeypot field filled: silently ignore bots
    setState('sending');
    const { error } = await supabase.from('contact_messages').insert({
      name: f.name.trim(), email: f.email.trim(), subject: f.subject.trim() || null, message: f.message.trim(),
    });
    if (error) { setState('error'); return; }
    setState('sent');
    setF({ name: '', email: '', subject: '', message: '', website: '' });
  }

  return (
    <div className="page mt-10">
      <h1 className="text-3xl font-bold">Contact</h1>
      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <section aria-labelledby="ci">
            <h2 id="ci" className="mb-2 text-xl font-bold">Campus contact information</h2>
            {hasInfo ? (
              <dl className="space-y-2 text-sm">
                {content.contact_address && <div><dt className="font-semibold">Address</dt><dd className="prose-plain">{content.contact_address}</dd></div>}
                {content.contact_phone && <div><dt className="font-semibold">Phone</dt><dd>{content.contact_phone}</dd></div>}
                {content.contact_email && <div><dt className="font-semibold">Email</dt><dd><a href={`mailto:${content.contact_email}`}>{content.contact_email}</a></dd></div>}
                {content.contact_hours && <div><dt className="font-semibold">Office hours</dt><dd className="prose-plain">{content.contact_hours}</dd></div>}
              </dl>
            ) : <Placeholder what="Contact information" />}
          </section>
          <section aria-labelledby="loc">
            <h2 id="loc" className="mb-2 text-xl font-bold">Campus location</h2>
            {mapUrl ? (
              <iframe title="Map showing the campus location" src={mapUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="h-72 w-full rounded-md border border-line" />
            ) : <Placeholder what="Campus map" />}
          </section>
        </div>

        <section aria-labelledby="cf">
          <h2 id="cf" className="mb-2 text-xl font-bold">Send a message</h2>
          {!formOn ? (
            <div className="alert alert-info">The contact form is currently turned off. Please use the contact details shown here.</div>
          ) : state === 'sent' ? (
            <div role="status" className="alert alert-success">Message sent. Thank you — the campus will respond using the email you provided.</div>
          ) : (
            <form onSubmit={submit} noValidate className="card space-y-4">
              {state === 'error' && <div role="alert" className="alert alert-error">Your message could not be sent. Please try again later.</div>}
              <div>
                <label className="label" htmlFor="c-name">Name</label>
                <input id="c-name" className="input" maxLength={120} autoComplete="name" value={f.name} onChange={set('name')} aria-invalid={!!errs.name} aria-describedby={errs.name ? 'c-name-e' : undefined} />
                {errs.name && <p id="c-name-e" className="field-error">{errs.name}</p>}
              </div>
              <div>
                <label className="label" htmlFor="c-email">Email</label>
                <input id="c-email" type="email" className="input" maxLength={200} autoComplete="email" value={f.email} onChange={set('email')} aria-invalid={!!errs.email} aria-describedby={errs.email ? 'c-email-e' : undefined} />
                {errs.email && <p id="c-email-e" className="field-error">{errs.email}</p>}
              </div>
              <div>
                <label className="label" htmlFor="c-subject">Subject (optional)</label>
                <input id="c-subject" className="input" maxLength={200} value={f.subject} onChange={set('subject')} />
              </div>
              <div>
                <label className="label" htmlFor="c-message">Message</label>
                <textarea id="c-message" rows={6} className="input" maxLength={3000} value={f.message} onChange={set('message')} aria-invalid={!!errs.message} aria-describedby={errs.message ? 'c-message-e' : undefined} />
                {errs.message && <p id="c-message-e" className="field-error">{errs.message}</p>}
              </div>
              {/* Honeypot: hidden from people, tempting to bots. */}
              <div className="absolute -left-[9999px]" aria-hidden="true">
                <label htmlFor="c-web">Website</label>
                <input id="c-web" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} />
              </div>
              <button type="submit" className="btn btn-primary" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send message'}</button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
