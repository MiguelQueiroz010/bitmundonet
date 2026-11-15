# raiden_wrapper.elf — status e checklist

**O `credits_wrapper.c` ainda NÃO foi compilado nem testado em PS2/PCSX2.** O lado JS/UI (marcadores, `<Credits>`, `<FailText>`, `<Media>`, bloqueio de filme) está coberto por testes automatizados; o lado PS2 não.

Build: `export PS2SDK=/usr/local/ps2dev/ps2sdk && make -C scripts` e publique `scripts/raiden_wrapper.elf`.
O site só habilita créditos se o .elf existir e tiver os marcadores `RAIDENBOOT/CREDIT/HASH1/MEDIA/FAIL`.

## Antes de publicar, verificar
1. Compila sem erros (nomes de struct/enum de `libcdvd`/`libpad`, macros GIF/GS dependem da versão do PS2SDK).
2. `mips64r5900el-ps2-elf-strings raiden_wrapper.elf | grep RAIDEN` mostra os 6 marcadores (prova que não foram otimizados fora).
3. `objdump -d` de `stub_run`: sem `jal`, cabe em 1024 bytes (`STUB_COPY_BYTES`), usa só desvios relativos.
4. Syscalls do stub (FlushCache 0x64) e endereços 0x01000000/0x01FD0000: confirmar no PCSX2; o jogo original não pode usar essas regiões.

## Testes no PCSX2 (ISO patcheada)
- ISO íntegra, sem mídia → créditos ~4 s → jogo inicia.
- Imagem com 0 s → espera botão; com N s → segue sozinho.
- Adulterar 1 byte do ELF original (ou arquivo extra) → mensagem de falha e **trava**.
- ISO sem `<FailText>` → mensagem padrão.
- Disco DVD vs CD (sceCdMmode).
- **Filme .PSS: não suportado** (precisa demux MPEG-PS + libmpeg, vídeo mudo). `RAIDENCAPS` = 0 faz o criador recusar `movie`.
- UDF: só o diretório ISO9660 é redirecionado; ISOs que dependem de UDF para achar o ELF não são suportadas.
