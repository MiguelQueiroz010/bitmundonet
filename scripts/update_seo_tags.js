import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const BASE_URL = 'https://bitraiden.org';

function updateFile(relPath, mutator) {
  const filePath = path.resolve(ROOT_DIR, relPath);
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    return;
  }
  const original = fs.readFileSync(filePath, 'utf-8');
  const updated = mutator(original);
  if (updated !== original) {
    fs.writeFileSync(filePath, updated, 'utf-8');
    console.log(`Updated: ${relPath}`);
  } else {
    console.log(`No changes needed: ${relPath}`);
  }
}

export function updateAllSeoTags() {
  // 1. Update projetos.html
  updateFile('projetos.html', html => {
    return html.replace(/<head>[\s\S]*?<\/head>/i, `<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Projetos de Tradução e RomHacking PS2 e PS1 PT-BR - RomHacking do Raiden</title>
    
    <meta name="description" content="Catálogo completo de jogos traduzidos para PlayStation 2, PS1 e clássicos em português (PT-BR) no RomHacking do Raiden. Baixe patches, veja status de tradução e changelogs detalhados." />
    <meta name="keywords" content="romhacking do raiden, jogos traduzidos ps2, tradução naruto ps2, patch tradução pt-br, romhacking ps2, iso traduzida ps2, alundra 2 pt-br, bitraiden" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
    <meta name="author" content="Raiden">
    <link rel="canonical" href="https://bitraiden.org/projetos.html" />
    <meta name="theme-color" content="#020814">

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="RomHacking do Raiden" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:url" content="https://bitraiden.org/projetos.html" />
    <meta property="og:title" content="Projetos de Tradução e RomHacking PS2 e PS1 PT-BR - RomHacking do Raiden" />
    <meta property="og:description" content="Catálogo completo de jogos traduzidos para PlayStation 2, PS1 e clássicos em português (PT-BR) no RomHacking do Raiden. Baixe patches, veja status de tradução e changelogs detalhados." />
    <meta property="og:image" content="https://bitraiden.org/bitmundo_logo.png" />
    <meta property="og:image:secure_url" content="https://bitraiden.org/bitmundo_logo.png" />
    <meta property="og:image:alt" content="Catálogo de Projetos - RomHacking do Raiden" />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@BitRaiden" />
    <meta name="twitter:creator" content="@BitRaiden" />
    <meta name="twitter:url" content="https://bitraiden.org/projetos.html" />
    <meta name="twitter:title" content="Projetos de Tradução e RomHacking PS2 e PS1 PT-BR - RomHacking do Raiden" />
    <meta name="twitter:description" content="Catálogo completo de jogos traduzidos para PlayStation 2, PS1 e clássicos em português (PT-BR) no RomHacking do Raiden. Baixe patches, veja status de tradução e changelogs detalhados." />
    <meta name="twitter:image" content="https://bitraiden.org/bitmundo_logo.png" />
    <meta name="twitter:image:alt" content="Catálogo de Projetos - RomHacking do Raiden" />

    <!-- Favicons -->
    <link rel="apple-touch-icon" sizes="180x180" href="/fav/apple-touch-icon.png" />
    <link rel="icon" type="image/png" sizes="32x32" href="/fav/favicon-32x32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/fav/favicon-16x16.png" />
    
    <!-- CSS -->
    <link rel="stylesheet" href="/css/style.css" />
    
    <!-- Scripts -->
    <script src="https://www.w3schools.com/lib/w3data.js"></script>
    <script type="text/javascript" src="/scripts/navbar.js"></script>
    <script type="module" src="/scripts/navbar_auth.js"></script>
    <script type="text/javascript" src="/scripts/router.js"></script>
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6401015076542561" crossorigin="anonymous"></script>

    <!-- Schema.org JSON-LD -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "CollectionPage",
          "@id": "https://bitraiden.org/projetos.html#collection",
          "url": "https://bitraiden.org/projetos.html",
          "name": "Projetos de Tradução e RomHacking - RomHacking do Raiden",
          "description": "Galeria completa de modificações e traduções de jogos em português para PlayStation 2, PS1 e outras plataformas.",
          "inLanguage": "pt-BR"
        },
        {
          "@type": "BreadcrumbList",
          "itemListElement": [
            {
              "@type": "ListItem",
              "position": 1,
              "name": "RomHacking do Raiden",
              "item": "https://bitraiden.org/"
            },
            {
              "@type": "ListItem",
              "position": 2,
              "name": "Projetos",
              "item": "https://bitraiden.org/projetos.html"
            }
          ]
        }
      ]
    }
    </script>
</head>`);
  });

  // 2. Update raiden_patcher.html
  updateFile('raiden_patcher.html', html => {
    const headBlock = `<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Raiden Web Patcher - Aplicar Patches e Mods em ISO de PS2 Online - RomHacking do Raiden</title>

    <meta name="description" content="Aplique mods e patches de tradução em ISOs de PlayStation 2 diretamente no navegador, sem instalar nada. Compatível com formato RPT e ISO9660 com economia de memória RAM." />
    <meta name="keywords" content="romhacking do raiden, raiden web patcher, patcher iso ps2 online, aplicar patch rpt, mod ps2 online, tradução iso ps2, bitraiden patcher" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
    <meta name="author" content="Raiden">
    <link rel="canonical" href="https://bitraiden.org/raiden_patcher.html" />
    <meta name="theme-color" content="#020814">
    <link rel="manifest" href="/fav/raiden_patcher.webmanifest" />

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="RomHacking do Raiden" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:url" content="https://bitraiden.org/raiden_patcher.html" />
    <meta property="og:title" content="Raiden Web Patcher - Aplicar Patches e Mods em ISO de PS2 Online - RomHacking do Raiden" />
    <meta property="og:description" content="Aplique mods e patches de tradução em ISOs de PlayStation 2 diretamente no navegador, sem instalar nada. Compatível com formato RPT e ISO9660." />
    <meta property="og:image" content="https://bitraiden.org/bitmundo_logo.png" />
    <meta property="og:image:secure_url" content="https://bitraiden.org/bitmundo_logo.png" />
    <meta property="og:image:alt" content="Raiden Web Patcher" />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@BitRaiden" />
    <meta name="twitter:creator" content="@BitRaiden" />
    <meta name="twitter:url" content="https://bitraiden.org/raiden_patcher.html" />
    <meta name="twitter:title" content="Raiden Web Patcher - Aplicar Patches e Mods em ISO de PS2 Online - RomHacking do Raiden" />
    <meta name="twitter:description" content="Aplique mods e patches de tradução em ISOs de PlayStation 2 diretamente no navegador, sem instalar nada." />
    <meta name="twitter:image" content="https://bitraiden.org/bitmundo_logo.png" />

    <!-- Schema.org WebApplication -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "name": "Raiden Web Patcher",
      "url": "https://bitraiden.org/raiden_patcher.html",
      "applicationCategory": "UtilityApplication",
      "operatingSystem": "Any",
      "browserRequirements": "Requires HTML5, WebAssembly and modern browser",
      "description": "Ferramenta web para aplicar patches RPT e modificações em imagens ISO de PlayStation 2 diretamente no navegador sem upload para servidores.",
      "image": "https://bitraiden.org/bitmundo_logo.png",
      "author": {
        "@type": "Person",
        "name": "Raiden",
        "url": "https://bitraiden.org"
      }
    }
    </script>

    <!-- CSS Base do Site -->
    <link rel="stylesheet" href="/css/style.css" />
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&family=Exo+2:wght@300;400;600;800&display=swap" rel="stylesheet">
    <script src="https://code.jquery.com/jquery-3.7.1.min.js"
            integrity="sha256-/JqT3SQfawRcv/BIHPThkBvs0OEvtFFmqPF/lYI/Cxo="
            crossorigin="anonymous"></script>
    <script type="text/javascript" src="/scripts/navbar.js"></script>`;

    return html.replace(/<head>[\s\S]*?(?=<style>)/i, headBlock + '\n\n    ');
  });

  // 3. Update hog_extractor.html
  updateFile('hog_extractor.html', html => {
    const headBlock = `<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HOG Extractor Online - Extrair Arquivos .HOG de Dragon Ball Z (PS2) - RomHacking do Raiden</title>
    
    <meta name="description" content="Extraia arquivos .HOG e pacotes de texturas e modelos de jogos Dragon Ball Z (PlayStation 2) online direto pelo navegador. Ferramenta gratuita para modders e romhackers no RomHacking do Raiden." />
    <meta name="keywords" content="romhacking do raiden, hog extractor online, extrair hog ps2, dragon ball z hog extractor, budokai tenkaichi modding, bitraiden hog" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
    <meta name="author" content="Raiden">
    <link rel="canonical" href="https://bitraiden.org/hog_extractor.html" />
    <meta name="theme-color" content="#020814">
    <link rel="manifest" href="/fav/hog_extractor.webmanifest" />

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="RomHacking do Raiden" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:url" content="https://bitraiden.org/hog_extractor.html" />
    <meta property="og:title" content="HOG Extractor Online - Extrair Arquivos .HOG de Dragon Ball Z (PS2) - RomHacking do Raiden" />
    <meta property="og:description" content="Extraia arquivos .HOG e pacotes de texturas e modelos de jogos Dragon Ball Z (PlayStation 2) online direto pelo navegador no RomHacking do Raiden." />
    <meta property="og:image" content="https://bitraiden.org/bitmundo_logo.png" />
    <meta property="og:image:secure_url" content="https://bitraiden.org/bitmundo_logo.png" />
    <meta property="og:image:alt" content="HOG Extractor Online" />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@BitRaiden" />
    <meta name="twitter:creator" content="@BitRaiden" />
    <meta name="twitter:url" content="https://bitraiden.org/hog_extractor.html" />
    <meta name="twitter:title" content="HOG Extractor Online - Extrair Arquivos .HOG de Dragon Ball Z (PS2) - RomHacking do Raiden" />
    <meta name="twitter:description" content="Extraia arquivos .HOG e pacotes de texturas e modelos de jogos Dragon Ball Z (PlayStation 2) online direto pelo navegador." />
    <meta name="twitter:image" content="https://bitraiden.org/bitmundo_logo.png" />

    <!-- Schema.org WebApplication -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "name": "HOG Extractor Online",
      "url": "https://bitraiden.org/hog_extractor.html",
      "applicationCategory": "UtilityApplication",
      "operatingSystem": "Any",
      "browserRequirements": "Requires HTML5 File API and modern browser",
      "description": "Ferramenta web para descompactar e extrair arquivos de contêineres .HOG dos jogos de Dragon Ball Z de PS2 diretamente no navegador.",
      "image": "https://bitraiden.org/bitmundo_logo.png",
      "author": {
        "@type": "Person",
        "name": "Raiden",
        "url": "https://bitraiden.org"
      }
    }
    </script>

    <!-- Scripts da Base do Site (Navbar e Footer) -->
    <script src="https://www.w3schools.com/lib/w3data.js"></script>
    <script type="text/javascript" src="/scripts/navbar.js"></script>
    <script type="module" src="/scripts/navbar_auth.js"></script>
     
    <!-- CSS Base do Site -->
    <link rel="stylesheet" href="/css/style.css" />`;

    return html.replace(/<head>[\s\S]*?(?=<style>)/i, headBlock + '\n    ');
  });

  // 4. Update tools.html
  updateFile('tools.html', html => {
    const headBlock = `<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ferramentas de RomHacking e Modding para PS2, PS1 e PC - RomHacking do Raiden</title>
    
    <meta name="description" content="Coleção de utilitários e ferramentas para edição, extração de áudio AFS, texturas CCSF, scripts e patchers de ISO para PlayStation 2 no RomHacking do Raiden." />
    <meta name="keywords" content="romhacking do raiden, ferramentas romhacking, ps2 modding tools, programas tradução jogos, ccs explorer, quickbms ps2, bitraiden tools" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
    <meta name="author" content="Raiden">
    <link rel="canonical" href="https://bitraiden.org/tools.html" />
    <meta name="theme-color" content="#020814">

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="RomHacking do Raiden" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:url" content="https://bitraiden.org/tools.html" />
    <meta property="og:title" content="Ferramentas de RomHacking e Modding para PS2, PS1 e PC - RomHacking do Raiden" />
    <meta property="og:description" content="Coleção de utilitários e ferramentas para edição, extração de áudio AFS, texturas CCSF, scripts e patchers de ISO para PlayStation 2 no RomHacking do Raiden." />
    <meta property="og:image" content="https://bitraiden.org/bitmundo_logo.png" />
    <meta property="og:image:secure_url" content="https://bitraiden.org/bitmundo_logo.png" />
    <meta property="og:image:alt" content="Ferramentas - RomHacking do Raiden" />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@BitRaiden" />
    <meta name="twitter:creator" content="@BitRaiden" />
    <meta name="twitter:url" content="https://bitraiden.org/tools.html" />
    <meta name="twitter:title" content="Ferramentas de RomHacking e Modding para PS2, PS1 e PC - RomHacking do Raiden" />
    <meta name="twitter:description" content="Coleção de utilitários e ferramentas para edição, extração de áudio AFS, texturas CCSF, scripts e patchers de ISO para PlayStation 2 no RomHacking do Raiden." />
    <meta name="twitter:image" content="https://bitraiden.org/bitmundo_logo.png" />

    <!-- Schema.org JSON-LD -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "CollectionPage",
          "@id": "https://bitraiden.org/tools.html#collection",
          "url": "https://bitraiden.org/tools.html",
          "name": "Ferramentas de RomHacking - RomHacking do Raiden",
          "description": "Lista de utilitários, scripts e editores desenvolvidos e catalogados para modificação de jogos de PlayStation 2 e retrô.",
          "inLanguage": "pt-BR"
        },
        {
          "@type": "BreadcrumbList",
          "itemListElement": [
            {
              "@type": "ListItem",
              "position": 1,
              "name": "RomHacking do Raiden",
              "item": "https://bitraiden.org/"
            },
            {
              "@type": "ListItem",
              "position": 2,
              "name": "Ferramentas",
              "item": "https://bitraiden.org/tools.html"
            }
          ]
        }
      ]
    }
    </script>

    <!-- Scripts -->
    <script src="https://www.w3schools.com/lib/w3data.js"></script>
    <script type="text/javascript" src="/scripts/navbar.js"></script>
    <script type="module" src="/scripts/navbar_auth.js"></script>
    <script type="text/javascript" src="/scripts/router.js"></script>
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6401015076542561" crossorigin="anonymous"></script>

    <!-- CSS -->
    <link rel="stylesheet" href="/css/style.css" />`;

    return html.replace(/<head>[\s\S]*?(?=<style>)/i, headBlock + '\n    ');
  });

  // 5. Update library.html
  updateFile('library.html', html => {
    const headBlock = `<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Biblioteca Técnica de RomHacking e Documentação - RomHacking do Raiden</title>
    
    <meta name="description" content="Documentação técnica, estruturas de arquivos, tutoriais de engenharia reversa e guia detalhado de jogos traduzidos no RomHacking do Raiden." />
    <meta name="keywords" content="romhacking do raiden, engenharia reversa jogos, documentação romhacking, estruturas de arquivos ps2, alundra 2 docs, bitraiden library" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
    <meta name="author" content="Raiden">
    <link rel="canonical" href="https://bitraiden.org/library.html" />
    <meta name="theme-color" content="#020814">

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="RomHacking do Raiden" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:url" content="https://bitraiden.org/library.html" />
    <meta property="og:title" content="Biblioteca Técnica de RomHacking e Documentação - RomHacking do Raiden" />
    <meta property="og:description" content="Documentação técnica, estruturas de arquivos, tutoriais de engenharia reversa e guia detalhado de jogos traduzidos no RomHacking do Raiden." />
    <meta property="og:image" content="https://bitraiden.org/bitmundo_logo.png" />
    <meta property="og:image:secure_url" content="https://bitraiden.org/bitmundo_logo.png" />
    <meta property="og:image:alt" content="Biblioteca Técnica - RomHacking do Raiden" />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@BitRaiden" />
    <meta name="twitter:creator" content="@BitRaiden" />
    <meta name="twitter:url" content="https://bitraiden.org/library.html" />
    <meta name="twitter:title" content="Biblioteca Técnica de RomHacking e Documentação - RomHacking do Raiden" />
    <meta name="twitter:description" content="Documentação técnica, estruturas de arquivos, tutoriais de engenharia reversa e guia detalhado de jogos traduzidos no RomHacking do Raiden." />
    <meta name="twitter:image" content="https://bitraiden.org/bitmundo_logo.png" />

    <!-- Schema.org JSON-LD -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "CollectionPage",
          "@id": "https://bitraiden.org/library.html#collection",
          "url": "https://bitraiden.org/library.html",
          "name": "Biblioteca Técnica de RomHacking - RomHacking do Raiden",
          "description": "Acervo de artigos e documentação sobre estruturas de arquivos, compressões e traduções de jogos.",
          "inLanguage": "pt-BR"
        },
        {
          "@type": "BreadcrumbList",
          "itemListElement": [
            {
              "@type": "ListItem",
              "position": 1,
              "name": "RomHacking do Raiden",
              "item": "https://bitraiden.org/"
            },
            {
              "@type": "ListItem",
              "position": 2,
              "name": "Biblioteca",
              "item": "https://bitraiden.org/library.html"
            }
          ]
        }
      ]
    }
    </script>
    
    <!-- CSS -->
    <link rel="stylesheet" href="/css/style.css" />
    <script src="https://www.w3schools.com/lib/w3data.js"></script>
    <script type="text/javascript" src="/scripts/navbar.js"></script>
    <script type="module" src="/scripts/navbar_auth.js"></script>
    <script type="text/javascript" src="/scripts/router.js"></script>`;

    return html.replace(/<head>[\s\S]*?(?=<style>)/i, headBlock + '\n\n    ');
  });

  // 6. Update about.html
  updateFile('about.html', html => {
    const headBlock = `<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sobre o Raiden - RomHacking, Projetos e Ferramentas</title>
    
    <meta name="description" content="Conheça o criador do RomHacking do Raiden: projetos de tradução de jogos, romhacking de PS2/PS1, ferramentas proprietárias e comunidade." />
    <meta name="keywords" content="romhacking do raiden, sobre bitraiden, miguel queiroz, criador bitmundo, história romhacking, comunidade bitraiden" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
    <meta name="author" content="Raiden">
    <link rel="canonical" href="https://bitraiden.org/about.html" />
    <meta name="theme-color" content="#020814">

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="profile" />
    <meta property="og:site_name" content="RomHacking do Raiden" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:url" content="https://bitraiden.org/about.html" />
    <meta property="og:title" content="Sobre o Raiden - RomHacking, Projetos e Ferramentas" />
    <meta property="og:description" content="Conheça o criador do RomHacking do Raiden: projetos de tradução de jogos, romhacking de PS2/PS1, ferramentas proprietárias e comunidade." />
    <meta property="og:image" content="https://bitraiden.org/bitmundo_logo.png" />
    <meta property="og:image:secure_url" content="https://bitraiden.org/bitmundo_logo.png" />
    <meta property="og:image:alt" content="RomHacking do Raiden" />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@BitRaiden" />
    <meta name="twitter:creator" content="@BitRaiden" />
    <meta name="twitter:url" content="https://bitraiden.org/about.html" />
    <meta name="twitter:title" content="Sobre o Raiden - RomHacking, Projetos e Ferramentas" />
    <meta name="twitter:description" content="Conheça o criador do RomHacking do Raiden: projetos de tradução de jogos, romhacking de PS2/PS1, ferramentas proprietárias e comunidade." />
    <meta name="twitter:image" content="https://bitraiden.org/bitmundo_logo.png" />

    <!-- Schema.org JSON-LD -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      "mainEntity": {
        "@type": "Person",
        "name": "Raiden",
        "alternateName": ["Bit.Raiden", "Miguel Queiroz"],
        "url": "https://bitraiden.org/about.html",
        "image": "https://bitraiden.org/media/Logotipo%20redondo.png",
        "description": "Tradutor, Programador e RomHacker. Criador do portal RomHacking do Raiden.",
        "sameAs": [
          "https://github.com/MiguelQueiroz010",
          "https://discord.gg/830475579336949770"
        ]
      }
    }
    </script>
    
    <!-- Favicons -->
    <link rel="apple-touch-icon" sizes="180x180" href="/fav/apple-touch-icon.png" />
    <link rel="icon" type="image/png" sizes="32x32" href="/fav/favicon-32x32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/fav/favicon-16x16.png" />
    
    <!-- CSS -->
    <link rel="stylesheet" href="/css/style.css" />
    
    <!-- Scripts -->
    <script src="https://www.w3schools.com/lib/w3data.js"></script>
    <script type="text/javascript" src="/scripts/navbar.js"></script>
    <script type="module" src="/scripts/navbar_auth.js"></script>
    <script type="text/javascript" src="/scripts/router.js"></script>
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6401015076542561" crossorigin="anonymous"></script>
</head>`;

    return html.replace(/<head>[\s\S]*?<\/head>/i, headBlock);
  });

  // 7. Update privacidade.html
  updateFile('privacidade.html', html => {
    return html.replace(/<head>[\s\S]*?<\/head>/i, `<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Política de Privacidade - RomHacking do Raiden</title>

    <meta name="description" content="Política de privacidade e proteção de dados do portal RomHacking do Raiden. Informações sobre segurança, navegação e Google AdSense." />
    <meta name="robots" content="index, follow" />
    <meta name="author" content="Raiden">
    <link rel="canonical" href="https://bitraiden.org/privacidade.html" />
    <meta name="theme-color" content="#020814">

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="RomHacking do Raiden" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:url" content="https://bitraiden.org/privacidade.html" />
    <meta property="og:title" content="Política de Privacidade - RomHacking do Raiden" />
    <meta property="og:description" content="Política de privacidade e proteção de dados do portal RomHacking do Raiden. Informações sobre segurança, navegação e Google AdSense." />
    <meta property="og:image" content="https://bitraiden.org/bitmundo_logo.png" />

    <link rel="stylesheet" href="/index.css">
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #fff;
            background-color: #121212;
            margin: 0;
            padding: 0;
        }
        .container {
            max-width: 800px;
            margin: 2em auto;
            padding: 2em;
            background-color: rgba(0, 0, 0, 0.7);
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5);
        }
        h1 {
            color: rgb(241, 163, 46);
            text-align: center;
            border-bottom: 2px solid rgb(241, 163, 46);
            padding-bottom: 10px;
        }
        h2 {
            color: rgb(241, 163, 46);
            margin-top: 1.5em;
        }
        p {
            margin-bottom: 1em;
        }
        ul {
            margin-bottom: 1em;
        }
    </style>
    <script src="https://www.w3schools.com/lib/w3data.js"></script>
    <script type="text/javascript" src="/scripts/navbar.js"></script>
</head>`);
  });

  // 8. Update AFS_STATION.html
  updateFile('tools/Fully/AFS_STATION.html', html => {
    return html.replace(/<head>[\s\S]*?(?=<style>)/i, `<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AFS Audio Station Online - Extrator e Reprodutor de Áudio AFS / ADX - RomHacking do Raiden</title>

<meta name="description" content="Abra, ouça e extraia faixas de áudio ADX, AHX e AIX contidas em arquivos AFS de jogos de Dreamcast, PlayStation 2 e PSP no RomHacking do Raiden." />
<meta name="keywords" content="romhacking do raiden, afs audio station, extrair adx online, tocar afs online, dreamcast audio extractor, ps2 afs audio, bitraiden afs" />
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
<meta name="author" content="Raiden">
<link rel="canonical" href="https://bitraiden.org/tools/Fully/AFS_STATION.html" />
<meta name="theme-color" content="#141922">
<link rel="manifest" href="/fav/afs_station.webmanifest">

<!-- Open Graph / Facebook -->
<meta property="og:type" content="website" />
<meta property="og:site_name" content="RomHacking do Raiden" />
<meta property="og:locale" content="pt_BR" />
<meta property="og:url" content="https://bitraiden.org/tools/Fully/AFS_STATION.html" />
<meta property="og:title" content="AFS Audio Station Online - Extrator e Reprodutor de Áudio AFS / ADX - RomHacking do Raiden" />
<meta property="og:description" content="Abra, ouça e extraia faixas de áudio ADX, AHX e AIX contidas em arquivos AFS de jogos de Dreamcast, PlayStation 2 e PSP no RomHacking do Raiden." />
<meta property="og:image" content="https://bitraiden.org/bitmundo_logo.png" />
<meta property="og:image:secure_url" content="https://bitraiden.org/bitmundo_logo.png" />

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@BitRaiden" />
<meta name="twitter:creator" content="@BitRaiden" />
<meta name="twitter:url" content="https://bitraiden.org/tools/Fully/AFS_STATION.html" />
<meta name="twitter:title" content="AFS Audio Station Online - Extrator e Reprodutor de Áudio AFS / ADX - RomHacking do Raiden" />
<meta name="twitter:description" content="Abra, ouça e extraia faixas de áudio ADX, AHX e AIX contidas em arquivos AFS de jogos de Dreamcast, PlayStation 2 e PSP no RomHacking do Raiden." />
<meta name="twitter:image" content="https://bitraiden.org/bitmundo_logo.png" />

<!-- Schema.org WebApplication -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "AFS Audio Station",
  "url": "https://bitraiden.org/tools/Fully/AFS_STATION.html",
  "applicationCategory": "MultimediaApplication",
  "operatingSystem": "Any",
  "browserRequirements": "Requires Web Audio API and modern browser",
  "description": "Reprodutor e extrator web de arquivos de áudio AFS e codecs CRI ADX/AHX de Dreamcast, PS2 e PSP.",
  "image": "https://bitraiden.org/bitmundo_logo.png",
  "author": {
    "@type": "Person",
    "name": "Raiden",
    "url": "https://bitraiden.org"
  }
}
</script>\n`);
  });

  // 9. Update TTxT-standalone.html
  updateFile('tools/Fully/TTxT-standalone.html', html => {
    return html.replace(/<head>[\s\S]*?(?=<style>)/i, `<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>TTxT Tradutor de Scripts - Editor de Textos para RomHacking Online - RomHacking do Raiden</title>

<meta name="description" content="Oficina e editor de tradução de scripts para romhacking com suporte a quebras de linha reais (↵), visualização lado a lado e modelos de diálogos no RomHacking do Raiden." />
<meta name="keywords" content="romhacking do raiden, ttxt tradutor, editor de scripts romhacking, tradução de diálogos ps2, quebra de linha romhacking, bitraiden ttxt" />
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
<meta name="author" content="Raiden">
<link rel="canonical" href="https://bitraiden.org/tools/Fully/TTxT-standalone.html" />
<meta name="theme-color" content="#e7ebf2">
<link rel="manifest" href="/fav/ttxt.webmanifest">

<!-- Open Graph / Facebook -->
<meta property="og:type" content="website" />
<meta property="og:site_name" content="RomHacking do Raiden" />
<meta property="og:locale" content="pt_BR" />
<meta property="og:url" content="https://bitraiden.org/tools/Fully/TTxT-standalone.html" />
<meta property="og:title" content="TTxT Tradutor de Scripts - Editor de Textos para RomHacking Online - RomHacking do Raiden" />
<meta property="og:description" content="Oficina e editor de tradução de scripts para romhacking com suporte a quebras de linha reais (↵), visualização lado a lado e modelos de diálogos no RomHacking do Raiden." />
<meta property="og:image" content="https://bitraiden.org/bitmundo_logo.png" />
<meta property="og:image:secure_url" content="https://bitraiden.org/bitmundo_logo.png" />

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@BitRaiden" />
<meta name="twitter:creator" content="@BitRaiden" />
<meta name="twitter:url" content="https://bitraiden.org/tools/Fully/TTxT-standalone.html" />
<meta name="twitter:title" content="TTxT Tradutor de Scripts - Editor de Textos para RomHacking Online - RomHacking do Raiden" />
<meta name="twitter:description" content="Oficina e editor de tradução de scripts para romhacking com suporte a quebras de linha reais (↵) e modelos de separação de diálogos." />
<meta name="twitter:image" content="https://bitraiden.org/bitmundo_logo.png" />

<!-- Schema.org WebApplication -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "TTxT Tradutor de Scripts",
  "url": "https://bitraiden.org/tools/Fully/TTxT-standalone.html",
  "applicationCategory": "UtilityApplication",
  "operatingSystem": "Any",
  "browserRequirements": "Requires modern browser",
  "description": "Ferramenta web para tradução de scripts e diálogos de jogos com controle visual de quebra de linha e formatos de script.",
  "image": "https://bitraiden.org/bitmundo_logo.png",
  "author": {
    "@type": "Person",
    "name": "Raiden",
    "url": "https://bitraiden.org"
  }
}
</script>\n`);
  });

  // 10. Update admin_login.html & admin_dashboard.html (noindex, nofollow)
  ['admin_login.html', 'admin_dashboard.html'].forEach(f => {
    updateFile(f, html => {
      if (html.includes('noindex')) return html;
      return html.replace(/<head>/i, `<head>\n    <meta name="robots" content="noindex, nofollow" />`);
    });
  });

  console.log('[SEO] All static HTML files meta tags verified and updated successfully.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  updateAllSeoTags();
}
L files meta tags verified and updated successfully.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    updateAllSeoTags();
}
