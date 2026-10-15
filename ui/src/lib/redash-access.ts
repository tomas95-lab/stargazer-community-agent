export function canUseRedash(user: { id: string; email?: string } | null): boolean {
  return user?.id === 'b6f44318-a33e-4d01-958c-5d591d9267bc'
    && user.email?.toLowerCase() === 'tomas.ruiz@contractors.scale.com'
}
