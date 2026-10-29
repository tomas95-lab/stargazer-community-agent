type DiagnosticsUser = { id: string; email?: string; isDemo?: boolean; app_metadata?: Record<string, unknown> }

export function isDemoDiagnosticsUser(user: DiagnosticsUser | null): boolean {
  return user?.isDemo === true || user?.app_metadata?.demo_account === true
}

export function canUseRedash(user: DiagnosticsUser | null): boolean {
  return !isDemoDiagnosticsUser(user) && user?.id === 'b6f44318-a33e-4d01-958c-5d591d9267bc'
    && user.email?.toLowerCase() === 'tomas.ruiz@contractors.scale.com'
}

export function canUseDiagnostics(user: DiagnosticsUser | null): boolean {
  return isDemoDiagnosticsUser(user) || canUseRedash(user)
}
