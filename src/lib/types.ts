export type Role = 'faculty' | 'admin' | 'designer';
export type AccountStatus = 'pending_approval' | 'approved' | 'rejected' | 'suspended' | 'deactivated';
export type AnnouncementStatus = 'draft' | 'pending' | 'published' | 'rejected' | 'revision_required' | 'unpublished' | 'archived';
export type RevisionStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'revision_required';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  department: string;
  role: Role;
  status: AccountStatus;
  status_reason: string | null;
  created_at: string;
}
export interface AdminUser extends Profile {
  email_confirmed_at: string | null;
}
export interface CampusContentRow {
  key: string;
  grp: string;
  label: string;
  kind: 'text' | 'longtext' | 'url' | 'toggle';
  value: string;
}
/** Admin view of a directory record (the base table; administrators only). */
export type PersonnelSection = 'administration' | 'teaching' | 'non_teaching';
export interface DirectoryEntry {
  id: string;
  profile_id: string | null;
  full_name: string;
  job_title: string | null;
  department: string | null;
  public_email: string | null;
  is_public: boolean;
  display_order: number;
  section: PersonnelSection;
  program_id: string | null;
  is_director: boolean;
  photo_asset_id: string | null;
  photo_approved: boolean;
  public_phone: string | null;
  consent_contact: boolean;
  consent_birthday: boolean;
  consent_retirement: boolean;
  consent_at: string | null;
  employment_verified: boolean;
}
export type EmploymentStatus = 'permanent' | 'temporary' | 'contractual' | 'part_time' | 'job_order' | 'on_leave' | 'retired' | 'resigned';
export interface PersonnelPrivate {
  directory_id: string;
  date_joined: string | null;
  birthday: string | null;
  retirement_date: string | null;
  employment_status: EmploymentStatus | null;
  personal_phone: string | null;
  personal_email: string | null;
  notes: string | null;
}
/** What visitors see: only approved, consented and derived fields (view public_directory). */
export interface PublicPerson {
  id: string;
  full_name: string;
  job_title: string | null;
  department: string | null;
  section: PersonnelSection;
  is_director: boolean;
  display_order: number;
  program_id: string | null;
  program_name: string | null;
  photo_asset_id: string | null;
  photo_path_medium: string | null;
  photo_path_thumb: string | null;
  public_email: string | null;
  public_phone: string | null;
  birth_month: number | null;
  birth_day: number | null;
  retirement_date: string | null;
  employment_status: EmploymentStatus | null;
  years_of_service: number | null;
  is_new_member: boolean;
}
export interface AcademicProgram {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  is_published: boolean;
}
export interface PublicAnnouncement {
  id: string;
  title: string;
  body: string;
  category: string | null;
  issuing_office: string;
  published_at: string;
  // Added by migration 003 (all optional so older rows/pages keep working)
  author_name?: string | null;
  expires_at?: string | null;
  cover_asset_id?: string | null;
  cover_alt?: string | null;
  cover_caption?: string | null;
  cover_path_original?: string | null;
  cover_path_medium?: string | null;
  cover_path_thumb?: string | null;
  cover_width?: number | null;
  cover_height?: number | null;
  cover_width_medium?: number | null;
  cover_width_thumb?: number | null;
}
export interface AnnouncementOverview {
  id: string;
  status: AnnouncementStatus;
  author_id: string;
  author_name: string | null;
  author_department: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  latest_revision_id: string;
  latest_version: number;
  latest_status: RevisionStatus;
  title: string;
  body: string;
  category: string | null;
  issuing_office: string;
  submitted_at: string | null;
  live_title: string | null;
  publish_at?: string | null;
  expires_at?: string | null;
}
export interface Review {
  revision_id: string;
  decision: 'approved' | 'rejected' | 'revision_required';
  reason: string | null;
  created_at: string;
}
export interface AuditLog {
  id: number;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
  actor: { full_name: string; email: string } | null;
}
export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
}
export type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

// ---------------------------------------------------------------- media
export type MediaPurpose = 'design' | 'announcement' | 'personnel' | 'document' | 'event';
export interface MediaAsset {
  id: string;
  owner_id: string;
  kind: 'image' | 'document';
  purpose: MediaPurpose;
  status: 'pending_upload' | 'ready' | 'deleted';
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  width_medium: number | null;
  width_thumb: number | null;
  path_original: string | null;
  path_medium: string | null;
  path_thumb: string | null;
  alt_text: string | null;
  caption: string | null;
  tags: string[];
  folder: string;
  is_public: boolean;
  created_at: string;
}
/** Everything needed to display an image (from a public view, the live design, or the media library). */
export interface ImageRef {
  id?: string | null;
  path_original: string | null;
  path_medium: string | null;
  path_thumb: string | null;
  width: number | null;
  height: number | null;
  width_medium: number | null;
  width_thumb: number | null;
}
export interface MediaUsageInfo { used_total: number; used_mine: number; settings: { max_image_bytes: number; max_document_bytes: number; quota_total_bytes: number; quota_per_user_bytes: number } }

// ---------------------------------------------------------------- announcements
export interface AnnouncementImage {
  id: string;
  revision_id: string;
  asset_id: string;
  role: 'cover' | 'inline';
  position: number;
  caption: string | null;
  alt_text: string;
  media?: MediaAsset | null;
}
export interface PublicAnnouncementImage extends ImageRef {
  announcement_id: string;
  role: 'cover' | 'inline';
  position: number;
  caption: string | null;
  alt_text: string;
  asset_id: string;
}

// ---------------------------------------------------------------- design + links
export interface DesignRevision {
  id: string;
  version: number;
  name: string;
  author_id: string;
  config: unknown;
  status: RevisionStatus;
  based_on: string | null;
  note: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_reason: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  author?: { full_name: string; email: string } | null;
}
export interface LiveDesign { revision_id: string; version: number; config: unknown; assets: Record<string, Omit<ImageRef, 'id'>> }

export type LinkIcon = 'globe' | 'document' | 'people' | 'book' | 'mail' | 'building' | 'calendar' | 'school' | 'download' | 'star';
export interface LinkGroupRow { id: string; title: string; description: string | null; display_order: number; is_hidden: boolean }
export interface LinkEntryRow { id: string; group_id: string; title: string; url: string; description: string | null; icon: LinkIcon | null; display_order: number; is_hidden: boolean }
export interface LinkRevision {
  id: string; version: number; author_id: string; status: RevisionStatus; note: string | null; submitted_at: string;
  reviewed_at: string | null; review_reason: string | null; approved_at: string | null;
  snapshot: { groups: { id: string; title: string; description: string | null; hidden: boolean; links: { id: string; title: string; url: string; description: string | null; icon: LinkIcon | null; hidden: boolean }[] }[] };
  author?: { full_name: string; email: string } | null;
}
export interface LiveLinks {
  version: number; approved_at: string;
  groups: { id: string; title: string; description: string | null; links: { id: string; title: string; url: string; description: string | null; icon: LinkIcon | null }[] }[];
}

// ---------------------------------------------------------------- campus features
export interface CampusEvent {
  id: string; title: string; description: string | null; location: string | null; category: string | null;
  starts_at: string; ends_at: string | null; all_day: boolean; is_published?: boolean; publish_at?: string | null;
  cover_asset_id?: string | null; cover_alt?: string | null;
}
export interface PublicEvent extends CampusEvent {
  cover_path_medium?: string | null; cover_path_thumb?: string | null; cover_width_medium?: number | null;
}
export interface DocumentRow {
  id: string; title: string; description: string | null; category: 'Forms' | 'Guides' | 'Downloads' | 'Policies'; asset_id: string;
  display_order: number; is_published: boolean; publish_at: string | null;
}
export interface PublicDocument {
  id: string; title: string; description: string | null; category: DocumentRow['category']; display_order: number; created_at: string;
  asset_id: string; path_original: string; size_bytes: number; mime_type: string; original_filename: string;
}
export interface SearchHit { kind: 'announcement' | 'program' | 'person' | 'event' | 'document' | 'link' | 'page'; id: string; title: string; snippet: string; path: string; rank: number }
export interface Analytics {
  days: number; total: number;
  by_day: { day: string; views: number }[];
  top_pages: { path: string; title: string | null; views: number }[];
  top_announcements: { path: string; title: string | null; views: number }[];
}
export interface ContentHistoryRow { id: number; key: string; old_value: string; new_value: string; changed_at: string; changed_by: string | null }
