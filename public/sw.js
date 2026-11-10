// Beffroi : service worker des notifications.
self.addEventListener("push", (event) => {
  let msg = { title: "Beffroi", body: "" };
  try {
    msg = event.data ? event.data.json() : msg;
  } catch {
    msg = { title: "Beffroi", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(self.registration.showNotification(msg.title, { body: msg.body, tag: msg.tag, icon: "/icon.svg", badge: "/icon.svg" }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) return c.focus();
      return self.clients.openWindow("/");
    }),
  );
});
