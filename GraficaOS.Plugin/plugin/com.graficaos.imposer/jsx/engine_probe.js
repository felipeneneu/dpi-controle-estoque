// ── engine_probe.js — Ponte WSH entre o painel CEP e o motor COM ──
// O ExtendScript do Illustrator (engine 4.5.x) NAO expoe ActiveXObject,
// e o CEF do painel nao pode criar COM in-proc. Este probe roda via
// cscript (WSH), onde o ActiveXObject funciona, e devolve o JSON do
// motor via stdout. O painel (Node) invoca: cscript //nologo engine_probe.js <comando> [json]

var args = WScript.Arguments;
var cmd = args.length > 0 ? args(0) : '';

function fail(code, message) {
    var safe = String(message)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/[\r\n\t]+/g, ' ');
    WScript.StdOut.WriteLine('{"success":false,"errorCode":"' + code + '","message":"' + safe + '"}');
}

// O payload chega via arquivo temporario UTF-8 porque o WScript.Arguments
// preserva o escape \" do Node — JSON inline nao sobrevive a linha de comando.
function readPayload(argsLen) {
    if (argsLen < 2) return '';
    var path = args(1);
    if (path === '') return '';
    var stream = new ActiveXObject('ADODB.Stream');
    try {
        stream.Charset = 'utf-8';
        stream.Type = 2;
        stream.Open();
        stream.LoadFromFile(path);
        var text = stream.ReadText(-1);
        return text;
    } catch (e) {
        return '';
    } finally {
        try { stream.Close(); } catch (e2) {}
    }
}

if (cmd === '') {
    fail('E_USAGE', 'uso: cscript //nologo engine_probe.js <version|tenant|plan|pdf|track|flush> [arquivo-json]');
    WScript.Quit(2);
}

var engine;
try {
    engine = new ActiveXObject('GraficaOS.Engine');
} catch (e) {
    fail('E_COM', 'ActiveXObject GraficaOS.Engine falhou: ' + e.message);
    WScript.Quit(1);
}

try {
    var payload = readPayload(args.length);
    var out;
    switch (cmd) {
        case 'version':
            out = engine.GetVersion();
            break;
        case 'tenant':
            out = engine.GetActiveTenant();
            break;
        case 'plan':
            if (payload === '') { fail('E_PAYLOAD', 'comando plan requer arquivo JSON de request'); WScript.Quit(1); }
            out = engine.PlanImposition(payload);
            break;
        case 'pdf':
            if (payload === '') { fail('E_PAYLOAD', 'comando pdf requer arquivo JSON de request'); WScript.Quit(1); }
            out = engine.ImposeToPdf(payload);
            break;
        case 'track':
            if (payload === '') { fail('E_PAYLOAD', 'comando track requer arquivo JSON de evento'); WScript.Quit(1); }
            engine.TrackEvent(payload);
            out = '{"success":true,"message":"telemetria registrada"}';
            break;
        case 'flush':
            out = engine.FlushTelemetry();
            break;
        default:
            fail('E_CMD', 'Comando desconhecido: ' + cmd);
            WScript.Quit(1);
            break;
    }
    if (out === null || out === undefined) out = '{"success":true}';
    WScript.StdOut.WriteLine(out);
} catch (e2) {
    fail('E_COM_CALL', cmd + ' falhou: ' + e2.message);
    WScript.Quit(1);
}