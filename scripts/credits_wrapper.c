/*
 * raiden_wrapper — camada de segurança + créditos para ISOs de PS2 (BitMundo / Raiden Patcher).
 *
 * ESTADO: escrito contra os headers do PS2SDK, mas AINDA NÃO COMPILADO e NÃO TESTADO em
 * PS2/PCSX2. Veja scripts/README_WRAPPER.md (checklist) antes de publicar o .elf.
 *
 * Fluxo: init CDVD -> SHA-256 do ELF original (+ arquivos extras) -> falhou? mostra a mensagem
 * e TRAVA -> créditos (texto) -> imagem (opcional) -> lê o ELF original do disco e executa.
 *
 * Marcadores: o JS (raiden_isometa.js) procura estes textos no .elf e grava os dados logo após.
 * Precisam ser `volatile` e NÃO-const (senão o GCC embute os valores e o patch não tem efeito).
 * Os campos tag[] têm exatamente strlen(marcador) bytes, sem '\0' (o JS escreve logo depois).
 */
#include <kernel.h>
#include <sifrpc.h>
#include <loadfile.h>
#include <libcdvd.h>
#include <libpad.h>
#include <debug.h>
#include <string.h>
#include <stdint.h>

#include <dma.h>
#include <graph.h>
#include <gs_psm.h>
#include <gs_gp.h>
#include <gif_tags.h>
#include <packet.h>

#define USED __attribute__((used, aligned(16)))

typedef struct __attribute__((packed)) { char tag[10]; uint32_t lba, size; uint8_t sha[32]; } boot_t;
typedef struct __attribute__((packed)) { char tag[12]; uint8_t len; char text[255]; } text_t;
typedef struct __attribute__((packed)) { char tag[10]; uint8_t len; char text[255]; } fail_t;
typedef struct __attribute__((packed)) { uint32_t lba, size; uint8_t sha[32]; } hent_t;
#define MAX_EXTRA 2 /* o JS só garante espaço para o que o template reserva; mantenha igual ao template */
typedef struct __attribute__((packed)) { char tag[11]; uint16_t count; hent_t e[MAX_EXTRA]; } hash_t;
typedef struct __attribute__((packed)) { char tag[11]; uint8_t type; uint32_t lba, size; uint16_t w, h, dur; uint8_t rsv; } media_t;
typedef struct __attribute__((packed)) { char tag[10]; uint8_t caps; } caps_t;

volatile boot_t  g_boot  USED = { "RAIDENBOOT" };
volatile text_t  g_cred  USED = { "RAIDENCREDIT" };
volatile fail_t  g_fail  USED = { "RAIDENFAIL" };
volatile hash_t  g_hash  USED = { "RAIDENHASH1" };
volatile media_t g_media USED = { "RAIDENMEDIA" };
#ifdef RAIDEN_WITH_MOVIE
#error "Reproducao de .PSS ainda nao implementada (precisa demux MPEG-PS + libmpeg). Compile sem RAIDEN_WITH_MOVIE."
#endif
volatile caps_t  g_caps  USED = { "RAIDENCAPS", 0 }; /* bit0 = filme .PSS (desligado) */

#define SECTOR 2048
#define MEDIA_IMAGE 1
#define MAX_ELF_BYTES (12u * 1024u * 1024u)
#define ELF_BUF   ((uint8_t *)0x01000000) /* ELF original é lido aqui, longe do 0x100000 do wrapper */
#define STUB_ADDR ((uint8_t *)0x01FD0000) /* stub de relocação em memória alta */
#define STUB_COPY_BYTES 1024              /* confira com objdump que stub_run cabe aqui */

static uint8_t sbuf[64 * SECTOR] __attribute__((aligned(64)));

/* ---------------- SHA-256 ---------------- */
typedef struct { uint32_t h[8]; uint8_t buf[64]; uint32_t n; uint64_t total; } sha_t;
static const uint32_t K[64] = {
 0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
 0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
 0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
 0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2 };
#define ROR(x,n) (((x) >> (n)) | ((x) << (32 - (n))))
static void sha_block(sha_t *s, const uint8_t *p) {
    uint32_t w[64], a, b, c, d, e, f, g, h, t1, t2; int i;
    for (i = 0; i < 16; i++) w[i] = (uint32_t)p[4*i] << 24 | (uint32_t)p[4*i+1] << 16 | (uint32_t)p[4*i+2] << 8 | p[4*i+3];
    for (; i < 64; i++) { uint32_t s0 = ROR(w[i-15],7) ^ ROR(w[i-15],18) ^ (w[i-15] >> 3), s1 = ROR(w[i-2],17) ^ ROR(w[i-2],19) ^ (w[i-2] >> 10); w[i] = w[i-16] + s0 + w[i-7] + s1; }
    a=s->h[0]; b=s->h[1]; c=s->h[2]; d=s->h[3]; e=s->h[4]; f=s->h[5]; g=s->h[6]; h=s->h[7];
    for (i = 0; i < 64; i++) {
        t1 = h + (ROR(e,6) ^ ROR(e,11) ^ ROR(e,25)) + ((e & f) ^ (~e & g)) + K[i] + w[i];
        t2 = (ROR(a,2) ^ ROR(a,13) ^ ROR(a,22)) + ((a & b) ^ (a & c) ^ (b & c));
        h=g; g=f; f=e; e=d+t1; d=c; c=b; b=a; a=t1+t2;
    }
    s->h[0]+=a; s->h[1]+=b; s->h[2]+=c; s->h[3]+=d; s->h[4]+=e; s->h[5]+=f; s->h[6]+=g; s->h[7]+=h;
}
static void sha_init(sha_t *s) {
    static const uint32_t iv[8] = {0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19};
    memcpy(s->h, iv, sizeof iv); s->n = 0; s->total = 0;
}
static void sha_update(sha_t *s, const uint8_t *d, uint32_t len) {
    s->total += len;
    while (len) { uint32_t k = 64 - s->n; if (k > len) k = len; memcpy(s->buf + s->n, d, k); s->n += k; d += k; len -= k; if (s->n == 64) { sha_block(s, s->buf); s->n = 0; } }
}
static void sha_final(sha_t *s, uint8_t out[32]) {
    uint64_t bits = s->total * 8; uint8_t pad = 0x80, L[8]; int i;
    sha_update(s, &pad, 1); pad = 0; while (s->n != 56) sha_update(s, &pad, 1);
    for (i = 0; i < 8; i++) L[i] = (uint8_t)(bits >> (56 - 8*i));
    sha_update(s, L, 8);
    for (i = 0; i < 8; i++) { out[4*i] = s->h[i] >> 24; out[4*i+1] = s->h[i] >> 16; out[4*i+2] = s->h[i] >> 8; out[4*i+3] = s->h[i]; }
}

/* ---------------- CDVD ---------------- */
/* Lê `count` setores de `lba` em `dst` (alinhado a 64). Até 5 tentativas. 1 = OK. */
static int read_sectors(uint32_t lba, uint32_t count, void *dst) {
    int tries;
    for (tries = 0; tries < 5; tries++) {
        sceCdRMode mode; mode.trycount = 16; mode.spindlctrl = SCECdSpinNom; mode.datapattern = SCECdSecS2048; mode.pad = 0;
        if (sceCdRead(lba, count, dst, &mode)) {
            sceCdSync(0);
            if (sceCdGetError() == SCECdErNO) return 1;
        }
        sceCdStop(); sceCdSync(0);
    }
    return 0;
}

/* Lê [lba, lba+size): copia p/ dst (se != NULL) e/ou calcula SHA-256 (se sha_out != NULL). 1 = leitura OK. */
static int read_range(uint32_t lba, uint32_t size, uint8_t *dst, uint8_t sha_out[32]) {
    sha_t s; uint32_t done = 0; if (sha_out) sha_init(&s);
    while (done < size) {
        uint32_t left = size - done, secs = (left + SECTOR - 1) / SECTOR; if (secs > 64) secs = 64;
        uint8_t *to = dst ? dst + done : sbuf;
        if (!read_sectors(lba + done / SECTOR, secs, to)) return 0;
        uint32_t take = secs * SECTOR; if (take > left) take = left;
        if (sha_out) sha_update(&s, to, take);
        done += take;
    }
    if (sha_out) sha_final(&s, sha_out);
    return 1;
}

static int verify_all(void) {
    uint8_t h[32]; uint32_t i, n;
    if (g_boot.size == 0 || g_boot.size > MAX_ELF_BYTES) return 0;
    if (!read_range(g_boot.lba, g_boot.size, NULL, h)) return 0;
    if (memcmp(h, (const void *)g_boot.sha, 32)) return 0;
    n = g_hash.count; if (n > MAX_EXTRA) return 0; /* contagem incoerente com o template => trata como falha */
    for (i = 0; i < n; i++) {
        if (!read_range(g_hash.e[i].lba, g_hash.e[i].size, NULL, h)) return 0;
        if (memcmp(h, (const void *)g_hash.e[i].sha, 32)) return 0;
    }
    return 1;
}

/* ---------------- tempo / pad ---------------- */
static void busy_wait(uint32_t units) { volatile uint32_t i; while (units--) for (i = 0; i < 300000; i++) ; } /* aproximado */

static char padbuf[256] __attribute__((aligned(64)));
static int pad_ready;
static void pad_setup(void) {
    SifLoadModule("rom0:SIO2MAN", 0, NULL);
    SifLoadModule("rom0:PADMAN", 0, NULL);
    if (padInit(0) == 1 && padPortOpen(0, 0, padbuf) == 1) pad_ready = 1;
}
static int pad_pressed(void) {
    struct padButtonStatus b;
    if (!pad_ready || padGetState(0, 0) != PAD_STATE_STABLE) return 0;
    if (padRead(0, 0, &b) == 0) return 0;
    return ((uint16_t)~b.btns) & (PAD_START | PAD_CROSS | PAD_CIRCLE);
}
static void wait_or_button(uint32_t tenths) { /* 0 = só botão */
    uint32_t t = 0;
    for (;;) { if (pad_pressed()) return; busy_wait(8); t++; if (tenths && t >= tenths) return; }
}

/* ---------------- telas de texto ---------------- */
static void screen_text(const char *title, const char *body) {
    init_scr(); scr_clear();
    scr_printf("\n\n  %s\n\n  %s\n", title, body);
}
static void fail_screen(void) {
    char msg[256]; uint32_t n = g_fail.len;
    if (n == 0) strcpy(msg, "A verificacao de integridade dos arquivos do jogo falhou.");
    else { memcpy(msg, (const void *)g_fail.text, n); msg[n] = 0; }
    screen_text("RAIDEN - ERRO", msg);
    for (;;) busy_wait(100); /* trava de propósito: não inicia um jogo possivelmente adulterado */
}

/* ---------------- imagem: RGBA32 cru (alfa 0..128) -> framebuffer GS ---------------- */
static qword_t gifbuf[8] __attribute__((aligned(64)));
static void gif_send(void *p, int qwc) {
    SyncDCache(p, (uint8_t *)p + qwc * 16);
    dma_channel_send_normal(DMA_CHANNEL_GIF, p, qwc, 0, 0);
    dma_wait_fast();
}
static int show_image(void) {
    uint32_t w = g_media.w, h = g_media.h, bytes = w * h * 4, done = 0;
    if (!w || !h || w > 640 || h > 448) return 0;
    dma_channel_initialize(DMA_CHANNEL_GIF, NULL, 0);
    dma_channel_fast_waits(DMA_CHANNEL_GIF);
    graph_initialize(0, 640, 448, GS_PSM_32, 0, 0);

    qword_t *q = gifbuf; /* BITBLTBUF/TRXPOS/TRXREG/TRXDIR via A+D: transferência host->GS no framebuffer 0 */
    q->dw[0] = GIF_SET_TAG(4, 1, 0, 0, GIF_FLG_PACKED, 1); q->dw[1] = GIF_REG_AD; q++;
    q->dw[0] = GS_SET_BITBLTBUF(0, 0, 0, 0, 10, GS_PSM_32); q->dw[1] = GS_REG_BITBLTBUF; q++;
    q->dw[0] = GS_SET_TRXPOS(0, 0, (640 - w) / 2, (448 - h) / 2, 0); q->dw[1] = GS_REG_TRXPOS; q++;
    q->dw[0] = GS_SET_TRXREG(w, h); q->dw[1] = GS_REG_TRXREG; q++;
    q->dw[0] = GS_SET_TRXDIR(0); q->dw[1] = GS_REG_TRXDIR; q++;
    gif_send(gifbuf, 5);

    while (done < bytes) {
        uint32_t left = bytes - done, secs = (left + SECTOR - 1) / SECTOR; if (secs > 16) secs = 16;
        if (!read_sectors(g_media.lba + done / SECTOR, secs, sbuf)) return 0;
        uint32_t take = secs * SECTOR; if (take > left) take = left;
        uint32_t qw = take / 16; /* w*h*4 é múltiplo de 16 */
        gifbuf[0].dw[0] = GIF_SET_TAG(qw, 0, 0, 0, GIF_FLG_IMAGE, 0); gifbuf[0].dw[1] = 0;
        gif_send(gifbuf, 1);
        gif_send(sbuf, qw);
        done += take;
    }
    graph_enable_output();
    return 1;
}

/* ---------------- chainload do ELF original ---------------- */
typedef struct { uint8_t id[16]; uint16_t type, machine; uint32_t version, entry, phoff, shoff, flags; uint16_t ehsize, phentsize, phnum, shentsize, shnum, shstrndx; } elf32_hdr;
typedef struct { uint32_t type, offset, vaddr, paddr, filesz, memsz, flags, align; } elf32_phdr;

/* Executa a partir de STUB_ADDR (cópia de bytes desta função): copia os segmentos PT_LOAD para os
 * endereços finais e salta para o entry. Sem chamadas/globais (precisa ser independente de posição).
 * Syscalls FlushCache (0x64) / ExecPS2 não confirmados em hardware — validar no PCSX2 e ajustar. */
__attribute__((noinline)) static void stub_run(const uint8_t *elf, char **argv) {
    const elf32_hdr *eh = (const elf32_hdr *)elf;
    const elf32_phdr *ph = (const elf32_phdr *)(elf + eh->phoff);
    for (unsigned i = 0; i < eh->phnum; i++) {
        if (ph[i].type != 1) continue;
        volatile uint8_t *d = (volatile uint8_t *)ph[i].vaddr; const uint8_t *s = elf + ph[i].offset;
        for (uint32_t k = 0; k < ph[i].filesz; k++) d[k] = s[k];
        for (uint32_t k = ph[i].filesz; k < ph[i].memsz; k++) d[k] = 0;
    }
    register uint32_t entry = eh->entry;
    register char **av = argv;
    __asm__ volatile("li $3, 0x64\n li $4, 0\n syscall\n li $3, 0x64\n li $4, 2\n syscall\n li $4, 1\n move $5, %1\n jr %0\n nop\n" : : "r"(entry), "r"(av) : "$3", "$4", "$5");
}

/* Lê SYSTEM.CNF (via sceCdSearchFile, no diretório ISO9660 que o patch NÃO altera) e extrai o
 * caminho BOOT2 ("cdrom0:\\SLUS_xxx.xx;1"). Serve de argv[0] para o jogo, como se o BIOS o tivesse
 * lançado. Não é fatal se faltar: o ELF original é carregado por LBA (o registro de diretório do
 * ELF aponta para este wrapper, então carregar por nome entraria em loop). */
#define ARGV_ADDR ((char **)0x01FD1000)
static void parse_system_cnf(void) {
    sceCdlFILE f; char *out = (char *)ARGV_ADDR + 16; uint32_t n = 0;
    ARGV_ADDR[0] = NULL; ARGV_ADDR[1] = NULL;
    if (!sceCdSearchFile(&f, "\\SYSTEM.CNF;1") || f.size == 0 || f.size > SECTOR) return;
    if (!read_sectors(f.lsn, 1, sbuf)) return;
    sbuf[f.size < SECTOR ? f.size : SECTOR - 1] = 0;
    char *p = strstr((char *)sbuf, "BOOT2");
    if (!p || !(p = strchr(p, '='))) return;
    p++; while (*p == ' ' || *p == '\t') p++;
    while (*p && *p != '\r' && *p != '\n' && n < 200) out[n++] = *p++;
    while (n && (out[n-1] == ' ' || out[n-1] == '\t')) n--;
    out[n] = 0;
    if (n) ARGV_ADDR[0] = out;
}

static void chainload(void) {
    parse_system_cnf();
    if (!read_range(g_boot.lba, g_boot.size, ELF_BUF, NULL)) fail_screen();
    const elf32_hdr *eh = (const elf32_hdr *)ELF_BUF;
    if (eh->id[0] != 0x7f || eh->id[1] != 'E' || eh->machine != 8 || eh->phoff + eh->phnum * sizeof(elf32_phdr) > g_boot.size) fail_screen();
    const elf32_phdr *ph = (const elf32_phdr *)(ELF_BUF + eh->phoff);
    for (unsigned i = 0; i < eh->phnum; i++) /* segmento não pode invadir o buffer do ELF nem o stub */
        if (ph[i].type == 1 && ph[i].vaddr + ph[i].memsz > (uint32_t)ELF_BUF) fail_screen();
    SifExitRpc();
    memcpy(STUB_ADDR, (const void *)stub_run, STUB_COPY_BYTES);
    FlushCache(0); FlushCache(2);
    ((void (*)(const uint8_t *, char **))STUB_ADDR)(ELF_BUF, ARGV_ADDR);
    for (;;) ;
}

int main(void) {
    SifInitRpc(0);
    sceCdInit(SCECdINIT);
    sceCdMmode(sceCdGetDiskType() >= SCECdPS2DVD ? SCECdMmodeDvd : SCECdMmodeCd);

    if (!verify_all()) fail_screen();

    pad_setup();
    if (g_cred.len) {
        char t[256]; memcpy(t, (const void *)g_cred.text, g_cred.len); t[g_cred.len] = 0;
        screen_text("CREDITOS", t);
        wait_or_button(40); /* ~4 s (aproximado) ou botão */
    }
    if (g_media.type == MEDIA_IMAGE && show_image()) wait_or_button(g_media.dur * 10); /* dur=0 => só botão */
    /* type==2 (filme .PSS): não suportado (g_caps bit0 = 0); o JS bloqueia esse caso. */

    chainload();
    return 0;
}
