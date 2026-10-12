const { supabase, isRealSupabase, memoryDb } = require('../config/supabase');

// GET /api/orders/:store_id
async function getOrders(req, res) {
  try {
    const { store_id } = req.params;
    if (isRealSupabase) {
      const { data, error } = await supabase.from('orders').select('*').eq('store_id', store_id).order('created_at', { ascending: false });
      if (error) throw error;
      return res.json(data);
    } else {
      const list = memoryDb.orders.filter(o => o.store_id === store_id);
      return res.json(list);
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// POST /api/orders
async function createOrder(req, res) {
  try {
    const { store_id, client_name, client_phone, item_name, amount, payment_method, zone, status } = req.body;
    
    const newOrder = {
      id: "CMD-" + Math.floor(1000 + Math.random() * 9000),
      store_id: store_id || '11111111-1111-1111-1111-111111111111',
      client_name: client_name || 'Client WhatsApp',
      client_phone: client_phone || '+228 90 00 00 00',
      item_name: item_name || 'Article Mode / Tech',
      amount: parseFloat(amount) || 0,
      payment_method: payment_method || 'T-Money (+228 Togo)',
      zone: zone || 'Lomé',
      status: status || 'Payé • À livrer',
      created_at: new Date().toISOString()
    };

    if (isRealSupabase) {
      const { data, error } = await supabase.from('orders').insert([newOrder]).select().single();
      if (error) throw error;
      return res.status(201).json({ success: true, order: data });
    } else {
      memoryDb.orders.unshift(newOrder);
      return res.status(201).json({ success: true, order: newOrder });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getOrders,
  createOrder
};
