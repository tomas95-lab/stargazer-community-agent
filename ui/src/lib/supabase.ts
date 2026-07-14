import { createClient } from "@supabase/supabase-js"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const supabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey)

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl!, supabasePublishableKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null

export async function getSupabaseAccessToken(): Promise<string> {
  if (!supabase) return ""
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ""
}
