// Round-trip encoder -> decoder. Rodar: node tests/rpt_encoder_selftest.mjs
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { encodeVcdiff } from '../scripts/IUP/rpt_vcdiff_encoder.js';
import { applyVcdiff } from '../scripts/IUP/rpt_vcdiff.js';

const rt = async (src, tgt, opts = {}) => {
    const dch = [];
    const n = await encodeVcdiff({ source: new Blob([src]), target: new Blob([tgt]), sink: { write: async (u) => dch.push(Buffer.from(u)) }, ...opts });
    const delta = Buffer.concat(dch); assert.equal(delta.length, n);
    const out = [];
    await applyVcdiff({ delta: new Blob([delta]), source: new Blob([src]), sink: { write: async (u) => out.push(Buffer.from(u)) } });
    const got = Buffer.concat(out);
    assert.ok(got.equals(Buffer.from(tgt)), 'round-trip difere');
    return delta.length;
};
let n = 0; const ok = (m) => { n++; console.log('  ok  ' + m); };
const rnd = (k) => crypto.randomBytes(k);

const base = rnd(300_000);
assert.ok(await rt(base, base) < 200);                                   ok('arquivo idêntico → delta minúsculo');
const ed = Buffer.from(base); ed.write('TRADUZIDO!', 1000); ed.write('XX', 250_000);
assert.ok(await rt(base, ed) < 400);                                     ok('edição no lugar (2 trechos) → delta < 400 bytes');
const ins = Buffer.concat([base.subarray(0, 100_000), Buffer.from('texto novo inserido aqui '.repeat(10)), base.subarray(100_000)]);
assert.ok(await rt(base, ins) < 1000);                                   ok('inserção no meio (desloca offsets) → delta < 1 KB');
const del = Buffer.concat([base.subarray(0, 50_000), base.subarray(120_000)]);
assert.ok(await rt(base, del) < 600);                                    ok('remoção no meio → delta < 600 bytes');
await rt(Buffer.alloc(0), rnd(5000));                                    ok('origem vazia');
await rt(rnd(5000), Buffer.alloc(0));                                    ok('alvo vazio');
await rt(rnd(10), rnd(10));                                              ok('arquivos menores que um bloco');
const unrelated = await rt(rnd(200_000), rnd(200_000)); assert.ok(unrelated > 199_000); ok('dados sem relação → delta ≈ tamanho do alvo (chamador deve usar replace)');
const sz = 9_000_000, big = rnd(sz), big2 = Buffer.from(big); big2.write('LEGENDA', 4_500_000); big2.write('FIM', 8_999_000);
assert.ok(await rt(big, big2, { windowSize: 1 << 20, reach: 2 << 20 }) < 3000); ok('9 MB em várias janelas (janela 1 MB, alcance 2 MB)');
const withZeros = Buffer.concat([Buffer.alloc(100_000), rnd(5000), Buffer.alloc(100_000)]);
await rt(withZeros, Buffer.concat([withZeros.subarray(0, 150_000), Buffer.from('ab'), withZeros.subarray(150_000)])); ok('regiões repetitivas (zeros) com inserção');
await assert.rejects(rt(rnd(100_000), rnd(100_000), { maxBytes: 1000 }), (e) => e.code === 'DELTA_TOO_LARGE'); ok('maxBytes aborta com code DELTA_TOO_LARGE');
for (let i = 0; i < 60; i++) {                                           // fuzz: edições aleatórias
    const s = rnd(1 + Math.floor(Math.random() * 200_000)); let t = Buffer.from(s);
    for (let k = 0; k < 1 + Math.floor(Math.random() * 6); k++) {
        const p = Math.floor(Math.random() * t.length), r = Math.random();
        if (r < 0.4) rnd(1 + Math.floor(Math.random() * 40)).copy(t, p);
        else if (r < 0.7) t = Buffer.concat([t.subarray(0, p), rnd(Math.floor(Math.random() * 300)), t.subarray(p)]);
        else t = Buffer.concat([t.subarray(0, p), t.subarray(Math.min(t.length, p + Math.floor(Math.random() * 300)))]);
    }
    await rt(s, t, { windowSize: 1 << 16, reach: 1 << 17 });
}
ok('fuzz: 60 pares aleatórios (substituição/inserção/remoção) com janelas pequenas');
// alcance de busca: conteúdo deslocado além do alcance não casa; dentro do alcance casa
{
    const src = rnd(6_000_000), shifted = Buffer.concat([rnd(1_500_000), src]);          // tudo deslocado 1,5 MB
    const short = await rt(src, shifted, { windowSize: 1 << 20, reach: 512 << 10 });
    const wide = await rt(src, shifted, { windowSize: 1 << 20, reach: 2 << 20 });
    assert.ok(short > 5_000_000, 'alcance curto deveria falhar em casar: ' + short);
    assert.ok(wide < 1_700_000, 'alcance suficiente deveria casar quase tudo: ' + wide);
    ok(`alcance: deslocamento de 1,5 MB → alcance 512 KB gera ${(short / 1e6).toFixed(1)} MB; alcance 2 MB gera ${(wide / 1e6).toFixed(2)} MB`);
    const st = {}; const sink = { write: async () => {} };
    await encodeVcdiff({ source: new Blob([src]), target: new Blob([shifted]), sink, stats: st, windowSize: 1 << 20, reach: 2 << 20 });
    assert.ok(st.copied > 4_000_000 && st.copied + st.added === shifted.length); ok('stats: copied+added == tamanho do alvo');
}
console.log(`\n${n} grupos de teste passaram.`);
