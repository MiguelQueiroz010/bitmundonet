# raiden_wrapper.elf — status e checklist

**O `raiden_wrapper.elf` publicado foi compilado, mas o fluxo completo (créditos → jogo) ainda precisa ser conferido no PCSX2/PS2.** O lado JS/UI (marcadores, `<Credits>`, `<FailText>`, `<Media>`, bloqueio de filme) está coberto por testes automatizados; o lado PS2 não.

Build: `export PS2SDK=/usr/local/ps2dev/ps2sdk && make -C scripts` e publique `scripts/raiden_wrapper.elf`.
O site só habilita créditos se o .elf existir e tiver os marcadores `RAIDENBOOT/CREDIT/HASH1/MEDIA/FAIL`.

## Antes de publicar, verificar
1. Compila sem erros (nomes de struct/enum de `libcdvd`/`libpad`, macros GIF/GS dependem da versão do PS2SDK).
2. `mips64r5900el-ps2-elf-strings raiden_wrapper.elf | grep RAIDEN` mostra os 6 marcadores (prova que não foram otimizados fora).
3. `objdump -d` de `stub_run`: o único `jal` é `EndTimer` (alvo absoluto, executado antes da cópia), cabe em 1024 bytes (`STUB_COPY_BYTES`), usa só desvios relativos; o `jr` final usa `$16` (nunca `$2`/`$v0`, que o syscall sobrescreve).
4. Syscalls do stub (FlushCache 0x64) e endereços 0x01000000/0x01FD0000: confirmar no PCSX2; o jogo original não pode usar essas regiões.

## Testes no PCSX2 (ISO patcheada)
- ISO íntegra, sem mídia → créditos ~4 s → jogo inicia.
- Imagem com 0 s → espera botão; com N s → segue sozinho.
- Adulterar 1 byte do ELF original (ou arquivo extra) → mensagem de falha e **trava**.
- ISO sem `<FailText>` → mensagem padrão.
- Disco DVD vs CD (sceCdMmode).
- **Filme .PSS: não suportado** (precisa demux MPEG-PS + libmpeg, vídeo mudo). `RAIDENCAPS` = 0 faz o criador recusar `movie`.
- UDF: só o diretório ISO9660 recebe o `RAIDEN.ELF` (registro no fim da raiz) e o `SYSTEM.CNF` é reescrito; ISOs que dependem de UDF para achar o ELF não são suportadas.
- O ELF original NÃO é redirecionado: continua com o nome e o LBA de sempre, então um jogo que releia o próprio ELF do disco enxerga o arquivo certo.
- PCSX2: o serial do jogo vem do nome em BOOT2; com `RAIDEN.ELF` ele deixa de ser `SLUS-21419` (gamedb/patches por serial não se aplicam).

## Histórico: travamento ao iniciar o jogo (UnkOp em 0x0012c3ac / 0x001709f0)
Sintoma no PCSX2: `Unrecognized op` em endereços de dados logo após os créditos, com `a0=0x0b`, `v1=0x001267a0`, `gp=0x00133bf0`.
Causa: o crt0 do PS2SDK inicia o timer do sistema (handler INTC da causa 11 = `TimerHandler_callback`, que mora no wrapper).
O stub sobrescrevia `0x100000+` com o ELF do jogo sem desligá-lo; a interrupção seguinte do T2 executava lixo.
Além disso, `entry` ficava em `$v0`, que o syscall `FlushCache` sobrescreve.
Correção: `stub_run` chama `EndTimer` antes de copiar os segmentos e mantém entry/argv em `$16/$17`.
O `.elf` versionado foi corrigido direto no `stub_run` (sem PS2SDK disponível); `credits_wrapper.c` tem o mesmo comportamento — um rebuild com `make` gera um binário equivalente.
