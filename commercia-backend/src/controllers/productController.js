const { supabase, isRealSupabase, memoryDb } = require('../config/supabase');

// GET /api/products/:store_id
async function getProducts(req, res) {
  try {
    const { store_id } = req.params;
    if (isRealSupabase) {
      const { data, error } = await supabase.from('products').select('*').eq('store_id', store_id).order('created_at', { ascending: false });
      if (error) throw error;
      return res.json(data);
    } else {
      const list = memoryDb.products.filter(p => p.store_id === store_id);
      return res.json(list);
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// POST /api/products
async function addProduct(req, res) {
  try {
    const { store_id, name, price, stock, variants, image_url } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ error: 'Le nom et le prix du produit sont obligatoires.' });
    }

    const newProd = {
      store_id: store_id || '11111111-1111-1111-1111-111111111111',
      name,
      price: parseFloat(price),
      stock: parseInt(stock, 10) || 1,
      variants: variants || 'Standard',
      image_url: image_url || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400',
      created_at: new Date().toISOString()
    };

    if (isRealSupabase) {
      const { data, error } = await supabase.from('products').insert([newProd]).select().single();
      if (error) throw error;
      return res.status(201).json({ success: true, product: data });
    } else {
      newProd.id = Date.now();
      memoryDb.products.unshift(newProd);
      return res.status(201).json({ success: true, product: newProd });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// PATCH /api/products/:id/stock
async function adjustStock(req, res) {
  try {
    const { id } = req.params;
    const { delta } = req.body; // +1 or -1

    if (isRealSupabase) {
      const { data: current } = await supabase.from('products').select('stock').eq('id', id).single();
      const newStock = Math.max(0, (current ? current.stock : 0) + parseInt(delta, 10));
      const { data, error } = await supabase.from('products').update({ stock: newStock }).eq('id', id).select().single();
      if (error) throw error;
      return res.json({ success: true, product: data });
    } else {
      const p = memoryDb.products.find(x => String(x.id) === String(id));
      if (p) {
        p.stock = Math.max(0, p.stock + parseInt(delta, 10));
        return res.json({ success: true, product: p });
      }
      return res.status(404).json({ error: 'Produit non trouvé' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getProducts,
  addProduct,
  adjustStock
};
