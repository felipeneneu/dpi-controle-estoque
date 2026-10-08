using Xunit;

// Desativa paralelismo entre classes de teste nesta suíte porque os testes redirecionam Console.Out e Console.Error globais
[assembly: CollectionBehavior(DisableTestParallelization = true)]
