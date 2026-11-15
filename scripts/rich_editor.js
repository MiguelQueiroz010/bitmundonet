/**
 * BitMundo Pro Article Studio — rich_editor.js
 * Editor profissional em tela cheia com barra de ferramentas avançada,
 * suporte a tópicos estruturados, modo dividido com Live Preview, e conversão
 * de tags customizadas do BitMundo.
 */

// HTML puro — não precisa mais importar parseArticleTags

/* ─── CSS Profissional do Studio ───────────────────────────────────── */
const STUDIO_CSS = `
/* Studio Container em Tela Cheia */
#bm-studio-overlay {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    background: #090a0f;
    color: #e5e5e7;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    z-index: 100000;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: bmStudioFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes bmStudioFadeIn {
    from { opacity: 0; transform: scale(0.99); }
    to { opacity: 1; transform: scale(1); }
}

/* Barra Superior do Studio */
.bm-studio-header {
    height: 56px;
    background: rgba(14, 15, 22, 0.95);
    border-bottom: 1px solid rgba(241, 163, 46, 0.2);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1.25rem;
    gap: 1rem;
    flex-shrink: 0;
    backdrop-filter: blur(12px);
    z-index: 10;
}

.bm-studio-header-left {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    min-width: 0;
}

.bm-studio-back-btn {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #bbb;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.82rem;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s ease;
    white-space: nowrap;
}
.bm-studio-back-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
    border-color: rgba(255, 255, 255, 0.25);
}

.bm-studio-brand-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(241, 163, 46, 0.12);
    border: 1px solid rgba(241, 163, 46, 0.3);
    padding: 3px 8px;
    border-radius: 5px;
    font-size: 0.72rem;
    font-weight: 700;
    color: #f1a32e;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.bm-studio-doc-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 280px;
}

.bm-studio-status-chip {
    font-size: 0.72rem;
    padding: 3px 8px;
    border-radius: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 5px;
}
.bm-studio-status-chip.published {
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.35);
    color: #34d399;
}
.bm-studio-status-chip.draft {
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.35);
    color: #fbbf24;
}

/* Modos de Visualização no Centro */
.bm-studio-view-tabs {
    display: flex;
    background: rgba(0, 0, 0, 0.45);
    padding: 3px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.08);
}
.bm-view-tab {
    background: none;
    border: none;
    color: #888;
    padding: 5px 12px;
    font-size: 0.78rem;
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 5px;
    transition: all 0.15s ease;
}
.bm-view-tab:hover {
    color: #fff;
}
.bm-view-tab.active {
    background: rgba(241, 163, 46, 0.18);
    color: #f1a32e;
    box-shadow: 0 1px 4px rgba(0,0,0,0.3);
}

/* Ações da Direita */
.bm-studio-header-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}

.bm-studio-stat {
    font-size: 0.75rem;
    color: #777;
    padding: 0 4px;
}

.bm-studio-publish-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
    color: #aaa;
    cursor: pointer;
    user-select: none;
    background: rgba(255, 255, 255, 0.04);
    padding: 5px 10px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.08);
}
.bm-studio-publish-toggle input {
    cursor: pointer;
    accent-color: #10b981;
}

.bm-studio-btn-delete {
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #ef4444;
    padding: 7px 14px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
}
.bm-studio-btn-delete:hover {
    background: rgba(239, 68, 68, 0.22);
}

.bm-studio-btn-save {
    background: linear-gradient(135deg, #f1a32e 0%, #e08b15 100%);
    border: none;
    color: #000;
    padding: 7px 18px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    box-shadow: 0 2px 10px rgba(241, 163, 46, 0.25);
    transition: all 0.15s ease;
}
.bm-studio-btn-save:hover {
    filter: brightness(1.1);
    transform: translateY(-1px);
    box-shadow: 0 4px 14px rgba(241, 163, 46, 0.4);
}
.bm-studio-btn-save:active {
    transform: translateY(0);
}

/* Faixa de Metadados Integrada */
.bm-studio-meta-bar {
    background: #0f1017;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    padding: 0.75rem 1.5rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem;
    flex-shrink: 0;
}
.bm-studio-title-input {
    flex: 2;
    min-width: 260px;
    background: transparent;
    border: none;
    border-bottom: 2px solid rgba(241, 163, 46, 0.3);
    color: #fff;
    font-size: 1.3rem;
    font-weight: 700;
    padding: 4px 2px;
    outline: none;
    transition: border-color 0.2s;
}
.bm-studio-title-input:focus {
    border-bottom-color: #f1a32e;
}
.bm-studio-title-input::placeholder {
    color: rgba(255, 255, 255, 0.25);
    font-weight: 400;
}

.bm-studio-meta-fields {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    flex-wrap: wrap;
}
.bm-meta-chip {
    display: flex;
    align-items: center;
    gap: 5px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 0.76rem;
    color: #999;
}
.bm-meta-chip input {
    background: transparent;
    border: none;
    color: #ddd;
    font-size: 0.76rem;
    outline: none;
    padding: 0;
    width: 100px;
}

/* Barra de Ferramentas Rica (Sticky Pro Toolbar) */
.bm-studio-toolbar {
    background: #14151e;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding: 6px 1.25rem;
    display: flex;
    flex-wrap: nowrap;
    overflow-x: auto;
    align-items: center;
    gap: 6px;
    user-select: none;
    flex-shrink: 0;
    z-index: 9;
    scrollbar-width: thin;
    scrollbar-color: rgba(241, 163, 46, 0.3) transparent;
}

.bm-tb-group {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
}
.bm-tb-sep {
    width: 1px;
    height: 20px;
    background: rgba(255, 255, 255, 0.1);
    margin: 0 6px;
    flex-shrink: 0;
}

.bm-tool-btn {
    background: transparent;
    border: 1px solid transparent;
    color: #bbb;
    border-radius: 5px;
    padding: 5px 8px;
    font-size: 0.8rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 28px;
    transition: all 0.12s ease;
    line-height: 1;
}
.bm-tool-btn:hover {
    background: rgba(241, 163, 46, 0.14);
    color: #f1a32e;
    border-color: rgba(241, 163, 46, 0.35);
}
.bm-tool-btn.active {
    background: rgba(241, 163, 46, 0.25);
    color: #f1a32e;
    border-color: #f1a32e;
}

.bm-tool-select {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #ccc;
    border-radius: 5px;
    padding: 4px 8px;
    font-size: 0.76rem;
    cursor: pointer;
    outline: none;
    height: 28px;
    min-width: 140px;
    flex-shrink: 0;
}
.bm-tool-select:focus {
    border-color: #f1a32e;
}

/* Popovers e Paleta de Cores */
.bm-color-picker-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
}
.bm-palette-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 5px;
    padding: 4px 8px;
    color: #ccc;
    font-size: 0.76rem;
    cursor: pointer;
    height: 28px;
}
.bm-palette-popover {
    display: none;
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    background: #1b1c26;
    border: 1px solid rgba(241, 163, 46, 0.4);
    border-radius: 8px;
    padding: 8px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    z-index: 1000;
    gap: 6px;
    flex-wrap: wrap;
    width: 170px;
}
.bm-palette-popover.open {
    display: flex;
}
.bm-color-dot {
    width: 22px;
    height: 22px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    cursor: pointer;
    transition: transform 0.1s;
}
.bm-color-dot:hover {
    transform: scale(1.15);
    border-color: #fff;
}
.bm-native-color-input {
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    border-radius: 4px;
}

/* Área Principal do Workspace */
.bm-studio-workspace {
    flex: 1;
    display: flex;
    overflow: hidden;
    position: relative;
}

/* Barra Lateral (Outline de Tópicos) */
.bm-studio-sidebar {
    width: 240px;
    background: #0d0e14;
    border-right: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    user-select: none;
}
.bm-sidebar-header {
    padding: 0.9rem 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.75rem;
    font-weight: 700;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
.bm-sidebar-topics-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
}
.bm-sidebar-topic-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 6px;
    color: #aaa;
    font-size: 0.8rem;
    cursor: pointer;
    margin-bottom: 2px;
    transition: all 0.12s;
    text-decoration: none;
}
.bm-sidebar-topic-item:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
}
.bm-sidebar-topic-item.active {
    background: rgba(241, 163, 46, 0.15);
    color: #f1a32e;
    font-weight: 600;
}
.bm-sidebar-num {
    font-size: 0.68rem;
    background: rgba(255, 255, 255, 0.08);
    padding: 2px 5px;
    border-radius: 4px;
    font-weight: 700;
}

/* Área de Rolagem do Conteúdo */
.bm-studio-content-area {
    flex: 1;
    overflow-y: auto;
    padding: 2rem 2.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    background: #090a0f;
    scroll-behavior: smooth;
}

.bm-studio-content-inner {
    width: 100%;
    max-width: 900px;
}

/* Painel de Pré-visualização ao Vivo */
.bm-studio-preview-pane {
    flex: 1;
    background: #000;
    border-left: 1px solid rgba(255, 255, 255, 0.08);
    display: none;
    flex-direction: column;
    overflow: hidden;
}
.bm-preview-header {
    height: 38px;
    background: #11121a;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: #888;
}
.bm-preview-iframe {
    flex: 1;
    width: 100%;
    border: none;
    background: #0a0b10;
}

/* Card de Tópico no Editor */
.bm-topic-card {
    background: #111219;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    margin-bottom: 1.8rem;
    overflow: hidden;
    transition: border-color 0.2s, box-shadow 0.2s;
}
.bm-topic-card.focused {
    border-color: rgba(241, 163, 46, 0.5);
    box-shadow: 0 0 0 1px rgba(241, 163, 46, 0.2), 0 8px 24px rgba(0,0,0,0.4);
}

.bm-topic-header {
    background: #151722;
    padding: 0.75rem 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    gap: 0.75rem;
}
.bm-topic-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
}
.bm-topic-badge {
    font-size: 0.7rem;
    font-weight: 700;
    color: #f1a32e;
    background: rgba(241, 163, 46, 0.12);
    border: 1px solid rgba(241, 163, 46, 0.3);
    padding: 3px 8px;
    border-radius: 5px;
    white-space: nowrap;
}
.bm-topic-title-input {
    flex: 1;
    background: transparent;
    border: none;
    border-bottom: 1px dashed rgba(255, 255, 255, 0.2);
    color: #fff;
    font-size: 0.95rem;
    font-weight: 600;
    padding: 3px 4px;
    outline: none;
    transition: border-color 0.15s;
}
.bm-topic-title-input:focus {
    border-bottom-color: #f1a32e;
}
.bm-topic-title-input::placeholder {
    color: rgba(255, 255, 255, 0.3);
    font-weight: 400;
}

.bm-topic-actions {
    display: flex;
    align-items: center;
    gap: 4px;
}
.bm-topic-action-btn {
    background: transparent;
    border: 1px solid transparent;
    color: #777;
    border-radius: 4px;
    padding: 4px 7px;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.12s;
}
.bm-topic-action-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #eee;
}
.bm-topic-action-btn.btn-delete:hover {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
}

/* Área Editável do Tópico (WYSIWYG Estilo Word) */
.bm-topic-editor-body {
    min-height: 180px;
    padding: 1.5rem 2rem;
    color: #e5e5e7;
    font-size: 1rem;
    line-height: 1.55;
    outline: none;
    word-break: break-word;
    caret-color: #f1a32e;
}
.bm-topic-editor-body p {
    margin: 0 0 0.35rem 0;
    line-height: 1.55;
}
.bm-topic-editor-body p:last-child {
    margin-bottom: 0;
}
.bm-topic-editor-body p:empty,
.bm-topic-editor-body p:has(> br:only-child) {
    min-height: 1.4em;
    margin-bottom: 0.35rem;
}
.bm-topic-editor-body:empty::before {
    content: attr(data-placeholder);
    color: rgba(255, 255, 255, 0.22);
    pointer-events: none;
    display: block;
}

/* Estilos de conteúdo dentro do editor */
.bm-topic-editor-body img {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    margin: 1rem 0;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    display: block;
}
.bm-topic-editor-body blockquote {
    border-left: 3px solid #f1a32e;
    margin: 1rem 0;
    padding: 0.75rem 1.25rem;
    background: rgba(241, 163, 46, 0.06);
    border-radius: 0 8px 8px 0;
    font-style: italic;
    color: #ddd;
}
.bm-topic-editor-body code {
    background: rgba(255, 255, 255, 0.08);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Fira Code', monospace;
    font-size: 0.88em;
    color: #f1a32e;
}
.bm-topic-editor-body hr {
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.12);
    margin: 1.5rem 0;
}

/* Chips visuais de mídia */
.bm-media-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 0.82rem;
    cursor: default;
    user-select: none;
    margin: 6px 2px;
    vertical-align: middle;
}
.bm-media-chip.youtube {
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.35);
    color: #f87171;
}
.bm-media-chip.discord {
    background: rgba(88, 101, 242, 0.12);
    border: 1px solid rgba(88, 101, 242, 0.35);
    color: #818cf8;
}

/* Caixa de Callout / Destaque */
.bm-callout-box {
    margin: 1rem 0;
    padding: 1rem 1.25rem;
    border-radius: 8px;
    border-left: 4px solid #f1a32e;
    background: rgba(241, 163, 46, 0.08);
}
.bm-callout-box.info {
    border-left-color: #38bdf8;
    background: rgba(56, 189, 248, 0.08);
}
.bm-callout-box.success {
    border-left-color: #10b981;
    background: rgba(16, 185, 129, 0.08);
}
.bm-callout-box.danger {
    border-left-color: #ef4444;
    background: rgba(239, 68, 68, 0.08);
}

/* Área Raw Textarea (quando em modo código) */
.bm-topic-raw-area {
    display: none;
    width: 100%;
    min-height: 200px;
    background: #0a0b10;
    color: #93c5fd;
    font-family: 'Fira Code', 'Courier New', monospace;
    font-size: 0.85rem;
    padding: 1.25rem 1.5rem;
    border: none;
    outline: none;
    resize: vertical;
    box-sizing: border-box;
    line-height: 1.7;
}

/* Botão de Adicionar Novo Tópico */
.bm-btn-add-topic {
    width: 100%;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.02);
    border: 2px dashed rgba(241, 163, 46, 0.3);
    border-radius: 10px;
    color: #f1a32e;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 1rem;
    margin-bottom: 3rem;
    transition: all 0.2s ease;
}
.bm-btn-add-topic:hover {
    background: rgba(241, 163, 46, 0.08);
    border-color: #f1a32e;
    transform: translateY(-1px);
}

/* Modais de Inserção */
.bm-studio-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.82);
    backdrop-filter: blur(6px);
    z-index: 200000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    animation: bmStudioFadeIn 0.15s ease;
}
.bm-studio-modal-box {
    background: #161722;
    border: 1px solid rgba(241, 163, 46, 0.4);
    border-radius: 12px;
    width: 480px;
    max-width: 95vw;
    padding: 1.8rem;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.7);
}
.bm-studio-modal-box h3 {
    margin: 0 0 1.25rem;
    font-size: 1.1rem;
    color: #f1a32e;
    display: flex;
    align-items: center;
    gap: 8px;
}
.bm-studio-modal-box label {
    display: block;
    font-size: 0.8rem;
    color: #aaa;
    margin: 0.8rem 0 0.3rem;
}
.bm-studio-modal-box label:first-of-type {
    margin-top: 0;
}
.bm-studio-modal-box input, .bm-studio-modal-box select {
    width: 100%;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 6px;
    padding: 0.65rem 0.9rem;
    color: #fff;
    font-size: 0.88rem;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s;
}
.bm-studio-modal-box input:focus, .bm-studio-modal-box select:focus {
    border-color: #f1a32e;
}
.bm-studio-modal-actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 1.5rem;
}
.bm-modal-confirm-btn {
    flex: 2;
    background: #f1a32e;
    color: #000;
    border: none;
    border-radius: 6px;
    padding: 0.7rem;
    font-weight: 700;
    cursor: pointer;
    font-size: 0.88rem;
}
.bm-modal-cancel-btn {
    flex: 1;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #ccc;
    border-radius: 6px;
    padding: 0.7rem;
    cursor: pointer;
    font-size: 0.88rem;
}

/* Notificações Toast do Studio */
.bm-studio-toast {
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    background: #1b1c26;
    border: 1px solid rgba(241, 163, 46, 0.4);
    border-left: 4px solid #f1a32e;
    color: #fff;
    padding: 0.85rem 1.4rem;
    border-radius: 8px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    font-size: 0.88rem;
    display: flex;
    align-items: center;
    gap: 10px;
    z-index: 210000;
    animation: bmStudioFadeIn 0.2s ease;
}
`;

let studioCSSInjected = false;
function injectStudioCSS() {
    if (studioCSSInjected) return;
    const style = document.createElement('style');
    style.id = 'bm-studio-css';
    style.textContent = STUDIO_CSS;
    document.head.appendChild(style);
    studioCSSInjected = true;
}

/* ─── Conversões Legacy → HTML (para artigos antigos com meta-linguagem) ── */

/**
 * Detecta se uma string usa a meta-linguagem legada do BitMundo.
 */
export function isLegacyFormat(str) {
    if (!str) return false;
    return /\((strong|em|color|font-size|image|quote|callout|\/strong|\/em|\/color|\/font-size|\/image|\/quote|\/callout)\b/i.test(str);
}

/**
 * Converte conteúdo legado (meta-tags) para HTML puro.
 * Usado apenas ao carregar artigos antigos que ainda não foram re-salvos.
 */
function legacyToHtml(raw) {
    if (!raw) return '';
    let html = raw;

    // (strong)...(/strong) → <b>
    html = html.replace(/\(strong\)([\s\S]*?)\(\/strong\)/gi, '<b>$1</b>');
    html = html.replace(/\(em\)([\s\S]*?)\(\/em\)/gi, '<em>$1</em>');
    html = html.replace(/\(u\)([\s\S]*?)\(\/u\)/gi, '<u>$1</u>');
    html = html.replace(/\(s\)([\s\S]*?)\(\/s\)/gi, '<s>$1</s>');
    html = html.replace(/\(quote\)([\s\S]*?)\(\/quote\)/gi, '<blockquote>$1</blockquote>');
    html = html.replace(/\(callout\s*type\s*=\s*"([^"]+)"\)([\s\S]*?)\(\/callout\)/gi,
        '<div class="bm-callout-box $1" data-callout="$1">$2</div>');
    html = html.replace(/\(color\s*=\s*"([^"]+)"\)([\s\S]*?)\(\/color\)/gi,
        '<span style="color:$1">$2</span>');
    html = html.replace(/\(font-size\s*=\s*"([^"]+)"\)([\s\S]*?)\(\/font-size\)/gi,
        '<span style="font-size:$1">$2</span>');

    // Imagens
    html = html.replace(/\(image style="([^"]*?)"\s*=\s*"([^"]+)"\)(.*?)\(\/image\)/gi,
        (_, style, url, cap) =>
            `<div style="${style}; margin: 1.5rem 0;"><img src="${url}" alt="${cap.trim()}" style="max-width:100%; border-radius:8px;"><p style="font-size:0.85rem; color:rgba(255,255,255,0.5); font-style:italic; margin-top:0.5rem; text-align:center;">${cap.trim()}</p></div>`
    );
    html = html.replace(/\(image style="([^"]*?)"\)([^(]*)\(\/image\)/gi,
        (_, style, url) =>
            `<div style="${style}; margin: 1.5rem 0;"><img src="${url.trim()}" alt="Imagem" style="max-width:100%; border-radius:8px;"></div>`
    );

    // YouTube / Streamable — converter para embed direto
    const ytPat = /(?:([^:<>\n]+):\s*)?(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+))(?:\s*:\s*([^<>\n]+))?/gi;
    html = html.replace(ytPat, (match, prefix, url, id, suffix) => {
        const embedUrl = `https://www.youtube.com/embed/${id}`;
        let vTitle = (prefix || suffix || "").trim();
        if (vTitle.length < 3 || vTitle.includes('http')) vTitle = "";
        const titleHtml = vTitle ? `<p style="margin-bottom:0.8rem;font-weight:700;color:var(--highlight);font-size:1.1rem;border-left:3px solid var(--highlight);padding-left:12px;text-transform:uppercase;">${vTitle}</p>` : '';
        return `<div class="video-container" style="margin:1rem 0 2.5rem;">${titleHtml}<div class="video-wrapper"><iframe src="${embedUrl}" frameborder="0" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;web-share" allowfullscreen></iframe></div></div>`;
    });

    html = html.replace(/(https?:\/\/streamable\.com\/([a-zA-Z0-9_-]+))/gi,
        (match, url, id) =>
            `<div class="video-container" style="margin:1rem 0 2.5rem;"><div class="video-wrapper"><iframe src="https://streamable.com/e/${id}" frameborder="0" allowfullscreen></iframe></div></div>`
    );

    // Discord
    html = html.replace(/(https?:\/\/(?:discord\.gg|discord\.com\/invite)\/([a-zA-Z0-9_-]+))/gi,
        (match, url, code) =>
            `<div class="discord-invite-card" style="margin:1.5rem 0;padding:1.2rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;border:1px solid rgba(88,101,242,0.4);background:rgba(88,101,242,0.1);border-radius:8px;flex-wrap:wrap;"><div style="display:flex;align-items:center;gap:1rem;"><strong style="color:#fff;">Discord</strong><span style="color:#9ca3af;font-family:monospace;font-size:0.8rem;">discord.gg/${code}</span></div><a href="https://discord.gg/${code}" target="_blank" style="background:#248046;color:#fff;padding:0.6rem 1.2rem;border-radius:4px;font-weight:700;text-decoration:none;font-size:0.8rem;">ENTRAR</a></div>`
    );

    // Quebras de linha → parágrafos/brs
    html = html.replace(/(\r\n|\r)/g, '\n');
    html = html.split(/\n{2,}/).map(chunk => {
        const trimmed = chunk.trim();
        if (!trimmed) return '';
        if (/^<(div|blockquote|ul|ol|hr|section|iframe|table|figure)/i.test(trimmed)) return trimmed;
        return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    }).filter(Boolean).join('');

    return html;
}

/**
 * Normaliza qualquer conteúdo (seja texto plano, legado ou HTML incompleto)
 * para uma estrutura HTML semântica estrita baseada em <p>, mantendo parágrafos
 * e quebras de linha (<br>) organizadas.
 */
export function normalizeToStrictHtml(input) {
    if (!input || !input.trim()) {
        return '<p><br></p>';
    }

    let text = input.trim();

    // Se for formato legado de meta-tags, converte primeiro
    if (isLegacyFormat(text)) {
        text = legacyToHtml(text);
    }

    // Se não tiver nenhuma tag HTML, converte quebras em parágrafos e <br>
    const hasHtmlTags = /<[a-z][\s\S]*>/i.test(text);
    if (!hasHtmlTags) {
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const paragraphs = text.split(/\n{2,}/);
        return paragraphs.map(p => {
            const cleanP = p.trim();
            if (!cleanP) return '<p><br></p>';
            return `<p>${cleanP.replace(/\n/g, '<br>')}</p>`;
        }).join('\n');
    }

    // Se tiver HTML mas texto solto ou <div> geradas pelo navegador, normaliza para <p>
    const temp = document.createElement('div');
    temp.innerHTML = text;

    // Converte <div> genéricas de texto em <p>
    temp.querySelectorAll('div').forEach(div => {
        // Se for container de vídeo, card de discord ou callout, não mexe
        if (div.classList.contains('video-container') ||
            div.classList.contains('video-wrapper') ||
            div.classList.contains('discord-invite-card') ||
            div.classList.contains('article-callout') ||
            div.classList.contains('bm-callout-box')) {
            return;
        }
        const p = document.createElement('p');
        p.innerHTML = div.innerHTML || '<br>';
        div.replaceWith(p);
    });

    // Se houver nós de texto soltos na raiz, empacota em <p>
    const fragment = document.createDocumentFragment();
    let currentP = null;

    Array.from(temp.childNodes).forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
            const val = node.nodeValue;
            if (val && val.trim()) {
                if (!currentP) currentP = document.createElement('p');
                currentP.appendChild(node.cloneNode(true));
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName.toLowerCase();
            const isBlock = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'blockquote', 'figure', 'section', 'hr', 'div'].includes(tag);
            if (isBlock) {
                if (currentP) {
                    fragment.appendChild(currentP);
                    currentP = null;
                }
                fragment.appendChild(node.cloneNode(true));
            } else {
                // Nó inline (ex: <b>, <span>, <a>) solto na raiz
                if (!currentP) currentP = document.createElement('p');
                currentP.appendChild(node.cloneNode(true));
            }
        }
    });

    if (currentP) {
        fragment.appendChild(currentP);
    }

    if (fragment.childNodes.length > 0) {
        temp.innerHTML = '';
        temp.appendChild(fragment);
    }

    return temp.innerHTML || '<p><br></p>';
}

/**
 * Formata o código HTML com quebras de linha limpas para exibição e edição no modo Código/Raw
 */
function formatPrettyHtml(html) {
    if (!html) return '';
    return html
        .replace(/<\/p>\s*<p>/gi, '</p>\n<p>')
        .replace(/<\/div>\s*<div/gi, '</div>\n<div')
        .replace(/<\/blockquote>\s*<p/gi, '</blockquote>\n<p')
        .replace(/<\/p>\s*<blockquote/gi, '</p>\n<blockquote')
        .replace(/<\/figure>\s*<p/gi, '</figure>\n<p')
        .replace(/<\/p>\s*<figure/gi, '</p>\n<figure')
        .replace(/<hr>\s*<p/gi, '<hr>\n<p>')
        .replace(/<\/p>\s*<hr>/gi, '</p>\n<hr>')
        .trim();
}

/**
 * Retorna o HTML do editor para salvar no banco.
 * Garante que o conteúdo retornado seja HTML estrito sem nós de texto órfãos.
 */
function getEditorHtml(editorEl) {
    const raw = editorEl.innerHTML;
    // Se estiver praticamente vazio, retorna vazio
    if (!raw || raw === '<p><br></p>' || raw === '<br>' || raw === '<p></p>') {
        return '';
    }
    return normalizeToStrictHtml(raw);
}

/**
 * Carrega conteúdo no editor garantindo que sempre seja HTML com parágrafos.
 */
function loadContentIntoEditor(editorEl, content) {
    if (!content || !content.trim()) {
        editorEl.innerHTML = '<p><br></p>';
        return;
    }
    editorEl.innerHTML = normalizeToStrictHtml(content);
}

/* ─── Modal Genérico do Studio ─────────────────────────────────────── */
function showStudioModal(title, fields) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'bm-studio-modal-overlay';

        const fieldsHtml = fields.map(f => {
            if (f.type === 'select') {
                const opts = (f.options || []).map(o => `<option value="${o.value}">${o.label}</option>`).join('');
                return `<label>${f.label}</label><select id="bm-mf-${f.id}">${opts}</select>`;
            }
            return `<label>${f.label}</label><input type="${f.type || 'text'}" id="bm-mf-${f.id}" placeholder="${f.placeholder || ''}" value="${f.value || ''}">`;
        }).join('');

        overlay.innerHTML = `
            <div class="bm-studio-modal-box">
                <h3>${title}</h3>
                ${fieldsHtml}
                <div class="bm-studio-modal-actions">
                    <button class="bm-modal-confirm-btn" id="bm-m-ok">Confirmar</button>
                    <button class="bm-modal-cancel-btn" id="bm-m-cancel">Cancelar</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        const firstInput = overlay.querySelector('input, select');
        if (firstInput) setTimeout(() => firstInput.focus(), 50);

        const close = (val) => { overlay.remove(); resolve(val); };

        overlay.querySelector('#bm-m-ok').onclick = () => {
            const vals = {};
            fields.forEach(f => {
                vals[f.id] = overlay.querySelector(`#bm-mf-${f.id}`).value.trim();
            });
            close(vals);
        };
        overlay.querySelector('#bm-m-cancel').onclick = () => close(null);
        overlay.addEventListener('keydown', e => {
            if (e.key === 'Enter') overlay.querySelector('#bm-m-ok').click();
            if (e.key === 'Escape') close(null);
        });
    });
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'bm-studio-toast';
    toast.innerHTML = `<span>✨</span> <div>${msg}</div>`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 2800);
}

/* ─── Abertura do Studio em Tela Cheia ─────────────────────────────── */

/**
 * Abre o Studio Profissional em tela cheia para editar ou criar um artigo.
 * @param {Object} options
 * @param {Object} options.article - Dados do artigo (title, topics, category, etc.)
 * @param {string|null} options.id - ID do documento no Firestore
 * @param {Function} options.onSave - Callback assíncrono ao salvar (data, id)
 * @param {Function} options.onDelete - Callback assíncrono ao excluir (id)
 * @param {Function} options.onClose - Callback ao fechar
 */
export function openArticleStudio({ article = {}, id = null, onSave = null, onDelete = null, onClose = null }) {
    injectStudioCSS();

    // Fecha qualquer studio já aberto
    const existing = document.getElementById('bm-studio-overlay');
    if (existing) existing.remove();

    const initialTitle = article.title || '';
    const initialAuthor = article.author || 'BitMundo';
    const initialCategory = article.category || 'Geral';
    const initialDate = article.date || new Date().toLocaleDateString('pt-BR');
    const initialSelected = !!article.selected;
    let topicsData = Array.isArray(article.topics) && article.topics.length > 0
        ? JSON.parse(JSON.stringify(article.topics))
        : [{ title: '', content: article.content || '' }];

    let currentView = 'editor'; // 'editor' | 'split' | 'preview'
    let isDirty = false;
    let focusedEditorEl = null; // Último contenteditable focado

    const overlay = document.createElement('div');
    overlay.id = 'bm-studio-overlay';

    overlay.innerHTML = `
        <!-- Cabeçalho Principal -->
        <header class="bm-studio-header">
            <div class="bm-studio-header-left">
                <button class="bm-studio-back-btn" id="bm-btn-close">
                    ← Sair do Editor
                </button>
                <div class="bm-studio-brand-badge">BitMundo Studio</div>
                <div class="bm-studio-doc-title" id="bm-top-title-display">${initialTitle || 'Nova Postagem'}</div>
                <div class="bm-studio-status-chip ${initialSelected ? 'published' : 'draft'}" id="bm-top-status-chip">
                    ${initialSelected ? '● Publicado' : '○ Rascunho'}
                </div>
            </div>

            <!-- Alternador de Modos -->
            <div class="bm-studio-view-tabs">
                <button class="bm-view-tab active" data-view="editor">✍️ Editor</button>
                <button class="bm-view-tab" data-view="split">🌗 Dividido</button>
                <button class="bm-view-tab" data-view="preview">👁️ Prévia</button>
            </div>

            <!-- Ações -->
            <div class="bm-studio-header-right">
                <span class="bm-studio-stat" id="bm-studio-counter">0 palavras</span>
                <label class="bm-studio-publish-toggle" title="Tornar este post público no BitMundo">
                    <input type="checkbox" id="bm-studio-chk-published" ${initialSelected ? 'checked' : ''}>
                    Publicar
                </label>
                ${id ? `<button class="bm-studio-btn-delete" id="bm-studio-btn-del" title="Excluir postagem">🗑️ Excluir</button>` : ''}
                <button class="bm-studio-btn-save" id="bm-studio-btn-save">
                    💾 Salvar Artigo
                </button>
            </div>
        </header>

        <!-- Faixa de Metadados -->
        <div class="bm-studio-meta-bar">
            <input type="text" class="bm-studio-title-input" id="bm-art-title" placeholder="Digite o título principal da postagem..." value="${initialTitle}">
            <div class="bm-studio-meta-fields">
                <div class="bm-meta-chip">
                    <span>📁 Categoria:</span>
                    <input type="text" id="bm-art-category" value="${initialCategory}" placeholder="Ex: Modding">
                </div>
                <div class="bm-meta-chip">
                    <span>✍️ Autor:</span>
                    <input type="text" id="bm-art-author" value="${initialAuthor}" placeholder="Autor">
                </div>
                <div class="bm-meta-chip">
                    <span>📅 Data:</span>
                    <input type="text" id="bm-art-date" value="${initialDate}" placeholder="DD/MM/YYYY">
                </div>
                <div class="bm-meta-chip">
                    <span>🔗 Slug/ID:</span>
                    <input type="text" id="bm-art-id" value="${id || ''}" placeholder="auto-gerado">
                </div>
            </div>
        </div>

        <!-- Barra de Ferramentas Avançada (Sticky Ribbon) -->
        <div class="bm-studio-toolbar">
            <!-- Histórico -->
            <div class="bm-tb-group">
                <button class="bm-tool-btn" data-act="undo" title="Desfazer (Ctrl+Z)">↩</button>
                <button class="bm-tool-btn" data-act="redo" title="Refazer (Ctrl+Y)">↪</button>
            </div>
            <span class="bm-tb-sep"></span>

            <!-- Estilo de Bloco -->
            <div class="bm-tb-group">
                <select class="bm-tool-select" data-act="block-format" title="Estilo de Texto">
                    <option value="">Parágrafo (Normal)</option>
                    <option value="h2">Título de Seção (H2)</option>
                    <option value="h3">Subtítulo (H3)</option>
                    <option value="h4">Tópico Menor (H4)</option>
                </select>
            </div>
            <span class="bm-tb-sep"></span>

            <!-- Tipografia Inline -->
            <div class="bm-tb-group">
                <button class="bm-tool-btn" data-act="bold" title="Negrito (Ctrl+B)"><b>B</b></button>
                <button class="bm-tool-btn" data-act="italic" title="Itálico (Ctrl+I)"><i>I</i></button>
                <button class="bm-tool-btn" data-act="underline" title="Sublinhado (Ctrl+U)"><u>U</u></button>
                <button class="bm-tool-btn" data-act="strike" title="Tachado"><s>S</s></button>
                <button class="bm-tool-btn" data-act="code" title="Código Inline"><code>&lt;&gt;</code></button>
            </div>
            <span class="bm-tb-sep"></span>

            <!-- Cores & Tamanho -->
            <div class="bm-tb-group">
                <div class="bm-color-picker-wrap">
                    <button class="bm-palette-btn" id="bm-palette-trigger" title="Cor do Texto">
                        🎨 Cor <span id="bm-color-indicator" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f1a32e;"></span>
                    </button>
                    <div class="bm-palette-popover" id="bm-color-popover">
                        <span class="bm-color-dot" style="background:#f1a32e;" data-color="#f1a32e" title="Dourado BitMundo"></span>
                        <span class="bm-color-dot" style="background:#38bdf8;" data-color="#38bdf8" title="Azul Ciano"></span>
                        <span class="bm-color-dot" style="background:#10b981;" data-color="#10b981" title="Verde Esmeralda"></span>
                        <span class="bm-color-dot" style="background:#ef4444;" data-color="#ef4444" title="Vermelho Carmim"></span>
                        <span class="bm-color-dot" style="background:#a855f7;" data-color="#a855f7" title="Roxo Real"></span>
                        <span class="bm-color-dot" style="background:#ffffff;" data-color="#ffffff" title="Branco"></span>
                        <input type="color" class="bm-native-color-input" id="bm-native-color" value="#f1a32e" title="Cor personalizada">
                    </div>
                </div>

                <select class="bm-tool-select" data-act="fontsize" title="Tamanho da Fonte" style="margin-left:4px;">
                    <option value="">Tamanho</option>
                    <option value="0.8em">Pequeno (12px)</option>
                    <option value="1em">Normal (16px)</option>
                    <option value="1.25em">Médio (20px)</option>
                    <option value="1.5em">Grande (24px)</option>
                    <option value="2em">Destaque (32px)</option>
                </select>
            </div>
            <span class="bm-tb-sep"></span>

            <!-- Alinhamento & Listas -->
            <div class="bm-tb-group">
                <button class="bm-tool-btn" data-act="align-left" title="Alinhar à Esquerda">☰</button>
                <button class="bm-tool-btn" data-act="align-center" title="Centralizar">☲</button>
                <button class="bm-tool-btn" data-act="align-right" title="Alinhar à Direita">☱</button>
                <button class="bm-tool-btn" data-act="list-ul" title="Lista com Marcadores">• Lista</button>
                <button class="bm-tool-btn" data-act="list-ol" title="Lista Numerada">1. Lista</button>
                <button class="bm-tool-btn" data-act="quote" title="Citação / Bloco de Destaque">❝ Citação</button>
            </div>
            <span class="bm-tb-sep"></span>

            <!-- Parágrafo & Espaçamento Estilo Word -->
            <div class="bm-tb-group">
                <select class="bm-tool-select" data-act="paragraph-spacing" title="Espaçamento entre Parágrafos (Estilo Word)" style="min-width: 135px;">
                    <option value="0.35rem">📐 Espaço: Word (4px)</option>
                    <option value="0">📐 Espaço: Zero (0px)</option>
                    <option value="0.75rem">📐 Espaço: Médio (12px)</option>
                    <option value="1.25rem">📐 Espaço: Amplo (20px)</option>
                </select>
                <select class="bm-tool-select" data-act="line-height" title="Entrelinhas" style="min-width: 110px; margin-left: 3px;">
                    <option value="1.55">📏 Linha: 1.5x (Word)</option>
                    <option value="1.25">📏 Linha: 1.25x</option>
                    <option value="1.85">📏 Linha: 1.85x</option>
                </select>
                <button class="bm-tool-btn" data-act="outdent" title="Diminuir Recuo">⇤</button>
                <button class="bm-tool-btn" data-act="indent" title="Aumentar Recuo">⇥</button>
            </div>
            <span class="bm-tb-sep"></span>

            <!-- Mídias & Elementos BitMundo -->
            <div class="bm-tb-group">
                <button class="bm-tool-btn" data-act="insert-img" title="Inserir Imagem via URL">🖼️ Imagem</button>
                <button class="bm-tool-btn" data-act="insert-yt" title="Inserir Vídeo do YouTube / Streamable">▶️ Vídeo</button>
                <button class="bm-tool-btn" data-act="insert-discord" title="Inserir Card de Convite do Discord">💬 Discord</button>
                <button class="bm-tool-btn" data-act="insert-callout" title="Inserir Caixa de Alerta">💡 Alerta</button>
                <button class="bm-tool-btn" data-act="insert-hr" title="Linha Divisória">⎯ HR</button>
            </div>
            <span class="bm-tb-sep"></span>

            <!-- Modos e Ajuda -->
            <div class="bm-tb-group">
                <button class="bm-tool-btn" data-act="clear-format" title="Limpar Formatação">🧹</button>
                <button class="bm-tool-btn" data-act="toggle-raw" id="bm-btn-raw" title="Alternar entre modo visual e código HTML">&lt;/&gt; HTML</button>
                <button class="bm-tool-btn" data-act="help" title="Ajuda e Tags do BitMundo">❓</button>
            </div>
        </div>

        <!-- Área de Trabalho (Sidebar + Conteúdo + Live Preview) -->
        <div class="bm-studio-workspace">
            <!-- Sidebar / Índice de Tópicos -->
            <aside class="bm-studio-sidebar">
                <div class="bm-sidebar-header">
                    <span>📑 Tópicos do Artigo</span>
                    <button id="bm-sidebar-add-topic" style="background:none;border:none;color:#f1a32e;cursor:pointer;font-size:1.1rem;padding:0;" title="Adicionar Tópico">+</button>
                </div>
                <div class="bm-sidebar-topics-list" id="bm-sidebar-list">
                    <!-- Gerado dinamicamente -->
                </div>
            </aside>

            <!-- Editor Central (Tópicos Estruturados) -->
            <main class="bm-studio-content-area" id="bm-content-area">
                <div class="bm-studio-content-inner">
                    <div id="bm-topics-container">
                        <!-- Tópicos serão inseridos aqui -->
                    </div>

                    <button class="bm-btn-add-topic" id="bm-btn-add-topic-main">
                        ➕ Adicionar Novo Tópico à Postagem
                    </button>
                </div>
            </main>

            <!-- Painel de Pré-visualização ao Vivo (Split / Full Preview) -->
            <section class="bm-studio-preview-pane" id="bm-preview-pane">
                <div class="bm-preview-header">
                    <span>👁️ Prévia ao Vivo em Tempo Real</span>
                    <span style="font-size:0.7rem;color:#666;">Renderização idêntica ao site</span>
                </div>
                <iframe class="bm-preview-iframe" id="bm-preview-iframe"></iframe>
            </section>
        </div>
    `;

    document.body.appendChild(overlay);

    /* ─── Elementos do DOM ─── */
    const titleInput = overlay.querySelector('#bm-art-title');
    const topTitleDisplay = overlay.querySelector('#bm-top-title-display');
    const statusChip = overlay.querySelector('#bm-top-status-chip');
    const chkPublished = overlay.querySelector('#bm-studio-chk-published');
    const topicsContainer = overlay.querySelector('#bm-topics-container');
    const sidebarList = overlay.querySelector('#bm-sidebar-list');
    const previewPane = overlay.querySelector('#bm-preview-pane');
    const contentArea = overlay.querySelector('#bm-content-area');
    const previewIframe = overlay.querySelector('#bm-preview-iframe');
    const counterEl = overlay.querySelector('#bm-studio-counter');
    const btnRaw = overlay.querySelector('#bm-btn-raw');

    let isRawMode = false;

    // Atualiza título no topo
    titleInput.addEventListener('input', () => {
        isDirty = true;
        topTitleDisplay.textContent = titleInput.value.trim() || 'Nova Postagem';
        schedulePreviewUpdate();
    });

    // Atualiza status chip
    chkPublished.addEventListener('change', () => {
        isDirty = true;
        if (chkPublished.checked) {
            statusChip.className = 'bm-studio-status-chip published';
            statusChip.textContent = '● Publicado';
        } else {
            statusChip.className = 'bm-studio-status-chip draft';
            statusChip.textContent = '○ Rascunho';
        }
        schedulePreviewUpdate();
    });

    /* ─── Renderização dos Tópicos ─── */

    function renderAllTopics() {
        topicsContainer.innerHTML = '';
        topicsData.forEach((t, idx) => {
            const card = createTopicCardElement(t, idx);
            topicsContainer.appendChild(card);
        });
        updateSidebarOutline();
        updateWordCount();
        schedulePreviewUpdate();
    }

    function createTopicCardElement(topic, index) {
        const card = document.createElement('div');
        card.className = 'bm-topic-card';
        card.dataset.index = index;
        card.id = `bm-topic-card-${index}`;

        card.innerHTML = `
            <div class="bm-topic-header">
                <div class="bm-topic-header-left">
                    <span class="bm-topic-badge">TÓPICO #${index + 1}</span>
                    <input type="text" class="bm-topic-title-input" placeholder="Subtítulo ou Seção (opcional)..." value="${topic.title || ''}">
                </div>
                <div class="bm-topic-actions">
                    <button class="bm-topic-action-btn" data-action="up" title="Mover para cima" ${index === 0 ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''}>↑</button>
                    <button class="bm-topic-action-btn" data-action="down" title="Mover para baixo" ${index === topicsData.length - 1 ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''}>↓</button>
                    <button class="bm-topic-action-btn" data-action="duplicate" title="Duplicar tópico">⧉</button>
                    <button class="bm-topic-action-btn btn-delete" data-action="delete" title="Excluir tópico">✕</button>
                </div>
            </div>
            <div class="bm-topic-editor-body" contenteditable="true" data-placeholder="Escreva o conteúdo do tópico aqui... use a barra de ferramentas para formatar, inserir mídias, etc." spellcheck="true"></div>
            <textarea class="bm-topic-raw-area" placeholder="Edite o código HTML diretamente..."></textarea>
        `;

        const bodyEl = card.querySelector('.bm-topic-editor-body');
        const rawEl = card.querySelector('.bm-topic-raw-area');
        const subTitleInput = card.querySelector('.bm-topic-title-input');

        loadContentIntoEditor(bodyEl, topic.content || '');
        rawEl.value = formatPrettyHtml(bodyEl.innerHTML);

        if (isRawMode) {
            bodyEl.style.display = 'none';
            rawEl.style.display = 'block';
        }

        // Foco e seleção com garantia de parágrafos <p>
        bodyEl.addEventListener('focus', () => {
            try {
                document.execCommand('defaultParagraphSeparator', false, 'p');
            } catch (e) {}
            if (!bodyEl.innerHTML.trim() || bodyEl.innerHTML === '<br>') {
                bodyEl.innerHTML = '<p><br></p>';
            }
            focusedEditorEl = bodyEl;
            document.querySelectorAll('.bm-topic-card').forEach(c => c.classList.remove('focused'));
            card.classList.add('focused');
            updateActiveSidebarTopic(index);
        });

        bodyEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                try {
                    document.execCommand('defaultParagraphSeparator', false, 'p');
                } catch (err) {}
            }
        });

        rawEl.addEventListener('focus', () => {
            focusedEditorEl = rawEl;
            document.querySelectorAll('.bm-topic-card').forEach(c => c.classList.remove('focused'));
            card.classList.add('focused');
            updateActiveSidebarTopic(index);
        });

        // Sincronização de conteúdo — HTML puro e semântico em tempo real
        bodyEl.addEventListener('input', () => {
            isDirty = true;
            const currentHtml = normalizeToStrictHtml(bodyEl.innerHTML);
            topicsData[index].content = currentHtml;
            rawEl.value = formatPrettyHtml(currentHtml);
            updateWordCount();
            schedulePreviewUpdate();
        });

        rawEl.addEventListener('input', () => {
            isDirty = true;
            topicsData[index].content = rawEl.value;
            bodyEl.innerHTML = rawEl.value;
            updateWordCount();
            schedulePreviewUpdate();
        });

        subTitleInput.addEventListener('input', () => {
            isDirty = true;
            topicsData[index].title = subTitleInput.value;
            updateSidebarOutline();
            schedulePreviewUpdate();
        });

        // Ações do cabeçalho do tópico
        card.querySelectorAll('.bm-topic-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const act = btn.getAttribute('data-action');
                syncCurrentCardData();

                if (act === 'up' && index > 0) {
                    const temp = topicsData[index];
                    topicsData[index] = topicsData[index - 1];
                    topicsData[index - 1] = temp;
                    renderAllTopics();
                } else if (act === 'down' && index < topicsData.length - 1) {
                    const temp = topicsData[index];
                    topicsData[index] = topicsData[index + 1];
                    topicsData[index + 1] = temp;
                    renderAllTopics();
                } else if (act === 'duplicate') {
                    const clone = JSON.parse(JSON.stringify(topicsData[index]));
                    clone.title = (clone.title ? clone.title + ' (Cópia)' : '');
                    topicsData.splice(index + 1, 0, clone);
                    renderAllTopics();
                } else if (act === 'delete') {
                    if (topicsData.length <= 1) {
                        topicsData = [{ title: '', content: '' }];
                    } else {
                        topicsData.splice(index, 1);
                    }
                    renderAllTopics();
                }
            });
        });

        return card;
    }

    function syncCurrentCardData() {
        overlay.querySelectorAll('.bm-topic-card').forEach(card => {
            const idx = parseInt(card.dataset.index, 10);
            if (topicsData[idx]) {
                const subTitle = card.querySelector('.bm-topic-title-input').value;
                const body = card.querySelector('.bm-topic-editor-body');
                const raw = card.querySelector('.bm-topic-raw-area');
                topicsData[idx].title = subTitle;
                topicsData[idx].content = isRawMode ? raw.value : getEditorHtml(body);
            }
        });
    }

    function addNewTopic() {
        syncCurrentCardData();
        topicsData.push({ title: '', content: '' });
        renderAllTopics();
        const newCard = overlay.querySelector(`#bm-topic-card-${topicsData.length - 1}`);
        if (newCard) {
            newCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => {
                const b = newCard.querySelector('.bm-topic-editor-body');
                if (b) b.focus();
            }, 150);
        }
    }

    overlay.querySelector('#bm-btn-add-topic-main').onclick = addNewTopic;
    overlay.querySelector('#bm-sidebar-add-topic').onclick = addNewTopic;

    /* ─── Atualização da Sidebar (Índice de Tópicos) ─── */
    function updateSidebarOutline() {
        sidebarList.innerHTML = '';
        topicsData.forEach((t, i) => {
            const item = document.createElement('div');
            item.className = 'bm-sidebar-topic-item';
            item.dataset.index = i;
            item.innerHTML = `
                <span class="bm-sidebar-num">#${i + 1}</span>
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    ${t.title && t.title.trim() ? t.title : `Tópico ${i + 1}`}
                </span>
            `;
            item.onclick = () => {
                const targetCard = overlay.querySelector(`#bm-topic-card-${i}`);
                if (targetCard) {
                    targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    const editor = targetCard.querySelector('.bm-topic-editor-body');
                    if (editor) editor.focus();
                }
            };
            sidebarList.appendChild(item);
        });
    }

    function updateActiveSidebarTopic(activeIdx) {
        sidebarList.querySelectorAll('.bm-sidebar-topic-item').forEach((el, i) => {
            if (i === activeIdx) el.classList.add('active');
            else el.classList.remove('active');
        });
    }

    function updateWordCount() {
        let totalWords = 0;
        topicsData.forEach(t => {
            // Strip HTML tags for word counting
            const text = (t.content || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
            if (text) totalWords += text.split(/\s+/).length;
        });
        counterEl.textContent = `${topicsData.length} tópicos • ${totalWords} palavras`;
    }

    /* ─── Barra de Ferramentas / Execução de Comandos ─── */

    // Garante que o clique na toolbar não perca a seleção do editor ativo
    overlay.querySelector('.bm-studio-toolbar').addEventListener('mousedown', e => {
        if (!e.target.closest('input') && !e.target.closest('select')) {
            e.preventDefault();
        }
    });

    function getActiveEditor() {
        if (focusedEditorEl && document.body.contains(focusedEditorEl)) {
            return focusedEditorEl;
        }
        // Fallback para o primeiro editor disponível
        const first = overlay.querySelector('.bm-topic-editor-body');
        if (first) {
            first.focus();
            return first;
        }
        return null;
    }

    function execFormat(cmd, val = null) {
        const editor = getActiveEditor();
        if (!editor || isRawMode) return;
        editor.focus();
        document.execCommand(cmd, false, val);
        editor.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Ações dos Botões da Toolbar
    overlay.querySelectorAll('.bm-tool-btn[data-act]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const act = btn.getAttribute('data-act');
            const editor = getActiveEditor();

            if (act === 'undo') { execFormat('undo'); return; }
            if (act === 'redo') { execFormat('redo'); return; }
            if (act === 'bold') { execFormat('bold'); return; }
            if (act === 'italic') { execFormat('italic'); return; }
            if (act === 'underline') { execFormat('underline'); return; }
            if (act === 'strike') { execFormat('strikeThrough'); return; }
            if (act === 'align-left') { execFormat('justifyLeft'); return; }
            if (act === 'align-center') { execFormat('justifyCenter'); return; }
            if (act === 'align-right') { execFormat('justifyRight'); return; }
            if (act === 'list-ul') { execFormat('insertUnorderedList'); return; }
            if (act === 'list-ol') { execFormat('insertOrderedList'); return; }
            if (act === 'outdent') { execFormat('outdent'); return; }
            if (act === 'indent') { execFormat('indent'); return; }
            if (act === 'clear-format') { execFormat('removeFormat'); return; }

            if (act === 'code') {
                if (!editor || isRawMode) return;
                editor.focus();
                const sel = window.getSelection();
                if (sel && !sel.isCollapsed) {
                    const range = sel.getRangeAt(0);
                    const code = document.createElement('code');
                    code.appendChild(range.extractContents());
                    range.insertNode(code);
                    editor.dispatchEvent(new Event('input', { bubbles: true }));
                }
                return;
            }

            if (act === 'quote') {
                if (!editor || isRawMode) return;
                editor.focus();
                const sel = window.getSelection();
                const bq = document.createElement('blockquote');
                if (sel && !sel.isCollapsed) {
                    bq.appendChild(sel.getRangeAt(0).extractContents());
                } else {
                    bq.textContent = 'Digite sua citação aqui...';
                }
                insertBlockElementAtCursor(editor, bq);
                editor.dispatchEvent(new Event('input', { bubbles: true }));
                return;
            }

            if (act === 'insert-hr') {
                if (!editor || isRawMode) return;
                editor.focus();
                const hr = document.createElement('hr');
                insertBlockElementAtCursor(editor, hr);
                editor.dispatchEvent(new Event('input', { bubbles: true }));
                return;
            }

            if (act === 'insert-img') {
                const res = await showStudioModal('🖼️ Inserir Imagem', [
                    { id: 'url', label: 'URL da Imagem *', placeholder: 'https://exemplo.com/imagem.png' },
                    { id: 'caption', label: 'Legenda da Imagem (Opcional)', placeholder: 'Descrição para os leitores' },
                    { id: 'style', label: 'Estilo/Alinhamento', type: 'select', options: [
                        { value: 'text-align:center', label: 'Centralizada' },
                        { value: 'text-align:left', label: 'Alinhada à Esquerda' },
                        { value: 'text-align:right', label: 'Alinhada à Direita' }
                    ]}
                ]);
                if (!res || !res.url) return;
                const ed = getActiveEditor();
                if (!ed) return;
                ed.focus();

                const fig = document.createElement('figure');
                fig.setAttribute('style', `${res.style || 'text-align:center'}; margin: 1.5rem 0;`);
                
                const img = document.createElement('img');
                img.src = res.url;
                img.alt = res.caption || 'Imagem';
                img.style.maxWidth = '100%';
                img.style.borderRadius = '8px';
                fig.appendChild(img);

                if (res.caption && res.caption.trim()) {
                    const cap = document.createElement('figcaption');
                    cap.style.cssText = 'font-size: 0.85rem; color: rgba(255,255,255,0.6); font-style: italic; margin-top: 0.5rem; text-align: center;';
                    cap.textContent = res.caption.trim();
                    fig.appendChild(cap);
                }

                insertBlockElementAtCursor(ed, fig);
                ed.dispatchEvent(new Event('input', { bubbles: true }));
                return;
            }

            if (act === 'insert-yt') {
                const res = await showStudioModal('▶️ Inserir Vídeo (YouTube / Streamable)', [
                    { id: 'url', label: 'URL do Vídeo *', placeholder: 'https://youtu.be/...' },
                    { id: 'title', label: 'Título/Prefixo do Vídeo (Opcional)', placeholder: 'Ex: Trailer de Lançamento' }
                ]);
                if (!res || !res.url) return;
                const ed = getActiveEditor();
                if (!ed) return;
                ed.focus();

                const isStreamable = res.url.includes('streamable.com');
                let id = res.url;
                const m = id.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/|streamable\.com\/(?:e\/)?)([a-zA-Z0-9_-]+)/i);
                if (m) id = m[1];

                const embedUrl = isStreamable
                    ? `https://streamable.com/e/${id}`
                    : `https://www.youtube.com/embed/${id}`;

                const container = document.createElement('div');
                container.className = 'video-container';
                container.style.cssText = 'margin: 1.5rem 0 2rem; user-select: none;';

                const titleHtml = res.title && res.title.trim()
                    ? `<p style="margin-bottom: 0.8rem; font-weight: 700; color: var(--highlight, #f1a32e); font-size: 1.1rem; border-left: 3px solid var(--highlight, #f1a32e); padding-left: 12px; text-transform: uppercase;">${res.title.trim()}</p>`
                    : '';

                container.innerHTML = `
                    ${titleHtml}
                    <div class="video-wrapper" style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 8px;">
                        <iframe src="${embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;"></iframe>
                    </div>
                `;
                insertBlockElementAtCursor(ed, container);
                ed.dispatchEvent(new Event('input', { bubbles: true }));
                return;
            }

            if (act === 'insert-discord') {
                const res = await showStudioModal('💬 Inserir Card do Discord', [
                    { id: 'url', label: 'Link de Convite do Discord *', placeholder: 'https://discord.gg/...' }
                ]);
                if (!res || !res.url) return;
                const ed = getActiveEditor();
                if (!ed) return;
                ed.focus();

                let code = res.url;
                const m = code.match(/discord\.(?:gg|com\/invite)\/([a-zA-Z0-9_-]+)/i);
                if (m) code = m[1];

                const card = document.createElement('div');
                card.className = 'discord-invite-card';
                card.style.cssText = 'margin: 1.5rem 0; padding: 1.2rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; border: 1px solid rgba(88, 101, 242, 0.4); background: rgba(88, 101, 242, 0.1); border-radius: 8px; flex-wrap: wrap;';
                card.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <div style="background: #5865F2; padding: 8px; border-radius: 8px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
                            <svg width="22" height="22" viewBox="0 0 127.14 96.36" fill="white"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.71,32.65-1.82,56.6.4,80.21a105.73,105.73,0,0,0,32.17,16.15,77.7,77.7,0,0,0,6.89-11.11,68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1,105.25,105.25,0,0,0,32.19-16.14c3.39-29.09-5.46-52.74-23.74-72.15ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>
                        </div>
                        <div>
                            <p style="margin: 0; font-weight: 700; color: #fff; font-size: 0.95rem;">Comunidade no Discord</p>
                            <p style="margin: 0; font-size: 0.8rem; color: #9ca3af; font-family: monospace;">discord.gg/${code}</p>
                        </div>
                    </div>
                    <a href="https://discord.gg/${code}" target="_blank" rel="noopener noreferrer" style="background: #248046; color: #fff; padding: 0.5rem 1rem; border-radius: 4px; font-weight: 700; text-decoration: none; font-size: 0.8rem; text-transform: uppercase;">ENTRAR NO SERVIDOR</a>
                `;
                insertBlockElementAtCursor(ed, card);
                ed.dispatchEvent(new Event('input', { bubbles: true }));
                return;
            }

            if (act === 'insert-callout') {
                const res = await showStudioModal('💡 Inserir Caixa de Alerta', [
                    { id: 'type', label: 'Tipo de Alerta', type: 'select', options: [
                        { value: 'info', label: 'ℹ️ Informação (Azul)' },
                        { value: 'success', label: '✅ Sucesso / Dica (Verde)' },
                        { value: 'danger', label: '⚠️ Atenção / Perigo (Vermelho)' }
                    ]},
                    { id: 'text', label: 'Mensagem', placeholder: 'Conteúdo do destaque...' }
                ]);
                if (!res) return;
                const ed = getActiveEditor();
                if (!ed) return;
                ed.focus();

                const colors = {
                    info: '#38bdf8',
                    success: '#10b981',
                    danger: '#ef4444'
                };
                const color = colors[res.type] || '#f1a32e';
                const box = document.createElement('div');
                box.className = `article-callout callout-${res.type} bm-callout-box ${res.type}`;
                box.style.cssText = `margin: 1.5rem 0; padding: 1rem 1.25rem; border-radius: 8px; border-left: 4px solid ${color}; background: rgba(255,255,255,0.05); color: #e5e5e7;`;
                box.innerHTML = res.text || 'Destaque importante aqui...';
                insertBlockElementAtCursor(ed, box);
                ed.dispatchEvent(new Event('input', { bubbles: true }));
                return;
            }

            if (act === 'toggle-raw') {
                isRawMode = !isRawMode;
                btnRaw.classList.toggle('active', isRawMode);
                btnRaw.title = isRawMode ? "Alternar para modo Visual" : "Alternar para código HTML";
                overlay.querySelectorAll('.bm-topic-card').forEach(card => {
                    const b = card.querySelector('.bm-topic-editor-body');
                    const r = card.querySelector('.bm-topic-raw-area');
                    if (isRawMode) {
                        const clean = normalizeToStrictHtml(b.innerHTML);
                        r.value = formatPrettyHtml(clean);
                        b.style.display = 'none';
                        r.style.display = 'block';
                    } else {
                        loadContentIntoEditor(b, r.value);
                        r.style.display = 'none';
                        b.style.display = 'block';
                    }
                });
                return;
            }

            if (act === 'help') {
                await showStudioModal('❓ Guia do Editor BitMundo', [
                    { id: 'h', label: 'O editor usa HTML puro — o que você formata é exatamente o que será salvo e exibido no site.', placeholder: '', value: 'Use a barra de ferramentas para formatar texto, inserir imagens, vídeos, citações e alertas. O botão </> HTML mostra o código fonte para edição avançada.' }
                ]);
                return;
            }
        });
    });

    // Seletor de Bloco (H2, H3, H4)
    overlay.querySelector('[data-act="block-format"]').addEventListener('change', function() {
        const val = this.value;
        const ed = getActiveEditor();
        if (!ed || isRawMode) return;
        ed.focus();
        if (val) {
            document.execCommand('formatBlock', false, `<${val}>`);
        } else {
            document.execCommand('formatBlock', false, '<p>');
        }
        this.value = '';
        ed.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Seletor de Tamanho de Fonte
    overlay.querySelector('[data-act="fontsize"]').addEventListener('change', function() {
        const val = this.value;
        const ed = getActiveEditor();
        if (!ed || isRawMode || !val) return;
        ed.focus();
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) {
            const range = sel.getRangeAt(0);
            const span = document.createElement('span');
            span.style.fontSize = val;
            try {
                range.surroundContents(span);
            } catch {
                span.appendChild(range.extractContents());
                range.insertNode(span);
            }
            ed.dispatchEvent(new Event('input', { bubbles: true }));
        }
        this.value = '';
    });

    // Seletor de Espaçamento de Parágrafo (Estilo Word)
    const pSpacingSelect = overlay.querySelector('[data-act="paragraph-spacing"]');
    if (pSpacingSelect) {
        pSpacingSelect.addEventListener('change', function() {
            const val = this.value;
            const ed = getActiveEditor();
            if (!ed || isRawMode) return;
            ed.focus();

            const sel = window.getSelection();
            let applied = false;
            if (sel && sel.anchorNode) {
                let node = sel.anchorNode;
                while (node && node !== ed) {
                    if (node.tagName && node.tagName.toLowerCase() === 'p') {
                        node.style.marginBottom = val;
                        applied = true;
                        break;
                    }
                    node = node.parentNode;
                }
            }
            if (!applied) {
                ed.querySelectorAll('p').forEach(p => {
                    p.style.marginBottom = val;
                });
            }
            ed.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }

    // Seletor de Entrelinhas (Line-height)
    const lineHSelect = overlay.querySelector('[data-act="line-height"]');
    if (lineHSelect) {
        lineHSelect.addEventListener('change', function() {
            const val = this.value;
            const ed = getActiveEditor();
            if (!ed || isRawMode) return;
            ed.focus();

            const sel = window.getSelection();
            let applied = false;
            if (sel && sel.anchorNode) {
                let node = sel.anchorNode;
                while (node && node !== ed) {
                    if (node.tagName && ['p', 'div', 'blockquote', 'li'].includes(node.tagName.toLowerCase())) {
                        node.style.lineHeight = val;
                        applied = true;
                        break;
                    }
                    node = node.parentNode;
                }
            }
            if (!applied) {
                ed.style.lineHeight = val;
                ed.querySelectorAll('p').forEach(p => p.style.lineHeight = val);
            }
            ed.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }

    // Paleta de Cores Popover
    const paletteTrigger = overlay.querySelector('#bm-palette-trigger');
    const colorPopover = overlay.querySelector('#bm-color-popover');
    const colorIndicator = overlay.querySelector('#bm-color-indicator');
    const nativeColorInput = overlay.querySelector('#bm-native-color');

    paletteTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        colorPopover.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#bm-color-popover') && !e.target.closest('#bm-palette-trigger')) {
            colorPopover.classList.remove('open');
        }
    });

    function applyTextColor(color) {
        colorIndicator.style.background = color;
        colorPopover.classList.remove('open');
        const ed = getActiveEditor();
        if (!ed || isRawMode) return;
        ed.focus();
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) {
            const range = sel.getRangeAt(0);
            const span = document.createElement('span');
            span.style.color = color;
            try {
                range.surroundContents(span);
            } catch {
                span.appendChild(range.extractContents());
                range.insertNode(span);
            }
            ed.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    colorPopover.querySelectorAll('.bm-color-dot').forEach(dot => {
        dot.addEventListener('click', () => applyTextColor(dot.getAttribute('data-color')));
    });

    nativeColorInput.addEventListener('input', () => applyTextColor(nativeColorInput.value));

    function insertNodeAtCursor(editorEl, node) {
        editorEl.focus();
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) {
            editorEl.appendChild(node);
            return;
        }
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function insertBlockElementAtCursor(editorEl, node) {
        editorEl.focus();
        const sel = window.getSelection();
        const lineAfter = document.createElement('div');
        lineAfter.innerHTML = '<br>';

        if (!sel || !sel.rangeCount) {
            editorEl.appendChild(node);
            editorEl.appendChild(lineAfter);
            const r = document.createRange();
            r.setStart(lineAfter, 0);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
            return;
        }

        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(node);

        if (node.nextSibling) {
            node.parentNode.insertBefore(lineAfter, node.nextSibling);
        } else {
            node.parentNode.appendChild(lineAfter);
        }

        const r = document.createRange();
        r.setStart(lineAfter, 0);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
    }

    /* ─── Modos de Visualização (Editor | Split | Preview) ─── */
    overlay.querySelectorAll('.bm-view-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            overlay.querySelectorAll('.bm-view-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentView = tab.getAttribute('data-view');
            applyViewMode(currentView);
        });
    });

    function applyViewMode(mode) {
        if (mode === 'editor') {
            contentArea.style.display = 'flex';
            contentArea.style.width = '100%';
            previewPane.style.display = 'none';
        } else if (mode === 'split') {
            contentArea.style.display = 'flex';
            contentArea.style.width = '50%';
            previewPane.style.display = 'flex';
            updatePreviewContent();
        } else if (mode === 'preview') {
            contentArea.style.display = 'none';
            previewPane.style.display = 'flex';
            previewPane.style.width = '100%';
            updatePreviewContent();
        }
    }

    /* ─── Atualização do Live Preview (Iframe) ─── */
    let previewDebounceTimer = null;
    function schedulePreviewUpdate() {
        if (currentView === 'editor') return;
        clearTimeout(previewDebounceTimer);
        previewDebounceTimer = setTimeout(updatePreviewContent, 150);
    }

    let previewLoaded = false;

    function updatePreviewContent() {
        syncCurrentCardData();
        const title = titleInput.value.trim() || 'Sem Título';
        const author = overlay.querySelector('#bm-art-author').value || 'BitMundo';
        const category = overlay.querySelector('#bm-art-category').value || 'Geral';
        const date = overlay.querySelector('#bm-art-date').value || '';

        // Renderiza tópicos para HTML — conteúdo já é HTML puro
        const topicsHtml = topicsData.map(topic => {
            const tTitle = topic.title && topic.title.trim()
                ? `<h3 class="topic-title" style="color: var(--highlight, #f1a32e); margin-top: 2.2rem; margin-bottom: 1rem; font-size: 1.35rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; border-left: 4px solid var(--highlight, #f1a32e); padding-left: 14px;">${topic.title}</h3>`
                : '';
            // O conteúdo já é HTML puro — renderizar diretamente
            const tContent = topic.content || '';
            return `<section class="article-topic" style="margin-bottom: 2.5rem;">${tTitle}${tContent}</section>`;
        }).join('');

        try {
            const doc = previewIframe.contentWindow.document;
            const mount = doc.getElementById('prev-mount');

            if (!previewLoaded || !mount) {
                const docHtml = `
                    <!DOCTYPE html>
                    <html lang="pt-br">
                    <head>
                        <meta charset="UTF-8">
                        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;700&family=Inter:wght@300;400;600&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap">
                        <link rel="stylesheet" href="/css/style.css">
                        <link rel="stylesheet" href="/css/projects.css">
                        <style>
                            :root {
                                --highlight: #f1a32e;
                                --primary: #f1a32e;
                                --text-muted: #8e8e93;
                            }
                            body {
                                background: #0a0b10;
                                color: #eee;
                                font-family: 'Inter', sans-serif;
                                padding: 2.5rem 2rem;
                                margin: 0;
                                line-height: 1.8;
                            }
                            .article-view-container {
                                max-width: 820px;
                                margin: 0 auto;
                            }
                            .article-content p {
                                margin: 0 0 0.35rem 0;
                                line-height: 1.55;
                            }
                            .article-content p:last-child {
                                margin-bottom: 0;
                            }
                            .article-content p:empty,
                            .article-content p:has(> br:only-child) {
                                min-height: 1.4em;
                                margin-bottom: 0.35rem;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="article-view-container" id="prev-mount">
                            <h1 class="hero-title" style="font-size: 2.2rem; margin-bottom: 0.5rem; text-align: left; color:#fff;" id="prev-title"></h1>
                            <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1);" id="prev-meta"></div>
                            <div class="article-content" id="prev-body" style="line-height: 1.8;"></div>
                        </div>
                    </body>
                    </html>
                `;
                doc.open();
                doc.write(docHtml);
                doc.close();
                previewLoaded = true;
            }

            const curDoc = previewIframe.contentWindow.document;
            const pTitle = curDoc.getElementById('prev-title');
            const pMeta = curDoc.getElementById('prev-meta');
            const pBody = curDoc.getElementById('prev-body');

            if (pTitle) pTitle.textContent = title;
            if (pMeta) pMeta.innerHTML = `<span>📅 ${date}</span> &nbsp;|&nbsp; <span>📁 ${category}</span> &nbsp;|&nbsp; <span>✍️ por <strong style="color:var(--highlight);">${author}</strong></span>`;
            if (pBody) pBody.innerHTML = topicsHtml;
        } catch (e) {
            console.error("[Studio Preview Error]", e);
        }
    }

    /* ─── Salvar Dados ─── */
    overlay.querySelector('#bm-studio-btn-save').addEventListener('click', async () => {
        syncCurrentCardData();

        const titleVal = titleInput.value.trim();
        if (!titleVal) {
            alert("Por favor, digite um título para a postagem!");
            titleInput.focus();
            return;
        }

        const idInput = overlay.querySelector('#bm-art-id');
        let finalId = id || idInput.value.trim();
        if (!finalId) {
            finalId = titleVal.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        }

        // Combina o HTML de todos os tópicos para preencher o campo content (compatibilidade total no banco)
        const combinedHtml = topicsData.map(t => {
            const tTitle = t.title && t.title.trim() ? `<h3 class="topic-title" style="color: var(--highlight, #f1a32e); margin-top: 2rem; margin-bottom: 1rem; font-size: 1.35rem; font-weight: 700;">${t.title.trim()}</h3>` : '';
            return `${tTitle}${t.content || ''}`;
        }).join('\n');

        const payload = {
            title: titleVal,
            author: overlay.querySelector('#bm-art-author').value.trim() || 'BitMundo',
            category: overlay.querySelector('#bm-art-category').value.trim() || 'Geral',
            date: overlay.querySelector('#bm-art-date').value.trim() || new Date().toLocaleDateString('pt-BR'),
            selected: chkPublished.checked,
            topics: topicsData,
            content: combinedHtml
        };

        const saveBtn = overlay.querySelector('#bm-studio-btn-save');
        const origText = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.innerHTML = `⏳ Salvando...`;

        try {
            if (typeof onSave === 'function') {
                await onSave(payload, finalId);
            }
            isDirty = false;
            showToast("Artigo salvo com sucesso no banco de dados!");
        } catch (err) {
            console.error("[Studio Save Error]", err);
            alert("Erro ao salvar: " + err.message);
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = origText;
        }
    });

    /* ─── Excluir Artigo ─── */
    const delBtn = overlay.querySelector('#bm-studio-btn-del');
    if (delBtn) {
        delBtn.addEventListener('click', async () => {
            if (typeof onDelete === 'function') {
                const deleted = await onDelete(id);
                if (deleted) closeStudio();
            }
        });
    }

    /* ─── Fechar Studio ─── */
    function closeStudio() {
        if (isDirty) {
            if (!confirm("Você possui alterações não salvas. Deseja realmente sair do editor?")) {
                return;
            }
        }
        overlay.remove();
        if (typeof onClose === 'function') onClose();
    }

    overlay.querySelector('#bm-btn-close').onclick = closeStudio;

    // Atalhos de teclado no Studio
    window.addEventListener('keydown', function studioKeyHandler(e) {
        if (!document.getElementById('bm-studio-overlay')) {
            window.removeEventListener('keydown', studioKeyHandler);
            return;
        }

        // Ctrl+S / Cmd+S: Salvar
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            overlay.querySelector('#bm-studio-btn-save').click();
            return;
        }

        // Escape: Sair
        if (e.key === 'Escape') {
            const openModal = document.querySelector('.bm-studio-modal-overlay');
            if (!openModal) {
                closeStudio();
            }
        }
    });

    // Renderiza tópicos iniciais
    renderAllTopics();

    // Foca no primeiro tópico
    setTimeout(() => {
        const firstCard = overlay.querySelector('.bm-topic-card');
        if (firstCard) {
            const body = firstCard.querySelector('.bm-topic-editor-body');
            if (body) body.focus();
        }
    }, 100);
}

/* ─── Backwards Compatibility Helpers ──────────────────────────────── */

export function upgradeTextarea(textarea) {
    // Mantido por compatibilidade
    return textarea;
}

export function upgradeAllTopicTextareas(container) {
    // Mantido por compatibilidade
}

export function getTopicRawContent(row) {
    const wrap = row.querySelector('.bm-editor-wrap');
    if (wrap && wrap._getRaw) return wrap._getRaw();
    const ta = row.querySelector('textarea.topic-content-input');
    return ta ? ta.value : '';
}
