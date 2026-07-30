importScripts('https://www.gstatic.com/firebasejs/9.17.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.17.1/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "${FIREBASE_API_KEY}",
    authDomain: "${FIREBASE_AUTH_DOMAIN}",
    projectId: "${FIREBASE_PROJECT_ID}",
    storageBucket: "${FIREBASE_STORAGE_BUCKET}",
    messagingSenderId: "${FIREBASE_MESSAGING_SENDER_ID}",
    appId: "${FIREBASE_APP_ID}",
    measurementId: "${FIREBASE_MEASUREMENT_ID}"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Recebida mensagem em segundo plano: ', payload);
    
    // Suporte tanto para payload.notification quanto payload.data
    const notificationTitle = (payload.notification && payload.notification.title) || (payload.data && payload.data.title) || 'Nova Notificação BitMundo';
    const notificationOptions = {
        body: (payload.notification && payload.notification.body) || (payload.data && payload.data.body) || 'Novo conteúdo publicado no site!',
        icon: '/fav/favicon-32x32.png',
        data: payload.data || {}
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
