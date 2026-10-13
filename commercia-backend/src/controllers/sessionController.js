const whatsappService = require('../services/whatsappService');

/**
 * GET /api/session/qr
 * Initialise ou récupère le QR code de session pour la boutique
 */
async function getQrCode(req, res) {
  try {
    const storeId = req.query.store_id || '11111111-1111-1111-1111-111111111111';
    const forceReset = req.query.force === 'true' || req.query.reset === 'true';
    const sessionData = await whatsappService.getOrInitSession(storeId, forceReset);
    return res.json({
      success: true,
      store_id: storeId,
      status: sessionData.status,
      qr: sessionData.qr,
      phone: sessionData.phone
    });
  } catch (err) {
    console.error('[SESSION-CONTROLLER] Erreur getQrCode:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * GET /api/session/status
 * Vérifie l'état de connexion de la session WhatsApp (renvoie aussi le QR si mis à jour)
 */
function getStatus(req, res) {
  try {
    const storeId = req.query.store_id || '11111111-1111-1111-1111-111111111111';
    const statusData = whatsappService.getSessionStatus(storeId);
    return res.json({
      success: true,
      store_id: storeId,
      status: statusData.status,
      phone: statusData.phone,
      qr: statusData.qr,
      pairingCode: statusData.pairingCode
    });
  } catch (err) {
    console.error('[SESSION-CONTROLLER] Erreur getStatus:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/session/pairing-code
 * Génère un code d'appairage à 8 caractères pour lier WhatsApp par numéro
 */
async function getPairingCode(req, res) {
  try {
    const storeId = req.body.store_id || '11111111-1111-1111-1111-111111111111';
    const phone = req.body.phone;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Numéro de téléphone requis' });
    }
    const result = await whatsappService.requestPairingCode(storeId, phone);
    return res.json(result);
  } catch (err) {
    console.error('[SESSION-CONTROLLER] Erreur getPairingCode:', err);
    return res.status(400).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/session/reset
 * Réinitialise complètement la session pour repartir d'un état propre
 */
async function reset(req, res) {
  try {
    const storeId = req.body.store_id || '11111111-1111-1111-1111-111111111111';
    await whatsappService.disconnectSession(storeId);
    const sessionData = await whatsappService.getOrInitSession(storeId, true);
    return res.json({
      success: true,
      store_id: storeId,
      status: sessionData.status,
      qr: sessionData.qr
    });
  } catch (err) {
    console.error('[SESSION-CONTROLLER] Erreur reset:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/session/disconnect
 * Déconnecte la session WhatsApp
 */
async function disconnect(req, res) {
  try {
    const storeId = req.body.store_id || '11111111-1111-1111-1111-111111111111';
    const result = await whatsappService.disconnectSession(storeId);
    return res.json(result);
  } catch (err) {
    console.error('[SESSION-CONTROLLER] Erreur disconnect:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getQrCode,
  getStatus,
  getPairingCode,
  reset,
  disconnect
};
