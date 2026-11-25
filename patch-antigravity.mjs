#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const ANTIGRAVITY_DIR = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'Programs',
  'antigravity'
);
const ASAR_PATH = path.join(ANTIGRAVITY_DIR, 'resources', 'app.asar');
const ORIG_PATH = path.join(ANTIGRAVITY_DIR, 'resources', 'app.asar.orig');
const VERSION_PATH = path.join(ANTIGRAVITY_DIR, 'version');
const BASE_DIR = path.dirname(fileURLToPath(import.meta.url)).replace(/\\/g, '/');
const PATCH_MARKER = '/* AGY_VI_PATCH_V9 */';

const MAIN_SNIPPET = `
${PATCH_MARKER}
try {
  const _viFs = require('fs');
  const _viHttps = require('https');
  const _viBase = ${JSON.stringify(BASE_DIR)};
  electron_1.ipcMain.on('agy-vi:get-bundle', (event) => {
    try {
      const code = _viFs.readFileSync(_viBase + '/vi-inject.js', 'utf8');
      const dict = JSON.parse(_viFs.readFileSync(_viBase + '/vi-dict.json', 'utf8'));
      event.returnValue = { ok: true, code, dict };
    } catch (err) {
      event.returnValue = { ok: false, error: String(err) };
    }
  });
  electron_1.ipcMain.on('agy-vi:get-dict', (event) => {
    try {
      event.returnValue = JSON.parse(_viFs.readFileSync(_viBase + '/vi-dict.json', 'utf8'));
    } catch {
      event.returnValue = null;
    }
  });
  function _viQueryLs(pathName, body = '{}') {
    return new Promise((resolve) => {
      try {
        const port = languageServer_1.getLsPort?.() || 0;
        const token = authBootstrap_1.getActiveLsCsrfToken?.() || '';
        if (!port || !token) return resolve(null);
        const req = _viHttps.request({
          hostname: '127.0.0.1',
          port: port,
          path: pathName,
          method: 'POST',
          rejectUnauthorized: false,
          headers: {
            'Content-Type': 'application/json',
            'x-codeium-csrf-token': token,
          },
          timeout: 4500,
        }, (res) => {
          let chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            try {
              const str = Buffer.concat(chunks).toString('utf8');
              const idx = str.indexOf('{');
              if (idx !== -1) {
                resolve(JSON.parse(str.slice(idx)));
              } else {
                resolve(null);
              }
            } catch {
              resolve(null);
            }
          });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.write(body);
        req.end();
      } catch {
        resolve(null);
      }
    });
  }
  electron_1.ipcMain.handle('agy-vi:fetch-quota-direct', async () => {
    try {
      // 1. RetrieveUserQuotaSummary
      let res1 = await _viQueryLs(
        '/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary',
        JSON.stringify({ request: {}, forceRefresh: true })
      );
      if (!res1 || (!res1.groups && !res1.response?.groups && !res1.buckets && !res1.response?.buckets)) {
        res1 = await _viQueryLs(
          '/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary',
          '{}'
        );
      }
      if (res1) {
        const root = res1.response || res1.userQuotaSummary || res1.summary || res1;
        if ((root.groups && root.groups.length > 0) || (root.buckets && root.buckets.length > 0)) {
          try {
            _viFs.writeFileSync(_viBase + '/quota-debug.json', JSON.stringify({ rpc: 'RetrieveUserQuotaSummary', data: res1 }, null, 2), 'utf8');
          } catch {}
          return res1;
        }
      }
      // 2. GetCommandModelConfigs
      const res2 = await _viQueryLs('/exa.language_server_pb.LanguageServerService/GetCommandModelConfigs');
      if (res2) {
        try {
          _viFs.writeFileSync(_viBase + '/quota-debug.json', JSON.stringify({ rpc: 'GetCommandModelConfigs', data: res2 }, null, 2), 'utf8');
        } catch {}
        return res2;
      }
      return await _viQueryLs('/exa.language_server_pb.LanguageServerService/GetUserStatus');
    } catch {
      return null;
    }
  });
  function _viParseTs(ts) {
    if (!ts) return 0;
    if (typeof ts === 'string') return Date.parse(ts) || 0;
    if (typeof ts === 'object') return Number(ts.seconds || 0) * 1000;
    return 0;
  }
  electron_1.ipcMain.handle('agy-vi:fetch-context-direct', async (_ev, hint) => {
    try {
      const all = await _viQueryLs(
        '/exa.language_server_pb.LanguageServerService/GetAllCascadeTrajectories',
        JSON.stringify({ excludeSubtrajectories: true })
      );
      const summaries = all?.trajectorySummaries || all?.trajectory_summaries || {};
      const entries = Object.entries(summaries);
      if (entries.length === 0) return null;

      let targetId = '';
      const hintId = hint?.cascadeId || '';
      const hintTitle = (hint?.title || '').trim();
      const hintTitles = Array.isArray(hint?.titles) ? hint.titles.map((t) => String(t || '').trim()).filter(Boolean) : [];
      if (hintTitle && !hintTitles.includes(hintTitle)) hintTitles.unshift(hintTitle);

      if (hintId && summaries[hintId]) {
        targetId = hintId;
      } else if (hintTitles.length > 0) {
        for (const t of hintTitles) {
          const exact = entries.find(([, v]) => (v?.summary || '').trim() === t);
          if (exact) { targetId = exact[0]; break; }
        }
        if (!targetId) {
          const lowerList = hintTitles.map((t) => t.toLowerCase());
          const ci = entries.find(([, v]) => {
            const s = (v?.summary || '').trim().toLowerCase();
            return s && lowerList.includes(s);
          });
          if (ci) targetId = ci[0];
        }
      }

      if (!targetId) {
        entries.sort((a, b) => _viParseTs(b[1]?.lastModifiedTime || b[1]?.last_modified_time) - _viParseTs(a[1]?.lastModifiedTime || a[1]?.last_modified_time));
        targetId = entries[0][0];
      }

      const meta = await _viQueryLs(
        '/exa.language_server_pb.LanguageServerService/GetCascadeTrajectoryGeneratorMetadata',
        JSON.stringify({ cascadeId: targetId })
      );
      const list = meta?.generatorMetadata || meta?.generator_metadata || [];
      let latestUsage = null;
      let latestModel = '';
      for (let i = list.length - 1; i >= 0; i--) {
        const cm = list[i]?.chatModel || list[i]?.chat_model;
        const u = cm?.usage;
        if (u && (u.inputTokens || u.input_tokens || u.cacheReadTokens || u.cache_read_tokens || u.outputTokens || u.output_tokens)) {
          latestUsage = u;
          latestModel = u.responseModel || u.response_model || cm.model || u.model || '';
          break;
        }
      }
      const summaryObj = summaries[targetId] || {};
      const result = {
        cascadeId: targetId,
        title: summaryObj.summary || '',
        stepCount: summaryObj.stepCount || summaryObj.step_count || 0,
        model: latestModel,
        inputTokens: Number(latestUsage?.inputTokens || latestUsage?.input_tokens || 0),
        cacheReadTokens: Number(latestUsage?.cacheReadTokens || latestUsage?.cache_read_tokens || 0),
        cacheWriteTokens: Number(latestUsage?.cacheWriteTokens || latestUsage?.cache_write_tokens || 0),
        outputTokens: Number(latestUsage?.outputTokens || latestUsage?.output_tokens || 0),
        thinkingOutputTokens: Number(latestUsage?.thinkingOutputTokens || latestUsage?.thinking_output_tokens || 0),
        matchedBy: (hintId && summaries[hintId]) ? 'id' : (targetId && hintTitles.length > 0 ? 'title_or_recent' : 'recent'),
      };
      try {
        _viFs.writeFileSync(_viBase + '/context-debug.json', JSON.stringify({ result, hint, sampleUsage: latestUsage }, null, 2), 'utf8');
      } catch {}
      return result;
    } catch {
      return null;
    }
  });
} catch {}
`;

const PRELOAD_SNIPPET = `
${PATCH_MARKER}
try {
  if (!isRemoteWindow) {
    const _viBundle = electron_1.ipcRenderer.sendSync('agy-vi:get-bundle');
    if (_viBundle && _viBundle.ok && _viBundle.code) {
      const _viInit = eval(_viBundle.code);
      if (typeof _viInit === 'function') {
        _viInit(
          _viBundle.dict,
          () => electron_1.ipcRenderer.sendSync('agy-vi:get-dict'),
          () => electron_1.ipcRenderer.invoke('agy-vi:fetch-quota-direct'),
          (hint) => electron_1.ipcRenderer.invoke('agy-vi:fetch-context-direct', hint)
        );
      }
    }
  }
} catch {}
`;

function readAsar(asarPath) {
  const buf = fs.readFileSync(asarPath);
  if (buf.length < 16) {
    throw new Error(`Invalid ASAR file (too small): ${asarPath}`);
  }
  const headerJsonSize = buf.readUInt32LE(12);
  const headerPickleSize = buf.readUInt32LE(4);
  const dataOffset = 8 + headerPickleSize;
  const headerStr = buf.subarray(16, 16 + headerJsonSize).toString('utf8');
  const header = JSON.parse(headerStr);
  return { buf, header, dataOffset };
}

function getFileEntry(header, parts) {
  let cur = header;
  for (const p of parts) {
    if (!cur?.files?.[p]) return null;
    cur = cur.files[p];
  }
  return cur;
}

function extractFileBuffer(asar, entry) {
  const offset = asar.dataOffset + Number(entry.offset);
  return asar.buf.subarray(offset, offset + entry.size);
}

function computeIntegrity(fileBuf, blockSize = 4194304) {
  const hash = crypto.createHash('sha256').update(fileBuf).digest('hex');
  const blocks = [];
  for (let i = 0; i < fileBuf.length; i += blockSize) {
    const slice = fileBuf.subarray(i, Math.min(i + blockSize, fileBuf.length));
    blocks.push(crypto.createHash('sha256').update(slice).digest('hex'));
  }
  if (blocks.length === 0) {
    blocks.push(crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex'));
  }
  return { algorithm: 'SHA256', hash, blockSize, blocks };
}

function rebuildAsar(asar, replaceMap) {
  const chunks = [];
  let currentOffset = 0;

  function cloneAndCollect(node, prefix = '') {
    if (node.files) {
      const outFiles = {};
      for (const key of Object.keys(node.files)) {
        const childPath = prefix ? `${prefix}/${key}` : key;
        outFiles[key] = cloneAndCollect(node.files[key], childPath);
      }
      return { files: outFiles };
    }

    if (node.unpacked) {
      return { ...node };
    }

    const fileBuf = replaceMap.has(prefix)
      ? replaceMap.get(prefix)
      : extractFileBuffer(asar, node);

    const out = {
      ...node,
      size: fileBuf.length,
      offset: String(currentOffset),
    };
    if (node.integrity) {
      out.integrity = computeIntegrity(fileBuf, node.integrity.blockSize || 4194304);
    }
    chunks.push(fileBuf);
    currentOffset += fileBuf.length;
    return out;
  }

  const newHeader = cloneAndCollect(asar.header);
  const headerJsonBuf = Buffer.from(JSON.stringify(newHeader), 'utf8');
  const alignedStrLen = (headerJsonBuf.length + 3) & ~3;
  const padLen = alignedStrLen - headerJsonBuf.length;

  const prefixBuf = Buffer.alloc(16);
  prefixBuf.writeUInt32LE(4, 0);
  prefixBuf.writeUInt32LE(alignedStrLen + 8, 4);
  prefixBuf.writeUInt32LE(alignedStrLen + 4, 8);
  prefixBuf.writeUInt32LE(headerJsonBuf.length, 12);

  const padBuf = Buffer.alloc(padLen, 0);
  return Buffer.concat([prefixBuf, headerJsonBuf, padBuf, ...chunks]);
}

function getAppVersion() {
  try {
    return fs.readFileSync(VERSION_PATH, 'utf8').trim();
  } catch {
    return 'unknown';
  }
}

function checkStatus(targetPath = ASAR_PATH) {
  const asar = readAsar(targetPath);
  const preloadEntry = getFileEntry(asar.header, ['dist', 'preload.js']);
  const mainEntry = getFileEntry(asar.header, ['dist', 'main.js']);
  if (!preloadEntry || !mainEntry) {
    throw new Error('dist/preload.js or dist/main.js not found inside app.asar');
  }
  const preloadStr = extractFileBuffer(asar, preloadEntry).toString('utf8');
  const mainStr = extractFileBuffer(asar, mainEntry).toString('utf8');
  const patched = preloadStr.includes(PATCH_MARKER) && mainStr.includes(PATCH_MARKER);
  const hasAnyPatch = preloadStr.includes('AGY_VI_PATCH_') || mainStr.includes('AGY_VI_PATCH_');
  return {
    patched,
    hasAnyPatch,
    version: getAppVersion(),
    asarPath: targetPath,
    origBackupExists: fs.existsSync(ORIG_PATH),
  };
}

function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes('--check');
  const ifNeeded = args.includes('--if-needed');
  const force = args.includes('--force');
  const testIdx = args.indexOf('--test-copy');
  const testDest = testIdx !== -1 ? args[testIdx + 1] : null;

  if (isCheck) {
    const status = checkStatus();
    console.log(JSON.stringify(status, null, 2));
    process.exit(status.patched ? 0 : 1);
  }

  const status = checkStatus();
  if (ifNeeded && status.patched && !force) {
    console.log(`[agy-vi] Already patched (v${status.version}).`);
    process.exit(0);
  }

  // Backup unpatched original whenever app.asar is genuinely unpatched (first run or post-update)
  if (!status.hasAnyPatch && !testDest) {
    fs.copyFileSync(ASAR_PATH, ORIG_PATH);
    console.log(`[agy-vi] Backed up original app.asar (v${status.version}) -> app.asar.orig`);
  }

  const sourcePath = status.hasAnyPatch && fs.existsSync(ORIG_PATH) && !testDest ? ORIG_PATH : ASAR_PATH;
  const asar = readAsar(sourcePath);

  const mainEntry = getFileEntry(asar.header, ['dist', 'main.js']);
  const preloadEntry = getFileEntry(asar.header, ['dist', 'preload.js']);
  let mainStr = extractFileBuffer(asar, mainEntry).toString('utf8');
  let preloadStr = extractFileBuffer(asar, preloadEntry).toString('utf8');

  if (!mainStr.includes(PATCH_MARKER)) {
    mainStr += MAIN_SNIPPET;
  }
  if (!preloadStr.includes(PATCH_MARKER)) {
    preloadStr += PRELOAD_SNIPPET;
  }

  const outBuf = rebuildAsar(
    asar,
    new Map([
      ['dist/main.js', Buffer.from(mainStr, 'utf8')],
      ['dist/preload.js', Buffer.from(preloadStr, 'utf8')],
    ])
  );

  if (testDest) {
    fs.writeFileSync(testDest, outBuf);
    const verified = checkStatus(testDest);
    console.log('[agy-vi] Test copy verified:', JSON.stringify(verified));
    process.exit(verified.patched ? 0 : 2);
  }

  const tmpPath = ASAR_PATH + '.vi-tmp';
  fs.writeFileSync(tmpPath, outBuf);
  try {
    fs.renameSync(tmpPath, ASAR_PATH);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {}
    throw new Error(
      `Cannot replace app.asar (is Antigravity.exe still running?): ${err.message}`
    );
  }

  const finalStatus = checkStatus();
  console.log('[agy-vi] Patched successfully:', JSON.stringify(finalStatus));
}

main();
