/**
 * MessagePanel — displays conversation messages alongside the terminal
 * in the split-pane layout.
 *
 * Listens on the same event channel as ChatSidebar for tool events and
 * session messages. Renders a chat-message thread that mirrors the Hermes
 * TUI conversation in a browser-native widget.
 *
 * Supports compact mode (no avatars/icons, minimal styling) for the
 * "Code Mode" experience, controlled via the `compact` prop.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Bot,
  Terminal,
  Loader2,
  AlertCircle,
  MessageSquare,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface RpcEnvelope {
  method?: string;
  params?: { type?: string; payload?: unknown };
}

interface ToolStartPayload {
  tool_id?: string;
  name?: string;
  context?: string;
}

interface ToolProgressPayload {
  name?: string;
  preview?: string;
}

interface ToolCompletePayload {
  tool_id?: string;
  summary?: string;
  error?: string;
}

interface SessionInfoPayload {
  session_id?: string;
  provider?: string;
  model?: string;
}

interface MessageEntry {
  id: string;
  kind: "user" | "assistant" | "tool" | "system";
  content: string;
  timestamp: number;
  status?: "running" | "done" | "error";
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface MessagePanelProps {
  channel: string;
  className?: string;
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function MessagePanel({ channel, className, compact = false }: MessagePanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [messages, setMessages] = useState<MessageEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [, setError] = useState<string | null>(null);

  // Auto-scroll to bottom on new messages
  const autoScroll = useRef(true);
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 40; // px from bottom
    autoScroll.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  useEffect(() => {
    if (autoScroll.current) {
      const el = scrollRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [messages]);

  // ---- WebSocket event subscriber --------------------------------------
  useEffect(() => {
    const token = window.__HERMES_SESSION_TOKEN__;
    if (!token || !channel) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const qs = new URLSearchParams({ token, channel });
    const ws = new WebSocket(
      `${proto}//${window.location.host}/api/events?${qs.toString()}`,
    );

    let unmounting = false;

    ws.addEventListener("open", () => {
      if (!unmounting) setConnected(true);
    });

    ws.addEventListener("close", (ev) => {
      if (!unmounting) {
        setConnected(false);
        if (ev.code !== 1000) {
          setError("events feed disconnected");
        }
      }
    });

    ws.addEventListener("error", () => {
      if (!unmounting) {
        setConnected(false);
        setError("events feed error");
      }
    });

    ws.addEventListener("message", (ev) => {
      if (unmounting) return;
      let frame: RpcEnvelope;
      try {
        frame = JSON.parse(ev.data);
      } catch {
        return;
      }

      if (frame.method !== "event" || !frame.params) return;
      const { type, payload } = frame.params;

      switch (type) {
        case "tool.start": {
          const p = payload as ToolStartPayload | undefined;
          if (!p?.tool_id) return;
          const name = p.name ?? "tool";
          setMessages((prev) => [
            ...prev,
            {
              id: `tool-${p.tool_id}`,
              kind: "tool",
              content: `Running ${name}${p.context ? `: ${p.context}` : ""}`,
              timestamp: Date.now(),
              status: "running",
            },
          ]);
          break;
        }

        case "tool.progress": {
          const p = payload as ToolProgressPayload | undefined;
          if (!p?.name) return;
          setMessages((prev) => {
            const last = prev.findLast(
              (m) => m.kind === "tool" && m.status === "running",
            );
            if (!last) return prev;
            return prev.map((m) =>
              m.id === last.id
                ? { ...m, content: p.preview ?? m.content }
                : m,
            );
          });
          break;
        }

        case "tool.complete": {
          const p = payload as ToolCompletePayload | undefined;
          if (!p?.tool_id) return;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === `tool-${p.tool_id}`
                ? {
                    ...m,
                    status: p.error ? ("error" as const) : ("done" as const),
                    content: p.summary ?? p.error ?? m.content,
                  }
                : m,
            ),
          );
          break;
        }

        case "session.info": {
          const p = payload as SessionInfoPayload | undefined;
          if (p?.model) {
            setMessages((prev) => {
              if (prev.some((m) => m.kind === "system")) return prev;
              return [
                ...prev,
                {
                  id: `session-${Date.now()}`,
                  kind: "system",
                  content: `Connected · ${p.model ?? "loading…"}`,
                  timestamp: Date.now(),
                },
              ];
            });
          }
          break;
        }
      }
    });

    return () => {
      unmounting = true;
      ws.close();
    };
  }, [channel]);

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-lg bg-background-base/40",
        className,
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex shrink-0 items-center justify-between gap-2",
          "border-b border-border/20 px-3 py-2",
        )}
      >
        <div className="flex items-center gap-2">
          {!compact && <Bot className="h-3.5 w-3.5 text-midground/60" />}
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-midground/60">
            {compact ? "Output" : "Chat"}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "inline-block h-1.5 w-1.5 rounded-full",
              connected ? "bg-success" : "bg-destructive",
            )}
          />
          <span className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">
            {connected ? "Live" : "Offline"}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-xs text-muted-foreground">
              {compact ? (
                <Terminal className="mx-auto mb-2 h-6 w-6 opacity-30" />
              ) : (
                <Bot className="mx-auto mb-2 h-6 w-6 opacity-30" />
              )}
              <p>{compact ? "Terminal output will appear here" : "Conversation messages will appear here"}</p>
              <p className="mt-1 opacity-60">Start a session to begin</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "rounded-md px-2.5 py-2 text-xs leading-relaxed",
                  msg.kind === "tool" && [
                    "border border-border/10",
                    msg.status === "running" && "bg-accent/5",
                    msg.status === "done" && "bg-accent/3",
                    msg.status === "error" &&
                      "border-destructive/20 bg-destructive/5",
                  ],
                  msg.kind === "system" &&
                    "bg-muted/5 text-muted-foreground italic",
                )}
              >
                <div className={cn(
                  "flex items-start gap-2",
                  compact && "gap-1",
                )}>
                  {/* Icon — hidden in compact mode */}
                  {!compact && (
                    <span className="mt-0.5 shrink-0">
                      {msg.kind === "tool" && msg.status === "running" && (
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                      )}
                      {msg.kind === "tool" && msg.status === "done" && (
                        <Terminal className="h-3 w-3 text-success" />
                      )}
                      {msg.kind === "tool" && msg.status === "error" && (
                        <AlertCircle className="h-3 w-3 text-destructive" />
                      )}
                      {msg.kind === "system" && (
                        <Bot className="h-3 w-3 text-muted-foreground" />
                      )}
                      {msg.kind === "user" && (
                        <MessageSquare className="h-3 w-3 text-muted-foreground/60" />
                      )}
                    </span>
                  )}

                  {/* Content */}
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                    {msg.content}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer status */}
      <div
        className={cn(
          "shrink-0 border-t border-border/20 px-3 py-1.5",
          "text-[0.55rem] uppercase tracking-widest text-muted-foreground/40 text-center",
        )}
      >
        {messages.length} {compact ? "output" : "message"}{messages.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
