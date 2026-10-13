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

async function getOrInitSession(storeId) {
  const sId = storeId || '11111111-1111-1111-1111-111111111111';

  if (activeSessions.has(sId)) {
    const existing = activeSessions.get(sId);
    if (existing.status === 'connected' || existing.qr) {
      return {
        status: existing.status,
        qr: existing.qr,
        phone: existing.phone
      };
    }
  }

  const storeSessionDir = path.join(SESSIONS_DIR, `store_${sId}`);
  if (!fs.existsSync(storeSessionDir)) {
    fs.mkdirSync(storeSessionDir, { recursive: true });
  }

  const sessionObj = {
    sock: null,
    qr: null,
    status: 'initializing',
    phone: null,
    lastActive: Date.now()
  };
  activeSessions.set(sId, sessionObj);

  try {
    const { state, saveCreds } = await useMultiFileAuthState(storeSessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: Browsers.macOS('Desktop'),
      syncFullHistory: false
    });

    sessionObj.sock = sock;

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, { width: 280, margin: 2 });
          sessionObj.qr = qrDataUrl;
          sessionObj.status = 'scan_needed';
          console.log(`[WA-BAILEYS] Nouveau QR Code prêt pour store ${sId}`);
        } catch (qrErr) {
          console.error('[WA-BAILEYS] Erreur conversion QR Code:', qrErr);
        }
      }

      if (connection === 'open') {
        sessionObj.status = 'connected';
        sessionObj.qr = null;
        const jid = sock.user?.id || '';
        const phone = jid.split(':')[0] || jid.split('@')[0] || '';
        sessionObj.phone = phone ? `+${phone}` : 'Connecté';
        console.log(`[WA-BAILEYS] Session CONNECTÉE avec succès pour store ${sId} (Tél: ${sessionObj.phone})`);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`[WA-BAILEYS] Connexion fermée pour store ${sId} (code: ${statusCode}, reconnexion: ${shouldReconnect})`);

        if (shouldReconnect) {
          setTimeout(() => {
            getOrInitSession(sId);
          }, 3000);
        } else {
          sessionObj.status = 'disconnected';
          sessionObj.qr = null;
          sessionObj.phone = null;
          try {
            fs.rmSync(storeSessionDir, { recursive: true, force: true });
          } catch (e) {}
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
      try {
        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
          if (msg.key.fromMe) continue;

          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') continue;

          const text = msg.message?.conversation ||
                       msg.message?.extendedTextMessage?.text ||
                       msg.message?.imageMessage?.caption ||
                       '';

          if (!text || text.trim() === '') continue;

          const senderPhone = remoteJid.split('@')[0];
          console.log(`[WA-BAILEYS] Message reçu de +${senderPhone} pour store ${sId}: "${text}"`);

          try {
            await sock.sendPresenceUpdate('composing', remoteJid);
          } catch (e) {}

          const { store, products, orders } = await getStoreData(sId);

          const cleanPhone = (p) => (p || '').replace(/[^0-9]/g, '');
          const isBoss = cleanPhone(senderPhone) === cleanPhone(store.phone);

          let replyText = await generateAIResponse({
            store,
            products,
            orders,
            userMessage: text,
            isBoss,
            senderPhone: `+${senderPhone}`
          });

          if (!replyText) {
            replyText = `Merci pour votre message ! Bienvenue chez ${store.name}. Nos articles sont disponibles. Voulez-vous connaître nos prix, nos stocks ou nos modalités de paiement par ${store.payment_method} ?`;
          }

          replyText = replyText.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');

          await new Promise(res => setTimeout(res, 800));

          await sock.sendMessage(remoteJid, { text: replyText });
          console.log(`[WA-BAILEYS] Réponse IA envoyée à +${senderPhone}`);

          try {
            const msgRecord = {
              store_id: sId,
              sender: isBoss ? 'boss' : 'client',
              sender_phone: `+${senderPhone}`,
              content: text,
              created_at: new Date().toISOString()
            };
            if (isRealSupabase) {
              await supabase.from('messages').insert([msgRecord]);
            } else {
              memoryDb.messages.unshift(msgRecord);
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
    console.error(`[WA-BAILEYS] Erreur initialisation session pour ${sId}:`, initErr);
    sessionObj.status = 'disconnected';
  }

  return {
    status: sessionObj.status,
    qr: sessionObj.qr,
    phone: sessionObj.phone
  };
}

function getSessionStatus(storeId) {
  const sId = storeId || '11111111-1111-1111-1111-111111111111';
  if (!activeSessions.has(sId)) {
    return { status: 'disconnected', qr: null, phone: null };
  }
  const s = activeSessions.get(sId);
  return {
    status: s.status,
    qr: s.qr,
    phone: s.phone
  };
}

async function disconnectSession(storeId) {
  const sId = storeId || '11111111-1111-1111-1111-111111111111';
  if (activeSessions.has(sId)) {
    const s = activeSessions.get(sId);
    if (s.sock) {
      try {
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

  return { success: true, message: 'Session déconnectée avec succès' };
}

module.exports = {
  getOrInitSession,
  getSessionStatus,
  disconnectSession
};
