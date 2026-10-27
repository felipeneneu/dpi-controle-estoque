/* ── GraficaOS Imposer — main.js (CEP Panel) ── */
/* ES2017 / Chromium 61+ — compatível com CEP 9 (Illustrator CC 2019) até CEP 12+ */

(() => {
  'use strict';

  const csInterface = new CSInterface();
  let engineOnline = false;
  let tenantData = null;
  let currentUnit = 'mm';

  const SHEET_PRESETS = {
    sra3: { w: 320, h: 450 },
    konica_super: { w: 330, h: 487 },
    a3: { w: 297, h: 420 },
    a4: { w: 210, h: 297 },
    a2: { w: 420, h: 594 },
    offset_inteira: { w: 710, h: 1000 },
    offset_meia: { w: 500, h: 710 },
    offset_66x96: { w: 660, h: 960 },
    offset_48x66: { w: 480, h: 660 },
  };

  function toMm(val, unit) {
    const num = Number(val) || 0;
    if (unit === 'cm') return num * 10;
    if (unit === 'pt') return (num * 25.4) / 72.0;
    return num;
  }

  function fromMm(mmVal, unit) {
    const num = Number(mmVal) || 0;
    if (unit === 'cm') return num / 10;
    if (unit === 'pt') return (num * 72.0) / 25.4;
    return num;
  }

  function roundUnit(val, unit) {
    if (unit === 'pt') return Math.round(val * 100) / 100;
    if (unit === 'cm') return Math.round(val * 100) / 100;
    return Math.round(val * 10) / 10;
  }

  function handleUnitChange(newUnit) {
    if (newUnit === currentUnit) return;
    const oldUnit = currentUnit;
    currentUnit = newUnit;

    const fields = ['sheetW', 'sheetH', 'artW', 'artH', 'gapMm', 'bleedMm', 'marginMm', 'markOffset', 'markLength'];
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const oldVal = parseFloat(el.value);
      if (!Number.isFinite(oldVal)) return;
      const mm = toMm(oldVal, oldUnit);
      const converted = fromMm(mm, newUnit);
      el.value = roundUnit(converted, newUnit);
    });

    updateUnitLabels(newUnit);
    logInfo(`Unidade alterada para: ${newUnit}`);
  }

  function updateUnitLabels(unit) {
    const labels = {
      lblSheetW: `Formato L (${unit})`,
      lblSheetH: `Formato A (${unit})`,
      lblArtW: `Arte L (${unit})`,
      lblArtH: `Arte A (${unit})`,
      lblGap: `Gap (${unit})`,
      lblBleed: `Sangria (${unit})`,
      lblMargin: `Margem (${unit})`,
      lblMarkOffset: `Offset (${unit}) [9 pt]`,
      lblMarkLength: `Comp. (${unit}) [18 pt]`,
    };
    Object.keys(labels).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = labels[id];
    });
  }

  function handleArtboardBoundsResult(res) {
    try {
      const parsed = JSON.parse(res);
      if (parsed && parsed.success) {
        const w = fromMm(parsed.widthMm, currentUnit);
        const h = fromMm(parsed.heightMm, currentUnit);
        document.getElementById('sheetW').value = roundUnit(w, currentUnit);
        document.getElementById('sheetH').value = roundUnit(h, currentUnit);
        logInfo(`Prancheta ativa [${parsed.index + 1} - ${parsed.name}]: ${roundUnit(w, currentUnit)}×${roundUnit(h, currentUnit)}${currentUnit}`);
      } else {
        logWarn(parsed.message || 'Falha ao ler prancheta ativa.');
      }
    } catch (e) {
      logWarn('Não foi possível obter a prancheta ativa' + (res && !res.startsWith('EvalScript') ? ': ' + res : '. Abra um documento no Illustrator.'));
    }
  }

  function handleSheetPresetChange() {
    const preset = document.getElementById('sheetPreset').value;
    if (preset === 'custom') return;

    if (preset === 'active_artboard') {
      ensureExtendScriptLoaded(() => {
        evalJsx('getActiveArtboardBounds', [], (res) => {
          handleArtboardBoundsResult(res);
        });
      });
      return;
    }

    const dims = SHEET_PRESETS[preset];
    if (dims) {
      const w = fromMm(dims.w, currentUnit);
      const h = fromMm(dims.h, currentUnit);
      document.getElementById('sheetW').value = roundUnit(w, currentUnit);
      document.getElementById('sheetH').value = roundUnit(h, currentUnit);
    }
  }

  function onSheetInputManual() {
    const presetSel = document.getElementById('sheetPreset');
    if (presetSel && presetSel.value !== 'custom') {
      presetSel.value = 'custom';
    }
  }

  // ── Ponte Motor via WSH (cscript) ─────────────────────────────────
  // O ExtendScript do Illustrator (engine 4.5.x) não expõe ActiveXObject,
  // e o CEF do painel não pode criar COM in-proc. Então o painel (Node)
  // invoca o COM através de um probe WSH: cscript engine_probe.js <cmd> <json-file>.

  let _execFileCached = false;

  function getNodeRequire() {
    if (typeof require === 'function') return require;
    if (typeof window !== 'undefined' && typeof window.require === 'function') return window.require;
    return null;
  }

  function getExecFile() {
    if (_execFileCached !== false) return _execFileCached;
    try {
      const req = getNodeRequire();
      if (!req) { _execFileCached = false; return false; }
      _execFileCached = req('child_process').execFile;
    } catch (e) {
      _execFileCached = false;
    }
    return _execFileCached;
  }

  function getTmpPayload(payload) {
    // Escreve o JSON em arquivo temporário UTF-8 (leitura no probe via ADODB.Stream)
    const req = getNodeRequire();
    if (!req) return null;
    try {
      const fs = req('fs');
      const os = req('os');
      const path = req('path');
      const tmp = path.join(os.tmpdir(), `graficaos_probe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`);
      fs.writeFileSync(tmp, payload, 'utf8');
      return tmp;
    } catch (e) {
      return null;
    }
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
    const extPath = extensionPath();
    if (!extPath) {
      callback('{"success":false,"errorCode":"E_PATH","message":"Caminho da extensao CEP nao encontrado."}');
      return;
    }
    const probe = extPath + '\\jsx\\engine_probe.js';
    const args = ['//nologo', probe, cmd];
    if (tmpFile) args.push(tmpFile);

    execFile(cscript, args, {
      encoding: 'latin1',
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
      timeout: 90000,
    }, (err, stdout) => {
      if (tmpFile) {
        try {
          const req = getNodeRequire();
          if (req) req('fs').unlinkSync(tmpFile);
        } catch (e) { /* best-effort */ }
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
      const p = csInterface.getSystemPath('extension') || '';
      return p.replace(/\//g, '\\');
    } catch (e) {
      return '';
    }
  }

  function safeString(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n\t]+/g, ' ');
  }

  // ── Inicialização ─────────────────────────────────────────────────

  let _extendScriptLoading = false;
  let _extendScriptCallbacks = [];

  function ensureExtendScriptLoaded(callback) {
    csInterface.evalScript('(typeof getActiveArtboardBounds === "function" && typeof applyComputedPlan === "function")', (isLoaded) => {
      if (isLoaded === 'true') {
        if (callback) callback(true);
        return;
      }

      if (_extendScriptLoading) {
        if (callback) _extendScriptCallbacks.push(callback);
        return;
      }
      _extendScriptLoading = true;
      if (callback) _extendScriptCallbacks.push(callback);

      const notifyAll = (success) => {
        _extendScriptLoading = false;
        const cbs = _extendScriptCallbacks.slice();
        _extendScriptCallbacks = [];
        cbs.forEach(cb => { try { cb(success); } catch (e) {} });
      };

      // 1. Tenta carregar lendo o arquivo via Node.js fs (método nativo CEP 100% confiável)
      const req = getNodeRequire();
      if (req) {
        try {
          const fs = req('fs');
          const path = req('path');
          const extensionRoot = csInterface.getSystemPath(SystemPath.EXTENSION);
          const fullPath = path.join(extensionRoot, 'jsx', 'impose.jsx');
          if (fs.existsSync(fullPath)) {
            let code = fs.readFileSync(fullPath, 'utf8');
            code = code.replace(/^#.*/gm, '');
            csInterface.evalScript(code, (evalRes) => {
              csInterface.evalScript('typeof getActiveArtboardBounds === "function"', (checkRes) => {
                notifyAll(checkRes === 'true');
              });
            });
            return;
          }
        } catch (eNode) {
          console.warn('Falha ao ler impose.jsx via Node fs:', eNode);
        }
      }

      // 2. Fallback via $.evalFile com new File() (sintaxe nativa ExtendScript)
      const extensionRoot = csInterface.getSystemPath(SystemPath.EXTENSION);
      const jsxPath = (extensionRoot + '/jsx/impose.jsx').replace(/\\/g, '/');
      const loadScript = `try { $.evalFile(new File("${jsxPath}")); (typeof getActiveArtboardBounds === "function") ? "true" : "false"; } catch(e) { "ERR: " + e.message; }`;
      csInterface.evalScript(loadScript, (evalRes) => {
        notifyAll(evalRes === 'true');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    setupButtons();
    checkEngine();
    ensureExtendScriptLoaded(() => {
      handleSheetPresetChange();
      if (!isArtSizeLocked) {
        refreshSelectionMeasurements();
      }
    });
    // Poll para atualizar medidas ao redimensionar (sem disparar selectionChanged)
    setInterval(refreshSelectionMeasurements, 1000);
    csInterface.addEventListener('com.graficaos.imposer.selection', (event) => {
      if (isArtSizeLocked) return;
      try { fillArtFromSelection(JSON.parse(event.data)); } catch (e) { /* ignora */ }
    });
    trackEvent('plugin.opened', { illustratorVersion: getAiVersion() });
  }

  // ── Botões e Controles ────────────────────────────────────────────

  function setupButtons() {
    document.getElementById('btnPlan').addEventListener('click', handlePlan);
    document.getElementById('btnImpose').addEventListener('click', handleImpose);
    document.getElementById('btnClearLog').addEventListener('click', clearLog);
    document.getElementById('btnInfo').addEventListener('click', openInfoModal);
    document.getElementById('btnCloseInfo').addEventListener('click', closeModals);
    document.getElementById('btnCloseOverflow').addEventListener('click', closeModals);
    document.getElementById('btnFlush').addEventListener('click', handleFlush);
    document.getElementById('modalBackdrop').addEventListener('click', closeModals);

    const unitSel = document.getElementById('unitSelector');
    if (unitSel) unitSel.addEventListener('change', (e) => handleUnitChange(e.target.value));

    const sheetSel = document.getElementById('sheetPreset');
    if (sheetSel) sheetSel.addEventListener('change', handleSheetPresetChange);

    const sheetW = document.getElementById('sheetW');
    if (sheetW) sheetW.addEventListener('input', onSheetInputManual);
    const sheetH = document.getElementById('sheetH');
    if (sheetH) sheetH.addEventListener('input', onSheetInputManual);

    const btnLock = document.getElementById('btnLockArtSize');
    if (btnLock) {
      btnLock.addEventListener('click', () => {
        setArtSizeLocked(!isArtSizeLocked, true);
        if (!isArtSizeLocked) {
          lastSeenBounds = null;
          refreshSelectionMeasurements();
        }
      });
    }

    const artW = document.getElementById('artW');
    if (artW) {
      artW.addEventListener('input', () => {
        if (!isArtSizeLocked) {
          setArtSizeLocked(true, false);
          logInfo('🔒 Tamanho da arte fixado manualmente.');
        }
      });
    }

    const artH = document.getElementById('artH');
    if (artH) {
      artH.addEventListener('input', () => {
        if (!isArtSizeLocked) {
          setArtSizeLocked(true, false);
          logInfo('🔒 Tamanho da arte fixado manualmente.');
        }
      });
    }

    updateArtLockUI();
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
        // "1.0.0" não é JSON válido → versão bruta
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
      } catch (e) {
        document.getElementById('tenantId').textContent = '—';
      }
    });
  }

  // ── Construir Request JSON ────────────────────────────────────────

  function generateRequestId() {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
      if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const buf = new Uint8Array(16);
        crypto.getRandomValues(buf);
        buf[6] = (buf[6] & 0x0f) | 0x40;
        buf[8] = (buf[8] & 0x3f) | 0x80;
        const hex = Array.from(buf, b => (b < 16 ? '0' : '') + b.toString(16)).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      }
    } catch (e) { /* fallback para timestamp */ }
    return 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function buildRequest() {
    const sheetW = toMm(parseFloat(document.getElementById('sheetW').value) || 710, currentUnit);
    const sheetH = toMm(parseFloat(document.getElementById('sheetH').value) || 1000, currentUnit);
    const artW = toMm(parseFloat(document.getElementById('artW').value) || 49, currentUnit);
    const artH = toMm(parseFloat(document.getElementById('artH').value) || 74, currentUnit);
    const target = parseInt(document.getElementById('targetCopies').value, 10) || 1;
    const gap = toMm(parseFloat(document.getElementById('gapMm').value) || 0, currentUnit);
    const margin = toMm(parseFloat(document.getElementById('marginMm').value) || 0, currentUnit);
    const marksType = document.getElementById('marksSelector').value;
    const marksEnabled = (marksType === 'moldura' || marksType === 'preps_sample_group');

    return {
      schemaVersion: '1.0',
      requestId: generateRequestId(),
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
      marks: marksEnabled ? { enabled: true, type: 'mimaki-fcrm', sizeMm: 20, offsetMm: 3 } : null,
    };
  }

  // ── Ações ─────────────────────────────────────────────────────────

  function handlePlan() {
    if (!engineOnline) { logErr('Motor offline. Verifique a instalação.'); return; }

    ensureSelectionMeasurements(() => {
      const request = buildRequest();
      logInfo(`Calculando grade ${request.artWMm.toFixed(1)}×${request.artHMm.toFixed(1)}mm${isArtSizeLocked ? ' [🔒 Bloqueado]' : ''} em ${request.sheetWMm.toFixed(1)}×${request.sheetHMm.toFixed(1)}mm (margem ${request.margins.top.toFixed(1)}mm)...`);
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
      logInfo(`Aplicando imposição na bancada (${request.artWMm.toFixed(1)}×${request.artHMm.toFixed(1)}mm${isArtSizeLocked ? ' [🔒 Bloqueado]' : ''})...`);
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

        const marksType = document.getElementById('marksSelector').value;
        const keepArtboard = document.getElementById('chkKeepArtboard').checked;
        const drawTrimBoxGuides = document.getElementById('chkTrimBoxGuides').checked;
        const markOffsetMm = toMm(parseFloat(document.getElementById('markOffset').value) || 3.175, currentUnit);
        const markLengthMm = toMm(parseFloat(document.getElementById('markLength').value) || 6.35, currentUnit);
        const strokeWidthPt = parseFloat(document.getElementById('strokeWidthPt').value) || 0.25;
        const outsideOnly = document.getElementById('chkOutsideOnly').checked;
        const bleedMm = toMm(parseFloat(document.getElementById('bleedMm').value) || 0, currentUnit);
        const marginMm = toMm(parseFloat(document.getElementById('marginMm').value) || 0, currentUnit);

        const headFoot = document.getElementById('headFootSelector') ? document.getElementById('headFootSelector').value : 'head_to_foot';

        const options = {
          keepArtboard: keepArtboard,
          headFoot: headFoot,
          marksType: marksType,
          drawTrimBoxGuides: drawTrimBoxGuides,
          marginMm: marginMm,
          markOffsetPt: markOffsetMm * (72.0 / 25.4),
          markLengthPt: markLengthMm * (72.0 / 25.4),
          strokeWidthPt: strokeWidthPt,
          outsideOnly: outsideOnly,
          bleedMm: bleedMm,
          shouldDrawFrame: marksType === 'moldura'
        };

        function processApplyResult(applyResult) {
          if (!applyResult || applyResult.indexOf('EvalScript error') !== -1 || applyResult.indexOf('EvalScript Error') !== -1 || applyResult.indexOf('Error ') !== -1 || applyResult.indexOf('não é uma função') !== -1) {
            logErr(`Falha ao aplicar na bancada: ${applyResult || '(vazio)'}`);
            return;
          }
          try {
            const r = JSON.parse(applyResult);
            if (!r.success) { logErr(`${r.errorCode || 'ERRO'}: ${r.message}`); return; }
            logOk(`Bancada aplicada (${r.placementCount} posições).`);
          } catch (e) {
            logErr(`Falha ao interpretar resposta da bancada: ${applyResult}`);
          }
        }

        evalJsx('applyComputedPlan', [result, JSON.stringify(options)], (applyResult) => {
          processApplyResult(applyResult);
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
      if (r.outputFiles && r.outputFiles.length) logOk(`PDF: ${r.outputFiles[0]}`);

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
        } catch (e) { /* ignorar */ }
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
      } catch (e) {
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
    csInterface.evalScript(script, (result) => {
      if (result && (result.indexOf('Error 24:') !== -1 || result.indexOf('não é uma função') !== -1 || result.indexOf('is not a function') !== -1)) {
        console.warn(`Função ${fnName} não disponível no ExtendScript. Recarregando impose.jsx...`);
        ensureExtendScriptLoaded((loaded) => {
          if (loaded) {
            csInterface.evalScript(script, callback || (() => {}));
          } else if (callback) {
            callback(result);
          }
        });
        return;
      }
      if (callback) callback(result);
    });
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
    } catch (e) { /* best-effort */ }
  }

  // ── Controle de Bloqueio de Tamanho da Arte (Cadeado) ──────────────
  let isArtSizeLocked = false;
  try {
    isArtSizeLocked = localStorage.getItem('graficaos_art_size_locked') === '1';
  } catch (e) {}

  function updateArtLockUI() {
    const btn = document.getElementById('btnLockArtSize');
    const icon = document.getElementById('lockIcon');
    const artW = document.getElementById('artW');
    const artH = document.getElementById('artH');
    if (!btn || !icon) return;

    if (isArtSizeLocked) {
      btn.classList.add('locked');
      icon.textContent = '🔒';
      btn.title = 'Tamanho BLOQUEADO: usando medidas manuais fixas (a seleção do Illustrator NÃO irá alterar estes valores). Clique para desbloquear.';
      if (artW) artW.classList.add('input-locked');
      if (artH) artH.classList.add('input-locked');
    } else {
      btn.classList.remove('locked');
      icon.textContent = '🔓';
      btn.title = 'Tamanho DINÂMICO: medindo automaticamente da seleção. Clique para travar estas medidas.';
      if (artW) artW.classList.remove('input-locked');
      if (artH) artH.classList.remove('input-locked');
    }
  }

  function setArtSizeLocked(locked, logMessage) {
    isArtSizeLocked = locked;
    try {
      localStorage.setItem('graficaos_art_size_locked', isArtSizeLocked ? '1' : '0');
    } catch (e) {}
    updateArtLockUI();
    if (logMessage) {
      const artWVal = document.getElementById('artW') ? document.getElementById('artW').value : '';
      const artHVal = document.getElementById('artH') ? document.getElementById('artH').value : '';
      if (isArtSizeLocked) {
        logInfo(`🔒 Tamanho da arte bloqueado: ${artWVal}×${artHVal}${currentUnit}. A seleção NÃO irá alterar estes valores.`);
      } else {
        logInfo('🔓 Tamanho da arte desbloqueado (medindo automaticamente da seleção).');
      }
    }
  }

  // ── Medidas da seleção ────────────────────────────────────────────

  let lastSeenBounds = null;

  function fillArtFromSelection(bounds) {
    if (isArtSizeLocked) return;
    if (!bounds || !bounds.selection) return;

    const wMm = Number(bounds.widthMm);
    const hMm = Number(bounds.heightMm);
    if (!Number.isFinite(wMm) || !Number.isFinite(hMm) || wMm <= 0 || hMm <= 0) return;

    const currentBoundsStr = wMm.toFixed(2) + 'x' + hMm.toFixed(2);
    if (lastSeenBounds === currentBoundsStr) {
        return; // As dimensões reais no Illustrator não mudaram, não sobrescreve o input
    }
    lastSeenBounds = currentBoundsStr;

    const w = roundUnit(fromMm(wMm, currentUnit), currentUnit);
    const h = roundUnit(fromMm(hMm, currentUnit), currentUnit);

    const artW = document.getElementById('artW');
    const artH = document.getElementById('artH');
    
    if (String(artW.value) !== String(w) || String(artH.value) !== String(h)) {
        artW.value = w;
        artH.value = h;
        logInfo(`Arte atualizada da seleção: ${w}×${h}${currentUnit}`);
    }
  }

  function refreshSelectionMeasurements() {
    if (isArtSizeLocked) return;
    evalJsx('getSelectionBounds', [], (result) => {
      try {
        const b = JSON.parse(result);
        if (b && b.selection) fillArtFromSelection(b);
      } catch (e) { /* ignora */ }
    });
  }

  function ensureSelectionMeasurements(cb) {
    if (isArtSizeLocked) {
      cb();
      return;
    }
    evalJsx('getSelectionBounds', [], (result) => {
      try {
        const b = JSON.parse(result);
        if (b && b.selection) fillArtFromSelection(b);
      } catch (e) { /* ignora */ }
      cb();
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────

  function getAiVersion() {
    try {
      const env = JSON.parse(csInterface.getHostEnvironment());
      return `${env.appName || 'ILST'} ${env.appVersion || '?'}`;
    } catch (e) {
      return 'Illustrator (versão desconhecida)';
    }
  }

  // ── Cleanup ao fechar ─────────────────────────────────────────────

  window.addEventListener('beforeunload', () => {
    trackEvent('plugin.closed');
  });
})();
