import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'

import { setApiAuthTokenProvider } from '@/api'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

interface AuthContextValue {
  configured: boolean
  loading: boolean
  session: Session | null
  user: User | null
  accessToken: string
  signIn: (email: string, password: string) => Promise<void>
  signUp: (params: { email: string; password: string; name: string }) => Promise<{ needsEmailConfirmation: boolean }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setApiAuthTokenProvider(() => session?.access_token || '')
  }, [session?.access_token])

  useEffect(() => {
    let mounted = true

    if (!isSupabaseConfigured) {
      setLoading(false)
      return () => {
        mounted = false
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      mounted = false
      data.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    configured: isSupabaseConfigured,
    loading,
    session,
    user: session?.user || null,
    accessToken: session?.access_token || '',
    signIn: async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      setSession(data.session)
    },
    signUp: async ({ email, password, name }: { email: string; password: string; name: string }) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
        },
      })
      if (error) throw error
      setSession(data.session)
      return { needsEmailConfirmation: !data.session }
    },
    signOut: async () => {
      await supabase.auth.signOut()
      setSession(null)
    },
  }), [loading, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
