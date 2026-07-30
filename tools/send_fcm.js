const admin = require('firebase-admin');

// Authenticate using the Service Account Secret
const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountKey) {
    console.error("❌ ERRO: FIREBASE_SERVICE_ACCOUNT_KEY não está definido nos secrets do GitHub.");
    process.exit(1);
}

let serviceAccount;
try {
    serviceAccount = JSON.parse(serviceAccountKey);
} catch (err) {
    console.error("❌ ERRO: FIREBASE_SERVICE_ACCOUNT não é um JSON válido:", err.message);
    process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function sendPush() {
    const title = process.env.TITLE || "Novo Artigo!";
    const body = process.env.BODY || "Venha conferir a novidade!";
    const clickUrl = process.env.URL || "https://bitraiden.org";

    console.log(`🚀 [send_fcm.js] Iniciando disparo de notificação FCM...`);
    console.log(`📌 Título: "${title}"`);
    console.log(`📌 Corpo: "${body}"`);
    console.log(`🔗 Link ao clicar: "${clickUrl}"`);
    
    try {
        const snapshot = await db.collection('subscribers').get();
        if (snapshot.empty) {
            console.warn("⚠️ [send_fcm.js] Nenhum assinante encontrado no Firestore na coleção 'subscribers'.");
            return;
        }

        const rawTokens = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.token) {
                rawTokens.push(data.token);
            }
        });

        // Remove tokens duplicados para evitar disparos repetidos
        const tokens = Array.from(new Set(rawTokens));
        console.log(`📱 [send_fcm.js] Encontrados ${tokens.length} assinantes únicos no banco.`);

        if (tokens.length === 0) {
            console.warn("⚠️ [send_fcm.js] Nenhum token válido extraído da coleção 'subscribers'.");
            return;
        }

        const message = {
            notification: {
                title: title,
                body: body,
            },
            webpush: {
                headers: {
                    Urgency: "high",
                    TTL: "86400"
                },
                notification: {
                    title: title,
                    body: body,
                    icon: "https://bitmundo.net/fav/favicon-32x32.png",
                    tag: "bitmundo-news",
                    renotify: true
                },
                fcmOptions: {
                    link: clickUrl
                }
            },
            tokens: tokens,
        };

        console.log("📤 [send_fcm.js] Enviando mensagem multicast via Firebase Cloud Messaging...");
        const sendFn = admin.messaging().sendEachForMulticast 
            ? admin.messaging().sendEachForMulticast.bind(admin.messaging())
            : admin.messaging().sendMulticast.bind(admin.messaging());

        const response = await sendFn(message);
        console.log(`✅ [send_fcm.js] Resultado: ${response.successCount} mensagens enviadas com sucesso, ${response.failureCount} falhas.`);
        
        // Limpa tokens falhos (ex: permissão revogada pelo usuário ou expirada)
        if (response.failureCount > 0) {
            const failedTokens = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    console.error(`❌ Erro no token [${idx}]:`, resp.error ? resp.error.message : resp);
                    failedTokens.push(tokens[idx]);
                }
            });
            console.log('🗑️ [send_fcm.js] Tokens inválidos a serem removidos:', failedTokens);
            
            const batch = db.batch();
            failedTokens.forEach(token => {
                const ref = db.collection('subscribers').doc(token);
                batch.delete(ref);
            });
            await batch.commit();
            console.log("🧹 [send_fcm.js] Limpeza de tokens inválidos concluída.");
        }
    } catch (e) {
        console.error("💥 [send_fcm.js] Erro fatal durante a execução:", e);
        process.exit(1);
    }
}

sendPush();
