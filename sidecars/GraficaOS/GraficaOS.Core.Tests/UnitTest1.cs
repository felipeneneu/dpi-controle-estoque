using System;
using Xunit;
using GraficaOS.Core;

namespace GraficaOS.Core.Tests
{
    public class ImposicaoServiceTests
    {
        private readonly ImposicaoService _service;

        public ImposicaoServiceTests()
        {
            _service = new ImposicaoService();
        }

        [Fact]
        public void Calcular_1x1_SemSangriaOuEspaco()
        {
            var pdf = new PdfEntrada { LarguraMm = 210, AlturaMm = 297 };
            var param = new ParametrosRepeticao { Linhas = 1, Colunas = 1, EspacoMm = 0, SangriaMm = 0 };

            var result = _service.Calcular(pdf, param);

            Assert.Equal(1, result.TotalCopias);
            Assert.Equal(210.0, result.LarguraGradeMm);
            Assert.Equal(297.0, result.AlturaGradeMm);
        }

        [Fact]
        public void Calcular_19x39_SemSangriaOuEspaco()
        {
            var pdf = new PdfEntrada { LarguraMm = 10, AlturaMm = 10 };
            var param = new ParametrosRepeticao { Linhas = 19, Colunas = 39, EspacoMm = 0, SangriaMm = 0 };

            var result = _service.Calcular(pdf, param);

            Assert.Equal(741, result.TotalCopias);
            Assert.Equal(390.0, result.LarguraGradeMm);
            Assert.Equal(190.0, result.AlturaGradeMm);
        }

        [Fact]
        public void Calcular_ComSangriaEEspaco()
        {
            var pdf = new PdfEntrada { LarguraMm = 100, AlturaMm = 50 };
            var param = new ParametrosRepeticao { Linhas = 2, Colunas = 3, EspacoMm = 10, SangriaMm = 5 };

            var result = _service.Calcular(pdf, param);

            Assert.Equal(6, result.TotalCopias);
            // Largura = 3 * 100 + (2 * 10) + (2 * 5) = 300 + 20 + 10 = 330
            Assert.Equal(330.0, result.LarguraGradeMm);
            // Altura = 2 * 50 + (1 * 10) + (2 * 5) = 100 + 10 + 10 = 120
            Assert.Equal(120.0, result.AlturaGradeMm);
        }
    }
}
