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

## Criando patches pelo site

Na página do Raiden Patcher, aba **Criar patch**: escolha a ISO original e a versão modificada (ISO ou pasta de arquivos),
analise, revise a lista e gere o `.rpt`. Para cada arquivo o criador escolhe sozinho:

| Situação | Operação |
|---|---|
| idêntico ao original | nada (nunca entra no patch) |
| mesmo tamanho, ≤ 4 KB de bytes alterados | `inject` |
| modificado e o delta fica < 85% do arquivo novo | `delta` (verificado: o delta é aplicado ao original e o hash conferido) |
| arquivo novo, ou delta não compensa | `replace` |

## Pós-processamento (opcional): metadados da ISO e créditos

Três elementos opcionais no XML, entre `<Resumo>` e `<Ops>`. Patches que não os têm continuam funcionando como antes.
Eles são aplicados **depois** que a ISO final foi reconstruída e gravada (a reconstrução muda todos os LBAs, então não
dá para fazer antes), editando o arquivo `.iso` salvo no próprio lugar (`scripts/raiden_isometa.js`).

```xml
<IsoMeta volumeId="RAIDEN_MOD" publisherId="BitMundo" applicationId="Raiden Patcher"
         volumeSetSize="2" modified="now"/>
<Credits>Traduzido por BitMundo.net</Credits>
<Media type="image" payload="__rpt/media.bin" size="1146880" sha256="…64 hex…"
       width="640" height="448" durationSec="5"/>
```

**`<IsoMeta>`** — cada atributo é opcional; atributo ausente = campo não é alterado.

| Atributos | Regra |
|---|---|
| `systemId` `volumeId` `volumeSetId` `publisherId` `preparerId` `applicationId` `copyrightFile` `abstractFile` `biblioFile` | ASCII imprimível, tamanho máximo do campo do ISO9660 (32 / 128 / 37 caracteres) |
| `volumeSetSize` `volumeSequenceNumber` | inteiro 0–65535 |
| `created` `modified` `expires` `effective` | data ISO-8601, `now` (momento da aplicação) ou vazio (limpa o campo) |

Só o descritor ISO9660 (e o Joliet, se existir) é editado; o descritor UDF não é.

**`<Credits>` / `<Media>`** — tela mostrada antes do jogo iniciar. Exigem o wrapper `scripts/raiden_wrapper.elf`
(compilado **uma vez** a partir de `scripts/credits_wrapper.c` com o PS2SDK). O aplicador anexa o wrapper e a mídia
ao fim da ISO e redireciona **só a entrada de diretório** do ELF de boot para o wrapper; o ELF original fica intacto.
Se o `.elf` não existir no site, a opção é desabilitada no criador e, ao aplicar, os créditos são ignorados com um aviso
(os metadados continuam sendo aplicados).

- `type="image"`: payload RGBA32 cru, **largura × altura × 4** bytes, alfa 0–128 (convenção da GS), 1–1024 px por lado.
  O criador converte PNG/JPG para 640×448 (com barras pretas se a proporção for outra).
  `durationSec` 0 = a imagem só some ao apertar um botão.
- `type="movie"`: arquivo `.PSS` inteiro, tocado do início ao fim; `width`/`height` = 0.
- A mídia é limitada a 64 MB, vai em `__rpt/media.bin` (entrada normal do patch, sem compressão) e o aplicador confere
  `size` e `sha256` antes de usá-la.
- `<Credits>`: no máximo 255 **bytes** em UTF-8.

Tudo é validado pelo aplicador antes de qualquer gravação; um manifesto inválido faz o patch ser recusado.
Se o pós-processamento falhar depois da ISO pronta (ex.: ISO sem `SYSTEM.CNF` legível), a ISO é mantida e o usuário é avisado.

> **Estado atual:** metadados da ISO estão completos e testados. Créditos/abertura estão integrados e testados com um
> wrapper *de teste* (só marcadores); o wrapper real ainda precisa ser escrito/compilado — `credits_wrapper.c` é um esqueleto
> (leitura de setores, SHA-256, desenho e chainload estão marcados como TODO) e **uma ISO com ele ainda não inicia**.

## Ferramentas de ISO (aba Criar patch): travar / destravar

Independente do patch. Criptografa com AES-256-CTR (chave por PBKDF2-SHA256 200 000 iterações) o ELF de boot e, se pedido,
até 7 arquivos extras da raiz; os parâmetros ficam no campo *Application Use* do PVD. Destravar restaura a ISO byte a byte
e confere o HMAC e o SHA-256 de cada arquivo. A senha **não** é guardada em lugar nenhum: sem ela a ISO não tem recuperação.

## Gerando os deltas por linha de comando (alternativa)

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
