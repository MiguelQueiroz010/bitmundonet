/**
 * Repost Automático: YouTube RSS -> Site (Firestore Articles) & Instagram Reels
 * Executado via GitHub Actions (.github/workflows/repost-videos.yml)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import admin from 'firebase-admin';

const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountRaw) {
  console.error('❌ Secret FIREBASE_SERVICE_ACCOUNT_KEY não configurada.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(serviceAccountRaw))
});

const db = admin.firestore();

const IG_USER_ID = process.env.IG_USER_ID || '';
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN || '';
const FB_PAGE_ID = process.env.FB_PAGE_ID || '';
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN || '';
const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID || '';
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET || '';
const REDDIT_USERNAME = process.env.REDDIT_USERNAME || '';
const REDDIT_PASSWORD = process.env.REDDIT_PASSWORD || '';
const REDDIT_SUBREDDIT = process.env.REDDIT_SUBREDDIT || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || 'MiguelQueiroz010/bitmundonet';

const INPUT_ACTION = (process.env.INPUT_ACTION || 'repost_videos').trim();
const INPUT_ARTICLE_ID = (process.env.INPUT_ARTICLE_ID || '').trim();
const INPUT_VIDEO_ID = (process.env.INPUT_VIDEO_ID || '').trim();
const INPUT_FORCE_POST = process.env.INPUT_FORCE_POST === 'true';
const INPUT_FORCE_IG = process.env.INPUT_FORCE_IG === 'true';
const INPUT_FORCE_FB = process.env.INPUT_FORCE_FB === 'true';
const INPUT_FORCE_REDDIT = process.env.INPUT_FORCE_REDDIT === 'true';
const INPUT_USE_AI = process.env.INPUT_USE_AI !== 'false';

function setOutput(name, value) {
  const outFile = process.env.GITHUB_OUTPUT;
  if (outFile) {
    fs.appendFileSync(outFile, `${name}=${value}\n`);
  }
}

function decodeXml(str) {
  return (str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseYouTubeRss(xml) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = entryRegex.exec(xml)) !== null) {
    const block = m[1];
    const videoId = (block.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1] || '';
    const title = decodeXml((block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
    const published = (block.match(/<published>(.*?)<\/published>/) || [])[1] || '';
    const description = decodeXml((block.match(/<media:description>([\s\S]*?)<\/media:description>/) || [])[1] || '');
    const thumbnail = (block.match(/<media:thumbnail[^>]*url="([^"]+)"/) || [])[1] || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    const link = `https://www.youtube.com/watch?v=${videoId}`;
    if (videoId) {
      entries.push({ videoId, title, published, description, thumbnail, link });
    }
  }
  return entries;
}

function formatBrDate(isoStr) {
  const d = isoStr ? new Date(isoStr) : new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function slugify(text) {
  return (text || 'video')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

async function generatePostWithGemini(video) {
  if (!GEMINI_API_KEY) return null;
  try {
    const prompt = `Você é o redator do portal RomHacking do Raiden (bitraiden.org), focado em traduções de jogos (PS2, PS1, retrô) e ferramentas de RomHacking.
Crie um artigo curto, envolvente e informativo em Português (PT-BR) em HTML limpo (use apenas <p>, <strong>, <ul>, <li>, <h3>) resumindo este novo vídeo do canal:

Título do vídeo: ${video.title}
Link: ${video.link}
Descrição original:
${(video.description || '').slice(0, 1500)}

Regras:
- Responda APENAS com um JSON válido no formato: {"title":"...","category":"VÍDEO","html":"..."}
- Não inclua markdown \`\`\`json ao redor.`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7 }
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn('⚠️ Falha ao resumir com Gemini, usando template padrão:', e.message);
    return null;
  }
}

async function createSitePost(video, settings) {
  const useAi = INPUT_USE_AI && settings.useAiSummary !== false;
  const aiResult = useAi ? await generatePostWithGemini(video) : null;

  const postTitle = aiResult?.title || video.title;
  const category = aiResult?.category || 'VÍDEO';
  const summaryHtml = aiResult?.html || `<p>${(video.description || 'Confira o novo vídeo publicado no canal Bit.Raiden!').replace(/\n/g, '<br>')}</p>`;

  const embedBlock = `
<div class="video-container" style="margin: 1.5rem 0;">
  <div class="video-wrapper">
    <iframe src="https://www.youtube.com/embed/${video.videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
  </div>
</div>`;

  const fullContent = `${embedBlock}\n${summaryHtml}\n<p><strong>Assista no YouTube:</strong> <a href="${video.link}" target="_blank" rel="noopener noreferrer">${video.link}</a></p>`;

  const articleId = `yt-${video.videoId}-${slugify(postTitle).slice(0, 24)}`;
  const pubDate = video.published ? new Date(video.published) : new Date();

  await db.collection('articles').doc(articleId).set({
    title: postTitle,
    author: 'Bit.Raiden',
    category,
    date: formatBrDate(video.published),
    sortDate: pubDate.toISOString(),
    image: video.thumbnail,
    content: fullContent,
    selected: true,
    youtubeVideoId: video.videoId,
    aiGenerated: !!aiResult,
    createdAt: new Date().toISOString()
  }, { merge: true });

  return { articleId, aiGenerated: !!aiResult };
}

async function ensureTempReleaseAndUpload(mp4Path, filename) {
  const tag = 'repost-media-cache';
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'User-Agent': 'BitRaiden-Repost-Bot'
  };

  let relRes = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/releases/tags/${tag}`, { headers });
  let release;
  if (relRes.status === 404) {
    const createRel = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/releases`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_name: tag, name: 'Repost Media Cache (Auto)', prerelease: true })
    });
    release = await createRel.json();
  } else {
    release = await relRes.json();
  }

  if (!release || !release.upload_url) throw new Error('Não foi possível criar/obter release temporário no GitHub.');

  const uploadUrl = release.upload_url.replace('{?name,label}', `?name=${encodeURIComponent(filename)}`);
  const fileBuffer = fs.readFileSync(mp4Path);

  const upRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'video/mp4',
      'Content-Length': String(fileBuffer.length)
    },
    body: fileBuffer
  });
  const asset = await upRes.json();
  if (!upRes.ok || !asset.browser_download_url) {
    throw new Error('Falha ao subir MP4 temporário no GitHub Release: ' + JSON.stringify(asset));
  }
  return { assetId: asset.id, url: asset.browser_download_url };
}

async function deleteTempAsset(assetId) {
  if (!assetId || !GITHUB_TOKEN) return;
  try {
    await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/releases/assets/${assetId}`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'User-Agent': 'BitRaiden-Repost-Bot'
      }
    });
  } catch (_) {}
}

async function publishToInstagramReels(video, settings) {
  if (!IG_USER_ID || !IG_ACCESS_TOKEN) {
    throw new Error('Secrets IG_USER_ID ou IG_ACCESS_TOKEN não configuradas no GitHub.');
  }

  const tmpFile = path.join('/tmp', `${video.videoId}.mp4`);
  try {
    execSync(`yt-dlp -f "bv*[ext=mp4][vcodec^=avc1]+ba[ext=m4a]/b[ext=mp4]/b" --merge-output-format mp4 -o "${tmpFile}" "${video.link}"`, {
      stdio: 'inherit'
    });
  } catch (e) {
    throw new Error('Falha ao baixar vídeo com yt-dlp: ' + e.message);
  }

  const { assetId, url: publicMp4Url } = await ensureTempReleaseAndUpload(tmpFile, `${video.videoId}.mp4`);

  try {
    const tpl = settings.igCaptionTemplate || '{title}\n\nVeja mais em: https://bitraiden.org\n{hashtags}';
    const hashtags = settings.igHashtags || '#romhacking #ps2 #traducao #bitraiden #games';
    const caption = tpl
      .replace(/\{title\}/g, video.title)
      .replace(/\{description\}/g, (video.description || '').slice(0, 400))
      .replace(/\{url\}/g, video.link)
      .replace(/\{hashtags\}/g, hashtags)
      .slice(0, 2200);

    const createRes = await fetch(
      `https://graph.facebook.com/v21.0/${IG_USER_ID}/media?media_type=REELS&video_url=${encodeURIComponent(publicMp4Url)}&caption=${encodeURIComponent(caption)}&access_token=${encodeURIComponent(IG_ACCESS_TOKEN)}`,
      { method: 'POST' }
    );
    const createData = await createRes.json();
    if (!createRes.ok || !createData.id) {
      throw new Error('IG Media Create falhou: ' + JSON.stringify(createData));
    }

    const creationId = createData.id;
    let status = 'IN_PROGRESS';
    for (let i = 0; i < 36; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const stRes = await fetch(`https://graph.facebook.com/v21.0/${creationId}?fields=status_code&access_token=${encodeURIComponent(IG_ACCESS_TOKEN)}`);
      const stData = await stRes.json();
      status = stData.status_code;
      if (status === 'FINISHED') break;
      if (status === 'ERROR') throw new Error('Instagram retornou erro ao processar o vídeo.');
    }
    if (status !== 'FINISHED') throw new Error('Timeout aguardando processamento do Reel no Instagram.');

    const pubRes = await fetch(
      `https://graph.facebook.com/v21.0/${IG_USER_ID}/media_publish?creation_id=${creationId}&access_token=${encodeURIComponent(IG_ACCESS_TOKEN)}`,
      { method: 'POST' }
    );
    const pubData = await pubRes.json();
    if (!pubRes.ok || !pubData.id) {
      throw new Error('IG Media Publish falhou: ' + JSON.stringify(pubData));
    }
    return pubData.id;
  } finally {
    await deleteTempAsset(assetId);
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

async function publishToFacebookPage(message, link, settings) {
  const pageId = (FB_PAGE_ID || settings.fbPageId || '').trim();
  if (!pageId) {
    throw new Error('FB_PAGE_ID não configurado (adicione nos Secrets do GitHub ou em repost_settings no painel).');
  }

  let token = (FB_PAGE_TOKEN || '').trim();
  if (!token) {
    token = (IG_ACCESS_TOKEN || '').trim();
    if (!token) {
      throw new Error('Nenhum Access Token disponível para Facebook (configure FB_PAGE_TOKEN ou IG_ACCESS_TOKEN).');
    }
    // Tenta trocar pelo token de página específico, se disponível
    try {
      const pageRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}?fields=access_token&access_token=${encodeURIComponent(token)}`);
      const pageData = await pageRes.json();
      if (pageData && pageData.access_token) {
        token = pageData.access_token;
      }
    } catch (_) {}
  }

  const params = new URLSearchParams();
  params.append('message', message);
  if (link) params.append('link', link);
  params.append('access_token', token);

  const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/feed`, {
    method: 'POST',
    body: params
  });
  const data = await res.json();
  if (!res.ok || !data.id) {
    throw new Error('Falha ao postar na Página do Facebook: ' + JSON.stringify(data));
  }
  return data.id;
}

async function publishToReddit(title, url, text, settings) {
  const clientId = (REDDIT_CLIENT_ID || '').trim();
  const clientSecret = (REDDIT_CLIENT_SECRET || '').trim();
  const username = (REDDIT_USERNAME || '').trim();
  const password = (REDDIT_PASSWORD || '').trim();
  let subreddit = (REDDIT_SUBREDDIT || settings.redditSubreddit || '').trim();

  if (!clientId || !clientSecret || !username || !password) {
    throw new Error('Credenciais do Reddit (REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD) não configuradas no GitHub Secrets.');
  }

  if (!subreddit) {
    subreddit = `u_${username}`;
  }
  subreddit = subreddit.replace(/^r\//i, '').replace(/^u\//i, 'u_');

  // 1. Obter Access Token via OAuth Password Grant
  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenParams = new URLSearchParams({
    grant_type: 'password',
    username,
    password
  });

  const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': `BitMundo-Bot/1.0 (by /u/${username})`
    },
    body: tokenParams
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error('Falha na autenticação Reddit: ' + JSON.stringify(tokenData));
  }

  const accessToken = tokenData.access_token;

  // 2. Submeter Post
  const submitParams = new URLSearchParams({
    api_type: 'json',
    sr: subreddit,
    title: title.slice(0, 300),
    resubmit: 'true'
  });

  if (url) {
    submitParams.append('kind', 'link');
    submitParams.append('url', url);
  } else {
    submitParams.append('kind', 'self');
    submitParams.append('text', text || title);
  }

  const submitRes = await fetch('https://oauth.reddit.com/api/submit', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': `BitMundo-Bot/1.0 (by /u/${username})`
    },
    body: submitParams
  });

  const submitData = await submitRes.json();
  const errors = submitData?.json?.errors;
  if (errors && errors.length > 0) {
    throw new Error('Reddit recusou o post: ' + JSON.stringify(errors));
  }

  const postUrl = submitData?.json?.data?.url || (submitData?.json?.data?.id ? `https://redd.it/${submitData.json.data.id}` : null);
  return postUrl || submitData?.json?.data?.name || 'ok';
}

async function shareSiteArticle(articleId, settings) {
  console.log(`📢 Compartilhando artigo do site nas redes: ${articleId}`);
  const snap = await db.collection('articles').doc(articleId).get();
  if (!snap.exists) {
    throw new Error(`Artigo "${articleId}" não encontrado no Firestore.`);
  }

  const article = snap.data();
  const articleUrl = `https://bitraiden.org/#${articleId}`;
  const cleanSummary = (article.content || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);

  const fbMessage = `${article.title}\n\n${cleanSummary}...\n\nConfira o post completo no site:\n${articleUrl}\n\n#romhacking #traducoes #jogos #bitraiden`;
  const redditTitle = `${article.title} - BitMundo`;

  const results = {};

  if (INPUT_FORCE_FB || settings.autoPostFb) {
    console.log('📘 Publicando postagem na Página do Facebook...');
    try {
      const fbId = await publishToFacebookPage(fbMessage, articleUrl, settings);
      results.fbPosted = true;
      results.fbPostId = fbId;
      results.fbError = null;
      console.log(`✅ Facebook publicado: ${fbId}`);
    } catch (e) {
      console.error(`❌ Erro Facebook:`, e.message);
      results.fbError = e.message;
    }
  }

  if (INPUT_FORCE_REDDIT || settings.autoPostReddit) {
    console.log('🤖 Publicando postagem no Reddit...');
    try {
      const redditUrl = await publishToReddit(redditTitle, articleUrl, null, settings);
      results.redditPosted = true;
      results.redditPostUrl = redditUrl;
      results.redditError = null;
      console.log(`✅ Reddit publicado: ${redditUrl}`);
    } catch (e) {
      console.error(`❌ Erro Reddit:`, e.message);
      results.redditError = e.message;
    }
  }

  await db.collection('articles').doc(articleId).set({
    socialShares: {
      ...(article.socialShares || {}),
      ...results,
      lastSharedAt: new Date().toISOString()
    }
  }, { merge: true });

  setOutput('site_updated', 'false');
  console.log(`✅ Compartilhamento do artigo ${articleId} finalizado.`);
}

async function main() {
  const cfgSnap = await db.collection('admin_config').doc('repost_settings').get();
  const settings = cfgSnap.exists ? cfgSnap.data() : {};

  // Se a ação for especificamente compartilhar um artigo existente do site
  if (INPUT_ACTION === 'share_article' || (INPUT_ARTICLE_ID && !INPUT_VIDEO_ID)) {
    if (!INPUT_ARTICLE_ID) {
      throw new Error('INPUT_ARTICLE_ID é obrigatório quando INPUT_ACTION=share_article.');
    }
    await shareSiteArticle(INPUT_ARTICLE_ID, settings);
    return;
  }

  const channelId = (settings.youtubeChannelId || '').trim();
  if (!channelId) {
    console.log('ℹ️ YouTube Channel ID não configurado em admin_config/repost_settings. Encerrando.');
    setOutput('site_updated', 'false');
    return;
  }

  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  console.log(`📡 Buscando RSS do YouTube: ${rssUrl}`);
  const rssRes = await fetch(rssUrl);
  if (!rssRes.ok) throw new Error(`Falha ao buscar RSS (${rssRes.status})`);
  const xml = await rssRes.text();
  let videos = parseYouTubeRss(xml);

  if (INPUT_VIDEO_ID) {
    videos = videos.filter(v => v.videoId === INPUT_VIDEO_ID);
    if (videos.length === 0) {
      videos = [{
        videoId: INPUT_VIDEO_ID,
        title: `Vídeo ${INPUT_VIDEO_ID}`,
        published: new Date().toISOString(),
        description: '',
        thumbnail: `https://i.ytimg.com/vi/${INPUT_VIDEO_ID}/hqdefault.jpg`,
        link: `https://www.youtube.com/watch?v=${INPUT_VIDEO_ID}`
      }];
    }
  } else {
    videos = videos.slice(0, 5); // Processa no máximo os 5 mais recentes por execução
  }

  let siteUpdated = false;

  for (const video of videos) {
    const docRef = db.collection('reposted_videos').doc(video.videoId);
    const existingSnap = await docRef.get();
    const existing = existingSnap.exists ? existingSnap.data() : {};

    const needPost = (INPUT_FORCE_POST || settings.autoCreatePost) && !existing.sitePosted;
    const needIg = (INPUT_FORCE_IG || settings.autoPostIg) && !existing.igPosted;
    const needFb = (INPUT_FORCE_FB || settings.autoPostFb) && !existing.fbPosted;
    const needReddit = (INPUT_FORCE_REDDIT || settings.autoPostReddit) && !existing.redditPosted;

    const record = {
      videoId: video.videoId,
      title: video.title,
      url: video.link,
      thumbnail: video.thumbnail,
      description: video.description || '',
      publishedAt: video.published || new Date().toISOString(),
      sitePosted: !!existing.sitePosted,
      sitePostId: existing.sitePostId || null,
      igPosted: !!existing.igPosted,
      igMediaId: existing.igMediaId || null,
      igError: existing.igError || null,
      fbPosted: !!existing.fbPosted,
      fbPostId: existing.fbPostId || null,
      fbError: existing.fbError || null,
      redditPosted: !!existing.redditPosted,
      redditPostUrl: existing.redditPostUrl || null,
      redditError: existing.redditError || null,
      updatedAt: new Date().toISOString()
    };

    if (needPost) {
      console.log(`📝 Criando post no site para: ${video.title}`);
      const { articleId, aiGenerated } = await createSitePost(video, settings);
      record.sitePosted = true;
      record.sitePostId = articleId;
      record.aiGenerated = aiGenerated;
      siteUpdated = true;
    }

    if (needIg) {
      console.log(`📸 Publicando Reel no Instagram para: ${video.title}`);
      try {
        const igMediaId = await publishToInstagramReels(video, settings);
        record.igPosted = true;
        record.igMediaId = igMediaId;
        record.igError = null;
      } catch (err) {
        console.error(`❌ Erro IG (${video.videoId}):`, err.message);
        record.igError = err.message;
      }
    }

    if (needFb) {
      console.log(`📘 Publicando na Página do Facebook para: ${video.title}`);
      try {
        const fbMsg = `${video.title}\n\n${(video.description || '').slice(0, 300)}...\n\nAssista no YouTube ou no portal BitMundo!\n${video.link}\n\n#romhacking #traducoes #games #bitraiden`;
        const fbId = await publishToFacebookPage(fbMsg, video.link, settings);
        record.fbPosted = true;
        record.fbPostId = fbId;
        record.fbError = null;
      } catch (err) {
        console.error(`❌ Erro Facebook (${video.videoId}):`, err.message);
        record.fbError = err.message;
      }
    }

    if (needReddit) {
      console.log(`🤖 Publicando no Reddit para: ${video.title}`);
      try {
        const redditTitle = `${video.title} [Bit.Raiden RomHacking]`;
        const redditUrl = await publishToReddit(redditTitle, video.link, null, settings);
        record.redditPosted = true;
        record.redditPostUrl = redditUrl;
        record.redditError = null;
      } catch (err) {
        console.error(`❌ Erro Reddit (${video.videoId}):`, err.message);
        record.redditError = err.message;
      }
    }

    await docRef.set(record, { merge: true });
  }

  setOutput('site_updated', siteUpdated ? 'true' : 'false');
  console.log('✅ Sincronização de vídeos finalizada.');
}

main().catch(err => {
  console.error('💥 Erro fatal no repost_videos.js:', err);
  process.exit(1);
});
