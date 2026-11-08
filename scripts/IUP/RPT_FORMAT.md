# Formato RPT v2 — "file-tree diff"

O `.rpt` descreve **operações por arquivo da ISO**. O conteúdo original do jogo nunca vai dentro do patch:
ele vem da ISO que o usuário fornece, e `delta`/`inject` só rodam se o SHA-256 do arquivo dessa ISO bater.

## Estrutura (antes da criptografia AES, igual ao v1)

```
"RPTP" | 2 bytes reservados | XML UTF-8 | 0x00 | { u64 LE tamanho | nome\0 | bytes }...
```

- Entradas com nome normal substituem o arquivo da ISO (comportamento v1, continua funcionando).
- Entradas com prefixo `__rpt/` são **conteúdo de operações** (deltas, arquivos de replace); não entram na ISO.

## XML

```xml
<RPT>
  <GameName>…</GameName><Version>…</Version><Author>…</Author>
  <TargetMD5>…</TargetMD5><Resumo>…</Resumo>
  <Ops>
    <!-- delta xdelta/VCDIFF sobre o arquivo ORIGINAL da ISO do usuário -->
    <Op type="delta" path="MOVIE/M1.PSS" payload="__rpt/m1.vcdiff" codec="deflate-raw"
        srcSha256="…64 hex…" sha256="…64 hex do resultado…"/>

    <!-- troca de bytes em offsets fixos (ELF/SLUS) -->
    <Op type="inject" path="SLUS_213.73" srcSha256="…" sha256="…(opcional)…">
      <Patch offset="0x1A2B3C" old="0F00" new="1000"/>
    </Op>

    <!-- arquivo criado pelo autor do patch (tradução, fonte) -->
    <Op type="replace" path="DATA/TEXT/US_SCRIPT.DAT" payload="__rpt/us.bin" codec="deflate-raw"
        sha256="…" size="123456"/>
  </Ops>
</RPT>
```

| Campo | delta | inject | replace |
|---|---|---|---|
| `path` | obrigatório | obrigatório | obrigatório |
| `payload` (`__rpt/…`) | obrigatório | — | obrigatório |
| `srcSha256` | **obrigatório** | **obrigatório** | — |
| `sha256` (resultado) | **obrigatório** | opcional | opcional (recomendado) |
| `codec` | `none` \| `deflate-raw` \| `gzip` | — | idem |

`path` é relativo à raiz da ISO, sem `..`, sem caminho absoluto, sem caracteres de controle. Nomes são comparados sem
diferenciar maiúsculas e ignorando `;1`.

## Gerando os deltas

```
xdelta3 -e -9 -S none -f -s ORIGINAL.PSS NOVO.PSS m1.vcdiff
```

`-S none` é obrigatório (sem compressão secundária). Para reduzir o tamanho, use `codec="deflate-raw"` no payload.

## Verificações feitas pelo patcher

1. Caminhos, hashes, tipos, limites de quantidade/tamanho validados antes de qualquer escrita.
2. SHA-256 do arquivo original da ISO do usuário == `srcSha256` (senão recusa, nada é gravado).
3. SHA-256 do resultado == `sha256` **antes** de confirmar a escrita (senão a escrita é abortada e o arquivo original fica intacto).
4. Pasta temporária própria (`raiden_tmp_*`) apagada ao final, mesmo em caso de erro.

## Boas práticas legais para quem cria patches

- Inclua **apenas** o que você criou (textos traduzidos, fontes, dublagens, código) e deltas.
- Nunca inclua arquivos originais sem alteração, nem a ISO pronta; não cobre pelo download.
- Um delta é derivado do original: use-o apenas com a exigência de o usuário fornecer sua própria cópia (o patcher já exige isso).
- Isto não é aconselhamento jurídico; as regras variam por país e por detentora dos direitos.
