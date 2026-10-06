using System.Reflection;
using System.Runtime.InteropServices;

namespace Imposition.Render.Native;

/// <summary>
/// Carregador de bibliotecas nativas C/C++ multiplataforma para pré-impressão (ADR-052 / ADR-053).
/// </summary>
public static class NativeLoader
{
    private static readonly string[] TurboJpegNames = ["turbojpeg", "libturbojpeg", "turbojpeg.dll", "libturbojpeg.so", "libturbojpeg.dylib", "jpeg62", "libjpeg-62"];

    /// <summary>
    /// Tenta carregar uma biblioteca nativa a partir de uma lista ordenada de nomes conhecidos.
    /// </summary>
    public static bool TryLoadLibrary(string[] libraryNames, Assembly assembly, out IntPtr handle)
    {
        handle = IntPtr.Zero;

        foreach (var name in libraryNames)
        {
            try
            {
                if (NativeLibrary.TryLoad(name, assembly, DllImportSearchPath.ApplicationDirectory | DllImportSearchPath.System32 | DllImportSearchPath.AssemblyDirectory, out handle))
                {
                    if (handle != IntPtr.Zero)
                    {
                        return true;
                    }
                }
            }
            catch
            {
                // Tenta próximo nome
            }
        }

        return false;
    }

    /// <summary>
    /// Verifica se a biblioteca TurboJPEG está disponível no ambiente atual.
    /// </summary>
    public static bool IsTurboJpegAvailable(out IntPtr handle)
    {
        return TryLoadLibrary(TurboJpegNames, typeof(NativeLoader).Assembly, out handle);
    }
}
