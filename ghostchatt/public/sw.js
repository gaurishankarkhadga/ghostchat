self.addEventListener('push', function(event) {
  // Required to make mobile Chrome think it's a real SW capable of background push
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  // Attempt to focus the existing chat window rather than opening a duplicate
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
