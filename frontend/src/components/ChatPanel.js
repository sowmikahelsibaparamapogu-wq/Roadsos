import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';

const QUICK_PROMPTS = [
  '🚨 Accident happened! Help!',
  '🩸 How to stop bleeding?',
  '❤️ How to do CPR?',
  '🏥 Find nearest hospital',
  '🚑 Ambulance steps',
  '🔥 Car is on fire!',
  '😵 Person is unconscious',
  '💊 Medicine overdose help',
];

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Render message text with basic formatting
function MessageText({ text }) {
  if (!text) return null;
  // Convert **bold**, newlines to JSX
  const lines = text.split('\n');
  return (
    <div className="msg-text">
      {lines.map((line, i) => {
        // Bold: **text**
        const parts = line.split(/\*\*(.*?)\*\*/g);
        return (
          <React.Fragment key={i}>
            {parts.map((part, j) =>
              j % 2 === 1 ? <strong key={j}>{part}</strong> : part
            )}
            {i < lines.length - 1 && <br />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function ChatPanel({ sessionId, location, hospitals, apiUrl }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');

    const userMsg = { role: 'user', content: msg, time: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await axios.post(`${apiUrl}/api/chat`, {
        session_id: sessionId,
        message: msg,
        latitude: location?.lat || null,
        longitude: location?.lon || null,
      });
      const aiMsg = {
        role: 'assistant',
        content: res.data.response,
        resources: res.data.resources || [],
        time: new Date(),
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ Could not reach the server. Check your connection.\n\nEmergency: 112 | Ambulance: 102',
        time: new Date(),
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-welcome">
            <div className="welcome-icon">🚨</div>
            <h2>Road SOS Assistant</h2>
            <p>
              AI-powered emergency help. Ask <strong>anything</strong> — accidents, first aid,
              hospitals, or any general question.
            </p>
            {!location && (
              <div className="location-hint">
                📍 Enable location for real-time nearby hospitals
              </div>
            )}
            <div className="quick-btns">
              {QUICK_PROMPTS.map((p, i) => (
                <button key={i} className="quick-btn" onClick={() => sendMessage(p)}>{p}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="message-bubble">
              <MessageText text={msg.content} />
            </div>

            {/* Hospital cards inline in chat */}
            {msg.role === 'assistant' && msg.resources && msg.resources.length > 0 && (
              <div className="chat-hospitals">
                {msg.resources.slice(0, 3).map((h, j) => (
                  <div key={j} className="chat-hospital-card">
                    <div className="h-name">🏥 {h.name}</div>
                    <div className="h-meta">
                      <span>📍 {h.distance_km} km</span>
                      {h.phone && (
                        <a href={`tel:${h.phone}`}>📞 {h.phone}</a>
                      )}
                      {h.maps_url && (
                        <a href={h.maps_url} target="_blank" rel="noreferrer">🗺️ Directions</a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="message-time">{formatTime(msg.time)}</div>
          </div>
        ))}

        {loading && (
          <div className="typing-indicator">
            <div className="typing-dot" />
            <div className="typing-dot" />
            <div className="typing-dot" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-row">
        <textarea
          ref={inputRef}
          className="chat-input"
          rows={1}
          placeholder="Ask anything — accident help, first aid, general questions..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
        />
        <button
          className="send-btn"
          onClick={() => sendMessage()}
          disabled={loading || !input.trim()}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
