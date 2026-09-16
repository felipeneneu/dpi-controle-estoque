CREATE TABLE IF NOT EXISTS imposition_jobs (
    id TEXT PRIMARY KEY,
    nome_job TEXT NOT NULL,
    caminho_origem TEXT NOT NULL,
    caminho_saida TEXT,
    motor TEXT CHECK(motor IN ('CLI_NET', 'ILLUSTRATOR_COM')) NOT NULL,
    material_id TEXT,
    largura_substrato_mm REAL NOT NULL,
    altura_substrato_mm REAL NOT NULL,
    copias_solicitadas INTEGER NOT NULL,
    copias_produzidas INTEGER NOT NULL,
    grade_config TEXT NOT NULL, -- JSON com cols, rows, gap, margins, rotate
    tempo_execucao_ms INTEGER,
    status TEXT CHECK(status IN ('pendente', 'processando', 'concluido', 'falhou')) NOT NULL DEFAULT 'pendente',
    mensagem_erro TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
