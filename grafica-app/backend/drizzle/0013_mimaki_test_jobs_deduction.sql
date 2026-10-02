-- Sintonia entre `src/db/schema.ts` e a tabela criada em 0011.
--
-- `mimaki_test_jobs` foi criada em 0011 sem as colunas que o schema declares.
-- A mais grave é `stock_deducted`: `deductMimakiStockForJob` filtra por ela na
-- guarda "o watcher físico já baixou este job?", e a query estourava
-- `no such column: stock_deducted` em TODA chamada - o watcher, o bind manual e
-- o reconciliador. Ou seja, nenhuma dedução Mimaki funcionava, e o operador
-- via um erro genérico sem saber que nada foi baixado.
--
-- As demais (`stock_item_id`, `bobina_id`, `mimaki_job_id`, `parsed_bobina_serial`,
-- `height_mm`, `linear_meters`) já eram referenciadas pelo código do watcher sem
-- existirem no banco: mesma classe de bug, mesma correção.
--
-- Esta migration é gerada do schema (fonte da verdade), não do SQL da 0011. As
-- tabelas de 0012 (`cartuchos`, `cartucho_consumo`) NÃO entram aqui: a 0012 já
-- as cria, e um `CREATE TABLE` duplicado abortaria a migração em qualquer banco
-- que já rodou a 0012.
ALTER TABLE `mimaki_test_jobs` ADD `parsed_bobina_serial` text;--> statement-breakpoint
ALTER TABLE `mimaki_test_jobs` ADD `height_mm` real;--> statement-breakpoint
ALTER TABLE `mimaki_test_jobs` ADD `linear_meters` real;--> statement-breakpoint
ALTER TABLE `mimaki_test_jobs` ADD `stock_deducted` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `mimaki_test_jobs` ADD `stock_item_id` text REFERENCES stock_items(id);--> statement-breakpoint
ALTER TABLE `mimaki_test_jobs` ADD `bobina_id` text REFERENCES bobinas(id);--> statement-breakpoint
ALTER TABLE `mimaki_test_jobs` ADD `mimaki_job_id` text REFERENCES mimaki_jobs(id);