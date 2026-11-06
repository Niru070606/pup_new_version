/**
 * Only verified institutional names appear here. Everything else (history, vision, mission,
 * contact details, programs, faculty) is entered by an administrator in the dashboard.
 */
export const SITE = {
  campusName: 'Polytechnic University of the Philippines – Unisan Campus',
  shortName: 'PUP Unisan Campus',
  universityName: 'Polytechnic University of the Philippines',
  /** Set to '/logo.png' (file placed in /public) ONLY when you have an authorized logo asset. */
  logoSrc: null as string | null,
  attribution: 'Campus information website for the Polytechnic University of the Philippines – Unisan Campus.',
};

export const CATEGORIES = ['Official Notices', 'Academic Updates', 'Campus Events', 'Admissions', 'Student Activities'] as const;
