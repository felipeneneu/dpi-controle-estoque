"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Message, MessageAvatar, MessageContent, MessageGroup, MessageHeader } from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { RiSendPlaneLine } from "@remixicon/react";
import { api, getUser, backendUrl, type ChatMessage } from "@/lib/api";

export default function ChatPage() {
  const router = useRouter();
  const user = getUser();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);

  useEffect(() => {
    if (!getUser()) {
      router.replace("/auth");
      return;
    }
    let active = true;

    api<ChatMessage[]>("/api/messages?room=geral")
      .then((msgs) => {
        if (active) {
          setMessages(msgs);
          setTimeout(scrollToBottom, 50);
        }
      })
      .catch(() => {});

    const socket = io(backendUrl(), {
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;
    socket.on("connect", () => socket.emit("chat:join", "geral"));
    socket.on("chat:message", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
      setTimeout(scrollToBottom, 50);
    });

    return () => {
      active = false;
      socket.disconnect();
    };
  }, [router, scrollToBottom]);

  async function send() {
    if (!draft.trim() || !user) return;
    const content = draft.trim();
    setDraft("");
    try {
      await api("/api/messages", {
        method: "POST",
        body: JSON.stringify({ room: "geral", content, senderId: user.id }),
      });
      setTimeout(scrollToBottom, 50);
    } catch {
      setDraft(content);
    }
  }

  const initials = (name: string) =>
    name
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

  return (
    <div className="flex flex-col h-full space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Chat Interno</h2>
        <p className="text-sm text-muted-foreground">#geral — comunicação em tempo real entre as máquinas</p>
      </div>

      <Card className="flex-1 min-h-0 rounded-[24px] shadow-sm border-gray-100 bg-card flex flex-col">
        <CardContent className="p-0 flex flex-col flex-1 min-h-0">
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
            <MessageGroup>
              {messages.map((m) => {
                const mine = m.senderId === user?.id;
                return (
                  <Message key={m.id} align={mine ? "end" : "start"}>
                    {!mine && (
                      <MessageAvatar>
                        <Avatar className="size-8">
                          <AvatarFallback className="bg-primary text-white text-xs">{initials(m.senderName || "?")}</AvatarFallback>
                        </Avatar>
                      </MessageAvatar>
                    )}
                    <MessageContent>
                      {!mine && <MessageHeader>{m.senderName || "Usuário"}</MessageHeader>}
                      <Bubble variant={mine ? "default" : "secondary"}>
                        <BubbleContent>{m.content}</BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                );
              })}
              {messages.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda. Envie a primeira!</p>
              )}
            </MessageGroup>
          </div>

          <div className="border-t border-gray-100 p-4 flex items-center gap-3">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Digite uma mensagem…"
              className="h-11 rounded-xl"
            />
            <Button onClick={send} disabled={!draft.trim()} className="h-11 rounded-xl px-4">
              <RiSendPlaneLine className="w-5 h-5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
