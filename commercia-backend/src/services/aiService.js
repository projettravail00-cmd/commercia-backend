// Service d'intelligence artificielle conversationnelle CommercIA
// Moteur Groq LLM haute performance avec fallback logique résilient

async function generateAIResponse({ store, products, orders, userMessage, isBoss, senderPhone }) {
  const groqKey = process.env.GROQ_API_KEY || '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';

  const catalogContext = products.map(p => 
    `- ${p.name} | Prix: ${Number(p.price).toLocaleString('fr-FR')} FCFA | Stock: ${p.stock} | Variantes: ${p.variants || 'Standard'}`
  ).join('\n');

  const totalSales = orders.reduce((s, o) => s + Number(o.amount), 0);

  const deliveryPolicyPrompt = (store.delivery_mode === 'pickup')
    ? `POLITIQUE DE LIVRAISON :\n- La boutique NE FAIT PAS de livraison à domicile. Les clients doivent obligatoirement venir retirer leurs achats sur place à : ${store.location}. Horaires de retrait : ${store.delivery_schedule || 'Du lundi au samedi aux heures ouvrées'}.\n- Si le client demande une livraison, informe-le poliment que les retraits se font uniquement en boutique et donne-lui les horaires.`
    : `POLITIQUE DE LIVRAISON :\n- La boutique propose un service de livraison selon ce programme fixé par la gérante : ${store.delivery_schedule || 'Livraisons assurées par coursier dans la ville'}.\n- Si le client demande une livraison, donne-lui ces informations et demande son quartier précis pour organiser le coursier dès réception du paiement.`;

  const complexQuestionsPrompt = `GESTION DES QUESTIONS COMPLEXES, RÉCLAMATIONS ET PRIX DE GROS :\n- Si le client demande un prix de gros / tarif revendeur, un achat en grand volume, fait une réclamation (litige, retard, colis abîmé, remboursement) ou pose une question hors catalogue :\n  RÈGLE ABSOLUE : N'invente JAMAIS de tarif de gros ni de promesse commerciale.\n  Réponds poliment que sa demande nécessite l'accord direct de la gérante, que tu lui transmets immédiatement l'alerte avec son numéro, et qu'elle va le contacter personnellement sur WhatsApp sous peu.`;

  const systemPrompt = `Tu es l'assistante commerciale officielle et intelligente de la boutique "${store.name}", située à ${store.location}.
Mode de paiement Mobile Money accepté : ${store.payment_method} au numéro ${store.phone}.

CATALOGUE EN DIRECT DE LA BOUTIQUE :
${catalogContext || 'Aucun article en stock actuellement.'}

BILAN COMMERCIAL :
- Total des ventes : ${orders.length} commandes enregistrées
- Chiffre d'affaires total encaissé : ${totalSales.toLocaleString('fr-FR')} FCFA

${deliveryPolicyPrompt}

${complexQuestionsPrompt}

CONSIGNES DE RÉPONSE STRICTES :
1. RÈGLE CRUCIALE : N'utilise AUCUN emoji. Zéro emoji dans tes réponses (interdiction formelle d'emojis).
2. Tu comprends et parles couramment le Français, l'Éwé et le Mina. Réponds dans la même langue que l'interlocuteur.
3. Sois très chaleureuse, polie, accueillante et efficace comme une excellente commerçante ouest-africaine.
${isBoss ? `4. L'interlocuteur est le PATRON / GÉRANT de la boutique. Donne-lui des chiffres précis s'il demande son bilan, ou confirme l'ajout d'article.` : `4. L'interlocuteur est un CLIENT. Renseigne-le sur les prix, les pointures, applique la politique de livraison ci-dessus et invite-le à régler par ${store.payment_method} pour réserver.`}
5. Reste concise : 2 à 4 phrases maximum par message, adaptées au format WhatsApp.`;

  if (groqKey) {
    const modelsToTry = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b'];
    
    for (const model of modelsToTry) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage }
            ],
            temperature: 0.6,
            max_tokens: 220
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.choices && data.choices[0] && data.choices[0].message) {
            let reply = data.choices[0].message.content.trim();
            // Nettoyage de sécurité strict pour zéro emojis
            reply = reply.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
            return reply;
          }
        }
      } catch (err) {
        console.warn(`[AI] Erreur appel Groq (${model}):`, err.message);
      }
    }
  }

  return null; // Fallback logique par défaut
}

module.exports = {
  generateAIResponse
};
