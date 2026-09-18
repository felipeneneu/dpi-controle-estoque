const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: 'C:/Users/impressao/Desktop/dpi-controle-estoque-main/dpi-controle-estoque-main/grafica-app/backend/.env' });
const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

function getPdfHeightMm(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    const str = buf.toString('latin1');
    const m = str.match(/\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/);
    if (!m) return null;
    const hPt = Math.abs(parseFloat(m[4]) - parseFloat(m[2]));
    const wPt = Math.abs(parseFloat(m[3]) - parseFloat(m[1]));
    const ptToMm = 25.4 / 72.0;
    return {
      widthMm: Number((wPt * ptToMm).toFixed(2)),
      heightMm: Number((hPt * ptToMm).toFixed(2))
    };
  } catch (e) {
    return null;
  }
}

async function main() {
  const jobs = await client.execute("SELECT id, key_filename, source_file, result, arrange_cnt, print_s_time, print_e_time, ink_total_cc FROM mimaki_test_jobs ORDER BY print_s_time DESC");

  console.log('=== AUDITORIA REAL: METRAGEM LINEAR DAS IMPRESSÕES FÍSICAS ===\n');

  // Diretório base
  const baseDir = 'J:/DPI Inteligência Gráfica/Gráfica Rápida/Arquivos para Impressão/Mimaki UCJV 300-75';

  for (const row of jobs.rows) {
    const filename = row.key_filename;
    const arrangeCnt = row.arrange_cnt || 1;

    // Procura o arquivo correspondente nas pastas da J:
    let pdfPath = null;
    try {
      const folders = fs.readdirSync(baseDir);
      for (const f of folders) {
        const fullFolder = path.join(baseDir, f);
        if (fs.statSync(fullFolder).isDirectory()) {
          const saidaDir = path.join(fullFolder, 'Saida');
          if (fs.existsSync(saidaDir) && fs.statSync(saidaDir).isDirectory()) {
            const candidate = path.join(saidaDir, filename);
            if (fs.existsSync(candidate)) {
              pdfPath = candidate;
              break;
            }
          }
        }
      }
    } catch (_) {}

    let dim = null;
    if (pdfPath) {
      dim = getPdfHeightMm(pdfPath);
    }

    const heightMm = dim?.heightMm ?? 0;
    const widthMm = dim?.widthMm ?? 0;
    const linearMeters = heightMm > 0 ? Number(((heightMm * arrangeCnt) / 1000).toFixed(3)) : null;

    console.log(`OS: ${filename.slice(0, 35)}...`);
    console.log(`  - Arquivo: "${filename}"`);
    console.log(`  - Status: ${row.result} | Print: ${row.print_s_time} | Tinta: ${row.ink_total_cc} cc`);
    console.log(`  - ARRANGE_CNT: ${arrangeCnt}`);
    if (dim) {
      console.log(`  - Dimensões do PDF: ${widthMm} mm (largura) x ${heightMm} mm (altura Y)`);
      console.log(`  -> METRAGEM LINEAR FÍSICA = (${heightMm} mm * ${arrangeCnt}) / 1000 = ${linearMeters} METROS`);
    } else {
      console.log(`  - [PDF não localizado na pasta Saida para leitura direta da MediaBox]`);
    }
    console.log('--------------------------------------------------------------------------------');
  }
}

main().catch(console.error);
