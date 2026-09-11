"use client"

import { avatarUrl, type UserPhoto } from "@/lib/api"

type Props = {
  value: string | null
  onChange: (value: string | null) => void
  photos: UserPhoto[]
}

export default function AvatarPicker({ value, onChange, photos }: Props) {
  return (
    <div>
      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma foto encontrada em <code className="text-primary">/public/users</code>.
        </p>
      ) : (
        <div className="grid grid-cols-5 gap-2">
          <button
            type="button"
            onClick={() => onChange(null)}
            className={`flex items-center justify-center h-14 rounded-xl border text-xs font-semibold transition-colors ${
              value === null ? "border-primary bg-primary/10 text-primary" : "border-gray-150 text-muted-foreground hover:bg-gray-50"
            }`}
          >
            Sem foto
          </button>
          {photos.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => onChange(p.url)}
              className={`aspect-square rounded-xl overflow-hidden ring-offset-2 transition-all ${
                value === p.url ? "ring-2 ring-[var(--brand-purple)]" : "ring-1 ring-gray-200 hover:ring-gray-400"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarUrl(p.url)} alt={p.name} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}