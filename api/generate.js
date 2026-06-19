// api/generate.js
// Fonction serverless Vercel (Node.js).
// Recoit la requete du front, appelle l'API Anthropic avec la cle secrete,
// et renvoie la reponse generee. La cle API n'est JAMAIS exposee au navigateur.

const MODEL = "claude-sonnet-4-6";
const MAX_AVIS_LENGTH = 3000;

module.exports = async function handler(req, res) {
  // CORS / methode
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Methode non autorisee." });
  }

  // La cle doit etre configuree cote serveur
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: "Configuration serveur incomplete." });
  }

  // Recuperation du corps (Vercel parse deja le JSON, mais on securise)
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return res.status(400).json({ error: "Requete invalide." });
    }
  }
  body = body || {};

  const typeCommerce = (body.typeCommerce || "").toString().trim();
  const note = body.note;
  const avis = (body.avis || "").toString().trim();

  // Validation des entrees
  if (!avis) {
    return res
      .status(400)
      .json({ error: "Le texte de l'avis est obligatoire." });
  }
  if (avis.length > MAX_AVIS_LENGTH) {
    return res.status(400).json({
      error: `L'avis est trop long (maximum ${MAX_AVIS_LENGTH} caracteres).`,
    });
  }

  let noteText = "";
  const noteNum = Number(note);
  if (note !== undefined && note !== null && note !== "" && !Number.isNaN(noteNum)) {
    if (noteNum >= 1 && noteNum <= 5) {
      noteText = `\nNote laissee par le client : ${noteNum}/5 etoiles.`;
    }
  }

  const commerceText = typeCommerce
    ? `Type de commerce : ${typeCommerce}.`
    : "Type de commerce : non precise.";

  const systemPrompt = [
    "Tu es un assistant qui redige des reponses professionnelles aux avis Google",
    "pour des commercants francais. Tu ecris en francais, sur un ton courtois,",
    "chaleureux et professionnel. Tu remercies le client quand c'est approprie,",
    "tu reponds aux points souleves, et en cas d'avis negatif tu restes calme,",
    "tu t'excuses sincerement sans etre servile et tu proposes de poursuivre",
    "l'echange. La reponse doit etre prete a publier : pas de variables a remplir,",
    "pas de crochets, pas de commentaire ni d'explication, uniquement le texte",
    "de la reponse. Longueur : 2 a 5 phrases.",
  ].join(" ");

  const userPrompt = `${commerceText}${noteText}\n\nAvis du client :\n"""${avis}"""\n\nRedige la reponse a publier.`;

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!anthropicRes.ok) {
      let detail = "";
      try {
        const errJson = await anthropicRes.json();
        detail = errJson?.error?.message || "";
      } catch (e) {
        /* ignore */
      }
      console.error("Anthropic API error", anthropicRes.status, detail);
      return res.status(502).json({
        error: "Le service de generation est momentanement indisponible.",
      });
    }

    const data = await anthropicRes.json();
    const reply =
      Array.isArray(data.content) && data.content.length
        ? data.content
            .filter((b) => b.type === "text")
            .map((b) => b.text)
            .join("\n")
            .trim()
        : "";

    if (!reply) {
      return res
        .status(502)
        .json({ error: "Reponse vide du service de generation." });
    }

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Erreur serveur generate.js", err);
    return res
      .status(500)
      .json({ error: "Une erreur est survenue. Veuillez reessayer." });
  }
};
