import type { AccountStatus, AnnouncementOverview, Role, RevisionStatus, Tone } from './types';

interface DbError {
  code?: string;
  message: string;
}

/** Turns database errors into messages that are safe and useful to show. */
function friendly(e: DbError): string {
  if (e.code === 'P0001') return e.message; // messages we raise ourselves in schema.sql
  if (e.code === '23505') return 'That record already exists or is already linked.';
  if (e.code === '23514') return 'Some values are not valid. Please check the form and try again.';
  if (e.code === '42501') return 'You do not have permission to do that.';
  return 'Something went wrong. Please try again.';
}

export function unwrap<T>(r: { data: T | null; error: DbError | null }): T {
  if (r.error) throw new Error(friendly(r.error));
  return r.data as T;
}

export function check(r: { error: DbError | null }): void {
  if (r.error) throw new Error(friendly(r.error));
}

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');

const TZ = 'Asia/Manila';
export function formatDateTime(iso?: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ }).format(new Date(iso));
}
export function formatDate(iso?: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'long', timeZone: TZ }).format(new Date(iso));
}

export function excerpt(text: string, max = 170): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : t.slice(0, max).trimEnd() + '…';
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export const isHttpsUrl = (s: string) => /^https:\/\/[^\s]+$/i.test(s);
export const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

export function accountStatusInfo(status: AccountStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'approved': return { label: 'Active', tone: 'success' };
    case 'pending_approval': return { label: 'Pending approval', tone: 'warning' };
    case 'rejected': return { label: 'Rejected', tone: 'error' };
    case 'suspended': return { label: 'Suspended', tone: 'error' };
    case 'deactivated': return { label: 'Deactivated', tone: 'neutral' };
  }
}

/** Status shown to people. A published announcement with a newer revision in review says so. */
export function announcementStatusInfo(a: Pick<AnnouncementOverview, 'status' | 'latest_status'>): { label: string; tone: Tone } {
  if (a.status === 'published') {
    if (a.latest_status === 'pending') return { label: 'Published (revision pending review)', tone: 'warning' };
    if (a.latest_status === 'rejected' || a.latest_status === 'revision_required') return { label: 'Published (revision needs changes)', tone: 'warning' };
    if (a.latest_status === 'draft') return { label: 'Published (draft revision)', tone: 'info' };
    return { label: 'Published', tone: 'success' };
  }
  switch (a.status) {
    case 'draft': return { label: 'Draft', tone: 'neutral' };
    case 'pending': return { label: 'Pending approval', tone: 'warning' };
    case 'rejected': return { label: 'Rejected', tone: 'error' };
    case 'revision_required': return { label: 'Revision required', tone: 'warning' };
    case 'unpublished': return { label: 'Unpublished', tone: 'neutral' };
    default: return { label: 'Archived', tone: 'neutral' };
  }
}

/** Can the submitter/admin open the editor for this announcement? */
export function isEditable(a: Pick<AnnouncementOverview, 'status' | 'latest_status'>): boolean {
  if (a.status === 'unpublished' || a.status === 'archived') return false;
  return a.latest_status !== 'pending';
}

/** Where each role lands after signing in. */
export const homeFor = (role: Role | undefined | null): string => (role === 'admin' ? '/admin' : role === 'designer' ? '/designer' : '/dashboard');

export const roleLabel = (role: Role): string => (role === 'admin' ? 'Administrator' : role === 'designer' ? 'Designer' : 'Faculty/Staff');

/** Label and tone for design / link-directory revisions. */
export function revisionStatusInfo(s: RevisionStatus): { label: string; tone: Tone } {
  switch (s) {
    case 'draft': return { label: 'Draft', tone: 'neutral' };
    case 'pending': return { label: 'Awaiting approval', tone: 'warning' };
    case 'approved': return { label: 'Approved', tone: 'success' };
    case 'rejected': return { label: 'Rejected', tone: 'error' };
    case 'revision_required': return { label: 'Changes requested', tone: 'warning' };
  }
}

/** <input type="datetime-local"> value <-> ISO string (browser local time). */
export function toLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const fromLocalInput = (v: string): string | null => (v ? new Date(v).toISOString() : null);

export const PH_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Only http(s)/mailto links may be rendered as hrefs. */
export const isSafeHref = (s: string) => /^(https?:\/\/[^\s<>"']+|mailto:[^\s<>"',]+)$/i.test(s);

/** Move an item inside an array (used for drag-and-drop and keyboard reordering). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

export const newId = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
