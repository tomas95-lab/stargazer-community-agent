import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import type { Session, User } from "@supabase/supabase-js"

import { supabase, supabaseConfigured } from "@/lib/supabase"

interface AuthContextValue {
  configured: boolean
  loading: boolean
  session: Session | null
  user: User | null
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(supabaseConfigured)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let mounted = true
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

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: supabaseConfigured,
      loading,
      session,
      user: session?.user || null,
      signOut: async () => {
        if (supabase) {
          await supabase.auth.signOut()
        }
      },
    }),
    [loading, session]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used inside AuthProvider")
  return context
}
