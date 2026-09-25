/* ── GraficaOS Imposer — main.js (CEP Panel) ── */
/* ES2020 — roda no Chromium Embedded Framework do CEP */

(() => {
  'use strict';

  const csInterface = new CSInterface();
  let engineOnline = false;
  let tenantData = null;

  // ── Ponte Motor via WSH (cscript) ─────────────────────────────────
  // O ExtendScript do Illustrator (engine 4.5.x) não expõe ActiveXObject,
  // e o CEF do painel não pode criar COM in-proc. Então o painel (Node)
  // invoca o COM através de um probe WSH: cscript engine_probe.js <cmd> <json-file>.

  let _execFileCached = false;

  function getExecFile() {
    if (_execFileCached !== false) return _execFileCached;
    try {
      if (typeof require !== 'function') { _execFileCached = false; return false; }
      _execFileCached = require('child_process').execFile;
    } catch (e) {
      _execFileCached = false;
    }
    return _execFileCached;
  }

  function getTmpPayload(payload) {
    // Escreve o JSON em arquivo temporário UTF-8 (leitura no probe via ADODB.Stream)
    if (typeof require !== 'function') return null;
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const tmp = path.join(os.tmpdir(), `graficaos_probe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`);
    fs.writeFileSync(tmp, payload, 'utf8');
    return tmp;
  }

  function callEngine(cmd, payload, callback) {
    const execFile = getExecFile();
    if (!execFile) {
      callback('{"success":false,"errorCode":"E_NODE","message":"Node/child_process indisponivel no painel CEP."}');
      return;
    }

    let tmpFile = null;
    if (payload) {
      tmpFile = getTmpPayload(payload);
      if (!tmpFile) {
        callback('{"success":false,"errorCode":"E_NODE","message":"Falha ao gravar payload temporario."}');
        return;
      }
    }

    const windir = (typeof process !== 'undefined' && process.env && process.env.windir) ? process.env.windir : 'C:\\Windows';
    const cscript = windir + '\\System32\\cscript.exe';
    const probe = extensionPath() + '\\jsx\\engine_probe.js';
    const args = ['//nologo', probe, cmd];
    if (tmpFile) args.push(tmpFile);

    execFile(cscript, args, {
      encoding: 'latin1',
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
      timeout: 90000,
    }, (err, stdout) => {
      if (tmpFile) {
        try { require('fs').unlinkSync(tmpFile); } catch (e) { /* best-effort */ }
      }
      if (err) {
        const detail = (err.stderr || err.message || String(err)).replace(/[\r\n]+/g, ' ');
        callback('{"success":false,"errorCode":"E_SPAWN","message":"' + safeString(detail) + '"}');
        return;
      }
      const text = (stdout || '').trim();
      if (!text) {
        callback('{"success":false,"errorCode":"E_EMPTY","message":"cscript retornou vazio."}');
        return;
      }
      callback(text);
    });
  }

  function extensionPath() {
    try {
      return new CSInterface().getSystemPath('extension');
    } catch {
      return '';
    }
  }

  function safeString(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n\t]+/g, ' ');
  }

  // ── Inicialização ─────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    setupButtons();
    checkEngine();
    refreshSelectionMeasurements();
    // Poll para atualizar medidas ao redimensionar (sem disparar selectionChanged)
    setInterval(refreshSelectionMeasurements, 1000);
    csInterface.addEventListener('com.graficaos.imposer.selection', (event) => {
      try { fillArtFromSelection(JSON.parse(event.data)); } catch (e) { /* ignora */ }
    });
    trackEvent('plugin.opened', { illustratorVersion: getAiVersion() });
  }

  // ── Botões ────────────────────────────────────────────────────────

  function setupButtons() {
    document.getElementById('btnPlan').addEventListener('click', handlePlan);
    document.getElementById('btnImpose').addEventListener('click', handleImpose);
    document.getElementById('btnClearLog').addEventListener('click', clearLog);
    document.getElementById('btnInfo').addEventListener('click', openInfoModal);
    document.getElementById('btnCloseInfo').addEventListener('click', closeModals);
    document.getElementById('btnCloseOverflow').addEventListener('click', closeModals);
    document.getElementById('btnFlush').addEventListener('click', handleFlush);
    document.getElementById('modalBackdrop').addEventListener('click', closeModals);
  }

  // ── Motor COM (via probe) ─────────────────────────────────────────

  function checkEngine() {
    setBadge('loading');
    callEngine('version', null, (result) => {
      let raw = result;
      try {
        const parsed = JSON.parse(result);
        if (parsed && !parsed.success) {
          engineOnline = false;
          setBadge('offline', 'Motor não disponível');
          logErr(`Motor offline: ${parsed.errorCode} — ${parsed.message}`);
          return;
        }
        if (typeof parsed !== 'string') raw = result; // resposta não é versão bruta
      } catch (e) {
        // "0.1.0" não é JSON válido → versão bruta
      }

      engineOnline = true;
      setBadge('online', `Motor v${raw}`);
      logOk(`Motor conectado (v${raw})`);
      loadTenant();
    });
  }

  function loadTenant() {
    callEngine('tenant', null, (result) => {
      try {
        const t = JSON.parse(result);
        tenantData = t;
        document.getElementById('tenantId').textContent = (t && t.tenantId) || '—';
      } catch {
        document.getElementById('tenantId').textContent = '—';
      }
    });
  }

  // ── Construir Request JSON ────────────────────────────────────────

  function buildRequest() {
    const sheetW = parseFloat(document.getElementById('sheetW').value) || 710;
    const sheetH = parseFloat(document.getElementById('sheetH').value) || 1000;
    const artW = parseFloat(document.getElementById('artW').value) || 49;
    const artH = parseFloat(document.getElementById('artH').value) || 74;
    const target = parseInt(document.getElementById('targetCopies').value, 10) || 1;
    const gap = parseFloat(document.getElementById('gapMm').value) || 0;
    const margin = parseFloat(document.getElementById('marginMm').value) || 0;
    const marks = document.getElementById('chkMarks').checked;

    return {
      schemaVersion: '1.0',
      requestId: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      sheetWMm: sheetW,
      sheetHMm: sheetH,
      artWMm: artW,
      artHMm: artH,
      gapMm: gap,
      margins: { top: margin, right: margin, bottom: margin, left: margin },
      targetCopies: target,
      forceRotation: null,
      surplusPolicy: 'fill_row',
      substrateKind: 'sheet',
      maxLengthMm: null,
      marks: marks ? { enabled: true, type: 'mimaki-fcrm', sizeMm: 20, offsetMm: 3 } : null,
    };
  }

  // ── Ações ─────────────────────────────────────────────────────────

  function handlePlan() {
    if (!engineOnline) { logErr('Motor offline. Verifique a instalação.'); return; }

    ensureSelectionMeasurements(() => {
      const request = buildRequest();
      logInfo(`Calculando grade ${request.artWMm}×${request.artHMm}mm em ${request.sheetWMm}×${request.sheetHMm}mm (margem ${request.margins.top}mm)...`);
      trackEvent('imposition.requested', { mode: 'plan' });

      callEngine('plan', JSON.stringify(request), (result) => {
        handleResponse(result, 'plan');
      });
    });
  }

  function handleImpose() {
    if (!engineOnline) { logErr('Motor offline. Verifique a instalação.'); return; }

    ensureSelectionMeasurements(() => {
      const request = buildRequest();
      logInfo('Aplicando imposição na bancada...');
      trackEvent('imposition.requested', { mode: 'bancada' });

      callEngine('plan', JSON.stringify(request), (result) => {
        let parsed = null;
        try { parsed = JSON.parse(result); } catch (e) {
          logErr(`Resposta inválida do motor: ${result}`);
          return;
        }

        // Overflow / erro → fluxo padrão de resposta
        if (!parsed || !parsed.success) { handleResponse(result, 'bancada'); return; }

        handleResponse(result, 'bancada');
        evalJsx('applyComputedPlan', [result], (applyResult) => {
          if (!applyResult || applyResult.startsWith('EvalScript Error')) {
            logErr(`Falha ao aplicar na bancada: ${applyResult || '(vazio)'}`);
            return;
          }
          try {
            const r = JSON.parse(applyResult);
            if (!r.success) { logErr(`${r.errorCode || 'ERRO'}: ${r.message}`); return; }
            logOk(`Bancada aplicada (${r.placementCount} posições).`);
          } catch {
            logOk('Bancada aplicada.');
          }
        });
      });
    });
  }

  function handleResponse(resultStr, mode) {
    try {
      const r = JSON.parse(resultStr);

      if (r.errorCode === 'E_GRID_OVERFLOW') {
        logWarn(r.message);
        showOverflowModal(r, mode);
        trackEvent('imposition.failed', { errorCode: r.errorCode });
        return;
      }

      if (!r.success) {
        logErr(`${r.errorCode || 'ERRO'}: ${r.message}`);
        trackEvent('imposition.failed', { errorCode: r.errorCode, message: r.message });
        return;
      }

      const g = r.grid;
      logOk(`Grade: ${g.cols}×${g.rows} = ${g.plannedUnits} un. (${g.rotationDeg}°)`);
      if (r.sheet) logInfo(`Chapa: ${r.sheet.widthMm}×${r.sheet.heightMm}mm`);
      if (r.executionTimeMs) logInfo(`Tempo: ${r.executionTimeMs}ms`);
      if (r.outputFiles?.length) logOk(`PDF: ${r.outputFiles[0]}`);

      trackEvent('imposition.completed', {
        mode,
        cols: g.cols,
        rows: g.rows,
        units: g.plannedUnits,
        durationMs: r.executionTimeMs,
      });
    } catch (e) {
      logErr(`Resposta inválida do motor: ${e.message}`);
      logErr(resultStr);
    }
  }

  // ── Overflow Modal ────────────────────────────────────────────────

  function showOverflowModal(response, mode) {
    const modal = document.getElementById('modalOverflow');
    const msg = document.getElementById('overflowMsg');
    const list = document.getElementById('overflowOptions');

    msg.textContent = response.message;
    list.innerHTML = '';

    (response.options || []).forEach(opt => {
      const li = document.createElement('li');
      li.textContent = `${opt.id}: ${opt.label}`;
      li.addEventListener('click', () => {
        logInfo(`Opção selecionada: ${opt.id} — ${opt.totalUnits} unidades em ${opt.sheets} chapa(s)`);
        trackEvent('imposition.option_selected', { optionId: opt.id, totalUnits: opt.totalUnits });
        
        const copiesPerSheet = Math.ceil(opt.totalUnits / opt.sheets);
        document.getElementById('targetCopies').value = copiesPerSheet;
        logInfo(`Tiragem ajustada para ${copiesPerSheet} unidades por chapa. Executando...`);
        
        closeModals();
        
        if (mode === 'plan') {
            handlePlan();
        } else if (mode === 'bancada') {
            handleImpose();
        }
      });
      list.appendChild(li);
    });

    showModal(modal);
  }

  // ── Info Modal ────────────────────────────────────────────────────

  function openInfoModal() {
    const modal = document.getElementById('modalInfo');
    document.getElementById('infoAiVersion').textContent = getAiVersion();

    if (engineOnline) {
      callEngine('version', null, (v) => {
        document.getElementById('infoMotorVersion').textContent = v || '—';
      });
      callEngine('tenant', null, (result) => {
        try {
          const t = JSON.parse(result);
          document.getElementById('infoTenant').textContent = t.tenantId || '—';
          document.getElementById('infoMachineId').textContent = t.machineId || '—';
        } catch { /* ignorar */ }
      });
    }

    showModal(modal);
  }

  function handleFlush() {
    logInfo('Enviando telemetria pendente...');
    callEngine('flush', null, (result) => {
      try {
        const r = JSON.parse(result);
        if (r.success) {
          logOk(r.message || `${r.sentCount} evento(s) enviado(s).`);
        } else {
          logWarn(r.message || 'Falha ao enviar telemetria.');
        }
      } catch {
        logErr('Resposta inválida do flush.');
      }
    });
  }

  // ── Modais (genérico) ─────────────────────────────────────────────

  function showModal(modal) {
    document.getElementById('modalBackdrop').classList.remove('hidden');
    modal.classList.remove('hidden');
  }

  function closeModals() {
    document.getElementById('modalBackdrop').classList.add('hidden');
    document.getElementById('modalInfo').classList.add('hidden');
    document.getElementById('modalOverflow').classList.add('hidden');
  }

  // ── Log ───────────────────────────────────────────────────────────

  const logEl = () => document.getElementById('logArea');

  function logOk(msg)   { appendLog(`✅ ${msg}`); }
  function logWarn(msg)  { appendLog(`⚠️ ${msg}`); }
  function logErr(msg)   { appendLog(`❌ ${msg}`); }
  function logInfo(msg)  { appendLog(`• ${msg}`); }

  function appendLog(line) {
    const el = logEl();
    el.textContent += line + '\n';
    el.scrollTop = el.scrollHeight;
  }

  function clearLog() { logEl().textContent = ''; }

  // ── Status Badge ──────────────────────────────────────────────────

  function setBadge(state, text) {
    const badge = document.getElementById('badge');
    const statusText = document.getElementById('statusText');
    badge.className = `badge ${state}`;
    if (text) statusText.textContent = text;
  }

  // ── JSX Bridge ────────────────────────────────────────────────────

  function evalJsx(fnName, args, callback) {
    const escapedArgs = args.map(a => {
      if (typeof a === 'string') {
        // Escapa aspas simples e barras para ExtendScript
        return "'" + a.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
      }
      return String(a);
    });
    const script = `${fnName}(${escapedArgs.join(', ')})`;
    csInterface.evalScript(script, callback || (() => {}));
  }

  // ── Telemetria ────────────────────────────────────────────────────

  function trackEvent(eventName, properties) {
    const evt = {
      eventName,
      timestamp: new Date().toISOString(),
      properties: properties || {},
    };
    try {
      callEngine('track', JSON.stringify(evt));
    } catch { /* best-effort */ }
  }

  // ── Medidas da seleção ────────────────────────────────────────────

  let lastSeenBounds = null;

  function fillArtFromSelection(bounds) {
    if (!bounds || !bounds.selection) return;

    const w = Number(bounds.widthMm);
    const h = Number(bounds.heightMm);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;

    const currentBoundsStr = w.toFixed(2) + 'x' + h.toFixed(2);
    if (lastSeenBounds === currentBoundsStr) {
        return; // As dimensões reais no Illustrator não mudaram, não sobrescreve o input
    }
    lastSeenBounds = currentBoundsStr;

    const artW = document.getElementById('artW');
    const artH = document.getElementById('artH');
    
    if (String(artW.value) !== String(w) || String(artH.value) !== String(h)) {
        artW.value = w;
        artH.value = h;
        logInfo(`Arte atualizada da seleção: ${w}×${h}mm`);
    }
  }

  function refreshSelectionMeasurements() {
    evalJsx('getSelectionBounds', [], (result) => {
      try {
        const b = JSON.parse(result);
        if (b && b.selection) fillArtFromSelection(b);
      } catch { /* ignora */ }
    });
  }

  function ensureSelectionMeasurements(cb) {
    evalJsx('getSelectionBounds', [], (result) => {
      try {
        const b = JSON.parse(result);
        if (b && b.selection) fillArtFromSelection(b);
      } catch { /* ignora */ }
      cb();
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────

  function getAiVersion() {
    try {
      const env = JSON.parse(csInterface.getHostEnvironment());
      return `${env.appName || 'ILST'} ${env.appVersion || '?'}`;
    } catch {
      return 'Illustrator (versão desconhecida)';
    }
  }

  // ── Cleanup ao fechar ─────────────────────────────────────────────

  window.addEventListener('beforeunload', () => {
    trackEvent('plugin.closed');
  });
})();
