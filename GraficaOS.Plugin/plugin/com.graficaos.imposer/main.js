/* ── GraficaOS Imposer — main.js (CEP Panel) ── */
/* ES2020 — roda no Chromium Embedded Framework do CEP */

(() => {
  'use strict';

  const csInterface = new CSInterface();
  let activeTab = 'pdf';
  let engineOnline = false;
  let tenantData = null;

  // ── Inicialização ─────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    setupTabs();
    setupButtons();
    checkEngine();
    trackEvent('plugin.opened', { illustratorVersion: getAiVersion() });
  }

  // ── Tabs ──────────────────────────────────────────────────────────

  function setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeTab = tab.dataset.tab;

        document.getElementById('tab-pdf').classList.toggle('hidden', activeTab !== 'pdf');
        document.getElementById('tab-bancada').classList.toggle('hidden', activeTab !== 'bancada');
      });
    });
  }

  // ── Botões ────────────────────────────────────────────────────────

  function setupButtons() {
    document.getElementById('btnPickPdf').addEventListener('click', pickPdf);
    document.getElementById('btnPlan').addEventListener('click', handlePlan);
    document.getElementById('btnImpose').addEventListener('click', handleImpose);
    document.getElementById('btnClearLog').addEventListener('click', clearLog);
    document.getElementById('btnInfo').addEventListener('click', openInfoModal);
    document.getElementById('btnCloseInfo').addEventListener('click', closeModals);
    document.getElementById('btnCloseOverflow').addEventListener('click', closeModals);
    document.getElementById('btnFlush').addEventListener('click', handleFlush);
    document.getElementById('modalBackdrop').addEventListener('click', closeModals);
  }

  // ── Motor COM ─────────────────────────────────────────────────────

  function checkEngine() {
    setBadge('loading');
    evalJsx('getEngineVersion', [], (result) => {
      if (result && !result.startsWith('EvalScript Error')) {
        engineOnline = true;
        setBadge('online', `Motor v${result}`);
        loadTenant();
      } else {
        engineOnline = false;
        setBadge('offline', 'Motor não disponível');
        logErr('Motor GraficaOS não registrado. Reinstale o plugin.');
      }
    });
  }

  function loadTenant() {
    evalJsx('getActiveTenant', [], (result) => {
      try {
        tenantData = JSON.parse(result);
        document.getElementById('tenantId').textContent = tenantData.tenantId || '—';
      } catch {
        document.getElementById('tenantId').textContent = '—';
      }
    });
  }

  // ── Selecionar PDF ────────────────────────────────────────────────

  function pickPdf() {
    evalJsx('pickPdfFile', [], (result) => {
      try {
        const parsed = JSON.parse(result);
        if (parsed && parsed.path) {
          document.getElementById('pdfPath').value = parsed.path;
          logInfo(`Arquivo: ${parsed.path}`);
        }
      } catch {
        if (result && result !== 'null' && result !== 'undefined') {
          document.getElementById('pdfPath').value = result;
        }
      }
    });
  }

  // ── Construir Request JSON ────────────────────────────────────────

  function buildRequest() {
    const isPdf = activeTab === 'pdf';
    const suffix = isPdf ? '' : '2';

    const sheetW = parseFloat(document.getElementById(`sheetW${suffix}`).value) || 710;
    const sheetH = parseFloat(document.getElementById(`sheetH${suffix}`).value) || 1000;
    const artW = parseFloat(document.getElementById(`artW${suffix}`).value) || 49;
    const artH = parseFloat(document.getElementById(`artH${suffix}`).value) || 74;
    const target = parseInt(document.getElementById(`targetCopies${suffix}`).value, 10) || 1;
    const gap = parseFloat(document.getElementById(`gapMm${suffix}`).value) || 0;
    const marks = document.getElementById(`chkMarks${suffix}`).checked;

    const request = {
      schemaVersion: '1.0',
      requestId: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      sheetWMm: sheetW,
      sheetHMm: sheetH,
      artWMm: artW,
      artHMm: artH,
      gapMm: gap,
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      targetCopies: target,
      forceRotation: null,
      surplusPolicy: 'fill_row',
      substrateKind: 'sheet',
      maxLengthMm: null,
      marks: marks ? { enabled: true, type: 'mimaki-fcrm', sizeMm: 20, offsetMm: 3 } : null,
    };

    if (isPdf) {
      request.inputPath = document.getElementById('pdfPath').value || null;
      request.outputDir = request.inputPath
        ? request.inputPath.replace(/[/\\][^/\\]+$/, '')
        : null;
    }

    return request;
  }

  // ── Ações ─────────────────────────────────────────────────────────

  function handlePlan() {
    if (!engineOnline) { logErr('Motor offline. Verifique a instalação.'); return; }

    const request = buildRequest();
    logInfo(`Calculando grade ${request.artWMm}×${request.artHMm}mm em ${request.sheetWMm}×${request.sheetHMm}mm...`);
    trackEvent('imposition.requested', { mode: 'plan', tab: activeTab });

    const json = JSON.stringify(request);
    evalJsx('planImposition', [json], (result) => {
      handleResponse(result, 'plan');
    });
  }

  function handleImpose() {
    if (!engineOnline) { logErr('Motor offline. Verifique a instalação.'); return; }

    const request = buildRequest();

    if (activeTab === 'pdf') {
      if (!request.inputPath) {
        logErr('Selecione um arquivo PDF antes de impor.');
        return;
      }
      logInfo(`Impondo PDF: ${request.inputPath}...`);
      trackEvent('imposition.requested', { mode: 'pdf', tab: 'pdf' });

      evalJsx('imposeToPdf', [JSON.stringify(request)], (result) => {
        handleResponse(result, 'pdf');
      });
    } else {
      logInfo('Aplicando imposição na bancada...');
      trackEvent('imposition.requested', { mode: 'bancada', tab: 'bancada' });

      evalJsx('applyPlanToDocument', [JSON.stringify(request)], (result) => {
        handleResponse(result, 'bancada');
      });
    }
  }

  function handleResponse(resultStr, mode) {
    try {
      const r = JSON.parse(resultStr);

      if (r.errorCode === 'E_GRID_OVERFLOW') {
        logWarn(r.message);
        showOverflowModal(r);
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

  function showOverflowModal(response) {
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
        closeModals();
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
      evalJsx('getEngineVersion', [], (v) => {
        document.getElementById('infoMotorVersion').textContent = v || '—';
      });
      evalJsx('getActiveTenant', [], (result) => {
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
    evalJsx('flushTelemetry', [], (result) => {
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
      evalJsx('trackEvent', [JSON.stringify(evt)]);
    } catch { /* best-effort */ }
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
