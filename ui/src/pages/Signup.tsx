import { SignupForm } from '@/components/signup-form'

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <SignupForm className="w-full max-w-sm" />
    </main>
  )
}
