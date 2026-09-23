-- Adicionar campos de auditoria para cálculo preciso de estoque
-- roll_width_used: Largura da bobina usada na conversão m² → m lineares
-- linear_meters_debited: Metros lineares efetivamente debitados do estoque

ALTER TABLE print_jobs ADD COLUMN roll_width_used real;
ALTER TABLE print_jobs ADD COLUMN linear_meters_debited real;
