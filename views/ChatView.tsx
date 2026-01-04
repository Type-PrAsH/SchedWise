import React, { useState, useRef, useEffect } from "react";
import { Message } from "../types";
import { geminiService } from "../services/gemini";

const ChatView: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      text: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Temporary profile & history (safe defaults)
      const profile = {};
      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

     const freeMinutes = detectFreeTime(input);

// TEMP skills (later replace with real selected skills)
const selectedSkills = [
  "Web Development",
  "JavaScript",
  "Communication"
];

if (freeMinutes) {
  const suggestions = await geminiService.getSuggestions(
    { durationMinutes: freeMinutes } as any,
    selectedSkills as any
  );

  let reply = `You have ${freeMinutes} minutes free.\n\n`;

  suggestions.forEach((s, i) => {
    reply += `${i + 1}. ${s.title}${
      s.recommended ? " ⭐ Recommended" : ""
    }\n`;

    if (s.youtubeSearchQuery) {
      reply += `🔗 https://www.youtube.com/results?search_query=${encodeURIComponent(
        s.youtubeSearchQuery
      )}\n`;
    }

    reply += "\n";
  });

  setMessages(prev => [
    ...prev,
    {
      id: `${Date.now()}-${Math.random()}`,
      role: "model",
      text: reply,
      timestamp: Date.now()
    }
  ]);
} else {
  const reply = await geminiService.chatAssistant(
    input,
    profile,
    history
  );

  setMessages(prev => [
    ...prev,
    {
      id: `${Date.now()}-${Math.random()}`,
      role: "model",
      text: reply,
      timestamp: Date.now()
    }
  ]);
}

    } catch (e) {
      setMessages(prev => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          role: "model",
          text: "⚠️ AI is busy right now. Please try again.",
          timestamp: Date.now()
        }
      ]);
    }

    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-full glass rounded-[3rem] overflow-hidden shadow-2xl border border-white/10">
      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8 hide-scrollbar"
      >
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center text-white/40 text-lg">
            Start by telling me about your free time or a cancelled class.
          </div>
        )}

        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[75%] p-6 rounded-[2.5rem] ${
                msg.role === "user"
                  ? "bg-primary text-black font-bold rounded-tr-none"
                  : "glass bg-white/5 text-white rounded-tl-none border border-white/10"
              }`}
            >
              <pre className="whitespace-pre-wrap font-medium">
                {msg.text}
              </pre>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="text-white/40">SchedWise is thinking…</div>
        )}
      </div>

      {/* Input */}
      <div className="p-8 border-t border-white/10">
        <div className="flex gap-4 max-w-5xl mx-auto">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSend()}
            placeholder="Class cancelled? Free time?"
            className="flex-1 px-8 py-5 rounded-[2rem] bg-white/5 text-white border border-white/10"
          />
          <button
            onClick={handleSend}
            disabled={isLoading}
            className="w-20 h-20 rounded-[2rem] bg-primary text-black font-bold"
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
};
function detectFreeTime(text: string): number | null {
  const t = text.toLowerCase();

  if (t.includes("1 hr") || t.includes("1 hour")) return 60;
  if (t.includes("2 hr") || t.includes("2 hours")) return 120;

  const m = t.match(/(\d+)\s*min/);
  return m ? parseInt(m[1], 10) : null;
}

export default ChatView;