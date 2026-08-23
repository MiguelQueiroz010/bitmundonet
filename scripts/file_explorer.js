/**
 * file_explorer.js
 * Explorer de arquivos próprio, rodando 100% em cima de FileList do
 * navegador — feito para contornar um bug real do Android:
 *
 *   O chooser nativo de "arquivo único" (ACTION_OPEN_DOCUMENT /
 *   GetContent — a tela "Abrir de" com ícones de nuvem) usa, em vários
 *   provedores de documento, um inteiro de 32 bits com sinal para
 *   reportar o tamanho do arquivo. Isso estoura em 2.147.483.647 bytes
 *   (2GB), e arquivos acima disso (como uma ISO de PS2) ficam
 *   corrompidos/inelegíveis pra seleção — mesmo que existam e sejam
 *   legíveis.
 *
 *   ACTION_OPEN_DOCUMENT_TREE (usado por <input webkitdirectory>) passa
 *   por outro caminho de enumeração de metadados e não sofre desse
 *   overflow: pegamos a pasta inteira de uma vez (com tamanhos corretos
 *   em cada File) e navegamos DENTRO dela com nossa própria UI, sem
 *   nunca re-tocar o chooser nativo por arquivo.
 *
 * Uso:
 *   import { pickFileViaExplorer } from './file_explorer.js';
 *   const file = await pickFileViaExplorer({ title: 'Selecionar ISO', hintExt: '.iso' });
 */

import { IOextent } from "./io_extent.js";
const { readBytes, readUInt, readString } = IOextent;

// ═══════════════════════════════════════════════════════
// VALIDAÇÃO ISO9660 (best-effort, nunca bloqueia a seleção)
// ═══════════════════════════════════════════════════════

/**
 * Verifica a assinatura "CD001" do Primary Volume Descriptor
 * (ECMA-119 / ISO 9660): setor lógico 16, offset 1 dentro do setor,
 * ou seja, byte absoluto 32769 (0x8001), 5 bytes, sempre 2048 bytes/setor.
 * Retorna { valid, volumeLabel } ou { valid: false } em qualquer erro.
 */
async function validateIso9660(file) {
  const SECTOR_SIZE = 2048;
  const PVD_LBA = 16;
  const MAGIC_OFFSET = PVD_LBA * SECTOR_SIZE + 1; // 32769
  const VOLLABEL_OFFSET = PVD_LBA * SECTOR_SIZE + 40; // campo Volume Identifier

  try {
    if (file.size < MAGIC_OFFSET + 5) return { valid: false };

    const slice = file.slice(PVD_LBA * SECTOR_SIZE, (PVD_LBA + 1) * SECTOR_SIZE);
    const buf = new Uint8Array(await slice.arrayBuffer());

    let magic;
    if (typeof readString === 'function') {
      try { magic = readString(buf, 1, 5); } catch (_) { magic = null; }
    }
    if (!magic) {
      magic = new TextDecoder('ascii').decode(buf.slice(1, 6));
    }

    if (magic !== 'CD001') return { valid: false };

    let volumeLabel;
    try {
      volumeLabel = (typeof readString === 'function')
        ? readString(buf, 40, 32)
        : new TextDecoder('ascii').decode(buf.slice(40, 72));
    } catch (_) {
      volumeLabel = new TextDecoder('ascii').decode(buf.slice(40, 72));
    }

    return { valid: true, volumeLabel: (volumeLabel || '').trim() };
  } catch (e) {
    console.warn('[FileExplorer] Falha ao validar ISO9660 (ignorando, não é bloqueante):', e);
    return { valid: false };
  }
}

// ═══════════════════════════════════════════════════════
// ESTILO (injetado uma única vez, com classes escopadas)
// ═══════════════════════════════════════════════════════

let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .rfx-overlay {
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(4,8,20,0.88);
      display: flex; align-items: center; justify-content: center;
      font-family: system-ui, -apple-system, sans-serif;
      padding: 16px; box-sizing: border-box;
    }
    .rfx-panel {
      width: 100%; max-width: 560px; max-height: 82vh;
      background: #0b1120; border: 1px solid #1e3a6e;
      border-radius: 10px; box-shadow: 0 0 40px rgba(51,170,255,0.25);
      display: flex; flex-direction: column; overflow: hidden;
      color: #cfe6ff;
    }
    .rfx-header {
      padding: 14px 16px; border-bottom: 1px solid #1e3a6e;
      display: flex; align-items: center; justify-content: space-between;
      gap: 10px;
    }
    .rfx-title { font-size: 15px; font-weight: 600; color: #7fc4ff; margin: 0; }
    .rfx-close {
      background: none; border: none; color: #7fa8d8; font-size: 20px;
      cursor: pointer; line-height: 1; padding: 4px 8px;
    }
    .rfx-close:hover { color: #fff; }
    .rfx-breadcrumb {
      padding: 8px 16px; font-size: 12.5px; color: #7fa8d8;
      border-bottom: 1px solid #16233f; overflow-x: auto; white-space: nowrap;
    }
    .rfx-breadcrumb span { cursor: pointer; }
    .rfx-breadcrumb span:hover { color: #7fc4ff; text-decoration: underline; }
    .rfx-breadcrumb .rfx-sep { margin: 0 4px; color: #3a537d; }
    .rfx-search {
      margin: 8px 16px; padding: 8px 10px; border-radius: 6px;
      border: 1px solid #1e3a6e; background: #0f1a33; color: #cfe6ff;
      font-size: 13px; outline: none;
    }
    .rfx-search:focus { border-color: #3af; }
    .rfx-list { flex: 1; overflow-y: auto; padding: 4px 8px 12px; }
    .rfx-row {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 10px; border-radius: 6px; cursor: pointer;
      font-size: 13.5px;
    }
    .rfx-row:hover { background: #142449; }
    .rfx-row .rfx-icon { width: 20px; text-align: center; flex-shrink: 0; opacity: 0.9; }
    .rfx-row .rfx-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rfx-row .rfx-size { color: #6f92c2; font-size: 12px; flex-shrink: 0; }
    .rfx-row.rfx-dir .rfx-name { color: #d7e9ff; }
    .rfx-row.rfx-file .rfx-name { color: #b9d4f5; }
    .rfx-row.rfx-hint .rfx-name { color: #7fffb0; }
    .rfx-empty { padding: 24px 16px; text-align: center; color: #52709e; font-size: 13px; }
    .rfx-footer {
      padding: 10px 16px; border-top: 1px solid #1e3a6e;
      font-size: 11.5px; color: #52709e;
    }
    .rfx-pick-root {
      margin: 40px auto; display: block; padding: 12px 22px;
      background: #133b7a; border: 1px solid #2f6fd1; color: #cfe6ff;
      border-radius: 8px; font-size: 14px; cursor: pointer;
    }
    .rfx-pick-root:hover { background: #1a4a99; }
    .rfx-badge {
      font-size: 10.5px; padding: 1px 6px; border-radius: 999px;
      background: rgba(63,255,140,0.12); color: #7fffb0; margin-left: 6px;
    }
  `;
  document.head.appendChild(style);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ═══════════════════════════════════════════════════════
// ÁRVORE DE ARQUIVOS (a partir da FileList do webkitdirectory)
// ═══════════════════════════════════════════════════════

function buildTree(fileList) {
  const root = { type: 'dir', name: '', children: new Map() };
  for (const file of fileList) {
    const relPath = file.webkitRelativePath || file.name;
    const parts = relPath.split('/').filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!node.children.has(part)) {
        node.children.set(part, { type: 'dir', name: part, children: new Map() });
      }
      node = node.children.get(part);
    }
    const fileName = parts[parts.length - 1];
    if (fileName) node.children.set(fileName, { type: 'file', name: fileName, file });
  }
  return root;
}

function sortedEntries(node, filterTerm) {
  const term = (filterTerm || '').toLowerCase();
  const entries = [...node.children.values()]
    .filter(e => !term || e.name.toLowerCase().includes(term));
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
  return entries;
}

// ═══════════════════════════════════════════════════════
// API PÚBLICA
// ═══════════════════════════════════════════════════════

/**
 * Abre o explorer próprio e resolve com o File escolhido pelo usuário.
 * @param {Object} opts
 * @param {string} [opts.title='Selecionar arquivo']
 * @param {string} [opts.hintExt] extensão a destacar (ex: '.iso')
 * @param {boolean} [opts.validateIso=false] valida assinatura ISO9660 ao clicar em arquivos com essa extensão
 * @returns {Promise<File>}
 */
export function pickFileViaExplorer(opts = {}) {
  const { title = 'Selecionar arquivo', hintExt = null, validateIso = false } = opts;
  ensureStyles();

  return new Promise((resolve, reject) => {
    let root = null;
    let pathStack = []; // array de nomes (strings) — o caminho atual
    let currentNode = null;
    let filterTerm = '';
    let settled = false;

    const overlay = document.createElement('div');
    overlay.className = 'rfx-overlay';
    overlay.innerHTML = `
      <div class="rfx-panel" role="dialog" aria-modal="true">
        <div class="rfx-header">
          <p class="rfx-title">${escapeHtml(title)}</p>
          <button type="button" class="rfx-close" aria-label="Fechar">✕</button>
        </div>
        <div class="rfx-breadcrumb" data-rfx="breadcrumb"></div>
        <input type="text" class="rfx-search" placeholder="Filtrar nesta pasta..." data-rfx="search" style="display:none" />
        <div class="rfx-list" data-rfx="list"></div>
        <div class="rfx-footer" data-rfx="footer">
          Navegação local — nenhum arquivo é enviado para fora do dispositivo.
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const els = {
      close: overlay.querySelector('.rfx-close'),
      breadcrumb: overlay.querySelector('[data-rfx="breadcrumb"]'),
      search: overlay.querySelector('[data-rfx="search"]'),
      list: overlay.querySelector('[data-rfx="list"]'),
      footer: overlay.querySelector('[data-rfx="footer"]'),
    };

    function settle(fn) {
      if (settled) return;
      settled = true;
      overlay.remove();
      document.removeEventListener('keydown', onKeydown);
      fn();
    }

    function onKeydown(e) {
      if (e.key === 'Escape') settle(() => reject(abortError('Seleção cancelada')));
    }
    document.addEventListener('keydown', onKeydown);

    els.close.addEventListener('click', () => settle(() => reject(abortError('Seleção cancelada'))));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) settle(() => reject(abortError('Seleção cancelada')));
    });

    els.search.addEventListener('input', (e) => {
      filterTerm = e.target.value;
      renderList();
    });

    function renderBreadcrumb() {
      const crumbs = ['Raiz', ...pathStack];
      els.breadcrumb.innerHTML = crumbs
        .map((name, idx) => `<span data-idx="${idx}">${escapeHtml(name)}</span>`)
        .join('<span class="rfx-sep">/</span>');
      els.breadcrumb.querySelectorAll('span[data-idx]').forEach(span => {
        span.addEventListener('click', () => {
          const idx = Number(span.dataset.idx);
          pathStack = pathStack.slice(0, idx);
          navigateToCurrentPath();
        });
      });
    }

    function navigateToCurrentPath() {
      let node = root;
      for (const name of pathStack) node = node.children.get(name);
      currentNode = node;
      filterTerm = '';
      els.search.value = '';
      renderBreadcrumb();
      renderList();
    }

    async function handleFileClick(entry) {
      let badge = '';
      if (validateIso && hintExt && entry.name.toLowerCase().endsWith(hintExt.toLowerCase())) {
        els.footer.textContent = 'Validando assinatura ISO9660...';
        const result = await validateIso9660(entry.file);
        if (result.valid) {
          badge = ` (ISO9660 válida${result.volumeLabel ? ': ' + result.volumeLabel : ''})`;
        } else {
          const proceed = confirm(
            `O arquivo "${entry.name}" não passou na validação de assinatura ISO9660.\n` +
            `Isso pode ser normal para algumas imagens não-padrão.\n\n` +
            `Selecionar mesmo assim?`
          );
          if (!proceed) return;
        }
      }
      console.log(`[FileExplorer] Arquivo selecionado: ${entry.name}${badge}`);
      settle(() => resolve(entry.file));
    }

    function renderList() {
      const entries = sortedEntries(currentNode, filterTerm);
      if (entries.length === 0) {
        els.list.innerHTML = `<div class="rfx-empty">Pasta vazia${filterTerm ? ' (ou sem resultados para o filtro)' : ''}.</div>`;
        return;
      }
      els.list.innerHTML = '';
      for (const entry of entries) {
        const row = document.createElement('div');
        const isHint = hintExt && entry.type === 'file' && entry.name.toLowerCase().endsWith(hintExt.toLowerCase());
        row.className = `rfx-row ${entry.type === 'dir' ? 'rfx-dir' : (isHint ? 'rfx-hint' : 'rfx-file')}`;
        const icon = entry.type === 'dir' ? '📁' : (isHint ? '💿' : '📄');
        const sizeStr = entry.type === 'file' ? formatBytes(entry.file.size) : '';
        row.innerHTML = `
          <span class="rfx-icon">${icon}</span>
          <span class="rfx-name">${escapeHtml(entry.name)}</span>
          <span class="rfx-size">${sizeStr}</span>
        `;
        row.addEventListener('click', () => {
          if (entry.type === 'dir') {
            pathStack = [...pathStack, entry.name];
            navigateToCurrentPath();
          } else {
            handleFileClick(entry);
          }
        });
        els.list.appendChild(row);
      }
      els.search.style.display = entries.length > 8 || filterTerm ? 'block' : (entries.length > 0 ? 'block' : 'none');
    }

    // ── Passo 1: pedir ao usuário a pasta raiz via webkitdirectory ──
    els.list.innerHTML = `<button type="button" class="rfx-pick-root">📂 Escolher pasta no dispositivo</button>`;
    els.breadcrumb.textContent = 'Nenhuma pasta selecionada ainda.';
    els.search.style.display = 'none';

    const rootBtn = els.list.querySelector('.rfx-pick-root');
    rootBtn.addEventListener('click', async () => {
      try {
        const input = document.createElement('input');
        input.type = 'file';
        input.webkitdirectory = true;
        input.multiple = true;
        input.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
        document.body.appendChild(input);

        const files = await new Promise((res, rej) => {
          input.addEventListener('change', () => {
            const list = Array.from(input.files || []);
            input.remove();
            if (list.length) res(list); else rej(abortError('Nenhuma pasta selecionada'));
          }, { once: true });
          input.click();
        });

        root = buildTree(files);
        pathStack = [];
        currentNode = root;
        renderBreadcrumb();
        renderList();
        els.footer.textContent = `${files.length} arquivo(s) indexado(s) nesta pasta (e subpastas).`;
      } catch (e) {
        if (e.name === 'AbortError') {
          els.footer.textContent = 'Nenhuma pasta selecionada. Toque no botão para tentar novamente.';
        } else {
          console.error('[FileExplorer] Erro ao ler pasta:', e);
          els.footer.textContent = 'Erro ao ler a pasta. Veja o console.';
        }
      }
    });
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function abortError(msg) {
  return Object.assign(new Error(msg), { name: 'AbortError' });
}

export { validateIso9660 };
