// Service d'intelligence artificielle conversationnelle CommercIA
// Moteur Groq LLM haute performance avec mémoire contextuelle et adaptation Produits / Services

async function generateAIResponse({ store, products, orders, userMessage, history = [], isBoss, senderPhone }) {
  const groqKey = process.env.GROQ_API_KEY || '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';

  const isServiceBusiness = (store.business_type === 'services') || 
    (products.length > 0 && products.every(p => (p.variants || '').toLowerCase().includes('service') || p.stock >= 900));

  const catalogContext = products.map(p => {
    if (isServiceBusiness) {
      return `- ${p.name} | Tarif: ${Number(p.price).toLocaleString('fr-FR')} FCFA | Modalité: ${p.variants || 'Sur rendez-vous'}`;
    }
    return `- ${p.name} | Prix: ${Number(p.price).toLocaleString('fr-FR')} FCFA | Stock: ${p.stock} | Variantes: ${p.variants || 'Standard'}`;
  }).join('\n');

  const totalSales = orders.reduce((s, o) => s + Number(o.amount), 0);

  const deliveryPolicyPrompt = (store.delivery_mode === 'pickup')
    ? `POLITIQUE DE LIVRAISON & RETRAIT SUR PLACE :\n- La boutique NE LIVRE PAS à domicile. Les clients doivent venir retirer leurs commandes directement sur place.\n- Adresse exacte : ${store.location}\n- Créneaux et horaires de retrait : ${store.delivery_schedule || 'Du lundi au samedi de 08h à 19h'}.\n- Si un client demande une livraison, explique poliment que les retraits se font sur place et donne l'adresse et les horaires.`
    : `POLITIQUE DE LIVRAISON :\n- La boutique assure les livraisons par coursier selon ce programme : ${store.delivery_schedule || 'Livraisons du lundi au samedi entre 14h et 18h'}.\n- Adresse de la boutique : ${store.location}.\n- Demande le quartier exact du client pour organiser le coursier dès validation du paiement.`;

  const locationPrompt = `DEMANDE D'ADRESSE ET DE LOCALISATION :
- Si le client dit "envoie la localisation", "vous êtes où", "je vais passer", "adresse", "c'est situé où" :
  Donne TOUJOURS précisément et immédiatement l'adresse : "${store.location}".
  Précise les horaires d'ouverture : "${store.delivery_schedule || 'Du lundi au samedi de 08h à 19h'}".`;

  const activityPrompt = isServiceBusiness
    ? `TYPE D'ACTIVITÉ : PRESTATION DE SERVICES (Salon, Couture, Agence, Artisanat, etc.)
- Tu parles de "prestations", "rendez-vous", "forfaits", "réservations" ou "devis".
- Ne parle JAMAIS de "stock épuisé" ou de "colis expédié". Invite à convenir d'une date ou à réserver un créneau.`
    : `TYPE D'ACTIVITÉ : BOUTIQUE COMMERCIALE (Vente d'articles)
- Tu informes sur les articles disponibles, les prix, les pointures/couleurs et les modalités de commande.`;

  const conversationLogicPrompt = `RÈGLES CAPITALES DE SUITE LOGIQUE DE CONVERSATION :
1. MÉMOIRE DE LA DISCUSSION :
   - Tu as accès aux messages précédents échangés avec ce client ci-dessous.
   - S'il a déjà choisi un article ou une prestation plus haut (ex: "Je veux 2 montres connectées") et demande ensuite "fait moi la facture", FAIS LA FACTURE DIRECTEMENT avec les articles qu'il vient de nommer ! Ne lui redemande JAMAIS quel article il veut !
   - S'il précise la couleur (ex: "Deux montre couleur noire"), intègre-le immédiatement dans la commande sans reposer la question.
   - S'il dit "Tmoney" ou "T-Money", c'est qu'il confirme ce moyen de paiement pour sa commande en cours. Donne-lui le récapitulatif du montant à transférer au numéro ${store.phone} (${store.payment_method}).

2. RÈGLE D'OR DE POLITESSE & ZÉRO RÉPÉTITION DE SALUTATION :
   - NE RÉPÈTE PAS "Bonjour" ni "Bienvenue à la Boutique" à chaque message !
   - Si la discussion a déjà commencé, enchaîne directement avec la réponse naturelle, chaleureuse et concise, exactement comme une vraie commerçante sur WhatsApp.

3. QUESTIONS PERTINENTES, COMPLEXES OU CAS PARTICULIERS (RELAI AU PROPRIÉTAIRE) :
   - Si le client pose une question spécifique hors catalogue, négocie un prix de gros ou une remise spéciale, fait une réclamation (litige, retard, remboursement), a une demande sur mesure ou si tu n'as pas l'information exacte :
     RÈGLE STRICTE : N'invente JAMAIS de fausse information.
     Réponds avec une politesse irréprochable :
     "C'est bien noté ! Je transmets votre demande directement à la responsable. Elle prendra personnellement la relève dès qu'elle est disponible."

4. LANGUE :
   - Réponds en FRANÇAIS par défaut.
   - Ne réponds en Éwé ou Mina QUE SI le client a expressément écrit lui-même dans cette langue (ex: "Efoa", "Ndi na mi", "Pagne le asinye a ?").
   - Ne confonds JAMAIS un mot court français ("Ok", "Tmoney", "D'accord", "Merci") avec une autre langue !

5. ZÉRO EMOJI :
   - Interdiction stricte et formelle d'inclure le moindre emoji dans tes réponses.`;

  const bossPrompt = `MODE PATRON (INTERLOCUTEUR = GÉRANT / PROPRIÉTAIRE DU COMMERCE) :
- L'interlocuteur est le GÉRANT / PATRON de la boutique.
- Réponds-lui poliment ("Bonjour Patron !" ou "Bonjour Madame la responsable !").
- S'il demande son bilan ("bilan", "ventes", "commandes", "chiffre"), donne-lui le récapitulatif des ${orders.length} commandes et du chiffre d'affaires de ${totalSales.toLocaleString('fr-FR')} FCFA.
- S'il demande "qui a écrit ?" ou les alertes, informe-le s'il y a des clients en attente de réponse.
- S'il demande son abonnement ("abonnement", "forfait", "combien", "renouvellement") :
  * Forfait actif : Plan Pro (2 800 FCFA / mois)
  * Statut : Actif
  * Renouvellement Mobile Money : direct par T-Money au +228 96 09 82 23 ou Flooz au +228 90 23 45 67.`;

  const systemPrompt = `Tu es l'assistante commerciale officielle et intelligente de "${store.name}", située à ${store.location}.
Mode de paiement Mobile Money : ${store.payment_method} au numéro ${store.phone}.

${activityPrompt}

CATALOGUE / PRESTATIONS DISPONIBLES :
${catalogContext || 'Prestations et articles sur mesure.'}

BILAN COMMERCIAL :
- Commandes enregistrées : ${orders.length}
- Chiffre d'affaires total : ${totalSales.toLocaleString('fr-FR')} FCFA

${locationPrompt}

${deliveryPolicyPrompt}

${isBoss ? bossPrompt : conversationLogicPrompt}

FORMAT DE RÉPONSE :
- Concise et directe : 2 à 4 phrases maximum par message.
- Zéro emoji.`;

  // Construction du tableau de messages avec historique multi-tours
  const chatMessages = [
    { role: 'system', content: systemPrompt }
  ];

  if (Array.isArray(history) && history.length > 0) {
    const recent = history.slice(-8);
    for (const m of recent) {
      if (m && m.content) {
        chatMessages.push({
          role: (m.role === 'assistant' || m.role === 'bot') ? 'assistant' : 'user',
          content: m.content
        });
      }
    }
  }

  chatMessages.push({ role: 'user', content: userMessage });

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
            messages: chatMessages,
            temperature: 0.5,
            max_tokens: 240
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

  // Fallback intelligent selon le contenu
  const lower = (userMessage || '').toLowerCase();
  if (lower.includes('localisation') || lower.includes('adresse') || lower.includes('passer')) {
    return `Notre adresse est : ${store.location}. Nous sommes ouverts aux horaires habituels. N'hésitez pas si vous avez besoin d'indications supplémentaires.`;
  }
  if (lower.includes('tmoney') || lower.includes('t-money') || lower.includes('moov') || lower.includes('payer')) {
    return `Pour effectuer votre règlement, veuillez transférer le montant via ${store.payment_method} au numéro ${store.phone}. Merci d'envoyer la référence de confirmation une fois effectué.`;
  }

  return `Bien reçu ! Comment puis-je vous renseigner plus en détail sur nos disponibilités ou nos tarifs ?`;
}

module.exports = {
  generateAIResponse
};
