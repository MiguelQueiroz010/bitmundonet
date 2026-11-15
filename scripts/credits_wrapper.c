/*
 * credits_wrapper.c — esqueleto do "wrapper" de créditos + mídia de abertura
 * (imagem OU vídeo .PSS) + verificação de integridade, para ISOs patcheadas
 * pelo Raiden Patcher (BitMundo.net).
 *
 * NÃO FOI COMPILADO NEM TESTADO neste ambiente (não há PS2SDK/ee-gcc nem rede
 * aqui). Precisa ser compilado uma única vez com o PS2SDK na sua máquina (ou
 * com o Claude Code Desktop/VSCode, que tem acesso ao seu toolchain local).
 * Depois de compilado, o .elf resultante vira o "template" que
 * buildCreditsWrapperPatches() em raiden_isometa.js reutiliza em todo patch —
 * ele não recompila nada, só sobrescreve os marcadores abaixo.
 *
 * Fluxo em tempo de boot:
 *   1. Confere do próprio disco os arquivos listados em RAIDENHASH1 (se houver)
 *      e o ELF original (RAIDENBOOT) via SHA-256.
 *   2. Se algo não bater: mostra aviso na tela e PARA (não executa o jogo).
 *   3. Se tudo bater: mostra os créditos (texto de RAIDENCREDIT) e, conforme
 *      RAIDENMEDIA.type:
 *        - NONE  (0): só o texto, por um tempo fixo curto.
 *        - IMAGE (1): desenha uma textura carregada direto do LBA/tamanho
 *                      gravados (ver formato esperado abaixo) por
 *                      RAIDENMEDIA.durationSec segundos (ou até um botão).
 *        - MOVIE (2): toca o vídeo .PSS gravado no LBA/tamanho indicados,
 *                      do início ao fim, depois segue.
 *   4. Lê o ELF original (LBA/tamanho de RAIDENBOOT) pra memória, resolve os
 *      program headers e salta pro entry point dele (chainload).
 *
 * IMPORTANTE — escopo real deste arquivo:
 *   Isto é um ESQUELETO DE INTEGRAÇÃO, não um player de vídeo completo. Os
 *   pontos marcados com TODO precisam de código que não cabe reescrever do
 *   zero aqui com segurança (decodificação MPEG2/Sofdec via IPU é um projeto
 *   em si). Em vez de inventar uma implementação que pareceria pronta mas
 *   não seria testável, cada TODO explica exatamente qual peça falta e qual
 *   caminho a cena de homebrew do PS2 já documenta pra ela — você já trabalha
 *   com IDA Pro/Ghidra e o ecossistema PCSX2, então deve ter (ou saber achar)
 *   esse código de referência mais rápido do que eu tentando reconstruí-lo
 *   às cegas.
 */

#include <kernel.h>
#include <sifrpc.h>
#include <loadfile.h>
#include <sbv_patches.h>
#include <string.h>
#include <stdint.h>
#include <malloc.h>
/* #include <gsKit.h>   -- desenho de texto/textura (créditos + tela de imagem) */
/* #include <libmc.h>   -- não usado aqui, só se quiser permitir pular com botão */
/* #include <libpad.h>  -- ler o pad pra permitir pular a tela de imagem/vídeo */
/* #include <sha256.h>  -- alguma lib de SHA-256 para EE (ex. portar uma pequena, domínio público) */
/* #include <libmpeg.h> ou equivalente -- decodificação MPEG2/Sofdec (ver MOVIE abaixo) */

/* ───────── Marcadores — o offset de cada struct é achado pelo texto do
   marcador em tempo de BUILD do patch (não em runtime); aqui eles só
   precisam existir em algum lugar do binário, com espaço reservado. ───────── */

__attribute__((aligned(16)))
static const struct __attribute__((packed)) {  /* sem padding: raiden_isometa.js grava os campos colados ao texto do marcador */
    char     magic[10];      /* "RAIDENBOOT" */
    uint32_t orig_lba;
    uint32_t orig_size;
    uint8_t  orig_sha256[32];
} g_boot_marker = { "RAIDENBOOT", 0, 0, {0} };

__attribute__((aligned(16)))
static const struct __attribute__((packed)) {  /* sem padding: raiden_isometa.js grava os campos colados ao texto do marcador */
    char    magic[12];       /* "RAIDENCREDIT" */
    uint8_t len;
    char    text[255];
} g_credit_marker = { "RAIDENCREDIT", 0, {0} };

#define MAX_EXTRA_FILES 32
__attribute__((aligned(16)))
static const struct __attribute__((packed)) {  /* sem padding: raiden_isometa.js grava os campos colados ao texto do marcador */
    char     magic[11];      /* "RAIDENHASH1" */
    uint16_t count;
    struct { uint32_t lba, size; uint8_t sha256[32]; } files[MAX_EXTRA_FILES];
} g_hash_marker = { "RAIDENHASH1", 0, {{0}} };

/* mediaType: 0 = nenhuma, 1 = imagem, 2 = vídeo .PSS (ver raiden_isometa.js) */
#define RAIDEN_MEDIA_NONE  0
#define RAIDEN_MEDIA_IMAGE 1
#define RAIDEN_MEDIA_MOVIE 2

__attribute__((aligned(16)))
static const struct __attribute__((packed)) {  /* sem padding: raiden_isometa.js grava os campos colados ao texto do marcador */
    char     magic[11];      /* "RAIDENMEDIA" */
    uint8_t  type;
    uint32_t lba;
    uint32_t size;
    uint16_t width;          /* só type==IMAGE */
    uint16_t height;         /* só type==IMAGE */
    uint16_t durationSec;    /* type==IMAGE: 0 = só sai com botão; type==MOVIE: ignorado (toca até o fim) */
    uint8_t  reserved;
} g_media_marker = { "RAIDENMEDIA", RAIDEN_MEDIA_NONE, 0, 0, 0, 0, 0, 0 };

#define SECTOR_SIZE 2048

/* ───────── leitura crua de setores via libcdvd (ajuste aos nomes da sua versão) ───────── */
static int read_sectors(uint32_t lba, uint32_t count, void *buf) {
    /* Exemplo de uso típico (nomes podem variar por versão do PS2SDK):
     *   sceCdRead(lba, count, buf, NULL);
     *   while (sceCdSync(0)) {}
     *   return sceCdGetError() == 0;
     */
    return 0; /* placeholder */
}

static int verify_one(uint32_t lba, uint32_t size, const uint8_t expected[32]) {
    uint32_t sectors = (size + SECTOR_SIZE - 1) / SECTOR_SIZE;
    uint8_t *buf = (uint8_t *)memalign(64, sectors * SECTOR_SIZE);
    if (!buf) return 0;
    int ok = read_sectors(lba, sectors, buf);
    if (ok) {
        uint8_t digest[32];
        /* TODO: sha256(buf, size, digest); -- ligar a alguma implementação de
         * SHA-256 para EE (existem várias portáveis de domínio público; não é
         * um problema em aberto, só falta escolher/colar uma no seu projeto). */
        ok = (memcmp(digest, expected, 32) == 0);
    }
    free(buf);
    return ok;
}

static void show_credits_text(void) {
    /* Desenhar g_credit_marker.text na tela com gsKit por alguns segundos.
     * Ex.: gsKit_init_global(); ... gsKit_fontm_render_fast(...); ... */
}

/*
 * show_image_screen() — tela de imagem de abertura.
 *
 * Formato esperado dos bytes em g_media_marker.lba/.size: RAW, sem cabeçalho,
 * já no layout que a GS consome diretamente (ex. RGBA32 ou indexed 8-bit +
 * CLUT), width x height = g_media_marker.width/.height. A conversão de
 * PNG/JPG pra esse raw é feita do LADO DO BUILD (no navegador, antes de
 * chamar buildCreditsWrapperPatches com opts.media), não aqui — o wrapper só
 * faz upload de textura e desenha um quad full-screen.
 *
 * TODO (gsKit): alocar a textura, gsKit_texture_send(buf, w, h, ...), montar
 * um prim_quad_texture cobrindo a tela e dar swap buffer. É o mesmo padrão
 * usado por qualquer "tela de splash" de homebrew PS2SDK — se você já tem um
 * splash screen em algum dos seus outros projetos OPL/PADEMU, o código de
 * upload de textura é reaproveitável quase 1:1.
 */
static void show_image_screen(void) {
    uint32_t sectors = (g_media_marker.size + SECTOR_SIZE - 1) / SECTOR_SIZE;
    uint8_t *buf = (uint8_t *)memalign(64, sectors * SECTOR_SIZE);
    if (!buf || !read_sectors(g_media_marker.lba, sectors, buf)) { if (buf) free(buf); return; }

    /* TODO: gsKit upload + quad fullscreen com buf/width/height, manter na
     * tela por g_media_marker.durationSec segundos (ou até um botão, se
     * durationSec == 0 — ler o pad com libpad). */

    free(buf);
}

/*
 * play_movie_pss() — vídeo de abertura em .PSS (o formato Sofdec/MPEG2 nativo
 * do PS2, o mesmo usado pelas cutscenes dos jogos retail).
 *
 * ESTE É O PONTO ONDE SEJA HONESTO SOBRE O LIMITE DESTE ESQUELETO: decodificar
 * um stream Sofdec exige demultiplexar os pacotes MPEG-PS, alimentar o IPU
 * (Image Processing Unit) pra decodificação MPEG2 (DCT/IDCT em hardware) e
 * compor o resultado YCbCr->RGB na GS em sincronia com o VBlank e o áudio
 * ADPCM/VAG — não é um laço de "ler setor, mostrar frame" simples, e não é
 * algo que eu deva tentar reescrever às cegas aqui (o risco de entregar algo
 * que parece completo mas trava o IPU ou dessincroniza áudio/vídeo é real).
 *
 * O que já existe e documentado na cena pra isso:
 *   - O PS2SDK tem exemplos de uso do IPU (ipu.h / libmpeg-ps2 de projetos
 *     comunitários) especificamente para tocar .PSS/.STR fora do SDK da Sony.
 *   - Vários grupos de fan-translation (o tipo de trabalho que você já faz)
 *     publicam players .PSS standalone em C pro PS2SDK — dado seu histórico
 *     com IDA Pro/Ghidra em jogos de PS2, extrair ou portar um desses é bem
 *     mais confiável do que uma implementação nova e não testada.
 *
 * TODO (integração, uma vez que você tenha um player IPU/.PSS de referência):
 *   1. sceCdRead(g_media_marker.lba, ..., buf, NULL) em blocos (não dá pra
 *      carregar o filme inteiro de uma vez só em RAM geralmente).
 *   2. Alimentar o demuxer/IPU do seu player com esses blocos.
 *   3. Rodar o laço de decodificação até o fim do stream (g_media_marker.size
 *      bytes), sem tocar além do fim do bloco anexado (há dados do jogo ou
 *      fim de imagem logo depois).
 *   4. Seguir para chainload_original() ao fim do vídeo (ou se o player
 *      sinalizar erro de stream — não travar a tela nesse caso).
 */
static void play_movie_pss(void) {
    /* TODO: ver comentário acima. Placeholder: não decodifica nada ainda. */
}

static void show_tamper_warning(void) {
    /* Tela de aviso: "Esta ISO foi modificada após o patch original —
       conteúdo de BitMundo.net removido ou alterado." + travar aqui
       (loop infinito) em vez de seguir pro jogo. */
    for (;;) { /* trava propositalmente */ }
}

static void chainload_original(void) {
    uint32_t sectors = (g_boot_marker.orig_size + SECTOR_SIZE - 1) / SECTOR_SIZE;
    uint8_t *elf = (uint8_t *)memalign(64, sectors * SECTOR_SIZE);
    if (!elf || !read_sectors(g_boot_marker.orig_lba, sectors, elf)) show_tamper_warning();

    /* Parsing manual do ELF + LoadExecPS2 a partir de memória: é o padrão
     * usado por "ELF loaders"/"chainloaders" de homebrew — ler e_entry,
     * percorrer os program headers (PT_LOAD), copiar cada segmento pro
     * endereço físico indicado (p_vaddr) e então pular pro e_entry (via uma
     * rotina em asm que limpa o estado da EE antes do salto, como fazem os
     * bootloaders do OPL/uLaunchELF — dá pra portar o mesmo trecho que você
     * já deve ter visto no fork do OPL). */
}

int main(int argc, char *argv[]) {
    SifInitRpc(0);

    int ok = verify_one(g_boot_marker.orig_lba, g_boot_marker.orig_size, g_boot_marker.orig_sha256);
    for (int i = 0; ok && i < g_hash_marker.count; i++) {
        ok = verify_one(g_hash_marker.files[i].lba, g_hash_marker.files[i].size, g_hash_marker.files[i].sha256);
    }
    if (!ok) show_tamper_warning(); /* não retorna */

    show_credits_text();
    switch (g_media_marker.type) {
        case RAIDEN_MEDIA_IMAGE: show_image_screen(); break;
        case RAIDEN_MEDIA_MOVIE: play_movie_pss();    break;
        case RAIDEN_MEDIA_NONE:  default:             break; /* só o texto */
    }

    chainload_original(); /* não retorna em caso de sucesso */
    return 0; /* nunca deveria chegar aqui */
}
