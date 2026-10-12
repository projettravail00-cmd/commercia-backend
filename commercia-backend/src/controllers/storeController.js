const { supabase, isRealSupabase, memoryDb } = require('../config/supabase');

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// POST /api/stores/onboard
async function onboardStore(req, res) {
  try {
    const { name, phone, location, payment_method } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'Le nom et le téléphone de la boutique sont requis.' });
    }

    const newStore = {
      id: isRealSupabase ? undefined : generateUUID(),
      name,
      phone,
      location: location || 'Lomé, Togo',
      payment_method: payment_method || 'T-Money (+228 Togo)',
      status: 'active',
      whatsapp_status: 'connected',
      created_at: new Date().toISOString()
    };

    if (isRealSupabase) {
      const { data, error } = await supabase.from('stores').insert([newStore]).select().single();
      if (error) throw error;
      return res.status(201).json({ success: true, store: data });
    } else {
      memoryDb.stores.unshift(newStore);
      return res.status(201).json({ success: true, store: newStore });
    }
  } catch (err) {
    console.error('Error onboardStore:', err);
    return res.status(500).json({ error: err.message });
  }
}

// GET /api/stores/:id
async function getStore(req, res) {
  try {
    const { id } = req.params;

    if (isRealSupabase) {
      const { data: store, error: sErr } = await supabase.from('stores').select('*').eq('id', id).single();
      if (sErr) throw sErr;

      const { data: products } = await supabase.from('products').select('*').eq('store_id', id).order('created_at', { ascending: false });
      const { data: orders } = await supabase.from('orders').select('*').eq('store_id', id).order('created_at', { ascending: false });

      return res.json({ store, products: products || [], orders: orders || [] });
    } else {
      let store = memoryDb.stores.find(s => s.id === id) || memoryDb.stores[0];
      let products = memoryDb.products.filter(p => p.store_id === store.id);
      let orders = memoryDb.orders.filter(o => o.store_id === store.id);
      return res.json({ store, products, orders });
    }
  } catch (err) {
    console.error('Error getStore:', err);
    return res.status(500).json({ error: err.message });
  }
}

// PUT /api/stores/:id
async function updateStore(req, res) {
  try {
    const { id } = req.params;
    const { name, phone, location, payment_method, whatsapp_status } = req.body;

    if (isRealSupabase) {
      const { data, error } = await supabase.from('stores').update({ name, phone, location, payment_method, status: whatsapp_status }).eq('id', id).select().single();
      if (error) throw error;
      return res.json({ success: true, store: data });
    } else {
      let store = memoryDb.stores.find(s => s.id === id) || memoryDb.stores[0];
      if (name) store.name = name;
      if (phone) store.phone = phone;
      if (location) store.location = location;
      if (payment_method) store.payment_method = payment_method;
      if (whatsapp_status) store.whatsapp_status = whatsapp_status;
      return res.json({ success: true, store });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// GET /api/stores/:id/qr
async function getWhatsAppQr(req, res) {
  try {
    const { id } = req.params;
    const qrToken = `COMMERCIA_WA_SESSION_${id}_${Date.now()}`;
    return res.json({
      success: true,
      status: 'qr_ready',
      qrToken,
      expiresInSeconds: 30,
      pairingCode: Math.floor(100000 + Math.random() * 900000).toString()
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// POST /api/stores/:id/scan
async function confirmWhatsAppScan(req, res) {
  try {
    const { id } = req.params;
    if (!isRealSupabase) {
      let store = memoryDb.stores.find(s => s.id === id) || memoryDb.stores[0];
      store.whatsapp_status = 'connected';
      return res.json({
        success: true,
        status: 'connected',
        connectedAt: new Date().toISOString(),
        phone: store.phone
      });
    } else {
      const { data, error } = await supabase.from('stores').update({ status: 'connected' }).eq('id', id).select().single();
      if (error) throw error;
      return res.json({ success: true, status: 'connected', store: data });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  onboardStore,
  getStore,
  updateStore,
  getWhatsAppQr,
  confirmWhatsAppScan
};
