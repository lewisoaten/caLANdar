/**
 * Web Push (docs/live-event/DESIGN.md §8): alerts reach phones that are
 * locked and tabs in the background. Falls back to plain notification
 * permission (shown while the tab is open) where push isn't available.
 */

export type PushResult =
  "enabled" | "notifications-only" | "denied" | "unsupported";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded =
    base64url.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export async function enablePush(
  eventId: number,
  token: string,
): Promise<PushResult> {
  if (!("Notification" in window)) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    return "notifications-only";
  const auth = { Authorization: `Bearer ${token}` };
  const keyRes = await fetch("/api/live/push/key", { headers: auth });
  if (!keyRes.ok) return "notifications-only";
  const { publicKey } = (await keyRes.json()) as { publicKey: string };
  try {
    const registration = await navigator.serviceWorker.register("/live-sw.js");
    await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(publicKey),
      }));
    const json = subscription.toJSON();
    const res = await fetch(`/api/events/${eventId}/live/push`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
    return res.ok ? "enabled" : "notifications-only";
  } catch {
    return "notifications-only";
  }
}
