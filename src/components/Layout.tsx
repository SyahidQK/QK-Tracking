import { useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, LogOut, PackagePlus, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { cn, initials } from '@/lib/utils'
import { Button } from '@/components/ui'

function Brand({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn('flex items-center gap-2.5', className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
        QK
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-slate-900">
        Equipment Tracking
      </span>
    </Link>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const { profile, session, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const name = profile?.fullName ?? session?.user.email ?? ''
  const email = profile?.email ?? session?.user.email ?? ''

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/new', label: 'Borrow item', icon: PackagePlus, end: false },
    ...(isAdmin ? [{ to: '/admin', label: 'All records', icon: ShieldCheck, end: false }] : []),
  ]

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Brand />

          <nav className="hidden items-center gap-1 sm:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'focus-ring rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="focus-ring flex items-center gap-2 rounded-full p-0.5 transition hover:bg-slate-100"
              aria-label="Account menu"
              aria-expanded={menuOpen}
            >
              {profile?.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-8 w-8 rounded-full object-cover ring-1 ring-slate-200"
                />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                  {initials(name)}
                </span>
              )}
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                  aria-hidden
                />
                <div className="absolute right-0 z-20 mt-2 w-60 animate-fade-in overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="truncate text-sm font-medium text-slate-900">{name}</p>
                    <p className="truncate text-xs text-slate-500">{email}</p>
                    {isAdmin && (
                      <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 ring-1 ring-inset ring-brand-600/20">
                        <ShieldCheck className="h-3 w-3" aria-hidden />
                        Admin
                      </span>
                    )}
                  </div>
                  <button
                    onClick={async () => {
                      setMenuOpen(false)
                      await signOut()
                      navigate('/login', { replace: true })
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                  >
                    <LogOut className="h-4 w-4" aria-hidden />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pb-12">{children}</main>

      {/* Bottom tab bar: on a phone, this is the whole navigation. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        <div className="flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors',
                  isActive ? 'text-brand-700' : 'text-slate-500',
                )
              }
            >
              <item.icon className="h-5 w-5" aria-hidden />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

/** Chrome-free shell for the public return page and other signed-out screens. */
export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              QK
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-slate-900">
              Equipment Tracking
            </span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  )
}

export { Brand, Button }
