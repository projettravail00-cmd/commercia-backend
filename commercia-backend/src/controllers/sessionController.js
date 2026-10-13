const whatsappService = require('../services/whatsappService');

/**
 * GET /api/session/qr
 * Initialise ou récupère le QR code de session pour la boutique
 */
async function getQrCode(req, res) {
  try {
    const storeId = req.query.store_id || '11111111-1111-1111-1111-111111111111';
    const sessionData = await whatsappService.getOrInitSession(storeId);
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
 * Vérifie l'état de connexion de la session WhatsApp
 */
function getStatus(req, res) {
  try {
    const storeId = req.query.store_id || '11111111-1111-1111-1111-111111111111';
    const statusData = whatsappService.getSessionStatus(storeId);
    return res.json({
      success: true,
      store_id: storeId,
      status: statusData.status,
      phone: statusData.phone
    });
  } catch (err) {
    console.error('[SESSION-CONTROLLER] Erreur getStatus:', err);
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
  disconnect
};
