import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  getGoogleAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const persistGoogleTokens = async (activeSession: Session) => {
      if (!activeSession.provider_refresh_token) return;

      const expiresAt =
        typeof activeSession.expires_at === 'number'
          ? new Date(activeSession.expires_at * 1000).toISOString()
          : null;

      const { error } = await supabase.functions.invoke('google-auth?action=store-tokens', {
        body: {
          accessToken: activeSession.provider_token ?? '',
          refreshToken: activeSession.provider_refresh_token,
          expiresAt,
          tokenType: 'Bearer',
        },
      });

      if (error) {
        console.error('Failed to persist Google tokens securely:', error);
      }
    };

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state change:', event, session?.user?.email);
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        // Persist OAuth tokens via an authenticated edge function instead of writing directly from the client.
        if (event === 'SIGNED_IN' && session?.provider_refresh_token) {
          console.log('Persisting Google refresh token securely...');
          setTimeout(async () => {
            try {
              await persistGoogleTokens(session);
            } catch (err) {
              console.error('Error persisting Google tokens:', err);
            }
          }, 0);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        scopes: 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.metadata.readonly',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  const getGoogleAccessToken = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.provider_token ?? null;
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signInWithGoogle, signOut, getGoogleAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
