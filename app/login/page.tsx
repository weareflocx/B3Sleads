'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getBrowserSupabase } from '@/lib/supabase-browser';
import { Logo } from '../(dashboard)/logo';

// Login de onboarding: enlace mágico por email o Google. Sin contraseñas.
// La sesión la valida el middleware; el dashboard queda protegido.
function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    params.get('error') ? 'error' : 'idle',
  );
  const [detail, setDetail] = useState<string | null>(null);

  async function sendMagicLink() {
    if (!email.trim()) return;
    setState('sending');
    const supabase = getBrowserSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setState('error');
      setDetail(error.message);
    } else {
      setState('sent');
    }
  }

  async function loginWithGoogle() {
    const supabase = getBrowserSupabase();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setState('error');
      setDetail(error.message);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-center justify-center gap-2">
          <Logo />
          <span className="text-xs font-semibold text-[var(--muted)]">Leads</span>
        </Link>

        <div className="mt-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
          <h1 className="text-lg font-bold tracking-tight">Entrar</h1>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Sin contraseñas: te mandamos un enlace de acceso al email.
          </p>

          {state === 'sent' ? (
            <div className="mt-5 rounded-md border border-[var(--cta)]/40 bg-[var(--cta)]/8 p-3 text-sm">
              <span className="text-[var(--cta)]">✓ Enlace enviado.</span>{' '}
              Revisa <span className="font-medium">{email}</span> y abre el enlace desde este
              dispositivo.
            </div>
          ) : (
            <>
              <label htmlFor="email" className="mt-5 block text-xs text-[var(--muted)]">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMagicLink()}
                placeholder="tu@empresa.com"
                autoComplete="email"
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--cta)]"
              />
              <button
                onClick={sendMagicLink}
                disabled={state === 'sending' || !email.trim()}
                className="mt-3 w-full rounded-md bg-[var(--cta)] px-3 py-2 text-sm font-medium text-[var(--cta-text)] transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {state === 'sending' ? 'Enviando…' : 'Enviarme enlace de acceso'}
              </button>

              <div className="my-4 flex items-center gap-3 text-[10px] uppercase tracking-wider text-[var(--soft)]">
                <span className="h-px flex-1 bg-[var(--border)]" />
                o
                <span className="h-px flex-1 bg-[var(--border)]" />
              </div>

              <button
                onClick={loginWithGoogle}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm font-medium transition-colors hover:border-[var(--muted)]"
              >
                <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                Continuar con Google
              </button>
            </>
          )}

          {state === 'error' && (
            <p className="mt-3 text-xs text-[var(--danger)]">
              No se pudo iniciar sesión{detail ? `: ${detail}` : ''}. Inténtalo de nuevo.
            </p>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-[var(--soft)]">
          B3S Leads · el envío es siempre humano
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
