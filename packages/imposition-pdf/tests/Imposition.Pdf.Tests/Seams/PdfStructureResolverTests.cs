using System;
using System.Collections.Generic;
using FluentAssertions;
using Imposition.Core.Errors;
using Imposition.Pdf.Seams;
using Xunit;

namespace Imposition.Pdf.Tests.Seams;

[Trait("Category", "StructureResolver")]
public class PdfStructureResolverTests
{
    [Fact]
    public void ResolveTrailerSize_SingleTrailer_ReturnsCorrectSize()
    {
        var pdf = """
            %PDF-1.3
            1 0 obj
            << /Type /Catalog >>
            endobj
            trailer
            <<
              /Root 1 0 R
              /Size 15
            >>
            startxref
            120
            %%EOF
            """;

        int size = PdfStructureResolver.ResolveTrailerSize(pdf);
        size.Should().Be(15);
    }

    [Fact]
    public void ResolveTrailerSize_MultipleTrailers_ReturnsSizeFromLastTrailer()
    {
        var pdf = """
            %PDF-1.3
            1 0 obj
            << /Type /Catalog >>
            endobj
            trailer
            <<
              /Size 10
            >>
            startxref
            100
            %%EOF
            2 0 obj
            << /Type /Page >>
            endobj
            trailer
            <<
              /Size 25
              /Prev 100
            >>
            startxref
            250
            %%EOF
            """;

        int size = PdfStructureResolver.ResolveTrailerSize(pdf);
        size.Should().Be(25);
    }

    [Fact]
    public void ResolveTrailerSize_MissingSize_ThrowsInvalidTrailerError()
    {
        var pdf = """
            %PDF-1.3
            1 0 obj
            << /Type /Catalog >>
            endobj
            trailer
            <<
              /Root 1 0 R
            >>
            startxref
            100
            %%EOF
            """;

        var act = () => PdfStructureResolver.ResolveTrailerSize(pdf);
        act.Should().Throw<ImpositionException>()
            .WithMessage("*E_PDF_INVALID_TRAILER*");
    }

    [Fact]
    public void ResolveLastStartXref_ReturnsOffset()
    {
        var pdf = """
            %PDF-1.3
            trailer
            << /Size 5 >>
            startxref
            12345
            %%EOF
            """;

        long offset = PdfStructureResolver.ResolveLastStartXref(pdf);
        offset.Should().Be(12345);
    }

    [Fact]
    public void ResolveResources_InheritedFromParent_ResolvesParentResources()
    {
        var pdf = """
            %PDF-1.3
            2 0 obj
            <<
              /Type /Pages
              /Count 1
              /Kids [ 3 0 R ]
              /Resources << /Font << /F1 10 0 R >> >>
            >>
            endobj
            3 0 obj
            <<
              /Type /Page
              /Parent 2 0 R
              /MediaBox [ 0 0 500 500 ]
            >>
            endobj
            """;

        var objs = PdfStructureResolver.ParseObjects(pdf);
        var page = objs[3];

        string resources = PdfStructureResolver.ResolveResources(page, objs);
        resources.Should().Contain("/Font << /F1 10 0 R >>");
    }

    [Fact]
    public void ResolveRotate_InheritedFromParent_ResolvesParentRotate()
    {
        var pdf = """
            %PDF-1.3
            2 0 obj
            <<
              /Type /Pages
              /Count 1
              /Rotate 90
            >>
            endobj
            3 0 obj
            <<
              /Type /Page
              /Parent 2 0 R
              /MediaBox [ 0 0 500 500 ]
            >>
            endobj
            """;

        var objs = PdfStructureResolver.ParseObjects(pdf);
        var page = objs[3];

        int rotate = PdfStructureResolver.ResolveRotate(page, objs);
        rotate.Should().Be(90);
    }

    [Fact]
    public void ResolveSinglePage_MultiPagePdf_RejectsWithMultiPageUnsupported()
    {
        var pdf = """
            %PDF-1.3
            2 0 obj
            <<
              /Type /Pages
              /Count 2
              /Kids [ 3 0 R 4 0 R ]
            >>
            endobj
            3 0 obj
            <<
              /Type /Page
              /Parent 2 0 R
              /MediaBox [ 0 0 100 100 ]
            >>
            endobj
            4 0 obj
            <<
              /Type /Page
              /Parent 2 0 R
              /MediaBox [ 0 0 100 100 ]
            >>
            endobj
            trailer
            << /Size 10 >>
            startxref
            500
            %%EOF
            """;

        var objs = PdfStructureResolver.ParseObjects(pdf);
        var act = () => PdfStructureResolver.ResolveSinglePage(pdf, objs);

        act.Should().Throw<ImpositionException>()
            .WithMessage("*E_PDF_MULTI_PAGE_UNSUPPORTED*");
    }

    [Fact]
    public void FormXObjectBuilder_SingleStream_BuildsSingleFormXObjectVerbatim()
    {
        var pdf = """
            %PDF-1.3
            14 0 obj
            <<
              /Filter /FlateDecode
              /Length 12
            >>
            stream
            samplebytes1
            endstream
            endobj
            """;

        var objs = PdfStructureResolver.ParseObjects(pdf);
        var def = FormXObjectBuilder.BuildFormXObject(
            startNewObjId: 20,
            sourceWidthPt: 1000,
            sourceHeightPt: 500,
            resourcesText: "<< /XObject << /Im1 5 0 R >> >>",
            contentStreamObjNums: new[] { 14 },
            objects: objs);

        def.FormObjNum.Should().Be(20);
        def.SubFormObjects.Should().BeEmpty();
        def.FormObjectText.Should().Contain("/Type /XObject");
        def.FormObjectText.Should().Contain("/Subtype /Form");
        def.FormObjectText.Should().Contain("/BBox [0 0 1000 500]");
        def.FormObjectText.Should().Contain("/Filter /FlateDecode");
        def.FormObjectText.Should().Contain("samplebytes1");
    }

    [Fact]
    public void FormXObjectBuilder_MultiStream_BuildsSubFormsAndContainer()
    {
        var pdf = """
            %PDF-1.3
            14 0 obj
            <<
              /Length 6
            >>
            stream
            partA
            endstream
            endobj
            15 0 obj
            <<
              /Length 6
            >>
            stream
            partB
            endstream
            endobj
            """;

        var objs = PdfStructureResolver.ParseObjects(pdf);
        var def = FormXObjectBuilder.BuildFormXObject(
            startNewObjId: 20,
            sourceWidthPt: 1000,
            sourceHeightPt: 500,
            resourcesText: "<< >>",
            contentStreamObjNums: new[] { 14, 15 },
            objects: objs);

        // 2 sub-forms (IDs 20 e 21) e 1 container (ID 22)
        def.SubFormObjects.Should().HaveCount(2);
        def.SubFormObjects[0].ObjNum.Should().Be(20);
        def.SubFormObjects[0].ObjectText.Should().Contain("partA");
        def.SubFormObjects[1].ObjNum.Should().Be(21);
        def.SubFormObjects[1].ObjectText.Should().Contain("partB");

        def.FormObjNum.Should().Be(22);
        def.FormObjectText.Should().Contain("/SubFm1 20 0 R");
        def.FormObjectText.Should().Contain("/SubFm2 21 0 R");
        def.FormObjectText.Should().Contain("/SubFm1 Do");
        def.FormObjectText.Should().Contain("/SubFm2 Do");
    }

    [Fact]
    public void ExtractBalancedDictionary_NestedDictionaries_ExtractsFullBalancedContent()
    {
        string raw = "/Type /Page /Resources << /ColorSpace << /CS1 /DeviceCMYK >> /XObject << /Im1 10 0 R /Im2 << /Sub 1 0 R >> >> >> /Rotate 0";
        int resIdx = raw.IndexOf("/Resources", StringComparison.Ordinal);

        string? dict = PdfStructureResolver.ExtractBalancedDictionary(raw, resIdx);

        dict.Should().NotBeNull();
        dict.Should().Be("<< /ColorSpace << /CS1 /DeviceCMYK >> /XObject << /Im1 10 0 R /Im2 << /Sub 1 0 R >> >> >>");
    }

    [Fact]
    public void ExtractBalancedDictionary_WithCommentsAndStrings_MaintainsDelimBalance()
    {
        string raw = "<< /Key (String with >> and << inside) % comment with >>\n /Sub << /Val <010203>>> >>";

        string? dict = PdfStructureResolver.ExtractBalancedDictionary(raw, 0);

        dict.Should().NotBeNull();
        dict.Should().Be("<< /Key (String with >> and << inside) % comment with >>\n /Sub << /Val <010203>>> >>");
    }
}

