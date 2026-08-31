'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { avatarUrl } from '@/lib/api';
import { RiAddLine, RiHashtag } from '@remixicon/react';
import { useUser } from '@/hooks/use-user';

const ROLE_LABEL: Record<string, string> = {
  DEV_MASTER: 'DEV MASTER',
  ADMIN: 'ADMIN',
  OPERATOR: 'OPERADOR',
};

export function SubSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const cat = searchParams.get('cat') || 'todos';
  const user = useUser();
  const initials = user?.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() ?? '?';

  const cats = [
    { label: 'Todos os Insumos', href: '/produtos', active: cat === 'todos' },
    { label: 'Bobinas de Vinil', href: '/produtos?cat=bobinas', active: cat === 'bobinas' },
    { label: 'Papeis Fotográficos', href: '/produtos?cat=fotograficos', active: cat === 'fotograficos' },
  ];
  const onProdutos = pathname === '/produtos';

  return (
    <aside className="w-60 h-[calc(100vh-1rem)] flex flex-col justify-between text-gray-300 select-none border m-2 border-purple-600 shrink-0 rounded-md">

      {/* Topo - Nome do Setor e Ações */}
      <div>
        <div className="h-16 px-4 border-b border-primary flex items-center justify-between">
          <span className="font-bold text-primary text-base tracking-wide">Estoque & Mídias</span>
          <Link href="/produtos/new">
            <Button size="icon" variant="ghost" className="w-8 h-8 rounded-lg hover:bg-[#35373c] text-accent-foreground hover:text-white">
              <RiAddLine className="w-5 h-5" />
            </Button>
          </Link>
        </div>

        {/* Lista de Categorias / Canais */}
        <div className="p-3 space-y-1">
          <div className="px-2 py-1.5 text-xs font-bold text-foreground uppercase tracking-wider">
            Categorias Ativas
          </div>

          {cats.map((c) => (
            <button
              key={c.label}
              onClick={() => router.push(c.href)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                onProdutos && c.active
                  ? 'bg-primary text-secondary font-medium'
                  : 'hover:bg-primary/50 text-primary hover:text-primary font-medium'
              }`}
            >
              <RiHashtag className="w-4 h-4" />
              <span>{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Rodapé do Operador (User Bar Discord) */}
      <div className="h-16 bg-primary px-3 flex items-center justify-between rounded-b-md">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="relative">
            <Avatar className="w-9 h-9 border border-gray-700">
              {user?.avatar && <AvatarImage src={avatarUrl(user.avatar)} alt={user.name} />}
              <AvatarFallback className="bg-primary text-white font-bold">{initials}</AvatarFallback>
            </Avatar>
            {/* Status Online em Tempo Real (Socket.io) */}
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#232428] rounded-full" />
          </div>

          <div className="flex flex-col leading-tight truncate">
            <span className="text-sm font-semibold text-white truncate">{user?.name || 'Operador'}</span>
            <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
              {ROLE_LABEL[user?.role ?? ''] ?? user?.role ?? 'OPERADOR'}
            </span>
          </div>
        </div>
      </div>

    </aside>
  );
}