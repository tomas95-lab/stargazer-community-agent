import { useState } from "react"
import type { FormEvent } from "react"
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom"
import { LoaderCircle as IconLoader2, LockKeyhole as IconLock, Orbit } from "lucide-react"

import { useAuth } from "@/auth"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabase"

export default function Login() {
  const { configured, session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/"

  if (session) return <Navigate to={from} replace />

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return

    setPending(true)
    setError("")
    const loginEmail = email.trim().toLowerCase() === "testing" ? "testing@demo.local" : email.trim()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    })
    setPending(false)

    if (signInError) {
      setError(signInError.message)
      return
    }

    navigate(from, { replace: true })
  }

  return (
    <main className="flex min-h-screen w-full max-w-full items-center justify-center overflow-x-hidden bg-background px-4 py-10">
      <div className="w-full min-w-0 max-w-md">
        <Link to="/" className="mb-5 flex items-center justify-center gap-2 text-sm font-semibold text-foreground">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Orbit className="size-4" /></span>
          Community Agent
        </Link>
      <Card className="w-full min-w-0 max-w-full overflow-hidden rounded-lg">
        <CardHeader className="min-w-0 px-4 sm:px-6">
          <div className="mb-2 flex size-10 items-center justify-center rounded-md border bg-muted">
            <IconLock className="size-5" />
          </div>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Access your community agent workspace.</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 px-4 sm:px-6">
          {!configured ? (
            <p className="text-sm text-muted-foreground">
              Supabase is not configured for this UI environment.
            </p>
          ) : (
            <form className="grid gap-4" onSubmit={submit}>
              <div className="grid gap-2">
                <Label htmlFor="email">Email or demo username</Label>
                <Input
                  id="email"
                  type="text"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" disabled={pending}>
                {pending ? <IconLoader2 className="size-4 animate-spin" /> : null}
                Sign in
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                New QM?{" "}
                <Link className="font-medium text-foreground underline underline-offset-4" to="/signup">
                  Create an account
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
      <p className="mt-5 break-words px-2 text-center text-xs text-muted-foreground">Secure QM workspace for Outlier Community operations</p>
      </div>
    </main>
  )
}
