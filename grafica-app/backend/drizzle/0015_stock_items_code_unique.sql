-- Migration 0015: Tornar stock_items.code UNIQUE NOT NULL
-- ADR-XXX: SKU unico por item de estoque

-- 1. Limpar duplicatas existentes (caso existam do seed anterior)
-- Mantem apenas o primeiro registro de cada codigo (case-insensitive)
DELETE FROM stock_items
WHERE id NOT IN (
  SELECT MIN(id)
  FROM stock_items
  WHERE code IS NOT NULL AND code != ''
  GROUP BY lower(code)
);

-- 2. Definir codigo vazio como NULL para permitir o UNIQUE parcial
UPDATE stock_items SET code = NULL WHERE code = '';

-- 3. Criar indice unico parcial (apenas para codes nao nulos)
CREATE UNIQUE INDEX stock_items_code_uq ON stock_items(lower(code)) WHERE code IS NOT NULL;