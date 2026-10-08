namespace SeamsCLI.Logging;

public static class LogTemplates
{
    public const string ReadmeContent =
@"================================================================================
GraficaOS — SeamsCLI (Instruções para Teste de Emendas)
================================================================================

Obrigado por ajudar a testar o fatiador de emendas do GraficaOS!

Como testar:
1. Arraste ou aponte sua imagem/PDF para o script 'MontarEmendas.bat'.
2. Siga as instruções na tela escolhendo largura de bobina, margem, sobreposição,
   cor e espessura da linha-guia.
3. Seus painéis fatiados serão gerados na pasta de saída configurada.
4. Toda execução gera automaticamente um arquivo de diagnóstico detalhado nesta
   pasta 'logs/' (ex: 2026-10-08_14-30-00_banner.log).

Como enviar feedback e relatar problemas:
1. Abra o arquivo 'feedback.txt' ao lado e preencha suas impressões.
2. Zipe toda esta pasta 'logs/' (contendo os arquivos .log e seu feedback.txt).
3. Envie o arquivo compactado para a equipe de desenvolvimento.

Muito obrigado pela colaboração!
================================================================================
";

    public const string FeedbackContent =
@"================================================================================
GraficaOS — SeamsCLI (Formulário de Feedback de Emendas)
================================================================================

Nome do Operador/Testador:
Data do Teste:
Equipamento/Impressora Usada:

1. O QUE FUNCIONOU BEM?
[Escreva aqui o que você achou fácil, rápido ou que atendeu bem]


2. O QUE DEU ERRADO OU FOI DIFÍCIL?
[Descreva travamentos, mensagens confusas, medidas incorretas, etc.]


3. A LINHA-GUIA FICOU ADEQUADA NA EMENDA?
( ) Sim, espessura e cor perfeitas para o alinhamento
( ) Muito grossa / Muito fina
( ) Cor difícil de enxergar
Observações sobre a linha-guia:


4. SUGESTÕES DE MELHORIA / RECURSOS QUE FALTARAM:
[O que tornaria o seu dia a dia mais prático ao montar lonas?]


5. OUTRAS OBSERVAÇÕES:
[Qualquer comentário adicional]

================================================================================
";

    public static void EnsureTemplatesExist(string logDirectory)
    {
        try
        {
            if (!Directory.Exists(logDirectory))
            {
                Directory.CreateDirectory(logDirectory);
            }

            var readmePath = Path.Combine(logDirectory, "README.txt");
            if (!File.Exists(readmePath))
            {
                File.WriteAllText(readmePath, ReadmeContent);
            }

            var feedbackPath = Path.Combine(logDirectory, "feedback.txt");
            if (!File.Exists(feedbackPath))
            {
                File.WriteAllText(feedbackPath, FeedbackContent);
            }
        }
        catch
        {
            // Fail-safe: falhas ao gerar templates não abortam execução
        }
    }
}
