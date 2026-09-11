"use client"

import { useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { RiAddLine, RiSearchLine, RiUserLine } from "@remixicon/react"
import { avatarUrl, type ChatContact } from "@/lib/api"
import { useContacts } from "@/lib/queries/messages"
import { useUsers } from "@/lib/queries/users"
import { useUser } from "@/hooks/use-user"

function formatTime(dateStr: string | null): string {
  if (!dateStr) return ""
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  if (diffDays === 1) return "Ontem"
  if (diffDays < 7) return d.toLocaleDateString("pt-BR", { weekday: "short" })
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()
}

interface ChatSidebarProps {
  selectedContactId: string | null
  onSelectContact: (contactId: string) => void
  onOpenGeral: () => void
  isGeralActive: boolean
}

export function ChatSidebar({ selectedContactId, onSelectContact, onOpenGeral, isGeralActive }: ChatSidebarProps) {
  const user = useUser()
  const { data: contacts = [] } = useContacts()
  const [search, setSearch] = useState("")
  const [showNewChat, setShowNewChat] = useState(false)
  const { data: users = [] } = useUsers()

  const filtered = contacts.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  const availableUsers = users.filter((u) => u.id !== user?.id)

  return (
    <div className="flex flex-col h-full border-r border-gray-200 bg-gray-50/50">
      <div className="p-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Conversas</h3>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => setShowNewChat(true)}
          >
            <RiAddLine className="w-4 h-4" />
          </Button>
        </div>
        <div className="relative">
          <RiSearchLine className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="h-8 pl-7 text-xs rounded-lg"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <button
          onClick={onOpenGeral}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
            isGeralActive ? "bg-primary/10 border-r-2 border-primary" : "hover:bg-gray-100"
          }`}
        >
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
            #
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">#geral</p>
            <p className="text-xs text-gray-500 truncate">Canal geral</p>
          </div>
        </button>

        {filtered.map((contact) => (
          <button
            key={contact.id}
            onClick={() => onSelectContact(contact.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
              selectedContactId === contact.id ? "bg-primary/10 border-r-2 border-primary" : "hover:bg-gray-100"
            }`}
          >
            <Avatar className="w-8 h-8">
              {contact.avatar && <AvatarImage src={avatarUrl(contact.avatar)} alt={contact.name} />}
              <AvatarFallback className="bg-gray-200 text-gray-600 text-xs">{initials(contact.name)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{contact.name}</p>
              {contact.lastMessage && (
                <p className="text-xs text-gray-500 truncate">{contact.lastMessage}</p>
              )}
            </div>
            {contact.lastMessageAt && (
              <span className="text-[10px] text-gray-400 shrink-0">{formatTime(contact.lastMessageAt)}</span>
            )}
          </button>
        ))}

        {filtered.length === 0 && !search && (
          <p className="text-xs text-gray-400 text-center py-4">Nenhuma conversa ainda</p>
        )}
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
                  onSelectContact(u.id)
                  setShowNewChat(false)
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
    </div>
  )
}
