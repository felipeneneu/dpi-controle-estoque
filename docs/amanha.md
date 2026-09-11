Backend: konica/device-info.ts — fetch deviceInfo.fcgi (session+retry) → KonicaDeviceInfo (toner %, trays, waste box, status)
Backend: map KonicaDeviceInfo → snapshot on machineTelemetry (CMYK % + trays) + persistTelemetry equivalent
Backend: wire telemetry polling into Konica agent loop (deviceInfo on each cycle) + route in machines.ts by machine type
Backend: sheet debit rounding — whole sheets (floor per unit rms=500, no .5s)
Frontend: api.ts types — toner % + trays; KonicaTelemetryPanel (4 CMYK cartridges, media trays) rendered by machine type
Verify: typecheck backend+frontend, lint konica files, live probe deviceInfo → telemetry + rounds