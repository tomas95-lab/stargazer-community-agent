import { useState } from "react"
import type { FormEvent } from "react"
import { Link, Navigate } from "react-router-dom"
import { IconLoader2, IconUserPlus } from "@tabler/icons-react"

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

export default function Signup() {
  const { configured, session } = useAuth()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  if (session) return <Navigate to="/onboarding" replace />

  function enterOnboarding() {
    window.location.replace("/onboarding")
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return

    setPending(true)
    setError("")
    setMessage("")
    const cleanEmail = email.trim()
    const cleanName = name.trim()
    const emailRedirectTo = `${window.location.origin}/onboarding`

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { name: cleanName },
        emailRedirectTo,
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setPending(false)
      return
    }

    if (data.session) {
      enterOnboarding()
      return
    }

    const { data: signInData } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    })

    if (signInData.session) {
      enterOnboarding()
      return
    }

    setPending(false)
    setMessage("Account created. Confirm your email and the confirmation link will bring you back to onboarding.")
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md rounded-lg">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-md border bg-muted">
            <IconUserPlus className="size-5" />
          </div>
          <CardTitle>Create account</CardTitle>
          <CardDescription>Start a QM workspace for your community project.</CardDescription>
        </CardHeader>
        <CardContent>
          {!configured ? (
            <p className="text-sm text-muted-foreground">
              Supabase is not configured for this UI environment.
            </p>
          ) : (
            <form className="grid gap-4" onSubmit={submit}>
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
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
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
              <Button type="submit" disabled={pending}>
                {pending ? <IconLoader2 className="size-4 animate-spin" /> : null}
                Create account
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Already have access?{" "}
                <Link className="font-medium text-foreground underline underline-offset-4" to="/login">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
