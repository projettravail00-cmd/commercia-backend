const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

let supabase = null;
let isRealSupabase = false;

if (supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('your-project')) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    isRealSupabase = true;
    console.log('[SUPABASE] Connected to real Supabase instance at:', supabaseUrl);
  } catch (err) {
    console.warn('[WARNING] Supabase connection failed, using resilient Mock DB:', err.message);
  }
} else {
  console.log('[INFO] SUPABASE_URL not configured yet. Running with In-Memory Database Engine.');
}

// In-Memory Database Engine (Mock) pour développement immédiat sans friction
const memoryDb = {
  stores: [
    {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Boutique Mode & Tech Lomé',
      phone: '+228 90 00 00 00',
      location: 'Lomé - Agoè',
      payment_method: 'T-Money (+228 Togo)',
      status: 'active',
      created_at: new Date().toISOString()
    }
  ],
  products: [
    {
      id: 1,
      store_id: '11111111-1111-1111-1111-111111111111',
      name: 'Sneakers Air Street Pro',
      price: 22000,
      stock: 6,
      variants: '41, 42, 43',
      image_url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400',
      created_at: new Date().toISOString()
    },
    {
      id: 2,
      store_id: '11111111-1111-1111-1111-111111111111',
      name: 'Montre Connectée AMOLED V4',
      price: 25000,
      stock: 4,
      variants: 'Noir, Argent',
      image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400',
      created_at: new Date().toISOString()
    }
  ],
  orders: [
    {
      id: 'CMD-8021',
      store_id: '11111111-1111-1111-1111-111111111111',
      client_name: 'Amina Kouassi',
      client_phone: '+228 90 23 45 67',
      item_name: 'Sneakers Air Street Pro (Taille 42)',
      amount: 23500,
      payment_method: 'T-Money',
      zone: 'Agoè Télécom',
      status: 'Payé • À livrer',
      created_at: new Date().toISOString()
    }
  ],
  messages: []
};

module.exports = {
  supabase,
  isRealSupabase,
  memoryDb
};
