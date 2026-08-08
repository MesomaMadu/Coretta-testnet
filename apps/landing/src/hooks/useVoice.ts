"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseVoiceOptions {
  onTranscript: (text: string) => void;
  /** Never auto-submit — caller must confirm */
}

export function useVoice({ onTranscript }: UseVoiceOptions) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    const SR =
      typeof window !== "undefined"
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : undefined;
    setSupported(!!SR);
    if (!SR) return;

    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      if (event.results[event.results.length - 1]?.isFinal) {
        onTranscript(transcript.trim());
        setListening(false);
      }
    };

    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
  }, [onTranscript]);

  const startListening = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.start();
      setListening(true);
      void import("@/lib/api").then(({ apiFetch }) => {
        const addr =
          typeof window !== "undefined"
            ? sessionStorage.getItem("coretta_wallet_verified_address")
            : null;
        void apiFetch<{ ok: boolean; metrics?: import("@coretta/shared").UserUsageMetrics }>(
          "/v1/usage/track",
          {
            method: "POST",
            body: JSON.stringify({
              action: "voice",
              ...(addr ? { walletAddress: addr } : {}),
            }),
          },
        )
          .then((res) => {
            if (res.metrics) {
              window.dispatchEvent(
                new CustomEvent("coretta-usage-updated", { detail: res.metrics }),
              );
            }
          })
          .catch(() => {});
      });
    } catch {
      setListening(false);
    }
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    utter.pitch = 1;
    window.speechSynthesis.speak(utter);
  }, []);

  return { listening, supported, startListening, stopListening, speak };
}
