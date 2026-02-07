"use client";

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

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${txt || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listSearches: (limit = 100) =>
    apiFetch<SearchRow[]>(`/api/searches?limit=${encodeURIComponent(String(limit))}`),

  createSearch: (payload: {
    search_item: string;
    location?: string | null;
    category?: string | null;
    max_price?: number | null;
    marketplaces?: Record<string, boolean>;
  }) =>
    apiFetch<any>(`/api/searches`, {
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

  duplicateSearch: (id: number) =>
    apiFetch<{ ok: boolean; id: number }>(`/api/searches/${id}/duplicate`, { method: "POST" }),

  getResults: (id: number, limit = 50, offset = 0) =>
    apiFetch<any[]>(`/api/searches/${id}/results?limit=${limit}&offset=${offset}`),

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

  listDeleted: (limit = 100) =>
    apiFetch<SearchRow[]>(`/api/searches/deleted?limit=${encodeURIComponent(String(limit))}`),
};
