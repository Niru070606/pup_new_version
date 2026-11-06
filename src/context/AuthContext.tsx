import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';

interface AuthValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  emailVerified: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (i: { email: string; password: string; fullName: string; department: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  sendReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [profileFor, setProfileFor] = useState<string | null>(null);
  const uid = session?.user.id ?? null;

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setReady(true);
      if (!s) {
        setProfile(null);
        setProfileFor(null);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const loadProfile = useCallback(async (id: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, []);

  // Loaded in its own effect (not inside onAuthStateChange) to avoid auth-client deadlocks.
  useEffect(() => {
    if (!uid) return;
    let active = true;
    loadProfile(uid).finally(() => { if (active) setProfileFor(uid); });
    return () => { active = false; };
  }, [uid, loadProfile]);

  const loading = !ready || (uid !== null && profileFor !== uid);

  const value: AuthValue = {
    session,
    profile,
    loading,
    emailVerified: Boolean(session?.user.email_confirmed_at),
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      // Deliberately vague: do not reveal whether the account exists.
      if (error) throw new Error('Sign-in failed. Check your email and password, and make sure you have verified your email address.');
    },
    async signUp({ email, password, fullName, department }) {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim(), department: department.trim() }, emailRedirectTo: `${window.location.origin}/login` },
      });
      if (error) throw new Error(error.message);
    },
    async signOut() {
      await supabase.auth.signOut();
    },
    async refreshProfile() {
      if (uid) await loadProfile(uid);
    },
    async sendReset(email) {
      await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    },
    async updatePassword(password) {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
