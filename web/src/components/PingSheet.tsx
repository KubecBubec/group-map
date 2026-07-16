import { useState } from "react";
import { useCoordinator } from "../lib/coordinator";
import type { Priority } from "../lib/types";
import { Segmented, Sheet } from "./ui";

const PRIORITY_PRESET: Record<Priority, string> = {
  INFO: "Info pre skupinu",
  MEET: "Stretnime sa, prosím",
  URGENT: "Súrne sa ozvi!",
};

export function PingSheet() {
  const { pingTarget, closePing, sendPing } = useCoordinator();
  const [priority, setPriority] = useState<Priority>("MEET");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!pingTarget) return null;

  const submit = async () => {
    setSending(true);
    setError(null);
    try {
      await sendPing({
        scope: pingTarget.scope,
        targetIds: pingTarget.targetIds,
        message: message.trim() || PRIORITY_PRESET[priority],
        priority,
      });
      closePing();
      setMessage("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ping sa nepodarilo odoslať");
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet title={`Pingnúť: ${pingTarget.label}`} onClose={closePing}>
      <div className="stack">
        <div className="field">
          <span className="field__label">Priorita</span>
          <Segmented<Priority>
            value={priority}
            onChange={setPriority}
            options={[
              { value: "INFO", label: "Info" },
              { value: "MEET", label: "Stretnutie" },
              { value: "URGENT", label: "Súrne" },
            ]}
          />
        </div>
        <div className="field">
          <span className="field__label">Správa (voliteľné)</span>
          <input
            className="input"
            value={message}
            placeholder={PRIORITY_PRESET[priority]}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
        {error && <div className="auth__error">{error}</div>}
        <button className="btn btn--primary btn--block" onClick={submit} disabled={sending}>
          {sending ? "Odosielam…" : "Odoslať ping"}
        </button>
        <p className="hint">Ochrana proti spamu: rovnaký ping vieš zopakovať až po 30 sekundách.</p>
      </div>
    </Sheet>
  );
}
