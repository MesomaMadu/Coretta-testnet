"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { apiFetch, getApiToken } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Preferences = {
  memoryEnabled: boolean;
  personalizationEnabled: boolean;
  transactionHistoryEnabled: boolean;
  savedRecipientsEnabled: boolean;
};

type SavedRecipient = {
  id: string;
  label: string;
  address: string;
  network: string;
  isPreferred: boolean;
  useCount: number;
  lastUsedAt: string | null;
};

type RecipientDraft = {
  id?: string;
  label: string;
  address: string;
  isPreferred: boolean;
};

const EMPTY_DRAFT: RecipientDraft = { label: "", address: "", isPreferred: false };

export default function DamianMemorySettings() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [recipients, setRecipients] = useState<SavedRecipient[]>([]);
  const [draft, setDraft] = useState<RecipientDraft>(EMPTY_DRAFT);
  const [pendingDraft, setPendingDraft] = useState<RecipientDraft | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!getApiToken()) {
      setPreferences(null);
      setRecipients([]);
      return;
    }
    try {
      const [boot, saved] = await Promise.all([
        apiFetch<Preferences>("/v1/ai/bootstrap"),
        apiFetch<{ enabled: boolean; recipients: SavedRecipient[] }>(
          "/v1/ai/saved-recipients",
        ),
      ]);
      setPreferences(boot);
      setRecipients(saved.recipients);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load Chat Memory.");
    }
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener("coretta-api-session-updated", load);
    window.addEventListener("coretta-damian-recipients-updated", load);
    return () => {
      window.removeEventListener("coretta-api-session-updated", load);
      window.removeEventListener("coretta-damian-recipients-updated", load);
    };
  }, [load]);

  const updatePreference = async (key: keyof Preferences, enabled: boolean) => {
    if (!preferences || busy) return;
    const previous = preferences;
    setPreferences({ ...preferences, [key]: enabled });
    setBusy(true);
    setError(null);
    try {
      const next = await apiFetch<Preferences>("/v1/ai/preferences", {
        method: "POST",
        body: JSON.stringify({ [key]: enabled }),
      });
      setPreferences(next);
      window.dispatchEvent(new Event("coretta-damian-preferences-updated"));
    } catch (updateError) {
      setPreferences(previous);
      setError(updateError instanceof Error ? updateError.message : "Could not update memory settings.");
    } finally {
      setBusy(false);
    }
  };

  const stageRecipient = () => {
    const label = draft.label.trim();
    const address = draft.address.trim();
    if (!label || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      setError("Enter a label and a complete Arc wallet address.");
      return;
    }
    setError(null);
    setPendingDraft({ ...draft, label, address });
  };

  const confirmRecipient = async () => {
    if (!pendingDraft || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (pendingDraft.id) {
        await apiFetch(`/v1/ai/saved-recipients/${pendingDraft.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            label: pendingDraft.label,
            address: pendingDraft.address,
            isPreferred: pendingDraft.isPreferred,
            confirmed: true,
          }),
        });
      } else {
        await apiFetch("/v1/ai/saved-recipients", {
          method: "POST",
          body: JSON.stringify({
            label: pendingDraft.label,
            address: pendingDraft.address,
            isPreferred: pendingDraft.isPreferred,
            network: "arc-testnet",
            confirmed: true,
          }),
        });
      }
      setDraft(EMPTY_DRAFT);
      setPendingDraft(null);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this recipient.");
    } finally {
      setBusy(false);
    }
  };

  const forgetRecipient = async (recipient: SavedRecipient) => {
    const confirmed = window.confirm(
      `Forget ${recipient.label} at ${recipient.address}? Past transactions will remain unchanged.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/v1/ai/saved-recipients/${recipient.id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmed: true }),
      });
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not forget this recipient.");
    } finally {
      setBusy(false);
    }
  };

  const clearConversationalMemory = async () => {
    const confirmed = window.confirm(
      "Clear Damian's saved conversation preferences? Transaction history and saved recipients will stay unchanged.",
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/v1/ai/memory/clear", { method: "POST" });
    } catch (clearError) {
      setError(
        clearError instanceof Error ? clearError.message : "Could not clear conversation memory.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!preferences) {
    return (
      <p className="text-xs leading-relaxed text-black/50">
        Sign in to manage Damian&apos;s memory and saved recipients.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <MemoryToggle
          label="Personalized conversations"
          description="Remember useful preferences such as your preferred response style."
          checked={preferences.personalizationEnabled}
          disabled={busy}
          onChange={(checked) => void updatePreference("personalizationEnabled", checked)}
        />
        <MemoryToggle
          label="Use transaction history"
          description="Let Damian reference previous Coretta transfers when you ask."
          checked={preferences.transactionHistoryEnabled}
          disabled={busy}
          onChange={(checked) => void updatePreference("transactionHistoryEnabled", checked)}
        />
        <MemoryToggle
          label="Saved recipients"
          description="Use wallet addresses you explicitly save under a label."
          checked={preferences.savedRecipientsEnabled}
          disabled={busy}
          onChange={(checked) => void updatePreference("savedRecipientsEnabled", checked)}
        />
      </div>

      {preferences.savedRecipientsEnabled ? (
        <div className="rounded-xl border border-[#7655ff]/20 bg-[#7655ff]/[0.04] p-3">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="flex w-full items-center justify-between text-left text-xs font-semibold text-black"
          >
            Manage saved recipients
            <ChevronDown
              className={`h-4 w-4 text-[#7655ff] transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>

          {expanded ? (
            <div className="mt-3 space-y-3">
              {recipients.length ? (
                <div className="space-y-2">
                  {recipients.map((recipient) => (
                    <div
                      key={recipient.id}
                      className="rounded-xl border border-black/10 bg-white px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-xs font-semibold text-black">
                              {recipient.label}
                            </p>
                            {recipient.isPreferred ? (
                              <span className="rounded-full bg-[#7655ff]/10 px-1.5 py-0.5 text-[9px] font-medium text-[#6844ff]">
                                Preferred
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 break-all font-mono text-[10px] text-black/50">
                            {recipient.address}
                          </p>
                          <p className="mt-1 text-[9px] text-black/35">
                            Arc Testnet · Used {recipient.useCount} time{recipient.useCount === 1 ? "" : "s"}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            aria-label={`Edit ${recipient.label}`}
                            onClick={() => {
                              setDraft({
                                id: recipient.id,
                                label: recipient.label,
                                address: recipient.address,
                                isPreferred: recipient.isPreferred,
                              });
                              setPendingDraft(null);
                            }}
                            className="rounded-lg p-1.5 text-black/45 transition hover:bg-black/5 hover:text-black"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Forget ${recipient.label}`}
                            onClick={() => void forgetRecipient(recipient)}
                            className="rounded-lg p-1.5 text-black/45 transition hover:bg-rose-50 hover:text-rose-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-black/45">No saved recipients yet.</p>
              )}

              <div className="space-y-2 rounded-xl border border-black/10 bg-white p-3">
                <input
                  value={draft.label}
                  onChange={(event) => setDraft((value) => ({ ...value, label: event.target.value }))}
                  maxLength={80}
                  placeholder="Label, for example Daniel or Treasury"
                  className="w-full rounded-lg border border-black/10 bg-[#F8F8F8] px-3 py-2 text-xs text-black outline-none focus:border-[#7655ff]/50"
                />
                <input
                  value={draft.address}
                  onChange={(event) => setDraft((value) => ({ ...value, address: event.target.value }))}
                  maxLength={42}
                  placeholder="0x wallet address"
                  className="w-full rounded-lg border border-black/10 bg-[#F8F8F8] px-3 py-2 font-mono text-xs text-black outline-none focus:border-[#7655ff]/50"
                />
                <label className="flex items-center gap-2 text-[10px] text-black/55">
                  <input
                    type="checkbox"
                    checked={draft.isPreferred}
                    onChange={(event) =>
                      setDraft((value) => ({ ...value, isPreferred: event.target.checked }))
                    }
                    className="accent-[#7655ff]"
                  />
                  Use as the preferred address when this label has several wallets
                </label>
                <Button variant="glass" size="sm" onClick={stageRecipient} disabled={busy}>
                  {draft.id ? "Review changes" : "Review recipient"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {pendingDraft ? (
        <div className="rounded-xl border border-[#7655ff]/30 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-black">
            <Check className="h-4 w-4 text-[#7655ff]" />
            Confirm saved recipient
          </div>
          <p className="mt-2 text-xs text-black">{pendingDraft.label}</p>
          <p className="mt-1 break-all font-mono text-[10px] text-black/50">
            {pendingDraft.address}
          </p>
          <p className="mt-2 text-[10px] leading-relaxed text-black/45">
            This label records how you refer to the address. It doesn&apos;t verify who controls it.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" size="sm" disabled={busy} onClick={() => void confirmRecipient()}>
              Confirm save
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setPendingDraft(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => void clearConversationalMemory()}
      >
        Clear conversational memory
      </Button>

      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}

function MemoryToggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-xs font-medium text-black">{label}</span>
        <span className="mt-0.5 block text-[10px] leading-relaxed text-black/45">
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[#7655ff]"
      />
    </label>
  );
}
