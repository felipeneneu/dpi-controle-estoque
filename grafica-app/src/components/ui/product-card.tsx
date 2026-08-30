'use client';

import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ProductCardProps {
  title: string;
  category: string;
  status: 'ACTIVE' | 'LOW_STOCK';
  quantity: string;
  description: string;
  imageSrc: string;
}

export function ProductCard({ title, category, status, quantity, description, imageSrc }: ProductCardProps) {
  return (
    <Card className="rounded-[24px] p-4 shadow-sm hover:shadow-md transition-all border-gray-100 flex flex-col justify-between bg-card">
      <CardContent className="p-0">
        {/* Imagem do Item com Badges */}
        <div className="relative w-full h-44 rounded-2xl overflow-hidden mb-4 bg-gray-50">
          <Image src={imageSrc} alt={title} fill className="object-cover" />
          <div className="absolute top-3 right-3 flex gap-1.5">
            <Badge className="bg-sky-500 hover:bg-sky-600 text-white font-bold text-[10px] uppercase tracking-wider rounded-md">
              {category}
            </Badge>
            <Badge className={`font-bold text-[10px] uppercase tracking-wider rounded-md ${
              status === 'ACTIVE' ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-amber-500 text-white'
            }`}>
              {status === 'ACTIVE' ? 'Disponível' : 'Estoque Baixo'}
            </Badge>
          </div>
        </div>

        {/* Informações */}
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-bold text-gray-900 text-lg leading-tight">{title}</h3>
          <span className="font-bold text-gray-900 text-lg">{quantity}</span>
        </div>
        <p className="text-muted-foreground text-sm line-clamp-2">{description}</p>
      </CardContent>

      {/* Ação do Operador */}
      <Button variant="outline" className="mt-4 w-full h-11 border-primary text-primary hover:bg-brand-pink/10 font-semibold rounded-xl">
        Dar Baixa no Estoque
      </Button>
    </Card>
  );
}