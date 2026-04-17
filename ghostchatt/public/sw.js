self.addEventListener('push', function(event) {
  // Required to make mobile Chrome think it's a real SW capable of background push
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  // Attempt to focus the window
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
