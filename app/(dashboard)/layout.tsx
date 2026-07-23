import { isDemoMode } from '@/lib/supabase';
import { currentUser } from '@/lib/auth';
import { Sidebar } from './sidebar';
import { Footer } from './footer';
import { PAGE } from './page-width';

// App-shell: menú lateral fijo a la izquierda (comprimible, cajón en móvil) y
// el contenido a la derecha con un ancho de lectura acotado y su pie. La
// cuenta y el tema viven al pie del menú; el logo lleva a home.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();

  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1">
          <div className="w-full px-5 pb-10 pt-[72px] md:px-10 md:pt-9">
            {isDemoMode() && (
              <div className={`${PAGE} mb-6 border border-[var(--warning)]/40 bg-[var(--accent-soft)]/30 px-4 py-2 text-xs text-[var(--warning)]`}>
                Modo demo: sin Supabase configurado. Los datos son de ejemplo y los cambios no se
                guardan. Configura .env.local para producción.
              </div>
            )}
            {children}
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
