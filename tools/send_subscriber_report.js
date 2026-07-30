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

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function sendSubscriberReport() {
    console.log("🚀 [send_subscriber_report.js] Iniciando relatório de inscritos de 2 dias...");
    try {
        const snapshot = await db.collection('subscribers').get();
        const totalCount = snapshot.size;
        console.log(`📊 Total de inscritos ativos encontrados no banco: ${totalCount}`);

        const adminTokens = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            // Se o documento do token possui um e-mail registrado (admin ou usuário logado)
            if (data.email && data.token) {
                console.log(`👤 Admin / Usuário com e-mail identificado: ${data.email}`);
                adminTokens.push(data.token);
            }
        });

        // Caso haja tokens com e-mail, direciona especificamente para eles; senão, busca todos os tokens
        const targetTokens = adminTokens.length > 0 
            ? Array.from(new Set(adminTokens)) 
            : Array.from(new Set(snapshot.docs.map(doc => doc.data().token).filter(Boolean)));

        if (targetTokens.length === 0) {
            console.warn("⚠️ Nenhum token válido de assinante foi encontrado na coleção 'subscribers'.");
            return;
        }

        const title = "📊 Relatório BitMundo: Total de Inscritos";
        const body = `Você possui atualmente ${totalCount} assinantes ativos de notificações!`;
        const clickUrl = "https://bitmundo.net/admin_dashboard.html";

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
                    tag: "bitmundo-report",
                    renotify: true
                },
                fcmOptions: {
                    link: clickUrl
                }
            },
            tokens: targetTokens,
        };

        console.log(`📤 Enviando relatório para ${targetTokens.length} token(s)...`);
        const sendFn = admin.messaging().sendEachForMulticast 
            ? admin.messaging().sendEachForMulticast.bind(admin.messaging())
            : admin.messaging().sendMulticast.bind(admin.messaging());

        const response = await sendFn(message);
        console.log(`✅ Relatório enviado com sucesso! (${response.successCount} enviados, ${response.failureCount} falhas).`);

    } catch (e) {
        console.error("💥 Erro ao gerar/enviar relatório de inscritos:", e);
        process.exit(1);
    }
}

sendSubscriberReport();
