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
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    
    // Customize notification here
    const notificationTitle = payload.notification ? payload.notification.title : 'Nova Notificação';
    const notificationOptions = {
        body: payload.notification ? payload.notification.body : 'Você tem uma nova mensagem.',
        icon: '/assets/images/favicon.ico'
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
