/**
 * CSInterface.js — Adobe CEP Common Extensibility Platform
 *
 * IMPORTANTE: Este é um stub mínimo para desenvolvimento.
 * Para produção, baixe a versão oficial de:
 * https://github.com/AdobeDev/CEP-Resources/tree/master/CEP_11.x/CSInterface.js
 *
 * Copie o arquivo CSInterface.js oficial para este diretório,
 * substituindo este stub.
 */

function CSInterface() {
    this.evalScript = function(script, callback) {
        if (callback) callback('EvalScript Error: CSInterface stub — instale a versão real');
    };
    this.addEventListener = function() {};
    this.removeEventListener = function() {};
    this.requestOpenExtension = function() {};
    this.getSystemPath = function(type) { return ''; };
    this.getHostEnvironment = function() {
        return JSON.stringify({ appName: 'ILST', appVersion: '0.0' });
    };
}

CSInterface.prototype.THEME_COLOR_CHANGED_EVENT = 'com.adobe.csxs.events.ThemeColorChanged';
CSInterface.SystemPath = { EXTENSION: 'extension', USER_DATA: 'userData', COMMON_FILES: 'commonFiles' };
