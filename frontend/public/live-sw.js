/* caLANdar Live service worker: shows Web Push alerts (docs/live-event/DESIGN.md §8). */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      title: "caLANdar Live",
      body: event.data ? event.data.text() : "",
    };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "caLANdar Live", {
      body: data.body || "",
      tag: data.tag,
      renotify: true,
      requireInteraction: true,
      icon: "/logo192.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(url) && "focus" in client)
            return client.focus();
        }
        return self.clients.openWindow(url);
      }),
  );
});
