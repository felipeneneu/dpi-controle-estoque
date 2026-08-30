// src/components/ui/dropzone.tsx
'use client';

import { useState } from 'react';
import Image from 'next/image';
import { RiUploadCloudLine, RiImageAddLine, RiCloseLine } from '@remixicon/react';
import { Button } from '@/components/ui/button';

interface ImageDropzoneProps {
  onImageSelect?: (file: File) => void;
}

export function ImageDropzone({ onImageSelect }: ImageDropzoneProps) {
  const [preview, setPreview] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      if (onImageSelect) onImageSelect(file);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreview(null);
  };

  return (
    <div className="relative w-full h-[360px] rounded-[var(--radius-card)] border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors flex flex-col items-center justify-center p-4 cursor-pointer group overflow-hidden">
      <input
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="absolute inset-0 opacity-0 cursor-pointer z-10"
      />

      {preview ? (
        <div className="relative w-full h-full rounded-2xl overflow-hidden">
          <Image
            src={preview}
            alt="Preview do produto"
            fill
            className="object-cover"
          />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={handleRemove}
            className="absolute top-3 right-3 z-20 rounded-xl shadow-md"
          >
            <RiCloseLine className="w-5 h-5" />
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center text-center space-y-3 p-6">
          <div className="w-16 h-16 rounded-2xl bg-brand-pink/15 flex items-center justify-center text-brand-pink group-hover:scale-110 transition-transform">
            <RiUploadCloudLine className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">
              Clique para selecionar a foto
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PNG, JPG ou WEBP (Recomendado 1000x1000px)
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-brand-pink bg-white px-3 py-1.5 rounded-full border border-brand-pink/20 shadow-sm">
            <RiImageAddLine className="w-4 h-4" />
            <span>Procurar arquivo</span>
          </div>
        </div>
      )}
    </div>
  );
}