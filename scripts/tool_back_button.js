/**
 * BitMundo - Universal Tool Controls & PWA Engine
 * Fornece botão de retorno e opção nativa de Instalar como Aplicativo PWA offline no navegador.
 */
(function() {

    // ─── 1. Resolução dinâmica do ícone e atualização do manifesto estático ───────
    async function ensurePwaRequirements() {
        const curPath = window.location.pathname.toLowerCase();

        // Tenta obter appIcon configurado pelo admin (localStorage primeiro, depois Firebase REST)
        let customAppIcon = '';
        let toolEmoji = '🛠️';

        try {
            const cached = localStorage.getItem('bitmundo_navbar_tools');
            if (cached) {
                const tools = JSON.parse(cached);
                if (Array.isArray(tools)) {
                    const found = tools.find(t => t && t.url &&
                        curPath.endsWith(t.url.toLowerCase().replace(/^\//, '')));
                    if (found) {
                        if (found.appIcon && found.appIcon.trim()) customAppIcon = found.appIcon.trim();
                        if (found.icon && found.icon.trim()) toolEmoji = found.icon.trim();
                    }
                }
            }
        } catch(e) {}

        // Se não veio do cache, tenta buscar do Firestore REST API
        if (!customAppIcon) {
            try {
                const fbConfig = JSON.parse(localStorage.getItem('bitmundo_firebase_config') || '{}');
                const projectId = fbConfig.projectId;
                if (projectId) {
                    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/articles/site_config_main`;
                    const res = await fetch(url);
                    if (res.ok) {
                        const json = await res.json();
                        const toolsField = json.fields?.navbar_tools?.arrayValue?.values;
                        if (Array.isArray(toolsField)) {
                            const tools = toolsField.map(v => {
                                const f = v.mapValue?.fields || {};
                                return {
                                    title: f.title?.stringValue || '',
                                    url: f.url?.stringValue || '',
                                    icon: f.icon?.stringValue || '',
                                    appIcon: f.appIcon?.stringValue || ''
                                };
                            });
                            // Salva no localStorage para próximas visitas
                            localStorage.setItem('bitmundo_navbar_tools', JSON.stringify(tools));
                            const found = tools.find(t => t.url &&
                                curPath.endsWith(t.url.toLowerCase().replace(/^\//, '')));
                            if (found) {
                                if (found.appIcon && found.appIcon.trim()) customAppIcon = found.appIcon.trim();
                                if (found.icon && found.icon.trim()) toolEmoji = found.icon.trim();
                            }
                        }
                    }
                }
            } catch(e) {
                // Falha silenciosa (offline ou Firebase não configurado)
            }
        }

        // Fallback por URL para as ferramentas nativas
        if (!customAppIcon) {
            if (curPath.includes('raiden')) {
                customAppIcon = '/media/tools/rp_icon.png';
                toolEmoji = '⚡';
            } else if (curPath.includes('hog')) {
                toolEmoji = '📦';
            } else if (curPath.includes('afs')) {
                customAppIcon = '/media/tools/sony.png';
                toolEmoji = '🎵';
            } else if (curPath.includes('ttxt')) {
                customAppIcon = '/media/tools/padplus.png';
                toolEmoji = '📝';
            }
        }

        // Atualiza o favicon e apple-touch-icon dinamicamente se houver ícone customizado
        if (customAppIcon) {
            let favIcon = document.querySelector('link[rel="icon"]');
            if (!favIcon) {
                favIcon = document.createElement('link');
                favIcon.rel = 'icon';
                document.head.appendChild(favIcon);
            }
            favIcon.href = customAppIcon;

            let appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
            if (!appleIcon) {
                appleIcon = document.createElement('link');
                appleIcon.rel = 'apple-touch-icon';
                document.head.appendChild(appleIcon);
            }
            appleIcon.href = customAppIcon;
        }

        // Atualiza o manifesto estático existente para usar o ícone customizado (se houver)
        // Isso é feito via link[rel="manifest"] já declarado no HTML.
        // Para ícone via canvas (fallback emoji) quando não há estático:
        const existingManifest = document.querySelector('link[rel="manifest"]');
        if (!existingManifest) {
            // Cria ícone emoji transparente via Canvas
            function createEmojiIconDataUrl(emoji) {
                const canvas = document.createElement('canvas');
                canvas.width = 512;
                canvas.height = 512;
                const ctx = canvas.getContext('2d');
                if (!ctx) return '/fav/favicon-32x32.png';
                ctx.clearRect(0, 0, 512, 512);
                ctx.font = '320px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(emoji, 256, 276);
                return canvas.toDataURL('image/png');
            }

            const iconSrc = customAppIcon || createEmojiIconDataUrl(toolEmoji);
            const toolTitle = document.title || 'BitMundo Ferramenta';
            const toolDesc = document.querySelector('meta[name="description"]')?.content || 'Ferramenta BitMundo Offline';

            const manifestObj = {
                name: toolTitle,
                short_name: toolTitle.length > 12 ? toolTitle.substring(0, 12) : toolTitle,
                description: toolDesc,
                start_url: window.location.pathname,
                scope: '/',
                display: 'standalone',
                orientation: 'any',
                theme_color: '#0a0b12',
                background_color: '#0a0b12',
                icons: [
                    { src: iconSrc, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
                    { src: iconSrc, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
                ]
            };

            const blob = new Blob([JSON.stringify(manifestObj, null, 2)], { type: 'application/manifest+json' });
            const newManifest = document.createElement('link');
            newManifest.rel = 'manifest';
            newManifest.href = URL.createObjectURL(blob);
            document.head.appendChild(newManifest);
        }

        // Registra Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js', { scope: '/' })
                .then(reg => console.debug('[BitMundo PWA] SW registrado:', reg.scope))
                .catch(err => console.debug('[BitMundo PWA] SW aviso:', err));
        }
    }

    ensurePwaRequirements();

    // ─── 2. Captura do evento de instalação PWA ────────────────────────────────────
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        const installBtn = document.getElementById('bitmundo-tool-install-btn');
        if (installBtn) {
            installBtn.style.display = 'inline-flex';
            installBtn.title = 'Instalar como aplicativo offline';
        }
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        const installBtn = document.getElementById('bitmundo-tool-install-btn');
        if (installBtn) {
            installBtn.innerHTML = `<span>✓</span><span>Instalado</span>`;
            setTimeout(() => { installBtn.style.display = 'none'; }, 3000);
        }
    });

    // ─── 3. Barra de controles flutuante ──────────────────────────────────────────
    function initToolBar() {
        if (document.getElementById('bitmundo-tool-controls')) return;

        const controls = document.createElement('div');
        controls.id = 'bitmundo-tool-controls';

        const style = document.createElement('style');
        style.id = 'bitmundo-tool-controls-style';
        style.textContent = `
            #bitmundo-tool-controls {
                position: fixed;
                top: 14px;
                left: 14px;
                z-index: 2147483647;
                display: flex;
                align-items: center;
                gap: 8px;
                pointer-events: auto;
            }

            .bitmundo-tool-pill {
                display: inline-flex;
                align-items: center;
                gap: 7px;
                padding: 8px 15px;
                background: rgba(10, 12, 22, 0.88);
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                border: 1px solid rgba(59, 130, 246, 0.45);
                border-radius: 99px;
                color: #f3f4f6;
                text-decoration: none;
                font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
                font-size: 0.82rem;
                font-weight: 600;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65), 0 0 15px rgba(59, 130, 246, 0.25);
                transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                cursor: pointer;
                user-select: none;
                line-height: 1;
                border: none;
            }

            .bitmundo-tool-pill:hover {
                background: rgba(15, 20, 35, 0.96);
                border-color: #60a5fa;
                color: #ffffff;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.75), 0 0 22px rgba(59, 130, 246, 0.45);
                transform: translateY(-2px);
            }

            .bitmundo-tool-pill:active {
                transform: translateY(0);
            }

            .bitmundo-tool-pill .btn-icon {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 0.95rem;
                color: #60a5fa;
                transition: transform 0.2s ease;
            }

            .bitmundo-tool-pill:hover .btn-icon.back-arrow {
                transform: translateX(-3px);
                color: #93c5fd;
            }

            #bitmundo-tool-install-btn {
                border: 1px solid rgba(16, 185, 129, 0.5);
                color: #e5e7eb;
                display: none;
            }
            #bitmundo-tool-install-btn .btn-icon {
                color: #34d399;
            }
            #bitmundo-tool-install-btn:hover {
                border-color: #10b981;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.75), 0 0 20px rgba(16, 185, 129, 0.4);
            }

            @media (max-width: 600px) {
                #bitmundo-tool-controls {
                    top: max(8px, env(safe-area-inset-top, 8px));
                    left: max(8px, env(safe-area-inset-left, 8px));
                    gap: 6px;
                }
                .bitmundo-tool-pill {
                    padding: 6px 12px;
                    font-size: 0.76rem;
                    min-height: 36px;
                    touch-action: manipulation;
                }
            }
        `;
        document.head.appendChild(style);

        // ── Botão Voltar / Visitar Site ────────────────────────────────────────────
        const backBtn = document.createElement('a');
        backBtn.id = 'bitmundo-tool-back-btn';
        backBtn.className = 'bitmundo-tool-pill';
        backBtn.href = '/tools.html';
        backBtn.setAttribute('data-no-pjax', 'true');

        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

        if (isStandalone) {
            backBtn.title = 'Abrir o site BitMundo no navegador';
            backBtn.setAttribute('aria-label', 'Abrir o site BitMundo no navegador');
            backBtn.target = '_blank';
            backBtn.rel = 'noopener noreferrer';
            backBtn.href = 'https://bitmundo.net/tools.html';
            backBtn.innerHTML = `
                <span class="btn-icon">🌐</span>
                <span>Visitar Site</span>
            `;
        } else {
            backBtn.title = 'Voltar ao site BitMundo';
            backBtn.setAttribute('aria-label', 'Voltar ao site BitMundo');
            backBtn.innerHTML = `
                <span class="btn-icon back-arrow">←</span>
                <span>Voltar ao Site</span>
            `;
            backBtn.addEventListener('click', function(e) {
                if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                e.preventDefault();
                if (window.history.length > 1 && document.referrer && document.referrer.includes(location.host)) {
                    window.history.back();
                } else {
                    window.location.href = '/tools.html';
                }
            });
        }
        controls.appendChild(backBtn);

        // ── Botão Instalar App (PWA) ───────────────────────────────────────────────
        if (!isStandalone) {
            const installBtn = document.createElement('button');
            installBtn.type = 'button';
            installBtn.id = 'bitmundo-tool-install-btn';
            installBtn.className = 'bitmundo-tool-pill';
            installBtn.title = 'Instalar como aplicativo no navegador (funciona 100% offline)';
            installBtn.innerHTML = `
                <span class="btn-icon">📲</span>
                <span>Instalar App</span>
            `;

            installBtn.addEventListener('click', async () => {
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    const choiceResult = await deferredPrompt.userChoice;
                    if (choiceResult.outcome === 'accepted') {
                        installBtn.style.display = 'none';
                    }
                    deferredPrompt = null;
                } else {
                    // Nunca deve aparecer sem deferredPrompt pois o botão fica oculto por padrão
                    // mas como fallback mostramos instrução
                    alert(
                        'Para instalar este app:\n' +
                        '• Chrome/Edge (desktop): clique no ícone ⊕ na barra de endereços, ou Menu ⋮ > "Instalar aplicativo"\n' +
                        '• Android: Menu ⋮ > "Adicionar à tela inicial"\n' +
                        '• iOS Safari: compartilhar ↑ > "Adicionar à Tela Inicial"\n\n' +
                        '⚠️ O botão automático só aparece quando o site está em HTTPS (produção). No Live Server via IP de rede, o navegador bloqueia o prompt por segurança.'
                    );
                }
            });

            controls.appendChild(installBtn);
        }

        document.body.appendChild(controls);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initToolBar);
    } else {
        initToolBar();
    }
})();
