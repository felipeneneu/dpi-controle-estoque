"use client"

import React, { useState, useRef, useEffect } from 'react'
import { RiAttachment2, RiMicLine, RiStopCircleLine, RiCloseLine, RiFileTextLine } from '@remixicon/react'

interface GeminiInputProps {
  onSend: (text: string, attachments?: { file?: File; audioBlob?: Blob; fileName?: string }) => void
  disabled?: boolean
  placeholder?: string
  commands?: { name: string; description: string }[]
  onSelectCommand?: (cmdName: string) => void
}

export const GeminiInput: React.FC<GeminiInputProps> = ({
  onSend,
  disabled = false,
  placeholder = 'Pergunte ao Gemini ou envie um arquivo...',
  commands = [],
}) => {
  const [text, setText] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null)
  const [audioDuration, setAudioDuration] = useState(0)
  const [showCommands, setShowCommands] = useState(false)
  const [selectedCmdIdx, setSelectedCmdIdx] = useState(0)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const hasContent = text.trim().length > 0 || selectedFile !== null || recordedAudio !== null

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
  }, [text])

  // Filter commands for autocomplete
  const filteredCommands = text.startsWith('/')
    ? commands.filter((c) => c.name.toLowerCase().startsWith(text.toLowerCase()))
    : []

  // Re-evaluate the command autocomplete whenever the input text changes (adjust during render)
  const [prevCommandText, setPrevCommandText] = useState(text)
  if (text !== prevCommandText) {
    setPrevCommandText(text)
    if (text.startsWith('/') && filteredCommands.length > 0) {
      setShowCommands(true)
      setSelectedCmdIdx(0)
    } else {
      setShowCommands(false)
    }
  }

  // Handle file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0])
    }
  }

  // Handle audio recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        setRecordedAudio(audioBlob)
        stream.getTracks().forEach((track) => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
      setAudioDuration(0)

      timerRef.current = setInterval(() => {
        setAudioDuration((prev) => prev + 1)
      }, 1000)
    } catch {
      // Audio permission denied or not supported
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }

  const handleSend = () => {
    if (!hasContent || disabled) return

    let fullText = text.trim()
    if (selectedFile) {
      fullText = fullText ? `${fullText} [Anexo: ${selectedFile.name}]` : `[Anexo: ${selectedFile.name}]`
    }
    if (recordedAudio) {
      fullText = fullText ? `${fullText} [Áudio gravado (${audioDuration}s)]` : `[Áudio gravado (${audioDuration}s)]`
    }

    onSend(fullText, {
      file: selectedFile ?? undefined,
      audioBlob: recordedAudio ?? undefined,
      fileName: selectedFile?.name,
    })

    setText('')
    setSelectedFile(null)
    setRecordedAudio(null)
    setShowCommands(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showCommands && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedCmdIdx((i) => (i + 1) % filteredCommands.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedCmdIdx((i) => (i - 1 + filteredCommands.length) % filteredCommands.length)
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        const selectedCmd = filteredCommands[selectedCmdIdx]
        if (selectedCmd) {
          setText(selectedCmd.name + ' ')
          setShowCommands(false)
        }
        return
      }
      if (e.key === 'Escape') {
        setShowCommands(false)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <footer className="p-4 bg-white dark:bg-zinc-900 border-t border-gray-100 dark:border-zinc-800/50">
      <div className="max-w-4xl mx-auto relative">
        {/* Command Autocomplete Popup */}
        {showCommands && filteredCommands.length > 0 && (
          <div className="absolute bottom-full mb-2 left-0 right-0 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-2xl shadow-xl overflow-hidden max-h-48 overflow-y-auto z-50">
            {filteredCommands.map((cmd, i) => (
              <button
                key={cmd.name}
                type="button"
                onClick={() => {
                  setText(cmd.name + ' ')
                  setShowCommands(false)
                  textareaRef.current?.focus()
                }}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${
                  i === selectedCmdIdx
                    ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300'
                    : 'hover:bg-gray-50 dark:hover:bg-zinc-750 text-gray-700 dark:text-zinc-200'
                }`}
              >
                <span className="text-sm font-mono font-semibold">{cmd.name}</span>
                <span className="text-xs text-gray-500 dark:text-zinc-400">{cmd.description}</span>
              </button>
            ))}
          </div>
        )}

        {/* Media / Audio Preview Badges */}
        {(selectedFile || recordedAudio || isRecording) && (
          <div className="flex flex-wrap items-center gap-2 mb-2 px-2">
            {selectedFile && (
              <div className="flex items-center gap-2 bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800/50 px-3 py-1.5 rounded-xl text-xs font-medium text-purple-700 dark:text-purple-300">
                <RiFileTextLine className="w-4 h-4" />
                <span className="max-w-[200px] truncate">{selectedFile.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  className="hover:text-red-500 transition-colors ml-1"
                >
                  <RiCloseLine className="w-4 h-4" />
                </button>
              </div>
            )}

            {isRecording && (
              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/50 px-3 py-1.5 rounded-xl text-xs font-medium text-red-600 dark:text-red-400 animate-pulse">
                <RiMicLine className="w-4 h-4" />
                <span>Gravando áudio ({audioDuration}s)...</span>
              </div>
            )}

            {recordedAudio && !isRecording && (
              <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/50 px-3 py-1.5 rounded-xl text-xs font-medium text-emerald-700 dark:text-emerald-300">
                <RiMicLine className="w-4 h-4" />
                <span>Áudio gravado ({audioDuration}s)</span>
                <button
                  type="button"
                  onClick={() => setRecordedAudio(null)}
                  className="hover:text-red-500 transition-colors ml-1"
                >
                  <RiCloseLine className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          className="hidden"
          accept="image/*,application/pdf,.doc,.docx,.txt"
        />

        {/* Main Input Container with Purple Focus Glow */}
        <div className="flex items-end gap-2 bg-gray-50 dark:bg-zinc-800/80 border border-gray-200 dark:border-zinc-700/60 rounded-3xl p-3 focus-within:border-[var(--brand-purple)] focus-within:shadow-[0_0_15px_rgba(141,52,228,0.15)] focus-within:bg-white dark:focus-within:bg-zinc-800 transition-all duration-300">
          {/* Upload Button */}
          <button
            type="button"
            title="Upload de mídia"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-gray-400 dark:text-zinc-400 hover:text-purple-600 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-700/50 rounded-full transition-colors cursor-pointer"
          >
            <RiAttachment2 className="w-5 h-5" />
          </button>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-500 text-sm focus:outline-none resize-none py-2 max-h-[200px] leading-relaxed"
          />

          {/* Right Button Group */}
          <div className="flex items-center gap-1.5">
            {/* Microphone Button */}
            <button
              type="button"
              title={isRecording ? 'Parar gravação' : 'Gravar áudio'}
              onClick={isRecording ? stopRecording : startRecording}
              className={`p-2 rounded-full transition-colors cursor-pointer ${
                isRecording
                  ? 'text-red-500 bg-red-100 dark:bg-red-950/60 animate-bounce'
                  : 'text-gray-400 dark:text-zinc-400 hover:text-purple-600 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-700/50'
              }`}
            >
              {isRecording ? <RiStopCircleLine className="w-5 h-5" /> : <RiMicLine className="w-5 h-5" />}
            </button>

            {/* Send Button with Gemini Gradient */}
            <button
              type="button"
              disabled={!hasContent || disabled}
              onClick={handleSend}
              style={{
                background: hasContent
                  ? 'linear-gradient(135deg, var(--brand-purple), var(--brand-pink))'
                  : 'transparent',
              }}
              className={`p-2.5 rounded-full transition-all duration-300 relative group overflow-hidden ${
                hasContent
                  ? 'text-white cursor-pointer shadow-[0_4px_12px_rgba(141,52,228,0.3)] hover:scale-105 active:scale-95'
                  : 'text-gray-400 dark:text-zinc-600 bg-transparent border border-gray-200 dark:border-zinc-700/50 cursor-not-allowed'
              }`}
            >
              {hasContent && (
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
              )}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
                className={`w-4 h-4 transform rotate-45 transition-transform duration-300 ${
                  hasContent ? '-translate-x-[1px] translate-y-[1px] scale-110' : ''
                }`}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </footer>
  )
}
