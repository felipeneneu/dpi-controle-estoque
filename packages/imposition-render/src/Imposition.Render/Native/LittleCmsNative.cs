using System.Runtime.InteropServices;

namespace Imposition.Render.Native;

/// <summary>
/// P/Invoke bindings nativos para a biblioteca LittleCMS (lcms2.dll / liblcms2.so).
/// Utilizado para transformações de espaço de cores ICC CMYK -> sRGB display adaptation (ADR-052).
/// </summary>
internal static class LittleCmsNative
{
    private const string LibraryName = "lcms2";

    public const uint TYPE_CMYK_8 = (6 << 16) | (4 << 3) | 1;
    public const uint TYPE_RGB_8 = (4 << 16) | (3 << 3) | 1;
    public const uint TYPE_RGBA_8 = (4 << 16) | (3 << 3) | (1 << 7) | 1;

    private static readonly Lazy<bool> _isAvailable = new(CheckAvailability);

    public static bool IsAvailable => _isAvailable.Value;

    private static bool CheckAvailability()
    {
        try
        {
            return NativeLibrary.TryLoad(LibraryName, typeof(LittleCmsNative).Assembly, null, out var handle)
                && handle != IntPtr.Zero;
        }
        catch
        {
            return false;
        }
    }

    [DllImport(LibraryName, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
    public static extern IntPtr cmsOpenProfileFromFile(string iccProfile, string sAccess);

    [DllImport(LibraryName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr cmsOpenProfileFromMem(IntPtr mem, uint size);

    [DllImport(LibraryName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr cmsCreate_sRGBProfile();

    [DllImport(LibraryName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr cmsCreateTransform(
        IntPtr inputProfile,
        uint inputFormat,
        IntPtr outputProfile,
        uint outputFormat,
        uint intent,
        uint dwFlags);

    [DllImport(LibraryName, CallingConvention = CallingConvention.Cdecl)]
    public static extern void cmsDoTransform(
        IntPtr transform,
        IntPtr inputBuffer,
        IntPtr outputBuffer,
        uint size);

    [DllImport(LibraryName, CallingConvention = CallingConvention.Cdecl)]
    public static extern void cmsDeleteTransform(IntPtr transform);

    [DllImport(LibraryName, CallingConvention = CallingConvention.Cdecl)]
    public static extern int cmsCloseProfile(IntPtr profile);
}
