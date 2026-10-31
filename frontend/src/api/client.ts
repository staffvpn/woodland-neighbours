import { getInitData } from "../telegram";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export interface UserDTO {
  telegramId: number;
  nickname: string;
  scarfColor: string;
  hatStyle: string;
  isFounder: boolean;
  lastSeenAt: number;
}

export interface HouseDTO {
  id: number;
  ownerTelegramId: number;
  shape: 1 | 2 | 3;
  x: number;
  y: number;
  hasSmoke: boolean;
  isOvergrown: boolean;
}

export interface ResourceNodeDTO {
  id: number;
  type: "branch" | "stone" | "mushroom" | "berry";
  x: number;
  y: number;
  available: boolean;
}

export interface PlacedItemDTO {
  id: number;
  itemType: string;
  slot: number;
}

export interface GiftDTO {
  id: number;
  fromTelegramId: number;
  itemType: string;
  createdAt: number;
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      "x-telegram-init-data": getInitData(),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`${res.status} ${(body as { error?: string }).error ?? res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

export function apiPost<T>(path: string, body?: unknown, method: "POST" | "DELETE" = "POST"): Promise<T> {
  return request<T>(path, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
