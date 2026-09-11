'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { avatarUrl } from '@/lib/api';
import { RiAddLine, RiHashtag, RiUserLine } from '@remixicon/react';
import { useUser } from '@/hooks/use-user';
import { useMachines } from '@/lib/queries/machines';
import { useContacts } from '@/lib/queries/messages';
import { useUsers } from '@/lib/queries/users';

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
  const { data: machines } = useMachines();
  const { data: contacts = [] } = useContacts();
  const [showNewChat, setShowNewChat] = useState(false);
  const { data: users = [] } = useUsers();

  const selectedContactId = searchParams.get('contact');
  const isGeral = pathname.startsWith('/chat') && !selectedContactId;

  const initials = user?.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() ?? '?';

  const contactInitials = (name: string) =>
    name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  const formatTime = (dateStr: string | null): string => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Ontem';
    if (diffDays < 7) return d.toLocaleDateString('pt-BR', { weekday: 'short' });
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const onProdutos = pathname === '/produtos' || pathname.startsWith('/produtos');
  const onMaquinas = pathname === '/maquinas' || pathname.startsWith('/maquinas/');
  const onRelatorios = pathname.startsWith('/relatorios');
  const onChat = pathname.startsWith('/chat');
  const onTintas = pathname.startsWith('/tintas');
  const onEstoque = pathname.startsWith('/estoque');

  const cats = [
    { label: 'Todos os Insumos', href: '/produtos', active: cat === 'todos' },
    { label: 'Bobinas de Vinil', href: '/produtos?cat=bobinas', active: cat === 'bobinas' },
    { label: 'Papeis Fotográficos', href: '/produtos?cat=fotograficos', active: cat === 'fotograficos' },
  ];

  const sectionTitle = onMaquinas
    ? 'Equipamentos'
    : onRelatorios
    ? 'Relatórios'
    : onChat
    ? 'Chat Interno'
    : onTintas
    ? 'Tintas & Química'
    : onEstoque
    ? 'Estoque de Mídias'
    : 'Estoque & Mídias';

  const availableUsers = users.filter((u) => u.id !== user?.id);

  return (
    <aside className="w-60 h-[calc(100vh-1rem)] flex flex-col justify-between text-gray-300 select-none border m-2 border-gray-100 shrink-0 rounded-md bg-card">

      {/* Topo - Nome do Setor e Ações */}
      <div>
        <div className="h-16 px-4 border-b border-gray-100 flex items-center justify-between">
          <span className="font-bold text-gray-900 text-base tracking-wide">{sectionTitle}</span>
          {onProdutos && (
            <Link href="/produtos/new">
              <Button size="icon" variant="ghost" className="w-8 h-8 rounded-lg hover:bg-[#35373c] text-accent-foreground hover:text-white">
                <RiAddLine className="w-5 h-5" />
              </Button>
            </Link>
          )}
          {onChat && (
            <Button size="icon" variant="ghost" className="w-8 h-8 rounded-lg hover:bg-[#35373c] text-accent-foreground hover:text-white" onClick={() => setShowNewChat(true)}>
              <RiAddLine className="w-5 h-5" />
            </Button>
          )}
        </div>

        <div className="p-3 space-y-1 overflow-y-auto flex-1">
          {onMaquinas ? (
            <>
              <div className="px-2 py-1.5 text-xs font-bold text-foreground uppercase tracking-wider">
                Canais dos Equipamentos
              </div>
              <button
                onClick={() => router.push('/maquinas')}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                  pathname === '/maquinas' && !searchParams.get('id')
                    ? 'bg-primary text-secondary font-medium'
                    : 'hover:bg-primary/50 text-primary hover:text-primary font-medium cursor-pointer'
                }`}
              >
                <RiHashtag className="w-4 h-4" />
                <span>Visão Geral</span>
              </button>
              {machines?.map((m) => {
                const active = pathname === '/maquinas' && searchParams.get('id') === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => router.push(`/maquinas?id=${m.id}`)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                      active
                        ? 'bg-primary text-secondary font-medium'
                        : 'hover:bg-primary/50 text-primary hover:text-primary font-medium cursor-pointer'
                    }`}
                  >
                    <RiHashtag className="w-4 h-4" />
                    <span className="truncate">{m.name}</span>
                  </button>
                );
              })}
            </>
          ) : onProdutos ? (
            <>
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
                      : 'hover:bg-primary/50 text-primary hover:text-primary font-medium cursor-pointer'
                  }`}
                >
                  <RiHashtag className="w-4 h-4" />
                  <span>{c.label}</span>
                </button>
              ))}
            </>
          ) : onChat ? (
            <>
              <button
                onClick={() => router.push('/chat')}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                  isGeral
                    ? 'bg-primary text-secondary font-medium'
                    : 'hover:bg-primary/50 text-primary hover:text-primary font-medium cursor-pointer'
                }`}
              >
                <RiHashtag className="w-4 h-4" />
                <span>#geral</span>
              </button>
              {contacts.map((c) => {
                const active = selectedContactId === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => router.push(`/chat?contact=${c.id}`)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                      active
                        ? 'bg-primary text-secondary font-medium'
                        : 'hover:bg-primary/50 text-primary hover:text-primary font-medium cursor-pointer'
                    }`}
                  >
                    <Avatar className="w-5 h-5">
                      {c.avatar && <AvatarImage src={avatarUrl(c.avatar)} alt={c.name} />}
                      <AvatarFallback className="bg-gray-200 text-gray-600 text-[9px]">{contactInitials(c.name)}</AvatarFallback>
                    </Avatar>
                    <span className="truncate flex-1 text-left">{c.name}</span>
                    {c.lastMessageAt && (
                      <span className="text-[9px] opacity-60 shrink-0">{formatTime(c.lastMessageAt)}</span>
                    )}
                  </button>
                );
              })}
            </>
          ) : (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              Nenhum canal listado nesta seção.
            </div>
          )}
        </div>
      </div>

      {/* Rodapé do Operador (User Bar Discord) */}
      <div className="h-16 bg-purple-800 px-3 flex items-center justify-between rounded-b-md">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="relative">
            <Avatar className="w-9 h-9 border border-purple-800">
              {user?.avatar && <AvatarImage src={avatarUrl(user.avatar)} alt={user.name} />}
              <AvatarFallback className="bg-purple-800 text-white font-bold">{initials}</AvatarFallback>
            </Avatar>
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

      <Dialog open={showNewChat} onOpenChange={setShowNewChat}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Conversa</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto space-y-1">
            {availableUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  router.push(`/chat?contact=${u.id}`);
                  setShowNewChat(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 text-left transition-colors"
              >
                <Avatar className="w-8 h-8">
                  {u.avatar && <AvatarImage src={avatarUrl(u.avatar)} alt={u.name} />}
                  <AvatarFallback className="bg-gray-200 text-gray-600 text-xs">
                    <RiUserLine className="w-4 h-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                </div>
              </button>
            ))}
            {availableUsers.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">Nenhum usuário disponível</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
