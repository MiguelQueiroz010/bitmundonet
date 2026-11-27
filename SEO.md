# SEO, indexação e Google Ads — como funciona

Tudo é gerado no build (`node scripts/build_static.js`, rodando no deploy diário e a cada push no `master`).
Conteúdo novo no Firestore (projeto, post, ferramenta) vira página própria + entrada no sitemap sozinho.

## O que é gerado

| Saída | Origem (Firestore) | Observação |
|---|---|---|
| `/projetos/<id>.html` | `projects` | já existia; agora com `dateModified`, `VideoObject` (YouTube) e `hreflang` |
| `/posts/<slug>.html` | `articles` com `selected: true` | **novo** – uma URL por post, `BlogPosting` + breadcrumb, comentários e reações |
| `/posts.html` | `articles` | **novo** – arquivo de todas as novidades (linkado no rodapé) |
| `/ferramentas/<slug>.html` | `tools` com link externo | **novo** – `SoftwareApplication`; ferramentas que já têm página própria no site (ex.: `raiden_patcher.html`) são puladas para não competir com ela |
| `/feed.xml` | `articles` | **novo** – RSS dos 30 posts mais recentes |
| `/sitemap.xml` | tudo acima | `lastmod` real (data do último commit / `_updateTime`) |
| `/robots.txt` | — | bloqueia fragmentos (`navbar.html`, `footer.html`, `project_view.html`) |
| `/404.html` | — | `noindex`, links para as seções |

Permalink de post: `slugify(título)-<6 primeiros chars do id>`. Para **congelar** a URL (editar o título sem
quebrar o link), crie o campo `slug` no documento do post no Firestore.

## Configuração (`seo.config.json`)

Preencha os IDs (ou defina como *secrets* do GitHub com o mesmo nome em maiúsculas, que têm prioridade):

| Campo | Secret opcional | Para quê |
|---|---|---|
| `ga4MeasurementId` | `GA4_MEASUREMENT_ID` | Google Analytics 4 (`G-XXXXXXXXXX`) |
| `googleAdsId` | `GOOGLE_ADS_ID` | tag do Google Ads (`AW-XXXXXXXXX`) |
| `googleAdsDownloadConversionLabel` | `GOOGLE_ADS_DOWNLOAD_LABEL` | rótulo da conversão "download de patch" |
| `googleSiteVerification` | `GOOGLE_SITE_VERIFICATION` | verificação do Search Console |
| `bingSiteVerification` | `BING_SITE_VERIFICATION` | verificação do Bing Webmaster |
| `indexNowKey` | `INDEXNOW_KEY` | IndexNow (Bing/Yandex); qualquer string hex de 16–64 caracteres |
| `consentBanner` / `consentDefault` | — | banner de cookies e padrão do Consent Mode v2 (`denied` ou `granted`) |

Sem IDs, nada de Google tag é injetado (só RSS, `google-adsense-account` e o banner).

## Depois do deploy (uma vez)

1. Search Console → adicionar a propriedade `bitraiden.org` → enviar `https://bitraiden.org/sitemap.xml`.
2. Search Console → Inspeção de URL → "Solicitar indexação" para `/posts.html` e para o primeiro post.
3. Bing Webmaster Tools → importar o site do Search Console.
4. Google Ads → Metas → Conversões → criar "download de patch" (tag do Google) e copiar o rótulo.

O Google **não** aceita IndexNow nem ping de sitemap: para ele, o que acelera é o sitemap enviado + links internos
(a home, o rodapé e `/posts.html` já apontam para cada post).

## Eventos enviados (`scripts/seo_runtime.js`)

- `patch_download` (parâmetros: `project_id`, `file_version`, `link_url`, `page_path`) + conversão do Google Ads
  quando `googleAdsDownloadConversionLabel` está definido.
- `tool_open` nos botões de ferramentas.

## Testar localmente sem Firestore

```bash
SSG_FIXTURE_DIR=/caminho/fixtures node scripts/build_static.js
```

com `projects.json`, `articles.json`, `tools.json`, `library.json` (arrays no formato já desserializado).
