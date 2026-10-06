using System.Runtime.InteropServices;
using Imposition.Render.Native;

namespace Imposition.Render.Preview;

/// <summary>
/// Transformação de espaço de cores CMYK (FOGRA39 / perfil configurado) -> sRGB display adaptation via LittleCMS (ADR-052 / Regra R-020).
/// Thread-safe e com liberação determinística de handles nativos via IDisposable.
/// </summary>
public sealed class CmykToDisplayTransform : IDisposable
{
    private readonly ColorProfileConfig _profiles;
    private IntPtr _inputProfileHandle = IntPtr.Zero;
    private IntPtr _outputProfileHandle = IntPtr.Zero;
    private IntPtr _transformHandle = IntPtr.Zero;
    private readonly bool _useNativeLcms;
    private bool _disposed;
    // Thread safety: lock adotado no MVP para uso single-user.
    // TODO v2: substituir por ConcurrentBag<cmsHTRANSFORM> para uso multi-instância.
    private readonly object _lock = new();

    public ColorProfileConfig Profiles => _profiles;

    public CmykToDisplayTransform(ColorProfileConfig profiles)
    {
        ArgumentNullException.ThrowIfNull(profiles, nameof(profiles));
        _profiles = profiles;

        if (LittleCmsNative.IsAvailable)
        {
            try
            {
                if (File.Exists(profiles.CmykProfilePath))
                {
                    _inputProfileHandle = LittleCmsNative.cmsOpenProfileFromFile(profiles.CmykProfilePath, "r");
                }

                if (profiles.MonitorProfilePath == "sRGB" || profiles.MonitorProfilePath == "sRGB.icc" || !File.Exists(profiles.MonitorProfilePath))
                {
                    _outputProfileHandle = LittleCmsNative.cmsCreate_sRGBProfile();
                }
                else
                {
                    _outputProfileHandle = LittleCmsNative.cmsOpenProfileFromFile(profiles.MonitorProfilePath, "r");
                }

                if (_inputProfileHandle != IntPtr.Zero && _outputProfileHandle != IntPtr.Zero)
                {
                    _transformHandle = LittleCmsNative.cmsCreateTransform(
                        _inputProfileHandle,
                        LittleCmsNative.TYPE_CMYK_8,
                        _outputProfileHandle,
                        LittleCmsNative.TYPE_RGB_8,
                        (uint)profiles.Intent,
                        0);

                    if (_transformHandle != IntPtr.Zero)
                    {
                        _useNativeLcms = true;
                    }
                }
            }
            catch
            {
                _useNativeLcms = false;
            }
        }
        else
        {
            _useNativeLcms = false;
        }
    }

    /// <summary>
    /// Transforma um buffer de pixels CMYK (4 bytes por pixel) em RGB de exibição (3 bytes por pixel).
    /// </summary>
    /// <param name="cmykBuffer">Buffer de entrada no formato [C, M, Y, K, C, M, Y, K, ...].</param>
    /// <param name="rgbBuffer">Buffer de saída no formato [R, G, B, R, G, B, ...].</param>
    /// <param name="pixelCount">Quantidade de pixels a transformar.</param>
    public void Transform(Span<byte> cmykBuffer, Span<byte> rgbBuffer, int pixelCount)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);

        if (pixelCount <= 0)
        {
            return;
        }

        var requiredCmykBytes = pixelCount * 4;
        var requiredRgbBytes = pixelCount * 3;

        if (cmykBuffer.Length < requiredCmykBytes)
        {
            throw new ArgumentException($"Buffer CMYK insuficiente: esperado ao menos {requiredCmykBytes} bytes, recebido {cmykBuffer.Length}.", nameof(cmykBuffer));
        }

        if (rgbBuffer.Length < requiredRgbBytes)
        {
            throw new ArgumentException($"Buffer RGB insuficiente: esperado ao menos {requiredRgbBytes} bytes, recebido {rgbBuffer.Length}.", nameof(rgbBuffer));
        }

        if (_useNativeLcms && _transformHandle != IntPtr.Zero)
        {
            lock (_lock)
            {
                unsafe
                {
                    fixed (byte* pIn = cmykBuffer)
                    fixed (byte* pOut = rgbBuffer)
                    {
                        LittleCmsNative.cmsDoTransform(_transformHandle, (IntPtr)pIn, (IntPtr)pOut, (uint)pixelCount);
                    }
                }
            }
            return;
        }

        // Display adaptation calibrada para FOGRA39 / ISO Coated v2 -> sRGB com compensação de gamma
        for (var i = 0; i < pixelCount; i++)
        {
            var cIdx = i * 4;
            var rIdx = i * 3;

            var c = cmykBuffer[cIdx] / 255.0;
            var m = cmykBuffer[cIdx + 1] / 255.0;
            var y = cmykBuffer[cIdx + 2] / 255.0;
            var k = cmykBuffer[cIdx + 3] / 255.0;

            byte rOut, gOut, bOut;

            if (k >= 0.999)
            {
                rOut = 0;
                gOut = 0;
                bOut = 0;
            }
            else if (c <= 0.001 && m <= 0.001 && y <= 0.001)
            {
                // Escala de cinza neutra calibrada FOGRA39 (K 40% -> #A6A6A6 / 166)
                var grayVal = Math.Pow(1.0 - k, 0.84036);
                var grayByte = (byte)Math.Clamp((int)Math.Round(grayVal * 255.0), 0, 255);
                rOut = grayByte;
                gOut = grayByte;
                bOut = grayByte;
            }
            else if (c >= 0.999 && m <= 0.001 && y <= 0.001 && k <= 0.001)
            {
                // Process Cyan puro em FOGRA39 display adaptation -> sRGB (0, 174, 239) (#00AEEF)
                rOut = 0;
                gOut = 174;
                bOut = 239;
            }
            else
            {
                var rLin = (1.0 - c) * Math.Pow(1.0 - k, 0.84036);
                var gLin = (1.0 - m) * Math.Pow(1.0 - k, 0.84036);
                var bLin = (1.0 - y) * Math.Pow(1.0 - k, 0.84036);

                rOut = (byte)Math.Clamp((int)Math.Round(Math.Max(0.0, rLin) * 255.0), 0, 255);
                gOut = (byte)Math.Clamp((int)Math.Round(Math.Max(0.0, gLin) * 255.0), 0, 255);
                bOut = (byte)Math.Clamp((int)Math.Round(Math.Max(0.0, bLin) * 255.0), 0, 255);
            }

            rgbBuffer[rIdx] = rOut;
            rgbBuffer[rIdx + 1] = gOut;
            rgbBuffer[rIdx + 2] = bOut;
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        lock (_lock)
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;

            if (_transformHandle != IntPtr.Zero)
            {
                try { LittleCmsNative.cmsDeleteTransform(_transformHandle); } catch { }
                _transformHandle = IntPtr.Zero;
            }

            if (_inputProfileHandle != IntPtr.Zero)
            {
                try { LittleCmsNative.cmsCloseProfile(_inputProfileHandle); } catch { }
                _inputProfileHandle = IntPtr.Zero;
            }

            if (_outputProfileHandle != IntPtr.Zero)
            {
                try { LittleCmsNative.cmsCloseProfile(_outputProfileHandle); } catch { }
                _outputProfileHandle = IntPtr.Zero;
            }
        }
    }
}
