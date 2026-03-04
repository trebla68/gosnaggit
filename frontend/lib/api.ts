export type SearchRow = {
  id: number;
  search_item: string;
  location: string | null;
  category: string | null;
  max_price: number | null;
  marketplaces?: Record<string, boolean> | null;
  status: string | null;
  plan_tier: string | null;
  created_at: string | null;
  next_refresh_at?: string | null;
  last_found_at?: string | null;
};

export type AlertSummary = {
  search_id: number;
  pending: number;
  sent: number;
  dismissed: number;
  error: number;
  total: number;
};

export type AlertRow = {
  alert_id: number;
  search_id: number;
  status: string;
  alert_created_at: string;
  title: string;
  price: string | null;
  currency: string | null;
  listing_url: string | null;
};

// --------------------
// Types for createSearch (frontend only)
// --------------------

export type CreateSearchOk =
  | { ok: true; search: SearchRow }
  | { ok: true; id: number }
  | { ok: true; searchId: number };

export type CreateSearchErr = { ok: false; error: string };

export type CreateSearchResponse = CreateSearchOk | CreateSearchErr;

export function getCreatedSearchId(res: CreateSearchResponse): number | null {
  if (!res || res.ok !== true) return null;

  if ("search" in res && res.search && typeof res.search.id === "number") return res.search.id;
  if ("id" in res && typeof res.id === "number") return res.id;
  if ("searchId" in res && typeof res.searchId === "number") return res.searchId;

  return null;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");

    // Global auth interceptor: if any API call returns 401, open the auth modal.
    // Pages can still provide more specific reasons, but this prevents raw 401 errors
    // from flashing in the UI.
    if (res.status === 401 && typeof window !== "undefined") {
      try {
        window.dispatchEvent(
          new CustomEvent("gs-auth-required", {
            detail: {
              reason:
                "Please log in to continue. (You may have used your 1 free search, or your session expired.)",
            },
          })
        );
      } catch {
        // ignore
      }
    }

    throw new Error(`API ${res.status}: ${txt || res.statusText}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export type ResultRow = {
  id: number;
  search_id: number;
  marketplace: string | null;
  external_id: string | null;

  title: string | null;
  price: string | null;
  currency: string | null;

  price_num: number | null;
  shipping_num: number | null;
  total_price: number | null;

  listing_url: string | null;
  image_url: string | null;

  location: string | null;
  condition: string | null;
  seller_username: string | null;

  found_at: string | null;
  created_at: string | null;
};

export const api = {
  listSearches: (limit = 100) =>
    apiFetch<SearchRow[]>(`/api/searches?limit=${encodeURIComponent(String(limit))}`),

  createSearch: (payload: {
    search_item: string;
    location?: string | null;
    category?: string | null;
    max_price?: number | null;
    marketplaces?: Record<string, boolean>;
  }): Promise<CreateSearchResponse> =>
    apiFetch<SearchRow>(`/api/searches`, {
      method: "POST",
      body: JSON.stringify(payload),
    }).then((raw) => ({ ok: true, search: raw })),

  getSearch: (id: number) => apiFetch<SearchRow>(`/api/searches/${id}`),

  patchSearch: (
    id: number,
    payload: Partial<Pick<SearchRow, "search_item" | "location" | "category" | "max_price">> & {
      marketplaces?: Record<string, boolean>;
    }
  ) =>
    apiFetch<{ ok: boolean; search: SearchRow }>(`/api/searches/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteSearch: (id: number) =>
    apiFetch<{ ok: boolean }>(`/api/searches/${id}`, { method: "DELETE" }),

  restoreSearch: (id: number) =>
    apiFetch<{ ok: boolean; search?: any }>(`/api/searches/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    }),

  duplicateSearch: (id: number) =>
    apiFetch<{ ok: boolean; id: number }>(`/api/searches/${id}/duplicate`, { method: "POST" }),

  getResults: (id: number, limit = 50, offset = 0) =>
    apiFetch<ResultRow[]>(`/api/searches/${id}/results?limit=${limit}&offset=${offset}`),

  getAlertSummary: async (id: number) => {
    const raw = await apiFetch<any>(`/api/searches/${id}/alerts/summary`);
    const c = raw?.counts || raw || {};
    return {
      search_id: Number(raw?.search_id ?? id),
      pending: Number(c?.pending ?? 0),
      sent: Number(c?.sent ?? 0),
      dismissed: Number(c?.dismissed ?? 0),
      error: Number(c?.error ?? 0),
      total: Number(c?.total ?? 0),
    } as AlertSummary;
  },


  listAlerts: (id: number, status = "all", limit = 50, offset = 0) =>
    apiFetch<AlertRow[]>(
      `/api/searches/${id}/alerts?status=${encodeURIComponent(status)}&limit=${limit}&offset=${offset}`
    ),

  patchAlertStatus: (alertId: number, status: string) =>
    apiFetch<{ ok: boolean; alert: any }>(`/api/alerts/${alertId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  getAlertSettings: (id: number) =>
    apiFetch<{ ok: boolean; search_id: number; settings: { enabled: boolean; mode: "immediate" | "daily"; maxPerEmail: number } }>(
      `/api/searches/${id}/alert-settings`
    ),

  saveAlertSettings: (id: number, settings: { enabled: boolean; mode: "immediate" | "daily"; maxPerEmail: number }) =>
    apiFetch<{ ok: boolean; search_id: number; settings: any }>(`/api/searches/${id}/alert-settings`, {
      method: "POST",
      body: JSON.stringify(settings),
    }),

  getNotificationStatus: (id: number) =>
    apiFetch<{ ok: boolean; search_id: number; email_enabled: boolean; email_destination: string | null }>(
      `/api/searches/${id}/notification-status`
    ),

  saveEmailNotification: (id: number, payload: { email: string; enabled: boolean }) =>
    apiFetch<any>(`/api/searches/${id}/notifications/email`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),


  refreshSearch: (id: number) =>
    apiFetch<any>(`/api/searches/${id}/refresh`, { method: "POST" }),

  sendNow: (id: number, limit = 25) =>
    apiFetch<any>(`/api/searches/${id}/alerts/send-now?limit=${limit}`, { method: "POST" }),

  // Backwards-compatible alias (older UI code calls this name)
  dispatchAlertsDev: (id: number, limit = 25) =>
    api.sendNow(id, limit),

  listDeleted: (limit = 100) =>
    apiFetch<SearchRow[]>(`/api/searches/deleted?limit=${encodeURIComponent(String(limit))}`),

  // Auth
  me: () => apiFetch<any>(`/api/auth/me`),
  login: (email: string, password: string) =>
    apiFetch<any>(`/api/auth/login`, { method: "POST", body: JSON.stringify({ email, password }) }),
  signup: (email: string, password: string) =>
    apiFetch<any>(`/api/auth/signup`, { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => apiFetch<any>(`/api/auth/logout`, { method: "POST" }),

};

export function isAuthRequiredError(err: any) {
  const msg = String(err?.message || "");
  return msg.includes("API 401");
}

export function isAuthedClient(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("gs-authed") === "1";
  } catch {
    return false;
  }
}

export function guestFreeUsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("gs-free-used") === "1";
  } catch {
    return false;
  }
}

export function markGuestFreeUsed() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("gs-free-used", "1");
  } catch {
    // ignore
  }
}
