"use client"

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react"
import { type Socket } from "socket.io-client"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { Message, MessageAvatar, MessageContent, MessageGroup, MessageHeader } from "@/components/ui/message"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { RiRobot2Line } from "@remixicon/react"
import { avatarUrl, getUser, api, type ChatMessage } from "@/lib/api"
import { getSocket } from "@/lib/socket"
import { useUser } from "@/hooks/use-user"
import { useMessages, useDmMessages, useSendMessage, fetchOlderMessages } from "@/lib/queries/messages"
import { ScrollableContainer } from "@/components/scrollable-container"
import { GeminiInput } from "@/components/gemini-input"

interface CommandInfo {
  name: string
  description: string
}

function formatDateSeparator(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) return "Hoje"
  if (diffDays === 1) return "Ontem"
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function shouldShowDateSeparator(current: ChatMessage, previous?: ChatMessage): boolean {
  if (!previous) return true
  const d1 = new Date(current.createdAt)
  const d2 = new Date(previous.createdAt)
  return d1.toDateString() !== d2.toDateString()
}

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 dark:bg-zinc-800 px-1 py-0.5 rounded text-xs">$1</code>')
    .replace(/\n/g, '<br/>')
}

// Time in ms before ephemeral bot messages disappear (5 minutes)
const BOT_MESSAGE_TTL = 5 * 60 * 1000

function ChatContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const user = useUser()
  const selectedContactId = searchParams.get("contact")

  const [live, setLive] = useState<ChatMessage[]>([])
  const [olderHistory, setOlderHistory] = useState<ChatMessage[]>([])
  const [ephemeralBotMsgs, setEphemeralBotMsgs] = useState<ChatMessage[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [commands, setCommands] = useState<CommandInfo[]>([])

  const socketRef = useRef<Socket | null>(null)
  const botTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const sendMessage = useSendMessage()

  const isGeral = selectedContactId === null
  const currentRoom = isGeral ? "geral" : `dm:${[user?.id ?? "", selectedContactId].sort().join(":")}`

  const { data: geralHistory = [] } = useMessages(isGeral ? "geral" : "__disabled__")
  const { data: dmHistory = [] } = useDmMessages(!isGeral ? selectedContactId : null)

  const history = isGeral ? geralHistory : dmHistory

  // Reset pagination state when channel/DM changes
  useEffect(() => {
    setOlderHistory([])
    setHasMore(true)
    setIsLoadingMore(false)
  }, [currentRoom])

  // Load command list for autocomplete
  useEffect(() => {
    api<CommandInfo[]>("/api/chat/commands").then(setCommands).catch(() => {})
  }, [])

  // Helper to add ephemeral bot message that auto-dismisses after 5 minutes
  const addEphemeralBotMessage = useCallback((msg: ChatMessage) => {
    setEphemeralBotMsgs((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev
      return [...prev, msg]
    })

    // Set 5-minute timer to clear bot response
    if (!botTimersRef.current.has(msg.id)) {
      const timer = setTimeout(() => {
        setEphemeralBotMsgs((prev) => prev.filter((m) => m.id !== msg.id))
        botTimersRef.current.delete(msg.id)
      }, BOT_MESSAGE_TTL)
      botTimersRef.current.set(msg.id, timer)
    }
  }, [])

  // Clean up bot timers on unmount
  useEffect(() => {
    return () => {
      botTimersRef.current.forEach((timer) => clearTimeout(timer))
      botTimersRef.current.clear()
    }
  }, [])

  // Deduplicated & ordered message list
  const messages = useMemo(() => {
    const seen = new Set<string>()
    const out: ChatMessage[] = []
    for (const m of [...olderHistory, ...history, ...live, ...ephemeralBotMsgs]) {
      if (!seen.has(m.id)) {
        seen.add(m.id)
        out.push(m)
      }
    }
    return out.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }, [olderHistory, history, live, ephemeralBotMsgs])

  // Socket connection & message handler
  useEffect(() => {
    if (!getUser()) {
      router.replace("/auth")
      return
    }
    let active = true
    const socket = getSocket()
    socketRef.current = socket

    const join = () => {
      if (socket.connected) socket.emit("chat:join", currentRoom)
    }

    const onMessage = (msg: ChatMessage) => {
      if (!active) return
      const isRelevant = msg.room === currentRoom || msg.senderId === selectedContactId || msg.recipientId === user?.id

      if (isRelevant) {
        if (msg.senderId === "system" || msg.isCommand) {
          addEphemeralBotMessage(msg)
        } else {
          setLive((prev) => [...prev, msg])
        }
      }
    }

    setLive([])
    join()
    socket.on("connect", join)
    socket.on("chat:message", onMessage)

    return () => {
      active = false
      socket.emit("chat:leave", currentRoom)
      socket.off("connect", join)
      socket.off("chat:message", onMessage)
    }
  }, [currentRoom, selectedContactId, router, user?.id, addEphemeralBotMessage])

  // Infinite Scroll Handler: loads older messages when scrolling to top
  const handleReachTop = useCallback(async () => {
    if (isLoadingMore || !hasMore || messages.length === 0) return

    setIsLoadingMore(true)
    const oldest = messages[0]

    try {
      const fetched = await fetchOlderMessages({
        room: currentRoom,
        recipientId: selectedContactId,
        before: oldest.createdAt,
        limit: 50,
      })

      if (fetched.length === 0) {
        setHasMore(false)
      } else {
        setOlderHistory((prev) => [...fetched, ...prev])
        if (fetched.length < 50) setHasMore(false)
      }
    } catch {
      toast.error("Erro ao carregar histórico antigo")
    } finally {
      setIsLoadingMore(false)
    }
  }, [isLoadingMore, hasMore, messages, currentRoom, selectedContactId])

  // Send message
  async function handleSend(text: string) {
    if (!text.trim() || !user) return

    try {
      const response = (await sendMessage.mutateAsync({
        room: currentRoom,
        recipientId: selectedContactId ?? undefined,
        content: text.trim(),
      })) as unknown as ChatMessage

      // If the response is a bot command answer, store as ephemeral
      if (response && (response.senderId === "system" || response.isCommand)) {
        addEphemeralBotMessage(response)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao enviar mensagem"
      if (msg.includes("401") || msg.toLowerCase().includes("unauthorized")) {
        toast.error("Sessão expirada. Faça login novamente.")
        router.replace("/auth")
      } else {
        toast.error(msg || "Erro ao enviar mensagem")
      }
    }
  }

  const initials = (name: string) =>
    name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Chat Header */}
      <div className="shrink-0 px-6 py-3 border-b border-gray-200 bg-white rounded-md mb-3">
        <h2 className="text-lg font-bold text-gray-900">
          {isGeral ? "#geral" : messages.find((m) => m.senderId === selectedContactId)?.senderName || "Conversa"}
        </h2>
        <p className="text-xs text-muted-foreground">
          {isGeral ? "Canal geral — comunicação em tempo real" : "Mensagem privada"}
        </p>
      </div>

      {/* Chat Body wrapped in ScrollableContainer with hidden scrollbar */}
      <Card className="flex-1 min-h-0 rounded-lg border-0 border-b shadow-none bg-white flex flex-col py-0 gap-0 overflow-hidden">
        <CardContent className="p-0 flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-hidden">
            <ScrollableContainer
              onReachTop={handleReachTop}
              hasMore={hasMore}
              isLoading={isLoadingMore}
            >
              <div className="p-6 space-y-4">
                <MessageGroup>
                  {messages.map((m, i) => {
                    const mine = m.senderId === user?.id
                    const isBot = m.senderId === "system" || m.isCommand
                    const showDate = shouldShowDateSeparator(m, messages[i - 1])
                    return (
                      <div key={m.id}>
                        {showDate && (
                          <div className="flex items-center gap-3 my-4">
                            <div className="flex-1 h-px bg-gray-200" />
                            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                              {formatDateSeparator(m.createdAt)}
                            </span>
                            <div className="flex-1 h-px bg-gray-200" />
                          </div>
                        )}
                        <Message align={isBot ? "start" : mine ? "end" : "start"}>
                          {isBot ? (
                            <MessageAvatar>
                              <Avatar className="size-8 bg-blue-500">
                                <AvatarFallback className="bg-blue-500 text-white">
                                  <RiRobot2Line className="w-4 h-4" />
                                </AvatarFallback>
                              </Avatar>
                            </MessageAvatar>
                          ) : !mine ? (
                            <MessageAvatar>
                              <Avatar className="size-8">
                                {m.senderAvatar && (
                                  <AvatarImage src={avatarUrl(m.senderAvatar)} alt={m.senderName || "avatar"} />
                                )}
                                <AvatarFallback className="bg-primary text-white text-xs">
                                  {initials(m.senderName || "?")}
                                </AvatarFallback>
                              </Avatar>
                            </MessageAvatar>
                          ) : null}
                          <MessageContent>
                            {!mine && (
                              <MessageHeader>{isBot ? "GraficaOS Bot" : m.senderName || "Usuário"}</MessageHeader>
                            )}
                            {isBot ? (
                              <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 max-w-lg shadow-sm">
                                <div
                                  className="text-sm text-gray-800 leading-relaxed"
                                  dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                                />
                                <p className="text-[10px] text-blue-400 mt-2 font-medium">
                                  Mensagem temporária (desaparece em 5 min)
                                </p>
                              </div>
                            ) : (
                              <Bubble variant={mine ? "default" : "secondary"}>
                                <BubbleContent>{m.content}</BubbleContent>
                              </Bubble>
                            )}
                          </MessageContent>
                        </Message>
                      </div>
                    )
                  })}
                  {messages.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Nenhuma mensagem ainda. Envie a primeira!
                    </p>
                  )}
                </MessageGroup>
              </div>
            </ScrollableContainer>
          </div>

          {/* Gemini Input Footer */}
          <div className="shrink-0">
            <GeminiInput
              onSend={handleSend}
              commands={commands}
              placeholder={
                isGeral
                  ? "Pergunte ao Gemini ou digite / para comandos (#geral)..."
                  : "Digite uma mensagem ou / para comandos..."
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 min-h-0 items-center justify-center text-muted-foreground">Carregando chat...</div>}>
      <ChatContent />
    </Suspense>
  )
}
