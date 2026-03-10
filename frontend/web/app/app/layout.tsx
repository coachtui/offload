// The middleware.ts already redirects unauthenticated users away from /app/*.
// This layout just wraps child pages — no additional auth logic needed here.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
