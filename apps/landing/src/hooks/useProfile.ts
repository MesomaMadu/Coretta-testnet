"use client";

import { useCallback, useEffect, useState } from "react";

export interface UserProfile {
  preferredName: string;
  onboardingComplete: boolean;
  linkedEmail: string | null;
  emailVerifiedAt: number | null;
}

const STORAGE_KEY = "coretta_profile";
const LEGACY_KEY = "Coretta_profile";

const DEFAULT: UserProfile = {
  preferredName: "",
  onboardingComplete: false,
  linkedEmail: null,
  emailVerifiedAt: null,
};

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
  } catch {
    /* ignore */
  }
}

export function useProfile() {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setProfile(load());
    setHydrated(true);
  }, []);

  const update = useCallback((patch: Partial<UserProfile>) => {
    setProfile((prev) => {
      const next = { ...prev, ...patch };
      save(next);
      return next;
    });
  }, []);

  const setPreferredName = useCallback(
    (name: string) => {
      update({
        preferredName: name.trim(),
        onboardingComplete: true,
      });
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

  return {
    profile,
    hydrated,
    setPreferredName,
    linkEmail,
    unlinkEmail,
    update,
  };
}
