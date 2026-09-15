const path = require('node:path');
const fs = require('node:fs');
const { launchImpositionSidecar, resolveImposerExecutable } = require('../sidecars/imposer-sidecar.js');

async function runTest() {
  console.log('=== TESTE DE INTEGRAÇÃO DO SIDECAR IMPOSITOR KONICA ===\n');

  const exePath = resolveImposerExecutable();
  console.log(`1. Resolução do caminho do executável:`);
  console.log(`   Caminho esperado: ${exePath}`);
  console.log(`   Existe no disco? ${fs.existsSync(exePath) ? 'SIM ✅' : 'NÃO ❌ (Necessário compilar o projeto C# primeiro)'}\n`);

  if (!fs.existsSync(exePath)) {
    console.log('Para compilar o sidecar C#, execute:');
    console.log('  cd sidecars/ImpositorKonica');
    console.log('  dotnet publish -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true /p:IncludeNativeLibrariesForSelfExtract=true\n');
    process.exit(1);
  }

  const samplePath = path.resolve(__dirname, '../../sidecars/ImpositorKonica/sample-payload.json');
  const payload = JSON.parse(fs.readFileSync(samplePath, 'utf-8'));

  console.log('2. Disparando sidecar via launchImpositionSidecar()...');
  const result = await launchImpositionSidecar(payload);

  console.log('\n3. Resultado retornado pelo Sidecar:');
  console.log(JSON.stringify(result, null, 2));

  if (result.success) {
    console.log('\n✅ TESTE CONCLUÍDO COM SUCESSO!');
  } else {
    console.log('\n❌ PROCESSO RETORNOU ERRO:', result.error);
  }
}

runTest().catch((err) => {
  console.error('Erro fatal no teste:', err);
  process.exit(1);
});
