// api/checkout.js
// Fonction serverless Vercel : cree une session Stripe Checkout (abonnement Pro, 19 EUR/mois).
// La cle secrete Stripe reste cote serveur (STRIPE_SECRET_KEY), jamais exposee au navigateur.

const PRO_AMOUNT_CENTS = 1900; // 19,00 EUR / mois
const PRO_LABEL = "AvisReply Pro";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Methode non autorisee." });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return res.status(500).json({ error: "Configuration paiement incomplete." });
  }

  const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0];
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const origin = `${proto}://${host}`;

  const params = new URLSearchParams();
  params.append("mode", "subscription");
  params.append("line_items[0][quantity]", "1");
  params.append("line_items[0][price_data][currency]", "eur");
  params.append("line_items[0][price_data][product_data][name]", PRO_LABEL);
  params.append("line_items[0][price_data][unit_amount]", String(PRO_AMOUNT_CENTS));
  params.append("line_items[0][price_data][recurring][interval]", "month");
  params.append("success_url", `${origin}/?paiement=succes`);
  params.append("cancel_url", `${origin}/?paiement=annule`);
  params.append("billing_address_collection", "auto");
  params.append("allow_promotion_codes", "true");

  try {
    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await stripeRes.json().catch(() => ({}));

    if (!stripeRes.ok) {
      console.error("Stripe error", stripeRes.status, data && data.error && data.error.message);
      return res.status(502).json({ error: "Le service de paiement est momentanement indisponible." });
    }

    if (!data.url) {
      return res.status(502).json({ error: "Reponse inattendue du service de paiement." });
    }

    return res.status(200).json({ url: data.url });
  } catch (err) {
    console.error("Erreur serveur checkout.js", err);
    return res.status(500).json({ error: "Une erreur est survenue. Veuillez reessayer." });
  }
};
