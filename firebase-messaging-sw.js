importScripts('https://www.gstatic.com/firebasejs/9.17.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.17.1/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyCWN9KX9pUKvX1VsMbzzBxgOhugaLtOk3k",
    authDomain: "bitraiden-site.firebaseapp.com",
    projectId: "bitraiden-site",
    storageBucket: "bitraiden-site.firebasestorage.app",
    messagingSenderId: "231370595400",
    appId: "1:231370595400:web:14fd476849a42d3f0a4c7d",
    measurementId: ""
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Recebida mensagem em segundo plano: ', payload);
    
    // Se a mensagem já possui o nó 'notification', o navegador já exibe a notificação nativa automaticamente
    if (payload.notification) {
        console.log('[firebase-messaging-sw.js] Notificação exibida nativamente pelo navegador.');
        return;
    }

    // Fallback caso a mensagem venha apenas com payload.data
    const notificationTitle = (payload.data && payload.data.title) || 'Nova Notificação BitMundo';
    const notificationOptions = {
        body: (payload.data && payload.data.body) || 'Novo conteúdo publicado no site!',
        icon: '/fav/favicon-32x32.png',
        tag: 'bitmundo-news',
        renotify: true,
        data: payload.data || {}
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

// Manipulador do clique na notificação (Abre o site https://bitraiden.org)
self.addEventListener('notificationclick', (event) => {
    console.log('[firebase-messaging-sw.js] Notificação clicada pelo usuário:', event);
    event.notification.close();

    const targetUrl = (event.notification.data && event.notification.data.url) || 'https://bitraiden.org';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (let client of windowClients) {
                if (client.url.includes('bitraiden.org') && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
