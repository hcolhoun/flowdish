export function systemOwnerEmails() {
  return String(process.env.SYSTEM_OWNER_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

export function isSystemOwnerEmail(email: string | null | undefined) {
  if (!email) return false

  return systemOwnerEmails().includes(email.toLowerCase())
}