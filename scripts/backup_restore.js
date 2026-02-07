
/**
 * BACKUP & RESTORE SYSTEM (JSON)
 */

window.backupSystem = async () => {
    const backupBtn = document.getElementById('btn-backup');
    if (backupBtn) backupBtn.innerText = "⏳ Gerando JSON...";

    try {
        const collections = ['projects', 'articles', 'library', 'tools', 'comments'];
        const backupData = {
            metadata: {
                version: '1.0',
                date: new Date().toISOString(),
                exportedBy: auth.currentUser ? auth.currentUser.email : 'unknown'
            },
            data: {}
        };

        showNotification("📦 Iniciando backup...", "info");

        for (const colName of collections) {
            console.log(`Backing up ${colName}...`);
            const q = collection(db, colName);
            const snapshot = await getDocs(q);
            backupData.data[colName] = {};

            snapshot.forEach(doc => {
                backupData.data[colName][doc.id] = doc.data();
            });
        }

        const jsonString = JSON.stringify(backupData, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `bitmundo_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showNotification("✅ Backup concluído! Download iniciado.", "success");

    } catch (e) {
        console.error("Backup Error:", e);
        showNotification("❌ Erro no Backup: " + e.message, "error");
    } finally {
        if (backupBtn) backupBtn.innerText = "⬇️ Fazer Backup (JSON)";
    }
};

window.triggerRestore = () => {
    document.getElementById('restore-input').click();
};

window.restoreSystem = async (input) => {
    const file = input.files[0];
    if (!file) return;

    if (!confirm("⚠️ ATENÇÃO: Isso irá substituir/mesclar os dados atuais com os do backup. Recomendamos fazer um backup antes. Deseja continuar?")) {
        input.value = "";
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const backup = JSON.parse(e.target.result);

            if (!backup.data) {
                throw new Error("Formato de backup inválido (missing data field)");
            }

            showNotification("🔄 Iniciando restauração...", "info");
            console.log("Restoring backup:", backup.metadata);

            let totalRestored = 0;
            const batchSize = 400; // Batch limit is 500

            // Process collection by collection
            for (const [colName, docs] of Object.entries(backup.data)) {
                const docIds = Object.keys(docs);
                console.log(`Restoring ${colName} (${docIds.length} docs)...`);

                // Chunk into batches
                for (let i = 0; i < docIds.length; i += batchSize) {
                    const batch = writeBatch(db);
                    const chunk = docIds.slice(i, i + batchSize);

                    chunk.forEach(id => {
                        const docRef = doc(db, colName, id);
                        batch.set(docRef, docs[id], { merge: true });
                    });

                    await batch.commit();
                    totalRestored += chunk.length;
                    console.log(`Committed batch for ${colName}: ${chunk.length} docs`);
                }
            }

            showNotification(`✅ Restauração completa! ${totalRestored} documentos processados.`, "success");

            // Reload all views
            loadProjects();
            loadArticles();
            loadLibrary();
            loadTools();

        } catch (err) {
            console.error("Restore Error:", err);
            showNotification("❌ Erro na Restauração: " + err.message, "error");
        } finally {
            input.value = "";
        }
    };
    reader.readAsText(file);
};
