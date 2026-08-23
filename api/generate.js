// Fonction serverless Vercel — garde ta clé API Gemini côté serveur.
// Le site (carrousel-studio.html) appelle "/api/generate", jamais Gemini
// directement, donc la clé n'est JAMAIS visible dans le navigateur des visiteurs.
//
// Déploiement : place ce fichier dans un dossier /api à la racine de ton projet
// Vercel, ajoute la variable d'environnement GEMINI_API_KEY dans les
// paramètres du projet (Settings > Environment Variables), puis déploie.

const GEMINI_MODEL = 'gemini-3.6-flash';

// Limiteur basique en mémoire (best-effort, se réinitialise à chaque cold start).
// Protège contre un usage abusif qui ferait exploser ta facture API.
const requestLog = new Map();
const MAX_REQUESTS_PER_WINDOW = 8;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function isRateLimited(ip) {
  const now = Date.now();
  const entry = requestLog.get(ip) || { count: 0, windowStart: now };
  if (now - entry.windowStart > WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count += 1;
  requestLog.set(ip, entry);
  return entry.count > MAX_REQUESTS_PER_WINDOW;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' });
    return;
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    res.status(429).json({ error: 'Trop de générations. Réessaie dans quelques minutes.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Clé API non configurée côté serveur (GEMINI_API_KEY manquante)." });
    return;
  }

  try {
    const { system, messages } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'Requête invalide.' });
      return;
    }

    const userText = messages.map(m => m.content).join('\n');

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          system_instruction: system ? { parts: [{ text: system }] } : undefined,
          contents: [{ role: 'user', parts: [{ text: userText }] }],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    const data = await geminiResponse.json();

    if (!geminiResponse.ok) {
      res.status(geminiResponse.status).json({ error: data.error?.message || 'Erreur API Gemini' });
      return;
    }

    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.map(p => p.text || '').join('') || '';

    if (candidate?.finishReason === 'MAX_TOKENS') {
      res.status(200).json({
        content: [{ type: 'text', text: '' }],
        error_hint: 'Réponse tronquée (trop de tokens) — réessaie avec un texte source plus court ou moins de slides.',
      });
      return;
    }

    // On normalise la réponse au même format que celui attendu par le site
    // (structure "content" façon Anthropic), pour ne rien changer côté client.
    res.status(200).json({
      content: [{ type: 'text', text }],
    });
  } catch (err) {
    console.error('Erreur /api/generate:', err);
    res.status(500).json({ error: 'Erreur serveur lors de la génération.' });
  }
}
