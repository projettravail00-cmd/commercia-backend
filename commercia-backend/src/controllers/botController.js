const { supabase, isRealSupabase, memoryDb } = require('../config/supabase');
const { generateAIResponse } = require('../services/aiService');
// GET /api/webhook/whatsapp (Handshake de vérification Meta WhatsApp Cloud API)
function verifyMetaWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.META_VERIFY_TOKEN || 'commercia_secret_token_2026';

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[WHATSAPP] Meta Webhook verified successfully');
    return res.status(200).send(challenge);
  } else {
    console.warn('[WHATSAPP] Verification failed: Token mismatch');
    return res.status(403).json({ error: 'Token de vérification invalide' });
  }
}

// POST /api/webhook/whatsapp
async function handleWhatsAppWebhook(req, res) {
  try {
    let { store_id, sender_phone, message, mode } = req.body || {};

    // Support natif des messages entrants via Meta WhatsApp Cloud API
    if (req.body && req.body.entry && req.body.entry[0] && req.body.entry[0].changes) {
      const change = req.body.entry[0].changes[0];
      if (change && change.value && change.value.messages && change.value.messages[0]) {
        const metaMsg = change.value.messages[0];
        if (metaMsg.type === 'text') {
          message = metaMsg.text.body;
          sender_phone = metaMsg.from;
        }
      }
    }

    const sId = store_id || '11111111-1111-1111-1111-111111111111';
    const lower = (message || '').trim().toLowerCase();

    // 1. Récupérer la boutique
    let store;
    if (isRealSupabase) {
      const { data } = await supabase.from('stores').select('*').eq('id', sId).single();
      store = data || { name: 'Boutique Lomé', phone: '+228 90 00 00 00', location: 'Lomé', payment_method: 'T-Money' };
    } else {
      store = memoryDb.stores.find(s => s.id === sId) || memoryDb.stores[0];
    }

    // Détection intelligente du mode
    const cleanPhone = (p) => (p || '').replace(/[^0-9]/g, '');
    const isOwnerPhone = cleanPhone(sender_phone) && cleanPhone(store.phone) && cleanPhone(sender_phone) === cleanPhone(store.phone);
    const isBossIntent = lower.includes('bilan') || lower.includes('caisse') || lower.includes('ga neni') || lower.includes('point des ventes') || lower.includes('arrivage');
    const isBoss = mode === 'boss' || isOwnerPhone || (isBossIntent && mode !== 'client');

    // 2. Récupérer les produits
    let products;
    if (isRealSupabase) {
      const { data } = await supabase.from('products').select('*').eq('store_id', sId);
      products = data || [];
    } else {
      products = memoryDb.products.filter(p => p.store_id === sId);
    }

    // 3. Récupérer les commandes
    let orders;
    if (isRealSupabase) {
      const { data } = await supabase.from('orders').select('*').eq('store_id', sId);
      orders = data || [];
    } else {
      orders = memoryDb.orders.filter(o => o.store_id === sId);
    }

    let replyText = '';
    let createdOrder = null;
    let createdProduct = null;

    // ========================================================
    // LOGIQUE MODE PATRON (Commerçant / Maman au Marché)
    // ========================================================
    if (isBoss) {
      const isBalance = lower.includes('bilan') || lower.includes('vente') || 
                        lower.includes('point') || lower.includes('ga neni') || 
                        lower.includes('combien j\'ai');

      const isAddProduct = lower.includes('nouveau') || lower.includes('ajoute') || 
                           lower.includes('arrivage') || lower.includes('va va') || 
                           lower.includes('yeye');

      if (isBalance) {
        const total = orders.reduce((s, o) => s + Number(o.amount), 0);
        const isEwe = lower.includes('ga neni') || lower.includes('asinye');

        if (isEwe) {
          replyText = `*[Bilan - ${store.name}]*\n• Asisiwo fe xexleme : *${orders.length} commandes*\n• Ga si va gé ɖe asinye : *${total.toLocaleString('fr-FR')} FCFA* (${store.payment_method})\n• Stock si susɔ : *${products.reduce((s, p) => s + p.stock, 0)} articles*\n\nNudzraɖoɖoa le zɔzɔm nyuie !`;
        } else {
          replyText = `*[Bilan des ventes - ${store.name}]*\n- ${orders.length} commandes enregistrées par l'IA\n- Chiffre d'affaires total encaissé : *${total.toLocaleString('fr-FR')} FCFA*\n- Mode Mobile Money actif : *${store.payment_method}*\n- Articles totaux en stock : *${products.reduce((s, p) => s + p.stock, 0)} pièces*\n\nTout est synchronisé sur votre compte marchand.`;
        }
      } 
      else if (isAddProduct) {
        const numbers = (message.match(/\d+[\s\d]*/g) || []).map(n => parseInt(n.replace(/\s/g, ''), 10));
        let detectedPrice = numbers.find(n => n >= 500) || 25000;
        let detectedStock = numbers.find(n => n < 100 && n !== detectedPrice) || 5;

        let prodName = "Pagne Wax Hollandais Prestige";
        let prodImg = "https://images.unsplash.com/photo-1590736969955-71cc94801759?w=400";

        if (lower.includes('robe')) {
          prodName = "Robe d'Été Fleurie";
          prodImg = "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=400";
        } else if (lower.includes('sandale') || lower.includes('chaussure')) {
          prodName = "Sandales Cuir Artisanales";
          prodImg = "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=400";
        } else if (lower.includes('montre') || lower.includes('tech')) {
          prodName = "Montre Quartz Luxe";
          prodImg = "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400";
        }

        createdProduct = {
          id: Date.now(),
          store_id: sId,
          name: prodName,
          price: detectedPrice,
          stock: detectedStock,
          variants: "Standard / Unique",
          image_url: prodImg,
          created_at: new Date().toISOString()
        };

        if (isRealSupabase) {
          await supabase.from('products').insert([createdProduct]);
        } else {
          memoryDb.products.unshift(createdProduct);
        }

        const isEwe = lower.includes('asinye') || lower.includes('va va') || lower.includes('yeye') || lower.includes('e-kpɔ');
        if (isEwe) {
          replyText = `*Akpé kaka Maman !*\nE-nyo ŋutɔ ! *${prodName}* le catalogue me fifia :\n• Ga neni (Prix) : *${detectedPrice.toLocaleString('fr-FR')} FCFA*\n• Stock : *${detectedStock} pièces*\n\nNe asisiwo bia ko, bot la a-fiae wo kple foto !`;
        } else {
          replyText = `*Bien reçu Patron !*\nArticle ajouté instantanément à votre catalogue :\n• Article : *${prodName}*\n• Prix de vente : *${detectedPrice.toLocaleString('fr-FR')} FCFA*\n• Stock enregistré : *${detectedStock} pièces*\n\nL'assistant IA présente déjà cet article à vos clients avec sa photo !`;
        }
      }
      else if (lower.includes('stock') || lower.includes('reste') || lower.includes('susɔ')) {
        const listStr = products.slice(0, 5).map(p => `• ${p.name} : *${p.stock} dispo* (${Number(p.price).toLocaleString('fr-FR')} F)`).join('\n');
        replyText = `*[État des stocks en direct]*\n${listStr}\n\nEnvoyez un vocal ou une photo pour ajouter un nouvel article à tout moment.`;
      } else {
        replyText = `[Confirmation CommercIA] Ordre bien enregistré pour la boutique *${store.name}*. Vous pouvez envoyer une photo ou dicter un arrivage en vocal (Français ou Éwé/Mina).`;
      }
    } 
    // ========================================================
    // LOGIQUE MODE CLIENT (Acheteur WhatsApp)
    // ========================================================
    else {
      if (lower.includes('e-kpɔ neni') || lower.includes('pagne le asinye') || lower.includes('ga neni')) {
        const p = products[0] || { name: 'Pagne Wax Hollandais', price: 25000, stock: 5 };
        replyText = `Woezo ! Ee, *${p.name}* le asinye !\n• E-kpɔ : *${Number(p.price).toLocaleString('fr-FR')} FCFA*\n• Stock si susɔ : *${p.stock} pièces*\n\nÈ-di be yeadze order via ${store.payment_method} a ?`;
      }
      else if (lower.includes('basket') || lower.includes('sneaker') || lower.includes('nike')) {
        const p = products.find(x => x.name.toLowerCase().includes('sneaker')) || products[0];
        if (p) {
          replyText = `Oui, les *${p.name}* sont disponibles !\n• Prix : *${Number(p.price).toLocaleString('fr-FR')} FCFA*\n• Tailles : ${p.variants}\n• Stock restant : *${p.stock} pièces*\n\nQuelle pointure souhaitez-vous réserver ?`;
        } else {
          replyText = `Nos baskets sont en stock. Quelle taille recherchez-vous ?`;
        }
      } 
      else if (lower.includes('montre')) {
        const p = products.find(x => x.name.toLowerCase().includes('montre')) || products[1];
        const pName = p ? p.name : 'Montre Connectée AMOLED V4';
        const pPrice = p ? Number(p.price).toLocaleString('fr-FR') : '25 000';
        replyText = `La *${pName}* est disponible à *${pPrice} FCFA*. Suivi santé et autonomie 7 jours. Dans quel quartier êtes-vous pour la livraison express ?`;
      } 
      else if (lower.includes('livr') || lower.includes('agoe') || lower.includes('agoè') || lower.includes('quartier')) {
        replyText = `Nous assurons la livraison rapide dans la zone de *${store.location}* !\n• Délai : Moins de 2h.\n• Tarif express : 1 000 à 1 500 FCFA.\n\nSouhaitez-vous valider votre commande par Mobile Money ?`;
      } 
      else if (lower.includes('payer') || lower.includes('t-money') || lower.includes('moov') || lower.includes('wave') || lower.includes('valide')) {
        const newCmdId = "CMD-" + Math.floor(1000 + Math.random() * 9000);
        replyText = `Parfait ! Voici le récapitulatif de votre commande auprès de *${store.name}* :\n\n[Facture Proforma ${newCmdId}]\n• Article : Sneakers Air Street Pro (Taille 42)\n• Montant net : 23 500 FCFA (livraison express incluse)\n• Mode de règlement : *${store.payment_method}*\n\nPour confirmer immédiatement le règlement, effectuez votre transfert au numéro marchand : *${store.phone}*.\n\nVotre colis est préparé dès réception du paiement !`;

        createdOrder = {
          id: newCmdId,
          store_id: sId,
          client_name: 'Client WhatsApp (' + store.payment_method + ')',
          client_phone: sender_phone || '+228 91 99 88 77',
          item_name: 'Sneakers Air Street Pro (Taille 42)',
          amount: 23500,
          payment_method: store.payment_method,
          zone: store.location,
          status: 'Payé • À livrer',
          created_at: new Date().toISOString()
        };

        if (isRealSupabase) {
          await supabase.from('orders').insert([createdOrder]);
        } else {
          memoryDb.orders.unshift(createdOrder);
        }
      } else {
        replyText = `Merci pour votre message ! Bienvenue chez *${store.name}*. Nos articles sont visibles dans le catalogue. Voulez-vous des informations sur nos stocks ou nos tarifs ?`;
      }
    }
 // Amélioration par IA générative (si configurée)
 if (!createdOrder && !createdProduct) {
   try {
     const aiReply = await generateAIResponse({
       store,
       products,
       orders,
       userMessage: message,
       isBoss,
       senderPhone: sender_phone
     });
     if (aiReply) {
       replyText = aiReply;
     }
   } catch (aiErr) {
     console.warn('[AI] Fallback utilisé:', aiErr.message);
   }
 }
    // Sauvegarder le message dans l'historique
    const msgRecord = {
      store_id: sId,
      sender: isBoss ? 'boss' : 'client',
      sender_phone: sender_phone || '+228 90 00 00 00',
      content: message,
      created_at: new Date().toISOString()
    };
    if (isRealSupabase) {
      await supabase.from('messages').insert([msgRecord]);
    } else {
      memoryDb.messages.unshift(msgRecord);
    }

    return res.json({
      success: true,
      reply: replyText,
      createdOrder,
      createdProduct
    });
  } catch (err) {
    console.error('Error handleWhatsAppWebhook:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  handleWhatsAppWebhook,
  verifyMetaWebhook
};
