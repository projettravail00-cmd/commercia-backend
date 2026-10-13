-- ==========================================
-- SCHÉMA DE BASE DE DONNÉES SUPABASE - COMMERCIA SAAS
-- Executer ce script dans le Supabase SQL Editor
-- ==========================================

-- Active l'extension UUID si non présente
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Table `stores` (Boutiques des commerçants)
CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    pin TEXT NOT NULL DEFAULT '1234', -- Code PIN secret de connexion (ex: 1234)
    location TEXT NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'T-Money (+228 Togo)',
    delivery_mode TEXT NOT NULL DEFAULT 'delivery', -- 'delivery' ou 'pickup'
    delivery_schedule TEXT DEFAULT 'Livraisons du lundi au samedi entre 14h et 18h par coursier. Frais selon quartier.',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Table `products` (Catalogue & Stocks d'articles)
CREATE TABLE IF NOT EXISTS public.products (
    id BIGSERIAL PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC NOT NULL CHECK (price >= 0),
    stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
    variants TEXT DEFAULT 'Standard',
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Table `orders` (Commandes & Factures enregistrées par le Bot)
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY, -- ex: 'CMD-8021'
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    client_name TEXT NOT NULL,
    client_phone TEXT NOT NULL,
    item_name TEXT NOT NULL,
    amount NUMERIC NOT NULL CHECK (amount >= 0),
    payment_method TEXT NOT NULL,
    zone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Payé • À livrer',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Table `messages` (Historique des échanges WhatsApp)
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    sender TEXT NOT NULL CHECK (sender IN ('client', 'bot', 'boss')),
    sender_phone TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes pour optimiser les requêtes multi-tenant
CREATE INDEX IF NOT EXISTS idx_products_store ON public.products(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_store ON public.orders(store_id);
CREATE INDEX IF NOT EXISTS idx_messages_store ON public.messages(store_id);

-- Données de démo initiales pour tester immédiatement
INSERT INTO public.stores (id, name, phone, location, payment_method)
VALUES ('11111111-1111-1111-1111-111111111111', 'Boutique Mode & Tech Lomé', '+228 90 00 00 00', 'Lomé - Agoè', 'T-Money (+228 Togo)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.products (id, store_id, name, price, stock, variants, image_url)
VALUES
(1, '11111111-1111-1111-1111-111111111111', 'Sneakers Air Street Pro', 22000, 6, '41, 42, 43', 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400'),
(2, '11111111-1111-1111-1111-111111111111', 'Montre Connectée AMOLED V4', 25000, 4, 'Noir, Argent', 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400'),
(3, '11111111-1111-1111-1111-111111111111', 'Écouteurs TWS Pro Réduction Bruit', 15000, 10, 'Blanc', 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.orders (id, store_id, client_name, client_phone, item_name, amount, payment_method, zone, status)
VALUES
('CMD-8021', '11111111-1111-1111-1111-111111111111', 'Amina Kouassi', '+228 90 23 45 67', 'Sneakers Air Street Pro (Taille 42)', 23500, 'T-Money', 'Agoè Télécom', 'Payé • À livrer'),
('CMD-8019', '11111111-1111-1111-1111-111111111111', 'Koffi Mensah', '+228 92 11 88 44', 'Montre Connectée AMOLED V4', 26000, 'Moov Money', 'Hédzranawoé', 'Payé • À livrer')
ON CONFLICT (id) DO NOTHING;
