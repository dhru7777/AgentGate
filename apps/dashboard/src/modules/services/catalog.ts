import { SERVICES } from "../../data";
import type { Service } from "../../types";

const STORAGE_KEY = "agentledger.userServices";

function readExtra(): Service[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Service[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadServices(): Service[] {
  const builtinIds = new Set(SERVICES.map((service) => service.id));
  return [...SERVICES, ...readExtra().filter((service) => !builtinIds.has(service.id))];
}

export function saveUserServices(services: Service[]) {
  const builtinIds = new Set(SERVICES.map((service) => service.id));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(services.filter((service) => !builtinIds.has(service.id))));
}

export function slugify(value: string): string {
  const slug = value.toLowerCase().replace(/https?:\/\//, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug.slice(0, 40) || "service";
}

export function nextServiceId(services: Service[], name: string): string {
  const base = slugify(name);
  if (!services.some((service) => service.id === base)) return base;
  let n = 2;
  while (services.some((service) => service.id === `${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function parseOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}
