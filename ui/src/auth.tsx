import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import type { Session, User } from "@supabase/supabase-js"

import { AUTH_SESSION_INVALID_EVENT } from "@/auth-events"
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

    const client = supabase
    let mounted = true
    const clearLocalWorkspace = () => {
      window.localStorage.removeItem("qm_active_project_id")
    }
    const handleInvalidSession = () => {
      clearLocalWorkspace()
      setSession(null)
      setLoading(false)
      void client.auth.signOut({ scope: "local" }).catch(() => undefined)
    }

    window.addEventListener(AUTH_SESSION_INVALID_EVENT, handleInvalidSession)

    client.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
    })

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      mounted = false
      window.removeEventListener(AUTH_SESSION_INVALID_EVENT, handleInvalidSession)
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
        if (typeof window !== "undefined") {
          window.localStorage.removeItem("qm_active_project_id")
        }
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
