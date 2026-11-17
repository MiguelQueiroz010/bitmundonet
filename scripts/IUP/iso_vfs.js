/**
 * iso_vfs.js
 * "Pasta virtual" sobre uma ISO: imita o subconjunto de FileSystemDirectoryHandle / FileSystemFileHandle usado pelo
 * BuildISO, pelo rpt_ops (applyOps) e pelo criador de patch — sem extrair NADA para o disco.
 *
 * Antes, aplicar um patch gravava a ISO inteira numa pasta (≈4 GB), relia tudo para reconstruir (+4 GB) e criar um
 * patch extraía as DUAS ISOs. Aqui cada arquivo é só uma fatia (Blob.slice, preguiçosa) da ISO original; só os arquivos
 * que o patch modifica ganham um arquivo real (num diretório de rascunho).
 *
 * Camadas de um arquivo (a de cima vence): rascunho gravado (`over`) > arquivo real da pasta overlay (`real`, usado
 * para os arquivos "v1" que o patch traz) > fatia da ISO (`iso`).
 *
 * Fidelidade com o comportamento antigo (ExtrairNaPasta + sistema de arquivos do Windows):
 *  - nomes comparados sem diferenciar maiúsculas/minúsculas ao procurar/mesclar; o arquivo do overlay substitui o da ISO;
 *  - o primeiro registro vence quando a ISO repete um nome.
 */

const up = (s) => s.toUpperCase();
const notFound = (n) => new DOMException(`"${n}" não encontrado`, 'NotFoundError');

class VNode {
    constructor(kind, name) {
        this.kind = kind; this.name = name;
        if (kind === 'directory') this.kids = new Map();     // chave = nome em maiúsculas
        this.handle = null;
    }
}

export class VFileHandle {
    constructor(node, ctx) { this.kind = 'file'; this.node = node; this.ctx = ctx; }
    get name() { return this.node.name; }
    async getFile() {
        const n = this.node;
        if (n.over) return n.over.getFile();
        if (n.real) return n.real.getFile();
        if (n.iso) return this.ctx.isoFile.slice(n.iso.start, n.iso.start + n.iso.size);
        return new Blob([]);
    }
    /** Grava num arquivo real do rascunho; ao fechar, vira a versão "atual" do arquivo. abort() descarta. */
    async createWritable() {
        const ctx = this.ctx, node = this.node;
        if (!ctx.scratchDir) throw new Error('Pasta virtual somente leitura (sem diretório de rascunho).');
        const name = `v${(++ctx.counter).toString(36)}.tmp`;
        const fh = await ctx.scratchDir.getFileHandle(name, { create: true });
        const w = await fh.createWritable();
        let done = false;
        return {
            write: (data) => w.write(data),
            close: async () => { if (done) return; done = true; await w.close(); node.over = fh; node.iso = null; node.real = null; },
            abort: async () => { if (done) return; done = true; try { await w.abort(); } catch (_) { /* já fechado */ } try { await ctx.scratchDir.removeEntry(name); } catch (_) { /* nada a limpar */ } },
        };
    }
}

export class VDirHandle {
    constructor(node, ctx) { this.kind = 'directory'; this.node = node; this.ctx = ctx; }
    get name() { return this.node.name; }
    _h(child) {
        if (!child.handle) child.handle = child.kind === 'directory' ? new VDirHandle(child, this.ctx) : new VFileHandle(child, this.ctx);
        return child.handle;
    }
    async *entries() { for (const c of [...this.node.kids.values()]) yield [c.name, this._h(c)]; }
    async *values() { for (const c of [...this.node.kids.values()]) yield this._h(c); }
    async *keys() { for (const c of [...this.node.kids.values()]) yield c.name; }
    [Symbol.asyncIterator]() { return this.entries(); }
    async _get(name, kind, create) {
        let c = this.node.kids.get(up(name));
        if (c && c.kind !== kind) throw new DOMException(`"${name}" é de outro tipo`, 'TypeMismatchError');
        if (!c) {
            if (!create) throw notFound(name);
            c = new VNode(kind, name); this.node.kids.set(up(name), c);
        }
        return this._h(c);
    }
    getDirectoryHandle(name, opt = {}) { return this._get(name, 'directory', !!opt.create); }
    getFileHandle(name, opt = {}) { return this._get(name, 'file', !!opt.create); }
    async removeEntry(name) { if (!this.node.kids.delete(up(name))) throw notFound(name); }
}

/**
 * Monta a pasta virtual.
 * @param {object} o
 * @param {Blob} o.isoFile
 * @param {Array} o.tree  descrição da ISO: [{name, dir:true, children:[...]} | {name, lba, size}] (já filtrada/saneada)
 * @param {FileSystemDirectoryHandle} [o.overlayDir]  arquivos reais que SOBREPÕEM os da ISO (e acrescentam novos)
 * @param {FileSystemDirectoryHandle} [o.scratchDir]  onde gravar os arquivos modificados
 */
export async function createIsoVfs({ isoFile, tree, overlayDir = null, scratchDir = null, sectorSize = 2048 }) {
    const ctx = { isoFile, scratchDir, counter: 0 };
    const root = new VNode('directory', '');

    const addTree = (dirNode, items) => {
        for (const it of items) {
            const key = up(it.name);
            if (dirNode.kids.has(key)) continue;                         // primeiro registro vence
            if (it.dir) {
                const d = new VNode('directory', it.name); dirNode.kids.set(key, d); addTree(d, it.children || []);
            } else {
                const f = new VNode('file', it.name); f.iso = { start: it.lba * sectorSize, size: it.size }; dirNode.kids.set(key, f);
            }
        }
    };
    addTree(root, tree);

    const mergeOverlay = async (dirNode, realDir) => {
        for await (const [name, h] of realDir.entries()) {
            const key = up(name);
            const cur = dirNode.kids.get(key);
            if (h.kind === 'directory') {
                let d = cur;
                if (!d || d.kind !== 'directory') { d = new VNode('directory', name); dirNode.kids.set(key, d); }
                await mergeOverlay(d, h);
            } else {
                const f = new VNode('file', name); f.real = h; dirNode.kids.set(key, f);   // o arquivo do overlay substitui o da ISO
            }
        }
    };
    if (overlayDir) await mergeOverlay(root, overlayDir);

    return new VDirHandle(root, ctx);
}
