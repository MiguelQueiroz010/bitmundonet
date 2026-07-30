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
    
    // Suporte tanto para payload.notification quanto payload.data
    const notificationTitle = (payload.notification && payload.notification.title) || (payload.data && payload.data.title) || 'Nova Notificação BitMundo';
    const notificationOptions = {
        body: (payload.notification && payload.notification.body) || (payload.data && payload.data.body) || 'Novo conteúdo publicado no site!',
        icon: '/fav/favicon-32x32.png',
        data: payload.data || {}
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
