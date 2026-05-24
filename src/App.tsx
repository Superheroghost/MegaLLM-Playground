import React, { useState, useEffect, useRef } from 'react';
import { Settings, Play, Square, MessageSquare, Plus, Activity, Zap, FileJson } from 'lucide-react';
import { MarkdownView } from './components/MarkdownView';
import { Model, ChatMessage, Conversation } from './types';
import { formatDistanceToNow } from 'date-fns';

const FALLBACK_MODELS: Model[] = [
  { id: 'gpt-4o', object: 'model', type: 'chat', created_at: '', owned_by: 'openai', display_name: 'GPT-4o', capabilities: { supports_function_calling: false, supports_vision: false, supports_streaming: true, supports_structured_output: false }, context_length: 128000, max_output_tokens: 4096 },
  { id: 'claude-3.5-sonnet', object: 'model', type: 'chat', created_at: '', owned_by: 'anthropic', display_name: 'Claude 3.5 Sonnet', capabilities: { supports_function_calling: false, supports_vision: false, supports_streaming: true, supports_structured_output: false }, context_length: 200000, max_output_tokens: 8192 },
  { id: 'gemini-1.5-pro', object: 'model', type: 'chat', created_at: '', owned_by: 'google', display_name: 'Gemini 1.5 Pro', capabilities: { supports_function_calling: false, supports_vision: false, supports_streaming: true, supports_structured_output: false }, context_length: 1048576, max_output_tokens: 8192 },
];

export default function App() {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('gpt-4o'); 
  const [systemPrompt, setSystemPrompt] = useState('You are a highly efficient software engineer for the MegaLLM platform. Provide clean, secure, and production-ready code snippets.');
  const [temperature, setTemperature] = useState<number>(0.74);
  const [maxTokens, setMaxTokens] = useState<number>(4096);
  
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const saved = localStorage.getItem('megallm_conversations');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(conversations.length > 0 ? conversations[0].id : null);
  
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);

  const currentConversation = conversations.find(c => c.id === currentConversationId);
  const messages = currentConversation?.messages || [];

  useEffect(() => {
    fetch('/api/models')
      .then(r => r.json())
      .then(data => {
        if (data && data.data && Array.isArray(data.data) && data.data.length > 0) {
          setModels(data.data);
          if (!data.data.find((m: any) => m.id === selectedModel)) {
             setSelectedModel(data.data[0].id);
          }
        } else {
          setModels(FALLBACK_MODELS);
        }
      })
      .catch(e => {
        console.error(e);
        setModels(FALLBACK_MODELS);
      });
  }, []);

  useEffect(() => {
    localStorage.setItem('megallm_conversations', JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent]);

  const createNewChat = () => {
    const newChat: Conversation = {
      id: Date.now().toString(),
      title: 'New Conversation',
      messages: [],
      updatedAt: Date.now()
    };
    setConversations([newChat, ...conversations]);
    setCurrentConversationId(newChat.id);
  };

  const updateCurrentConversation = (newMessages: ChatMessage[], titleUpdate?: string) => {
    setConversations(prev => {
      const current = prev.find(c => c.id === currentConversationId);
      if (!current) {
        // Create new if none selected
        const newChat: Conversation = {
          id: Date.now().toString(),
          title: titleUpdate || 'New Conversation',
          messages: newMessages,
          updatedAt: Date.now()
        };
        setCurrentConversationId(newChat.id);
        return [newChat, ...prev];
      }
      
      const title = titleUpdate || current.title;
      return prev.map(c => c.id === current.id ? { ...c, messages: newMessages, title, updatedAt: Date.now() } : c).sort((a,b) => b.updatedAt - a.updatedAt);
    });
  };

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const userText = inputValue.trim();
    const userMessage: ChatMessage = { role: 'user', content: userText };
    
    // Auto-generate title if it's the first message
    let titleToSet = undefined;
    if (messages.length === 0) {
      titleToSet = userText.slice(0, 30) + (userText.length > 30 ? '...' : '');
    }

    const newMessages = [...messages, userMessage];
    updateCurrentConversation(newMessages, titleToSet);
    setInputValue('');
    setIsStreaming(true);
    setStreamingContent('');
    setErrorMsg('');

    try {
      const payloadMessages = [];
      if (systemPrompt.trim()) {
        payloadMessages.push({ role: 'system', content: systemPrompt.trim() });
      }
      payloadMessages.push(...newMessages);

      const response = await fetch('/api/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          messages: payloadMessages,
          temperature,
          max_tokens: maxTokens,
          stream: true,
        }),
      });

      if (!response.ok) {
        let errMsg = 'Network Error';
        try {
           const err = await response.json();
           errMsg = err.error?.message || err.error || errMsg;
        } catch(e) {}
        throw new Error(errMsg);
      }

      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          
          let lineEndIndex;
          while ((lineEndIndex = buffer.indexOf('\n')) !== -1) {
             const line = buffer.slice(0, lineEndIndex).trim();
             buffer = buffer.slice(lineEndIndex + 1);

             if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                const data = line.slice(6);
                try {
                  const parsed = JSON.parse(data);
                  const delta = parsed.choices?.[0]?.delta?.content || '';
                  accumulated += delta;
                  setStreamingContent(accumulated);
                } catch (e) {}
             }
          }
        }

        updateCurrentConversation([...newMessages, { role: 'assistant', content: accumulated }]);
        setStreamingContent('');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'An error occurred during chat.');
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background text-neutral-300 font-sans">
      {/* Left Sidebar: Conversation History */}
      <aside className="w-64 bg-surface border-r border-border flex flex-col shrink-0">
        <div className="p-4 mb-2">
          <button 
             onClick={createNewChat}
             className="w-full bg-[#1A1A1C] border border-white/10 hover:border-white/20 text-white rounded-lg p-3 flex items-center justify-between group transition-all"
          >
            <span className="font-medium text-sm">New Chat</span>
            <Plus className="w-4 h-4 opacity-50 group-hover:opacity-100" />
          </button>
        </div>
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-neutral-500 font-bold">History</div>
          {conversations.map(conv => (
            <div 
              key={conv.id}
              onClick={() => setCurrentConversationId(conv.id)}
              className={`p-3 rounded-lg flex flex-col gap-1 cursor-pointer transition-colors ${currentConversationId === conv.id ? 'bg-white/5 border border-white/5' : 'hover:bg-white/5 border border-transparent'}`}
            >
              <div className={`text-sm font-medium truncate ${currentConversationId === conv.id ? 'text-white' : 'text-neutral-400'}`}>
                {conv.title}
              </div>
              <div className="text-xs text-neutral-600">
                 {formatDistanceToNow(conv.updatedAt, { addSuffix: true })}
              </div>
            </div>
          ))}
          {conversations.length === 0 && (
            <div className="px-3 py-4 text-xs text-neutral-600 italic text-center">No history yet</div>
          )}
        </nav>
        <div className="p-4 border-t border-white/5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 shrink-0"></div>
          <div className="flex-1 min-w-0">
             <div className="text-xs font-bold text-white truncate">Guest User</div>
             <div className="text-[10px] text-neutral-500 tracking-tight italic truncate">Local Session</div>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col relative bg-[#0A0A0B] min-w-0">
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#0A0A0B]/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-indigo-500 rounded flex items-center justify-center text-[10px] font-black text-black shrink-0">M</div>
            <h1 className="font-semibold text-white tracking-tight flex items-center">
              MegaLLM 
              <span className="text-indigo-400 font-mono text-xs ml-2 font-normal select-none px-2 py-0.5 bg-indigo-500/10 rounded border border-indigo-500/20">
                {models.find(m => m.id === selectedModel)?.display_name || selectedModel}
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
             {isStreaming && <span className="text-[11px] text-indigo-400 border border-indigo-400/30 bg-indigo-400/10 px-2 py-0.5 rounded uppercase font-mono animate-pulse">GENERATING</span>}
          </div>
        </header>

        {errorMsg && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 max-w-lg w-full bg-red-900/50 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg text-sm shadow-xl z-20 flex justify-between items-start">
             <span>{errorMsg}</span>
             <button onClick={() => setErrorMsg('')} className="opacity-70 hover:opacity-100">&times;</button>
          </div>
        )}

        <section className="flex-1 px-8 py-8 space-y-8 overflow-y-auto scroll-smooth">
          {(!messages || messages.length === 0) && !isStreaming && (
             <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-50">
                <MessageSquare size={48} className="text-neutral-700" />
                <h2 className="text-xl font-medium text-neutral-400">Ready to chat</h2>
             </div>
          )}

          {messages.map((msg, idx) => (
             <MessageView key={idx} role={msg.role} content={msg.content} />
          ))}

          {isStreaming && (
            <MessageView role="assistant" content={streamingContent || "▋"} />
          )}

          <div ref={chatEndRef} className="h-4" />
        </section>

        <footer className="p-6 shrink-0">
          <div className="max-w-3xl mx-auto relative">
             <div className="bg-[#161618] border border-white/10 rounded-xl p-2 shadow-2xl focus-within:border-indigo-500/50 transition-colors">
                 <textarea 
                   disabled={isStreaming}
                   value={inputValue}
                   onChange={e => setInputValue(e.target.value)}
                   onKeyDown={handleKeyDown}
                   placeholder={isStreaming ? "AI is typing..." : "Describe your feature requirements..."}
                   className="w-full bg-transparent border-none focus:ring-0 text-sm p-3 h-20 resize-none text-white placeholder-neutral-600 outline-none"
                 />
                 <div className="flex items-center justify-between px-2 pb-1">
                   <div className="flex gap-2">
                     <button className="p-2 hover:bg-white/5 rounded-lg text-neutral-500 transition-colors"><FileJson size={16}/></button>
                   </div>
                   <button 
                     disabled={!inputValue.trim() || isStreaming}
                     onClick={handleSend}
                     className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-1.5 px-4 rounded-lg text-xs transition-all flex items-center gap-2 disabled:opacity-50 disabled:bg-surface disabled:text-neutral-500"
                   >
                     {isStreaming ? <Square size={12} fill="currentColor" /> : "Send Request"}
                     {!isStreaming && <Play size={12} fill="currentColor" />}
                   </button>
                 </div>
             </div>
             <p className="text-[10px] text-center mt-3 text-neutral-600 uppercase tracking-widest font-medium">MegaLLM can make mistakes. Verify critical code.</p>
          </div>
        </footer>
      </main>

      {/* Right Sidebar: Feature Controls */}
      <aside className="w-72 bg-surface border-l border-border p-5 flex flex-col gap-6 shrink-0">
        <div className="space-y-4">
           <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Parameters</h2>
           <div className="space-y-5">
             <div className="space-y-2">
                <div className="flex justify-between items-center text-[11px] font-mono">
                  <span className="text-neutral-500">MODEL</span>
                </div>
                <select 
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full bg-[#161618] border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500/50"
                  disabled={models.length === 0}
                >
                  {models.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.display_name || m.id}
                    </option>
                  ))}
                </select>
             </div>

             <div className="space-y-2">
               <div className="flex justify-between items-center text-[11px] font-mono">
                 <span className="text-neutral-500">TEMPERATURE</span>
                 <span className="text-indigo-400">{temperature.toFixed(2)}</span>
               </div>
               <input 
                 type="range" 
                 min="0" 
                 max="2" 
                 step="0.01" 
                 value={temperature}
                 onChange={(e) => setTemperature(parseFloat(e.target.value))}
                 className="w-full h-1 bg-white/5 rounded-full appearance-none accent-indigo-500 cursor-pointer"
               />
             </div>

             <div className="space-y-2">
               <div className="flex justify-between items-center text-[11px] font-mono">
                 <span className="text-neutral-500">MAX TOKENS</span>
                 <span className="text-indigo-400">{maxTokens}</span>
               </div>
               <input 
                 type="range" 
                 min="256" 
                 max="8192" 
                 step="256" 
                 value={maxTokens}
                 onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                 className="w-full h-1 bg-white/5 rounded-full appearance-none accent-indigo-500 cursor-pointer"
               />
             </div>
           </div>
        </div>

        <div className="h-px bg-white/5"></div>

        <div className="space-y-4">
          <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-widest">System Instructions</h2>
          <div className="bg-white/[0.02] border border-white/5 rounded-lg p-1">
             <textarea 
               value={systemPrompt}
               onChange={e => setSystemPrompt(e.target.value)}
               className="w-full bg-transparent border-none text-[11px] leading-relaxed text-neutral-500 italic h-24 resize-none p-2 focus:text-neutral-300 focus:outline-none"
             />
          </div>
        </div>

        <div className="mt-auto space-y-4">
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
             <div className="text-[11px] font-bold text-indigo-300">QUOTA USAGE</div>
             <div className="flex items-center gap-2 mt-2">
               <div className="flex-1 h-1.5 bg-indigo-900/50 rounded-full overflow-hidden">
                 <div className="w-1/3 h-full bg-indigo-500"></div>
               </div>
               <span className="text-[10px] text-indigo-400">32%</span>
             </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function MessageView({ role, content }: { role: string, content: string }) {
  const isUser = role === 'user';
  
  if (isUser) {
    return (
      <div className="flex gap-4 max-w-3xl">
        <div className="w-8 h-8 rounded bg-neutral-800 shrink-0 border border-white/5 flex items-center justify-center text-xs font-bold text-neutral-300">
          ME
        </div>
        <div className="flex-1 space-y-2 pt-1">
          <p className="text-sm leading-relaxed text-neutral-200 italic whitespace-pre-wrap">{content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 max-w-3xl">
      <div className="w-8 h-8 rounded bg-indigo-900 shrink-0 border border-indigo-500/30 flex items-center justify-center text-xs text-white">
        AI
      </div>
      <div className="flex-1 space-y-4 pt-1 text-sm leading-relaxed text-neutral-200 min-w-0">
         <MarkdownView content={content} />
      </div>
    </div>
  );
}
