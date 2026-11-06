import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ContentProvider } from './context/ContentContext';
import { DesignProvider } from './context/DesignContext';
import { isSupabaseConfigured } from './lib/supabase';
import PublicLayout from './components/PublicLayout';
import DashboardLayout from './components/DashboardLayout';
import ProtectedRoute from './components/ProtectedRoute';
import { Loading } from './components/ui';

import Home from './pages/Home';
import About from './pages/About';
import Academics from './pages/Academics';
import FacultyDirectory from './pages/FacultyDirectory';
import Announcements from './pages/Announcements';
import AnnouncementDetail from './pages/AnnouncementDetail';
import Contact from './pages/Contact';
import Events from './pages/Events';
import EventDetail from './pages/EventDetail';
import Documents from './pages/Documents';
import LinksDirectory from './pages/LinksDirectory';
import SearchPage from './pages/Search';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AccountStatus from './pages/AccountStatus';
import NotFound from './pages/NotFound';

// Dashboards are loaded only when needed, keeping the public site fast.
const FacultyHome = lazy(() => import('./pages/faculty/FacultyHome'));
const MyAnnouncements = lazy(() => import('./pages/faculty/MyAnnouncements'));
const AnnouncementEditor = lazy(() => import('./pages/faculty/AnnouncementEditor'));
const Profile = lazy(() => import('./pages/faculty/Profile'));
const AdminHome = lazy(() => import('./pages/admin/AdminHome'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminReview = lazy(() => import('./pages/admin/AdminReview'));
const AdminAnnouncements = lazy(() => import('./pages/admin/AdminAnnouncements'));
const AdminDirectory = lazy(() => import('./pages/admin/AdminDirectory'));
const AdminContent = lazy(() => import('./pages/admin/AdminContent'));
const AdminMessages = lazy(() => import('./pages/admin/AdminMessages'));
const AdminLogs = lazy(() => import('./pages/admin/AdminLogs'));
const AdminDesign = lazy(() => import('./pages/admin/AdminDesign'));
const AdminLinks = lazy(() => import('./pages/admin/AdminLinks'));
const AdminEvents = lazy(() => import('./pages/admin/AdminEvents'));
const AdminDocuments = lazy(() => import('./pages/admin/AdminDocuments'));
const AdminMedia = lazy(() => import('./pages/admin/AdminMedia'));
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics'));
const AdminHistory = lazy(() => import('./pages/admin/AdminHistory'));
const DesignerHome = lazy(() => import('./pages/designer/DesignerHome'));
const VisualEditor = lazy(() => import('./pages/designer/VisualEditor'));
const DesignerMedia = lazy(() => import('./pages/designer/DesignerMedia'));
const LinksEditor = lazy(() => import('./pages/designer/LinksEditor'));

const FACULTY_LINKS = [
  { to: '/dashboard', label: 'Overview', end: true },
  { to: '/dashboard/announcements', label: 'My announcements' },
  { to: '/dashboard/announcements/new', label: 'Create announcement' },
  { to: '/dashboard/profile', label: 'My profile' },
];

const DESIGNER_LINKS = [
  { to: '/designer', label: 'Overview', end: true },
  { to: '/designer/editor', label: 'Visual editor' },
  { to: '/designer/media', label: 'Media library' },
  { to: '/designer/links', label: 'Links directory' },
  { to: '/designer/profile', label: 'My profile' },
];

const ADMIN_LINKS = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/registrations', label: 'Registrations' },
  { to: '/admin/review', label: 'Review queue' },
  { to: '/admin/announcements', label: 'Announcements' },
  { to: '/admin/directory', label: 'Faculty & staff' },
  { to: '/admin/events', label: 'Events' },
  { to: '/admin/documents', label: 'Documents' },
  { to: '/admin/design', label: 'Design approvals' },
  { to: '/admin/links', label: 'Links approvals' },
  { to: '/admin/media', label: 'Media & storage' },
  { to: '/admin/analytics', label: 'Analytics' },
  { to: '/admin/history', label: 'Content history' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/content', label: 'Campus content' },
  { to: '/admin/messages', label: 'Messages' },
  { to: '/admin/logs', label: 'Activity logs' },
  { to: '/admin/settings', label: 'Website settings' },
];

function ConfigNotice() {
  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">Supabase is not configured</h1>
      <p className="mt-3">
        Copy <code>.env.example</code> to <code>.env</code>, add your Supabase project URL and anon key, then restart
        the dev server (or rebuild). See README.md, step 3.
      </p>
    </div>
  );
}

export default function App() {
  if (!isSupabaseConfigured) return <ConfigNotice />;
  return (
    <BrowserRouter>
      <AuthProvider>
        <ContentProvider>
         <DesignProvider>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route element={<PublicLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/about" element={<About />} />
                <Route path="/academics" element={<Academics />} />
                <Route path="/faculty" element={<FacultyDirectory />} />
                <Route path="/announcements" element={<Announcements />} />
                <Route path="/announcements/:id" element={<AnnouncementDetail />} />
                <Route path="/events" element={<Events />} />
                <Route path="/events/:id" element={<EventDetail />} />
                <Route path="/documents" element={<Documents />} />
                <Route path="/links" element={<LinksDirectory />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/account-status" element={<AccountStatus />} />
                <Route path="*" element={<NotFound />} />
              </Route>

              <Route
                path="/dashboard"
                element={<ProtectedRoute role="faculty"><DashboardLayout title="Faculty/Staff dashboard" links={FACULTY_LINKS} /></ProtectedRoute>}
              >
                <Route index element={<FacultyHome />} />
                <Route path="announcements" element={<MyAnnouncements />} />
                <Route path="announcements/new" element={<AnnouncementEditor base="/dashboard" />} />
                <Route path="announcements/:id/edit" element={<AnnouncementEditor base="/dashboard" />} />
                <Route path="profile" element={<Profile />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>

              <Route
                path="/designer"
                element={<ProtectedRoute role="designer"><DashboardLayout title="Designer dashboard" links={DESIGNER_LINKS} /></ProtectedRoute>}
              >
                <Route index element={<DesignerHome />} />
                <Route path="editor" element={<VisualEditor base="/designer" />} />
                <Route path="editor/:id" element={<VisualEditor base="/designer" />} />
                <Route path="media" element={<DesignerMedia />} />
                <Route path="links" element={<LinksEditor base="/designer" />} />
                <Route path="profile" element={<Profile />} />
                <Route path="*" element={<Navigate to="/designer" replace />} />
              </Route>

              <Route
                path="/admin"
                element={<ProtectedRoute role="admin"><DashboardLayout title="Administrator dashboard" links={ADMIN_LINKS} /></ProtectedRoute>}
              >
                <Route index element={<AdminHome />} />
                <Route path="registrations" element={<AdminUsers mode="pending" />} />
                <Route path="users" element={<AdminUsers mode="all" />} />
                <Route path="review" element={<AdminReview />} />
                <Route path="announcements" element={<AdminAnnouncements />} />
                <Route path="announcements/new" element={<AnnouncementEditor base="/admin" />} />
                <Route path="announcements/:id/edit" element={<AnnouncementEditor base="/admin" />} />
                <Route path="directory" element={<AdminDirectory />} />
                <Route path="content" element={<AdminContent mode="content" />} />
                <Route path="settings" element={<AdminContent mode="settings" />} />
                <Route path="messages" element={<AdminMessages />} />
                <Route path="logs" element={<AdminLogs />} />
                <Route path="design" element={<AdminDesign />} />
                <Route path="design/editor" element={<VisualEditor base="/admin" />} />
                <Route path="design/editor/:id" element={<VisualEditor base="/admin" />} />
                <Route path="links" element={<AdminLinks />} />
                <Route path="links/edit" element={<LinksEditor base="/admin" />} />
                <Route path="events" element={<AdminEvents />} />
                <Route path="documents" element={<AdminDocuments />} />
                <Route path="media" element={<AdminMedia />} />
                <Route path="analytics" element={<AdminAnalytics />} />
                <Route path="history" element={<AdminHistory />} />
                <Route path="*" element={<Navigate to="/admin" replace />} />
              </Route>
            </Routes>
          </Suspense>
         </DesignProvider>
        </ContentProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
