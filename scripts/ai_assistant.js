/**
 * Assistente de IA (Google Gemini API - Free Tier Google AI Studio)
 * Integrado ao Painel Admin: Vídeos/Repost, Postagens, Projetos, Ferramentas e Biblioteca.
 */

const GEMINI_KEY_STORAGE = 'bitraiden_gemini_api_key';
const GEMINI_MODEL = 'gemini-3.8-flash';

export function getGeminiApiKey() {
    return (localStorage.getItem(GEMINI_KEY_STORAGE) || '').trim();
}

export function saveGeminiApiKey(key) {
    if (key && key.trim()) {
        localStorage.setItem(GEMINI_KEY_STORAGE, key.trim());
    } else {
        localStorage.removeItem(GEMINI_KEY_STORAGE);
    }
}

export async function callGemini(prompt, { expectJson = false, temperature = 0.7 } = {}) {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
        throw new Error('Configure sua chave da API do Gemini (Google AI Studio) na aba "Vídeos & Repost (IA)" primeiro.');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature,
                ...(expectJson ? { responseMimeType: 'application/json' } : {})
            }
        })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data?.error?.message || `Erro HTTP ${res.status} na API Gemini`);
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) throw new Error('A IA retornou uma resposta vazia.');

    if (expectJson) {
        const cleaned = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
        return JSON.parse(cleaned);
    }
    return text.trim();
}

export async function generateVideoPostWithAI(video) {
    const prompt = `Você é o editor do portal RomHacking do Raiden (bitraiden.org), especializado em traduções de jogos (PS2, PS1, retrô) e ferramentas web de RomHacking.
Crie um artigo completo em Português (PT-BR) sobre este vídeo do YouTube:

Título: ${video.title}
Link: ${video.url}
Descrição:
${(video.description || '').slice(0, 2000)}

Retorne JSON válido com:
{
  "title": "Título chamativo e otimizado para SEO",
  "category": "VÍDEO",
  "html": "<p>Resumo bem escrito...</p><h3>Destaques</h3><ul><li>...</li></ul>"
}
Use apenas tags HTML limpas (<p>, <h3>, <ul>, <li>, <strong>, <em>).`;
    return await callGemini(prompt, { expectJson: true, temperature: 0.65 });
}

export async function generateLibraryGameWithAI(title, platform = 'PlayStation 2') {
    const prompt = `Você é um especialista em história dos videogames e RomHacking escrevendo para a Biblioteca do portal RomHacking do Raiden (bitraiden.org).
Preencha informações ricas, precisas e bem escritas em Português (PT-BR) para o jogo:
Jogo: ${title}
Plataforma: ${platform}

Retorne APENAS um JSON válido com estas chaves:
{
  "genre": "Gênero(s)",
  "release_year": "Ano (ex: 2007)",
  "publisher": "Publicadora",
  "developer": "Desenvolvedora",
  "region": "NTSC-U / PAL / NTSC-J",
  "summary": "Sinopse rica em 2 parágrafos HTML (<p>...</p>)",
  "lore": "Enredo e contexto da história (<p>...</p>)",
  "impact": "Impacto cultural e recepção (<p>...</p>)",
  "dev_details": "Detalhes técnicos e processo de desenvolvimento (<p>...</p>)",
  "dev_legacy": "Legado tecnológico e curiosidades (<p>...</p>)",
  "guide_tips": "Dicas úteis de jogabilidade e segredos (<p>...</p><ul><li>...</li></ul>)",
  "links": [
    { "label": "Wikipedia / Fandom", "url": "https://..." }
  ]
}
Se não tiver certeza de algum link exato, omita ou use apenas links oficiais/reais conhecidos.`;
    return await callGemini(prompt, { expectJson: true, temperature: 0.5 });
}

export async function generateProjectContentWithAI(title, platform, status) {
    const prompt = `Crie textos em Português (PT-BR) para a página de projeto de tradução/RomHacking no portal RomHacking do Raiden (bitraiden.org):
Projeto: ${title}
Plataforma: ${platform}
Status: ${status}

Retorne JSON válido com:
{
  "subtitle": "Subtítulo curto e atrativo (até 90 caracteres)",
  "description": "Descrição completa em HTML limpo (<p>, <h3>, <ul>, <li>, <strong>) explicando o projeto, compatibilidade (OPL/PCSX2/Console) e como aplicar o patch."
}`;
    return await callGemini(prompt, { expectJson: true, temperature: 0.65 });
}

export async function generateToolContentWithAI(name, type, target) {
    const prompt = `Crie uma descrição técnica clara e um mini guia de uso em Português (PT-BR) para a ferramenta de RomHacking:
Nome: ${name}
Tipo: ${type || 'Utilitário'}
Alvo: ${target || 'PS2 / PC'}

Retorne JSON válido com:
{
  "description": "HTML limpo (<p>, <strong>, <ul>, <li>) explicando para que serve, formatos suportados e como usar."
}`;
    return await callGemini(prompt, { expectJson: true, temperature: 0.6 });
}

export async function runUniversalAdminAssistant(userPrompt, targetArea, dbSummary) {
    const prompt = `Você é o Assistente IA integrado ao Painel Admin do portal RomHacking do Raiden (bitraiden.org).
Área alvo escolhida pelo administrador: ${targetArea}
Contexto atual do banco de dados:
${JSON.stringify(dbSummary)}

Pedido do administrador:
${userPrompt}

Responda em Português (PT-BR) de forma prática e direta. Se o pedido envolver criar conteúdo para "${targetArea}", forneça um rascunho pronto para uso em formato estruturado.`;
    return await callGemini(prompt, { expectJson: false, temperature: 0.7 });
}
