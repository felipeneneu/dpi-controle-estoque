'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { RiMailLine, RiLockPasswordLine, RiEyeLine, RiEyeOffLine, RiArrowRightLine } from '@remixicon/react';
import { api, setToken, setUser } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ token: string; user: { id: string; name: string; email: string; role: string } }>(
        '/api/auth/login',
        { method: 'POST', body: JSON.stringify({ email, password }) }
      );
      setToken(res.token);
      setUser(res.user);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-screen h-screen max-w-[1920px] max-h-[1080px] overflow-hidden bg-[hsl(var(--background))] flex items-center justify-between p-16 select-none">
      
      {/* Lado Esquerdo - Hero / Branding */}
      <div className="flex-1 flex flex-col justify-between h-full max-w-[800px]">
        <div className="flex items-center gap-4">
          <div>
            <Image src="/assets/Logo.svg" alt="Logo" width={267} height={48} priority />
          </div>
        </div>

        <div className="relative w-full h-[650px] flex items-center justify-center">
       
            <Image src="/assets/Background.svg" alt="Caixa" fill className="object-contain" priority />
        
        </div>

        <p className="text-xs text-muted-foreground">© GráficaOS — Sistema de Gestão de Produção</p>
      </div>

      {/* Lado Direito - Card Form do Shadcn */}
      <Card className="w-[540px] rounded-[32px] p-8 shadow-sm border-gray-100 flex flex-col justify-between h-[680px]">
        <CardContent className="p-0 flex flex-col justify-between h-full">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Acesse sua conta</h2>
            <p className="text-muted-foreground text-sm mb-10">Informe seu e-mail e senha para entrar</p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">E-MAIL</Label>
                <div className="relative flex items-center border-b border-input focus-within:border-primary transition-colors pb-1">
                  <RiMailLine className="w-5 h-5 text-muted-foreground mr-3" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Seu e-mail cadastrado"
                    className="border-none shadow-none focus-visible:ring-0 px-0 h-9"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">SENHA</Label>
                <div className="relative flex items-center border-b border-input focus-within:border-primary transition-colors pb-1">
                  <RiLockPasswordLine className="w-5 h-5 text-muted-foreground mr-3" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Sua senha de acesso"
                    className="border-none shadow-none focus-visible:ring-0 px-0 h-9"
                    required
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-muted-foreground">
                    {showPassword ? <RiEyeOffLine className="w-5 h-5" /> : <RiEyeLine className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {error && <p className="text-sm text-brand-pink font-semibold -mt-2">{error}</p>}

              <Button type="submit" className="mt-6 w-full h-14 rounded-2xl justify-between px-6 text-base font-semibold shadow-md" disabled={busy}>
                <span>{busy ? 'Entrando…' : 'Acessar'}</span>
                <RiArrowRightLine className="w-5 h-5" />
              </Button>
            </form>
          </div>

          <div className="pt-6 border-t border-gray-100">
            <p className="text-sm text-muted-foreground mb-3">Ainda não tem uma conta?</p>
            <Button variant="outline" className="w-full h-14 rounded-2xl justify-between px-6 border-primary text-primary hover:bg-brand-pink/10 text-base font-semibold">
              <span>Cadastrar</span>
              <RiArrowRightLine className="w-5 h-5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}