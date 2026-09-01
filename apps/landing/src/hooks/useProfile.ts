"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch, getApiToken } from "@/lib/api";

interface PreferredNameServerState {
  preferredName: string;
  preferredNameUpdatedAt: string | null;
  nextPreferredNameEditAt: string | null;
  canEditPreferredName: boolean;
}

export interface UserProfile {
  preferredName: string;
  preferredNameUpdatedAt: number | null;
  nextPreferredNameEditAt: number | null;
  canEditPreferredName: boolean;
  onboardingComplete: boolean;
  onboardingVersion: number;
  linkedEmail: string | null;
  emailVerifiedAt: number | null;
  walletTutorialComplete: boolean;
}

const STORAGE_KEY = "coretta_profile";
const LEGACY_KEY = "Coretta_profile";

const DEFAULT: UserProfile = {
  preferredName: "",
  preferredNameUpdatedAt: null,
  nextPreferredNameEditAt: null,
  canEditPreferredName: true,
  onboardingComplete: false,
  onboardingVersion: 0,
  linkedEmail: null,
  emailVerifiedAt: null,
  walletTutorialComplete: false,
};

let preferredNameSync: Promise<PreferredNameServerState | null> | null = null;

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function savePreferredName(preferredName: string) {
  const delays = [0, 500, 1_200];
  let lastError: unknown;
  for (const delay of delays) {
    if (delay) await wait(delay);
    try {
      return await apiFetch<PreferredNameServerState>("/v1/me/profile", {
        method: "PATCH",
        body: JSON.stringify({ preferredName }),
      });
    } catch (error) {
      lastError = error;
      if (error instanceof ApiError && error.status < 500) throw error;
    }
  }
  if (lastError instanceof ApiError) throw lastError;
  throw new Error(
    "Coretta could not reach its account database. Please retry in a moment.",
  );
}

function toLocalPreferredNameState(state: PreferredNameServerState) {
  return {
    preferredName: state.preferredName,
    preferredNameUpdatedAt: state.preferredNameUpdatedAt
      ? new Date(state.preferredNameUpdatedAt).getTime()
      : null,
    nextPreferredNameEditAt: state.nextPreferredNameEditAt
      ? new Date(state.nextPreferredNameEditAt).getTime()
      : null,
    canEditPreferredName: state.canEditPreferredName,
  };
}

function syncPreferredName(localName: string) {
  if (preferredNameSync) return preferredNameSync;
  preferredNameSync = (async () => {
    if (!getApiToken()) return null;
    const server = await apiFetch<PreferredNameServerState>("/v1/me/profile");
    if (server.preferredName || !localName.trim()) return server;

    return apiFetch<PreferredNameServerState>("/v1/me/profile", {
      method: "PATCH",
      body: JSON.stringify({ preferredName: localName.trim() }),
    });
  })().finally(() => {
    preferredNameSync = null;
  });
  return preferredNameSync;
}

function load(): UserProfile {
  if (typeof window === "undefined") return DEFAULT;
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_KEY);
      if (raw) localStorage.setItem(STORAGE_KEY, raw);
    }
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return DEFAULT;
  }
}

function save(profile: UserProfile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    window.dispatchEvent(new CustomEvent<UserProfile>("coretta-profile-updated", { detail: profile }));
  } catch {
    /* ignore */
  }
}

export function useProfile() {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT);
  const [hydrated, setHydrated] = useState(false);
  const profileRef = useRef<UserProfile>(DEFAULT);

  const update = useCallback((patch: Partial<UserProfile>) => {
    const next = { ...profileRef.current, ...patch };
    profileRef.current = next;
    setProfile(next);
    save(next);
  }, []);

  useEffect(() => {
    const loaded = load();
    profileRef.current = loaded;
    setProfile(loaded);
    setHydrated(true);
    const onProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent<UserProfile>).detail;
      if (detail) {
        profileRef.current = detail;
        setProfile(detail);
      }
    };
    window.addEventListener("coretta-profile-updated", onProfileUpdated);

    const refreshPreferredName = async () => {
      try {
        const state = await syncPreferredName(profileRef.current.preferredName);
        if (state) update(toLocalPreferredNameState(state));
      } catch {
        /* Keep the last locally known state while the API is unavailable. */
      }
    };

    window.addEventListener("coretta-api-session-updated", refreshPreferredName);
    void refreshPreferredName();

    return () => {
      window.removeEventListener("coretta-profile-updated", onProfileUpdated);
      window.removeEventListener("coretta-api-session-updated", refreshPreferredName);
    };
  }, [update]);

  const setPreferredName = useCallback(
    async (name: string) => {
      const preferredName = name.trim();
      if (!preferredName) throw new Error("Enter a preferred name.");
      if (!getApiToken()) {
        throw new Error("Sign in or connect your wallet before saving a preferred name.");
      }

      try {
        const state = await savePreferredName(preferredName);
        update({
          ...toLocalPreferredNameState(state),
          onboardingComplete: true,
          onboardingVersion: 1,
        });
        return state;
      } catch (error) {
        try {
          const current = await apiFetch<PreferredNameServerState>("/v1/me/profile");
          update(toLocalPreferredNameState(current));
        } catch {
          /* Preserve the original save error. */
        }
        throw error;
      }
    },
    [update],
  );

  const linkEmail = useCallback((email: string) => {
    update({
      linkedEmail: email,
      emailVerifiedAt: Date.now(),
    });
  }, [update]);

  const unlinkEmail = useCallback(() => {
    update({ linkedEmail: null, emailVerifiedAt: null });
  }, [update]);

  const skipWalletTutorial = useCallback(() => {
    update({ walletTutorialComplete: true });
  }, [update]);

  const completeOnboarding = useCallback(() => {
    update({
      onboardingComplete: true,
      onboardingVersion: 1,
      walletTutorialComplete: true,
    });
  }, [update]);

  const signOutEmail = useCallback(() => {
    update({
      onboardingComplete: false,
      onboardingVersion: 0,
      linkedEmail: null,
      emailVerifiedAt: null,
    });
  }, [update]);

  return {
    profile,
    hydrated,
    setPreferredName,
    linkEmail,
    unlinkEmail,
    update,
    skipWalletTutorial,
    completeOnboarding,
    signOutEmail,
  };
}
