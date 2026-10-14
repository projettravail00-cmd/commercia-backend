const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const pino = require('pino');
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers
} = require('@whiskeysockets/baileys');

const { supabase, isRealSupabase, memoryDb } = require('../config/supabase');
const { generateAIResponse } = require('./aiService');

const activeSessions = new Map();
const conversationHistories = new Map();

const SESSIONS_DIR = path.join(__dirname, '../../sessions');
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

async function getStoreData(storeId) {
  let store;
  let products = [];
  let orders = [];

  const sId = storeId || '11111111-1111-1111-1111-111111111111';

  try {
    if (isRealSupabase) {
      const { data: sData } = await supabase.from('stores').select('*').eq('id', sId).single();
      store = sData || { name: 'Boutique Lomé', phone: '+228 90 00 00 00', location: 'Lomé', payment_method: 'T-Money' };

      const { data: pData } = await supabase.from('products').select('*').eq('store_id', sId);
      products = pData || [];

      const { data: oData } = await supabase.from('orders').select('*').eq('store_id', sId);
      orders = oData || [];
    } else {
      store = memoryDb.stores.find(s => s.id === sId) || memoryDb.stores[0];
      products = memoryDb.products.filter(p => p.store_id === sId);
      orders = memoryDb.orders.filter(o => o.store_id === sId);
    }
  } catch (err) {
    console.warn('[WA-SERVICE] Erreur récupération données boutique:', err.message);
    store = { name: 'Boutique Lomé', phone: '+228 90 00 00 00', location: 'Lomé', payment_method: 'T-Money' };
  }

  return { store, products, orders };
}

async function launchSocket(storeId, forceClean = false) {
  const sId = storeId || '11111111-1111-1111-1111-111111111111';
  const storeSessionDir = path.join(SESSIONS_DIR, `store_${sId}`);

  if (forceClean && fs.existsSync(storeSessionDir)) {
    try {
      fs.rmSync(storeSessionDir, { recursive: true, force: true });
    } catch (e) {}
  }

  if (!fs.existsSync(storeSessionDir)) {
    fs.mkdirSync(storeSessionDir, { recursive: true });
  }

  let sessionObj = activeSessions.get(sId);
  if (!sessionObj) {
    sessionObj = {
      sock: null,
      qr: null,
      pairingCode: null,
      status: 'initializing',
      phone: null,
      lastActive: Date.now(),
      waiters: []
    };
    activeSessions.set(sId, sessionObj);
  } else {
    sessionObj.waiters = sessionObj.waiters || [];
  }

  // Si un socket existe déjà, on le ferme proprement avant de recréer
  if (sessionObj.sock) {
    try {
      sessionObj.sock.ev.removeAllListeners();
      sessionObj.sock.end();
    } catch (e) {}
    sessionObj.sock = null;
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(storeSessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      defaultQueryTimeoutMs: 60000,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000
    });

    sessionObj.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, { width: 280, margin: 2 });
          sessionObj.qr = qrDataUrl;
          sessionObj.status = 'scan_needed';
          console.log(`[WA-BAILEYS] Nouveau QR Code prêt pour boutique ${sId}`);

          // Notifier les requêtes HTTP en attente
          if (sessionObj.waiters && sessionObj.waiters.length > 0) {
            const waiters = sessionObj.waiters;
            sessionObj.waiters = [];
            waiters.forEach(fn => fn({ status: 'scan_needed', qr: qrDataUrl }));
          }
        } catch (qrErr) {
          console.error('[WA-BAILEYS] Erreur conversion QR Code:', qrErr);
        }
      }

      if (connection === 'open') {
        sessionObj.status = 'connected';
        sessionObj.qr = null;
        sessionObj.pairingCode = null;
        const jid = sock.user?.id || '';
        const phone = jid.split(':')[0] || jid.split('@')[0] || '';
        sessionObj.phone = phone ? `+${phone}` : 'Connecté';
        console.log(`[WA-BAILEYS] Session CONNECTÉE avec succès pour store ${sId} (Tél: ${sessionObj.phone})`);

        if (sessionObj.waiters && sessionObj.waiters.length > 0) {
          const waiters = sessionObj.waiters;
          sessionObj.waiters = [];
          waiters.forEach(fn => fn({ status: 'connected', phone: sessionObj.phone }));
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`[WA-BAILEYS] Connexion fermée pour store ${sId} (code: ${statusCode}, reconnexion: ${shouldReconnect})`);

        if (statusCode === DisconnectReason.loggedOut) {
          sessionObj.status = 'disconnected';
          sessionObj.qr = null;
          sessionObj.phone = null;
          sessionObj.pairingCode = null;
          try {
            fs.rmSync(storeSessionDir, { recursive: true, force: true });
          } catch (e) {}
        } else {
          // IMPORTANT: Après un scan QR ou un code d'appairage, WhatsApp ferme délibérément
          // la connexion avec le code 515 (restartRequired) pour finaliser l'enregistrement.
          // On DOIT relancer le socket immédiatement pour valider la synchronisation.
          const delay = statusCode === 515 ? 400 : 2500;
          console.log(`[WA-BAILEYS] Redémarrage immédiat du socket (${delay}ms) pour finaliser l'appairage...`);
          setTimeout(() => {
            launchSocket(sId, false).catch(err => {
              console.error('[WA-BAILEYS] Erreur lors du redémarrage socket:', err);
            });
          }, delay);
        }
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      try {
        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') continue;

          // Détecter si le commerçant s'écrit à lui-même ("Vous (Vous-même)" sur WhatsApp)
          const botPhone = (sock.user?.id || '').split(':')[0].split('@')[0];
          const isSelfChat = msg.key.fromMe && botPhone && remoteJid.startsWith(botPhone);

          // Si c'est un message envoyé par le téléphone à un autre client, on ne répond pas
          if (msg.key.fromMe && !isSelfChat) continue;

          const text = msg.message?.conversation ||
                       msg.message?.extendedTextMessage?.text ||
                       msg.message?.imageMessage?.caption ||
                       '';

          if (!text || text.trim() === '') continue;

          const senderPhone = remoteJid.split('@')[0];
          console.log(`[WA-BAILEYS] Message reçu de +${senderPhone} (Self-Chat: ${isSelfChat}) pour store ${sId}: "${text}"`);

          try {
            await sock.sendPresenceUpdate('composing', remoteJid);
          } catch (e) {}

          const { store, products, orders } = await getStoreData(sId);

          const cleanPhone = (p) => (p || '').replace(/[^0-9]/g, '');
          const isBoss = isSelfChat ||
                         cleanPhone(senderPhone) === cleanPhone(store.phone) ||
                         (store.owner_phone && cleanPhone(senderPhone) === cleanPhone(store.owner_phone));

          // Récupération de l'historique récent de la discussion
          const convKey = `${sId}_${cleanPhone(senderPhone)}`;
          let history = conversationHistories.get(convKey) || [];

          if (history.length === 0) {
            try {
              if (isRealSupabase) {
                const { data: dbMsgs } = await supabase
                  .from('messages')
                  .select('sender, content, created_at')
                  .eq('store_id', sId)
                  .eq('sender_phone', `+${cleanPhone(senderPhone)}`)
                  .order('created_at', { ascending: false })
                  .limit(6);
                if (dbMsgs && dbMsgs.length > 0) {
                  history = dbMsgs.reverse().map(m => ({
                    role: m.sender === 'client' ? 'user' : 'assistant',
                    content: m.content
                  }));
                }
              } else {
                const memMsgs = (memoryDb.messages || [])
                  .filter(m => m.store_id === sId && cleanPhone(m.sender_phone) === cleanPhone(senderPhone))
                  .slice(0, 6)
                  .reverse();
                history = memMsgs.map(m => ({
                  role: m.sender === 'client' ? 'user' : 'assistant',
                  content: m.content
                }));
              }
            } catch (histLoadErr) {
              console.warn('[WA-BAILEYS] Erreur lecture historique:', histLoadErr.message);
            }
          }

          let replyText = await generateAIResponse({
            store,
            products,
            orders,
            userMessage: text,
            history,
            isBoss,
            senderPhone: `+${senderPhone}`
          });

          if (!replyText) {
            replyText = `Merci pour votre message ! Bienvenue chez ${store.name}. Nos articles sont disponibles. Voulez-vous connaître nos prix, nos stocks ou nos modalités de paiement par ${store.payment_method} ?`;
          }

          replyText = replyText.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');

          // Mise à jour de la mémoire de conversation
          history.push({ role: 'user', content: text });
          history.push({ role: 'assistant', content: replyText });
          if (history.length > 10) history = history.slice(-10);
          conversationHistories.set(convKey, history);

          if (replyText.includes('transmets votre demande directement à la responsable') || replyText.includes('prendra personnellement la relève')) {
            console.log(`[WA-ALERTE-PATRON] Relai requis pour client +${senderPhone}: "${text}"`);
          }

          await new Promise(res => setTimeout(res, 800));

          await sock.sendMessage(remoteJid, { text: replyText });
          console.log(`[WA-BAILEYS] Réponse IA envoyée à +${senderPhone}`);

          try {
            const clientRecord = {
              store_id: sId,
              sender: isBoss ? 'boss' : 'client',
              sender_phone: `+${senderPhone}`,
              content: text,
              created_at: new Date().toISOString()
            };
            const botRecord = {
              store_id: sId,
              sender: 'bot',
              sender_phone: `+${senderPhone}`,
              content: replyText,
              created_at: new Date(Date.now() + 500).toISOString()
            };
            if (isRealSupabase) {
              await supabase.from('messages').insert([clientRecord, botRecord]);
            } else {
              memoryDb.messages.unshift(botRecord);
              memoryDb.messages.unshift(clientRecord);
            }
          } catch (histErr) {
            console.warn('[WA-BAILEYS] Erreur historique message:', histErr.message);
          }
        }
      } catch (upsertErr) {
        console.error('[WA-BAILEYS] Erreur traitement message upsert:', upsertErr);
      }
    });

  } catch (initErr) {
    console.error(`[WA-BAILEYS] Erreur initialisation socket pour ${sId}:`, initErr);
    sessionObj.status = 'disconnected';
  }

  return sessionObj;
}

async function getOrInitSession(storeId, forceReset = false) {
  const sId = storeId || '11111111-1111-1111-1111-111111111111';

  if (forceReset) {
    await disconnectSession(sId);
  }

  let session = activeSessions.get(sId);

  // Si déjà connecté, on retourne l'état
  if (session && session.status === 'connected') {
    return {
      status: 'connected',
      qr: null,
      phone: session.phone
    };
  }

  // Si un QR est déjà prêt et récent
  if (session && session.status === 'scan_needed' && session.qr && session.sock) {
    return {
      status: 'scan_needed',
      qr: session.qr,
      phone: null
    };
  }

  // Démarrer le socket
  launchSocket(sId, forceReset);

  // Attendre jusqu'à 6.5s que le QR soit généré pour répondre immédiatement à la requête HTTP
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const cur = activeSessions.get(sId);
      resolve({
        status: cur ? cur.status : 'initializing',
        qr: cur ? cur.qr : null,
        phone: cur ? cur.phone : null
      });
    }, 6500);

    const cur = activeSessions.get(sId);
    if (cur) {
      cur.waiters = cur.waiters || [];
      cur.waiters.push((result) => {
        clearTimeout(timer);
        resolve(result);
      });
    }
  });
}

async function requestPairingCode(storeId, rawPhone) {
  const sId = storeId || '11111111-1111-1111-1111-111111111111';
  const cleanPhone = (rawPhone || '').replace(/[^0-9]/g, '');

  if (!cleanPhone || cleanPhone.length < 8) {
    throw new Error('Numéro invalide. Précisez l\'indicatif pays sans le signe + (ex: 22890000000)');
  }

  let session = activeSessions.get(sId);
  if (!session || !session.sock) {
    await launchSocket(sId, false);
    session = activeSessions.get(sId);
  }

  // Attendre 1.5s pour que le socket soit bien en attente
  await new Promise(r => setTimeout(r, 1500));

  if (!session || !session.sock) {
    throw new Error('Impossible d\'initialiser le service WhatsApp');
  }

  if (session.status === 'connected') {
    return {
      success: true,
      status: 'connected',
      phone: session.phone
    };
  }

  const code = await session.sock.requestPairingCode(cleanPhone);
  session.pairingCode = code;
  console.log(`[WA-BAILEYS] Code d'appairage généré pour +${cleanPhone}: ${code}`);

  return {
    success: true,
    code,
    phone: cleanPhone,
    status: 'pairing_code_ready'
  };
}

function getSessionStatus(storeId) {
  const sId = storeId || '11111111-1111-1111-1111-111111111111';
  if (!activeSessions.has(sId)) {
    return { status: 'disconnected', qr: null, phone: null, pairingCode: null };
  }
  const s = activeSessions.get(sId);
  return {
    status: s.status,
    qr: s.qr,
    phone: s.phone,
    pairingCode: s.pairingCode
  };
}

async function disconnectSession(storeId) {
  const sId = storeId || '11111111-1111-1111-1111-111111111111';
  if (activeSessions.has(sId)) {
    const s = activeSessions.get(sId);
    if (s.sock) {
      try {
        s.sock.ev.removeAllListeners();
        await s.sock.logout();
      } catch (e) {}
    }
    activeSessions.delete(sId);
  }

  const storeSessionDir = path.join(SESSIONS_DIR, `store_${sId}`);
  if (fs.existsSync(storeSessionDir)) {
    try {
      fs.rmSync(storeSessionDir, { recursive: true, force: true });
    } catch (e) {}
  }

  return { success: true, message: 'Session réinitialisée avec succès' };
}

module.exports = {
  getOrInitSession,
  requestPairingCode,
  getSessionStatus,
  disconnectSession
};
