// Service d'intelligence artificielle conversationnelle CommercIA
// Moteur Groq LLM haute performance avec mémoire contextuelle et adaptation Produits / Services

async function generateAIResponse({ store, products, orders, userMessage, history = [], isBoss, senderPhone }) {
  const groqKey = process.env.GROQ_API_KEY || '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';

  const statusStr = ((store.status || '') + ';' + (store.business_type || '')).toLowerCase();
  const isServiceBusiness = (store.business_type === 'services') || 
    (store.activity_type === 'services') ||
    statusStr.includes('type=services') ||
    statusStr.includes('type=service') ||
    (products.length > 0 && products.every(p => (p.variants || '').toLowerCase().includes('service') || (p.variants || '').toLowerCase().includes('rdv') || (p.name || '').toLowerCase().includes('consultation') || (p.name || '').toLowerCase().includes('séance') || p.stock >= 900));

  const catalogContext = products.map(p => {
    if (isServiceBusiness) {
      return `- ${p.name} | Tarif: ${Number(p.price).toLocaleString('fr-FR')} FCFA | Modalité / Durée: ${p.variants || 'Sur rendez-vous'}`;
    }
    return `- ${p.name} | Prix: ${Number(p.price).toLocaleString('fr-FR')} FCFA | Stock: ${p.stock} | Variantes: ${p.variants || 'Standard'}`;
  }).join('\n');

  const totalSales = orders.reduce((s, o) => s + Number(o.amount), 0);

  // Configuration exclusive pour PRESTATAIRE DE SERVICES (Zéro livraison, Zéro stock)
  const serviceExecutionPrompt = `MODALITÉS D'EXÉCUTION & PRISE DE RENDEZ-VOUS (PRESTATIONS DE SERVICES) :
- RÈGLE FONDAMENTALE : Tu représentes un PRESTATAIRE DE SERVICES professionnel. Tu ne vends AUCUN produit physique à livrer.
- INTERDICTION FORMELLE : Ne parle JAMAIS de "livraison", "livreur", "coursier", "frais de livraison", "colis" ou "stock de produits" ! Ces termes sont totalement inadaptés et proscrits.
- Tu parles uniquement de : "prestations", "rendez-vous", "séances", "interventions", "disponibilités", "planning", "réservations" et "devis".
- Modalités d'exécution selon la demande du client :
  1. En présentiel (Au cabinet / salon / atelier) : situé à "${store.location}".
  2. À domicile : intervention possible au domicile du client sur rendez-vous selon la zone.
  3. En ligne / À distance : consultation ou séance à distance (téléphone, visio Google Meet/Zoom, WhatsApp).
- Horaires et jours de disponibilité : "${store.delivery_schedule || 'Du lundi au samedi de 08h à 19h sur rendez-vous'}".
- Prise de rendez-vous fluide : Invite le client à proposer sa date et son heure souhaitées. Dès qu'il choisit, récapitule la prestation, le tarif et communique les coordonnées Mobile Money pour valider la réservation avec acompte : ${store.payment_method} au numéro ${store.phone}.`;

  // Configuration pour BOUTIQUE PHYSIQUE (Gestion stock & livraison)
  const deliveryPolicyPrompt = (store.delivery_mode === 'pickup')
    ? `POLITIQUE DE RETRAIT SUR PLACE :\n- La boutique NE LIVRE PAS à domicile. Les clients viennent retirer leurs achats directement sur place.\n- Adresse exacte : ${store.location}\n- Horaires de retrait : ${store.delivery_schedule || 'Du lundi au samedi de 08h à 19h'}.`
    : `POLITIQUE DE LIVRAISON PAR COURSIER :\n- La boutique assure les livraisons par coursier selon ce programme : ${store.delivery_schedule || 'Livraisons du lundi au samedi entre 14h et 18h'}.\n- Adresse de la boutique : ${store.location}.\n- Demande le quartier exact du client pour organiser le coursier dès validation du paiement.`;

  const locationPrompt = isServiceBusiness
    ? `LOCALISATION & ADRESSE DU PROFESSIONNEL :
- Si le client demande l'adresse, la localisation ou où vous trouver :
  Donne immédiatement l'adresse exacte : "${store.location}".
  Précise les horaires d'accueil : "${store.delivery_schedule || 'Du lundi au samedi de 08h à 19h sur rendez-vous'}".
  Indique qu'il peut aussi convenir d'une intervention à domicile ou à distance si nécessaire.`
    : `DEMANDE D'ADRESSE ET DE LOCALISATION :
- Si le client dit "envoie la localisation", "vous êtes où", "je vais passer", "adresse", "c'est situé où" :
  Donne TOUJOURS précisément et immédiatement l'adresse : "${store.location}".
  Précise les horaires d'ouverture : "${store.delivery_schedule || 'Du lundi au samedi de 08h à 19h'}".`;

  const conversationLogicPrompt = `RÈGLES CAPITALES DE SUITE LOGIQUE DE CONVERSATION :
1. MÉMOIRE DE LA DISCUSSION :
   - Tu as accès aux messages précédents échangés avec ce client ci-dessous.
   - S'il a déjà exprimé son besoin plus haut, enchaîne directement sans redemander ce qu'il veut !
   - S'il dit "Tmoney", "Flooz", "Moov" ou demande comment payer, confirme le moyen de paiement pour valider son rendez-vous ou sa commande. Donne le récapitulatif du montant à transférer au numéro ${store.phone} (${store.payment_method}).

2. RÈGLE D'OR DE POLITESSE & ZÉRO RÉPÉTITION DE SALUTATION :
   - NE RÉPÈTE PAS "Bonjour" ni les salutations à chaque message dès que la conversation est en cours !
   - Enchaîne directement avec une réponse naturelle, professionnelle et concise.

3. QUESTIONS PERTINENTES, COMPLEXES OU CAS PARTICULIERS (RELAI AU RESPONSABLE) :
   - Si le client pose une question spécifique hors catalogue, demande un devis complexe sur mesure, négocie un tarif spécial ou si tu n'as pas l'information exacte :
     RÈGLE STRICTE : N'invente JAMAIS de fausse information.
     Réponds avec une politesse irréprochable :
     "C'est bien noté ! Je transmets votre demande directement à la responsable. Elle prendra personnellement la relève dès qu'elle est disponible."

4. LANGUE :
   - Réponds en FRANÇAIS par défaut.
   - Ne réponds en Éwé ou Mina QUE SI le client a expressément écrit lui-même dans cette langue.

5. ZÉRO EMOJI :
   - Interdiction stricte et formelle d'inclure le moindre emoji dans tes réponses.`;

  const bossPrompt = `MODE PATRON (INTERLOCUTEUR = GÉRANT / RESPONSABLE DU SERVICE) :
- L'interlocuteur est le GÉRANT / RESPONSABLE de "${store.name}".
- Réponds-lui poliment ("Bonjour Patron !" ou "Bonjour Madame la responsable !").
- S'il demande son bilan ("bilan", "ventes", "commandes", "chiffre", "rendez-vous") :
  Donne-lui le récapitulatif des ${orders.length} ${isServiceBusiness ? 'rendez-vous / prestations réservées' : 'commandes'} et du chiffre d'affaires total de ${totalSales.toLocaleString('fr-FR')} FCFA.
- S'il demande "qui a écrit ?" ou les alertes, informe-le s'il y a des clients en attente de réponse.
- S'il demande son abonnement ("abonnement", "forfait", "combien", "renouvellement") :
  * Forfait actif : Plan Pro (2 800 FCFA / mois)
  * Statut : Actif
  * Renouvellement Mobile Money : Moov Flooz au +228 96 09 82 23.`;

  const systemPrompt = isServiceBusiness
    ? `Tu es l'assistante officielle, hautement qualifiée et accueillante de "${store.name}", spécialisée dans les prestations de services.
Adresse / Localisation : ${store.location}.
Mode de règlement Mobile Money : ${store.payment_method} au numéro ${store.phone}.

PRESTATIONS & TARIFS DISPONIBLES :
${catalogContext || 'Prestations sur mesure sur rendez-vous.'}

BILAN DES PRESTATIONS :
- Rendez-vous / réservations enregistrés : ${orders.length}
- Montant total encaissé : ${totalSales.toLocaleString('fr-FR')} FCFA

${serviceExecutionPrompt}

${locationPrompt}

${isBoss ? bossPrompt : conversationLogicPrompt}

FORMAT DE RÉPONSE :
- Concise, chaleureuse et professionnelle : 2 à 4 phrases maximum par message.
- Zéro emoji.`
    : `Tu es l'assistante commerciale officielle et intelligente de "${store.name}", située à ${store.location}.
Mode de paiement Mobile Money : ${store.payment_method} au numéro ${store.phone}.

TYPE D'ACTIVITÉ : BOUTIQUE COMMERCIALE (Vente d'articles physiques)
- Tu informes sur les articles disponibles, les prix, les pointures/couleurs et les modalités de commande.

CATALOGUE ARTICLES DISPONIBLES :
${catalogContext || 'Articles disponibles.'}

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
