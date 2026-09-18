#r "nuget: PdfSharp, 6.1.1"
using PdfSharp.Pdf;
using PdfSharp.Drawing;
using (var doc = new PdfDocument()) {
    var page = doc.AddPage();
    page.Width = XUnit.FromMillimeter(19);
    page.Height = XUnit.FromMillimeter(34);
    using (var gfx = XGraphics.FromPdfPage(page)) {
        gfx.DrawRectangle(XPens.Black, 0, 0, page.Width, page.Height);
    }
    doc.Save("dummy_19x34.pdf");
}
