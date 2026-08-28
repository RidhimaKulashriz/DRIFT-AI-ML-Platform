import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Loader2, Send, User, Sparkles, Volume2, VolumeX, Square, Mic, RotateCcw, Play } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Streamdown } from "streamdown";

/**
 * Message type matching server-side LLM Message interface
 */
export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

type SpeechRecognitionResultEventLike = Event & { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> };
type SpeechRecognitionLike = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((event: SpeechRecognitionResultEventLike) => void) | null; onerror: (() => void) | null; onend: (() => void) | null };

type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };

export type AIChatBoxProps = {
  /**
   * Messages array to display in the chat.
   * Should match the format used by invokeLLM on the server.
   */
  messages: Message[];

  /**
   * Callback when user sends a message.
   * Typically you'll call a tRPC mutation here to invoke the LLM.
   */
  onSendMessage: (content: string) => void;

  /**
   * Whether the AI is currently generating a response
   */
  isLoading?: boolean;

  /**
   * Placeholder text for the input field
   */
  placeholder?: string;

  /**
   * Custom className for the container
   */
  className?: string;

  /**
   * Height of the chat box (default: 600px)
   */
  height?: string | number;

  /**
   * Empty state message to display when no messages
   */
  emptyStateMessage?: string;

  /**
   * Suggested prompts to display in empty state
   * Click to send directly
   */
  suggestedPrompts?: string[];
  /** Enables built-in browser speech controls for assistant/agent messages. */
  enableSpeech?: boolean;
  /** Label announced for assistant messages. */
  assistantLabel?: string;
};

/**
 * A ready-to-use AI chat box component that integrates with the LLM system.
 *
 * Features:
 * - Matches server-side Message interface for seamless integration
 * - Markdown rendering with Streamdown
 * - Auto-scrolls to latest message
 * - Loading states
 * - Uses global theme colors from index.css
 *
 * @example
 * ```tsx
 * const ChatPage = () => {
 *   const [messages, setMessages] = useState<Message[]>([
 *     { role: "system", content: "You are a helpful assistant." }
 *   ]);
 *
 *   const chatMutation = trpc.ai.chat.useMutation({
 *     onSuccess: (response) => {
 *       // Assuming your tRPC endpoint returns the AI response as a string
 *       setMessages(prev => [...prev, {
 *         role: "assistant",
 *         content: response
 *       }]);
 *     },
 *     onError: (error) => {
 *       console.error("Chat error:", error);
 *       // Optionally show error message to user
 *     }
 *   });
 *
 *   const handleSend = (content: string) => {
 *     const newMessages = [...messages, { role: "user", content }];
 *     setMessages(newMessages);
 *     chatMutation.mutate({ messages: newMessages });
 *   };
 *
 *   return (
 *     <AIChatBox
 *       messages={messages}
 *       onSendMessage={handleSend}
 *       isLoading={chatMutation.isPending}
 *       suggestedPrompts={[
 *         "Explain quantum computing",
 *         "Write a hello world in Python"
 *       ]}
 *     />
 *   );
 * };
 * ```
 */
export function AIChatBox({
  messages,
  onSendMessage,
  isLoading = false,
  placeholder = "Type your message...",
  className,
  height = "600px",
  emptyStateMessage = "Start a conversation with AI",
  suggestedPrompts,
  enableSpeech = true,
  assistantLabel = "AI agent",
}: AIChatBoxProps) {
  const [input, setInput] = useState("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputAreaRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedTranscript, setRecordedTranscript] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const lastSpokenAssistantCount = useRef(0);
  const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;
  const recordingSupported = typeof window !== "undefined" && "MediaRecorder" in window && "mediaDevices" in navigator;
  const recognitionSupported = typeof window !== "undefined" && Boolean((window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition);

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    speechRecognitionRef.current?.stop();
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    setIsRecording(false);
  };

  const startRecording = async () => {
    if (!recordingSupported || isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaChunksRef.current = [];
      setRecordedTranscript("");
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = event => { if (event.data.size) mediaChunksRef.current.push(event.data); };
      recorder.onstop = () => { const blob = new Blob(mediaChunksRef.current, { type: recorder.mimeType || "audio/webm" }); setRecordedUrl(URL.createObjectURL(blob)); stream.getTracks().forEach(track => track.stop()); };
      recorder.start();
      setRecordingSeconds(0);
      setIsRecording(true);
      recordingTimerRef.current = window.setInterval(() => setRecordingSeconds(seconds => seconds + 1), 1000);
      const Recognition = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
      if (Recognition) {
        const recognition = new Recognition();
        recognition.lang = "en-IN";
        recognition.interimResults = false;
        recognition.continuous = true;
        recognition.onresult = event => { const transcript = Array.from({ length: event.results.length }, (_, index) => event.results[index]?.[0]?.transcript ?? "").join(" "); setRecordedTranscript(transcript.trim()); };
        recognition.onerror = () => undefined;
        recognition.onend = () => { if (isRecording) try { recognition.start(); } catch { /* browser already stopped */ } };
        speechRecognitionRef.current = recognition;
        recognition.start();
      }
    } catch {
      setIsRecording(false);
      setRecordedTranscript("Microphone permission was not granted. You can still type a question.");
    }
  };

  const stopSpeaking = () => {
    if (!speechSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  const speak = (content: string) => {
    if (!speechSupported || !content.trim()) return;
    stopSpeaking();
    const utterance = new SpeechSynthesisUtterance(content.replace(/[#*_`>|-]/g, " ").replace(/\s+/g, " ").trim());
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(voice => /^(en-IN|hi-IN)$/i.test(voice.lang)) ?? voices.find(voice => /^en(-US|-GB)?$/i.test(voice.lang)) ?? voices.find(voice => voice.lang.toLowerCase().startsWith("en"));
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.rate = 0.94;
    utterance.pitch = 1.02;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  // Filter out system messages
  const displayMessages = messages.filter((msg) => msg.role !== "system");
  const assistantMessages = displayMessages.filter((msg) => msg.role === "assistant");

  useEffect(() => {
    return () => { if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current); if (recordedUrl) URL.revokeObjectURL(recordedUrl); speechRecognitionRef.current?.stop(); mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop()); };
  }, [recordedUrl]);

  useEffect(() => {
    if (!enableSpeech || !autoSpeak || assistantMessages.length <= lastSpokenAssistantCount.current) return;
    const latest = assistantMessages[assistantMessages.length - 1];
    if (latest) speak(latest.content);
    lastSpokenAssistantCount.current = assistantMessages.length;
  }, [assistantMessages, autoSpeak, enableSpeech]);

  // Calculate min-height for last assistant message to push user message to top
  const [minHeightForLastMessage, setMinHeightForLastMessage] = useState(0);

  useEffect(() => {
    if (containerRef.current && inputAreaRef.current) {
      const containerHeight = containerRef.current.offsetHeight;
      const inputHeight = inputAreaRef.current.offsetHeight;
      const scrollAreaHeight = containerHeight - inputHeight;

      // Reserve space for:
      // - padding (p-4 = 32px top+bottom)
      // - user message: 40px (item height) + 16px (margin-top from space-y-4) = 56px
      // Note: margin-bottom is not counted because it naturally pushes the assistant message down
      const userMessageReservedHeight = 56;
      const calculatedHeight = scrollAreaHeight - 32 - userMessageReservedHeight;

      setMinHeightForLastMessage(Math.max(0, calculatedHeight));
    }
  }, []);

  // Scroll to bottom helper function with smooth animation
  const scrollToBottom = () => {
    const viewport = scrollAreaRef.current?.querySelector(
      '[data-radix-scroll-area-viewport]'
    ) as HTMLDivElement;

    if (viewport) {
      requestAnimationFrame(() => {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: 'smooth'
        });
      });
    }
  };

  const sendRecordedMessage = () => {
    const transcript = recordedTranscript.trim();
    if (!transcript || isLoading) return;
    onSendMessage(`Voice message: ${transcript}`);
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    setRecordedTranscript("");
    setRecordingSeconds(0);
  };

  const discardRecording = () => {
    stopRecording();
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    setRecordedTranscript("");
    setRecordingSeconds(0);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    onSendMessage(trimmedInput);
    setInput("");

    // Scroll immediately after sending
    scrollToBottom();

    // Keep focus on input
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-col bg-card text-card-foreground rounded-lg border shadow-sm",
        className
      )}
      style={{ height }}
    >
      {enableSpeech && <div className="flex items-center justify-between gap-2 border-b bg-background/70 px-3 py-2 text-[10px] uppercase tracking-[.1em]">
        <span className="text-muted-foreground">VOICE · {speechSupported ? (isSpeaking ? `${assistantLabel} speaking` : "ready") : "not supported in this browser"}</span>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" onClick={() => setAutoSpeak(current => !current)} disabled={!speechSupported} className="h-7 px-2 text-[10px]" aria-pressed={autoSpeak}>{autoSpeak ? <Volume2 className="mr-1 size-3" /> : <VolumeX className="mr-1 size-3" />}AUTO SPEAK</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => { const latest = assistantMessages[assistantMessages.length - 1]; if (latest) speak(latest.content); }} disabled={!speechSupported || !assistantMessages.length} className="h-7 px-2 text-[10px]"><Volume2 className="mr-1 size-3" />SPEAK</Button>
          <Button type="button" variant="outline" size="sm" onClick={stopSpeaking} disabled={!speechSupported || !isSpeaking} className="h-7 px-2 text-[10px]"><Square className="mr-1 size-3" />STOP</Button>
        </div>
      </div>}

      {/* Messages Area */}
      <div ref={scrollAreaRef} className="flex-1 overflow-hidden">
        {displayMessages.length === 0 ? (
          <div className="flex h-full flex-col p-4">
            <div className="flex flex-1 flex-col items-center justify-center gap-6 text-muted-foreground">
              <div className="flex flex-col items-center gap-3">
                <Sparkles className="size-12 opacity-20" />
                <p className="text-sm">{emptyStateMessage}</p>
              </div>

              {suggestedPrompts && suggestedPrompts.length > 0 && (
                <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                  {suggestedPrompts.map((prompt, index) => (
                    <button
                      key={index}
                      onClick={() => onSendMessage(prompt)}
                      disabled={isLoading}
                      className="rounded-lg border border-border bg-card px-4 py-2 text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="flex flex-col space-y-4 p-4">
              {displayMessages.map((message, index) => {
                // Apply min-height to last message only if NOT loading (when loading, the loading indicator gets it)
                const isLastMessage = index === displayMessages.length - 1;
                const shouldApplyMinHeight =
                  isLastMessage && !isLoading && minHeightForLastMessage > 0;

                return (
                  <div
                    key={index}
                    className={cn(
                      "flex gap-3",
                      message.role === "user"
                        ? "justify-end items-start"
                        : "justify-start items-start"
                    )}
                    style={
                      shouldApplyMinHeight
                        ? { minHeight: `${minHeightForLastMessage}px` }
                        : undefined
                    }
                  >
                    {message.role === "assistant" && (
                      <div className="size-8 shrink-0 mt-1 rounded-full bg-primary/10 flex items-center justify-center">
                        <Sparkles className="size-4 text-primary" />
                      </div>
                    )}

                    <div
                      className={cn(
                        "max-w-[80%] rounded-lg px-4 py-2.5",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      )}
                    >
                      {message.role === "assistant" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.08em] text-muted-foreground"><span>{assistantLabel}</span><button type="button" onClick={() => speak(message.content)} disabled={!speechSupported} className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[9px] hover:bg-accent disabled:opacity-50" aria-label={`Speak ${assistantLabel} response`}><Volume2 className="size-3" />SPEAK</button></div><Streamdown>{message.content}</Streamdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-sm">
                          {message.content}
                        </p>
                      )}
                    </div>

                    {message.role === "user" && (
                      <div className="size-8 shrink-0 mt-1 rounded-full bg-secondary flex items-center justify-center">
                        <User className="size-4 text-secondary-foreground" />
                      </div>
                    )}
                  </div>
                );
              })}

              {isLoading && (
                <div
                  className="flex items-start gap-3"
                  style={
                    minHeightForLastMessage > 0
                      ? { minHeight: `${minHeightForLastMessage}px` }
                      : undefined
                  }
                >
                  <div className="size-8 shrink-0 mt-1 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles className="size-4 text-primary" />
                  </div>
                  <div className="rounded-lg bg-muted px-4 py-2.5">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Input Area */}
      <form
        ref={inputAreaRef}
        onSubmit={handleSubmit}
        className="flex gap-2 p-4 border-t bg-background/50 items-end"
      >
        {enableSpeech && <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={isRecording ? stopRecording : startRecording} disabled={!recordingSupported} className={cn("h-[38px] shrink-0 px-3 text-[10px] uppercase tracking-[.08em]", isRecording && "border-red-500 text-red-600")} aria-label={isRecording ? "Stop recording voice message" : "Record voice message"}>
            {isRecording ? <Square className="mr-1 size-3" /> : <Mic className="mr-1 size-3" />}{isRecording ? `STOP ${String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:${String(recordingSeconds % 60).padStart(2, "0")}` : "RECORD VOICE"}
          </Button>
          {!recordingSupported && <span className="text-[9px] text-muted-foreground">MIC NOT AVAILABLE</span>}
        </div>}
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 max-h-32 resize-none min-h-9"
          rows={1}
        />
        {recordedUrl && <div className="flex min-w-full flex-wrap items-center gap-2 rounded border border-cyan-700/40 bg-cyan-50 px-2 py-1.5 text-[10px] text-cyan-900">
          <audio controls src={recordedUrl} className="h-8 max-w-[170px]" aria-label="Recorded voice preview" />
          <span className="max-w-[280px] truncate" title={recordedTranscript}>{recordedTranscript || "Audio recorded; speak clearly or type the transcript before sending."}</span>
          <Button type="button" variant="outline" size="sm" onClick={sendRecordedMessage} disabled={!recordedTranscript.trim() || isLoading} className="h-7 px-2 text-[9px]"><Send className="mr-1 size-3" />SEND VOICE</Button>
          <Button type="button" variant="outline" size="sm" onClick={discardRecording} className="h-7 px-2 text-[9px]"><RotateCcw className="mr-1 size-3" />RE-RECORD</Button>
        </div>}
        <Button
          type="submit"
          size="icon"
          disabled={!input.trim() || isLoading}
          className="shrink-0 h-[38px] w-[38px]"
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </form>
    </div>
  );
}
