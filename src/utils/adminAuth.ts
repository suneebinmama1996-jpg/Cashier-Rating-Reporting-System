import { SystemSettings } from '../types';

// The admin password is kept only as a SHA-256 hash, so the settings document
// no longer holds it in plain text.
export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode('nuh-admin:' + pin);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Before a password is set with the new menu, the old plain PIN (or 1234 if none) still works.
export async function checkPin(input: string, s: Pick<SystemSettings, 'adminPin' | 'adminPinHash'>): Promise<boolean> {
  if (!input) return false;
  if (s.adminPinHash) return (await hashPin(input)) === s.adminPinHash;
  return input === (s.adminPin || '1234');
}

export const MIN_PIN_LEN = 6;
