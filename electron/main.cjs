const { app, BrowserWindow, shell, Menu, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PREFERRED_PORT = 45821;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

let mainWindow = null;
let staticServer = null;
let lastUpdateStatus = { phase: 'idle' };

function sendUpdateStatus(payload) {
  lastUpdateStatus = payload;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('yeobaek:update-status', payload);
  }
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    sendUpdateStatus({ phase: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    sendUpdateStatus({ phase: 'available', version: info?.version });
  });

  autoUpdater.on('update-not-available', (info) => {
    sendUpdateStatus({ phase: 'not-available', version: info?.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus({
      phase: 'downloading',
      version: lastUpdateStatus.version,
      percent: Math.round(progress?.percent ?? 0),
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendUpdateStatus({ phase: 'downloaded', version: info?.version });
  });

  autoUpdater.on('error', (err) => {
    sendUpdateStatus({
      phase: 'error',
      message: err?.message || '업데이트 확인 중 오류가 발생했습니다.',
    });
  });
}

function registerIpcHandlers() {
  ipcMain.handle('yeobaek:get-app-version', () => app.getVersion());

  ipcMain.handle('yeobaek:check-for-updates', async () => {
    if (!app.isPackaged) {
      const devMsg = '개발 모드에서는 자동 업데이트를 실행하지 않습니다.';
      sendUpdateStatus({ phase: 'not-available', version: app.getVersion(), message: devMsg });
      return { ok: false, reason: devMsg };
    }
    try {
      await autoUpdater.checkForUpdates();
      return { ok: true };
    } catch (err) {
      const message = err?.message || '업데이트 서버에 연결할 수 없습니다.';
      sendUpdateStatus({ phase: 'error', message });
      return { ok: false, reason: message };
    }
  });

  ipcMain.handle('yeobaek:install-update', () => {
    if (!app.isPackaged) return;
    autoUpdater.quitAndInstall(false, true);
  });
}

function resolveOutDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'out');
  }
  return path.join(__dirname, '..', 'out');
}

function startStaticServer(outDir) {
  const resolvedOut = path.resolve(outDir);
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const parsed = new URL(req.url || '/', 'http://localhost');
        let pathname = decodeURIComponent(parsed.pathname);
        if (pathname === '/') pathname = '/index.html';

        const normalized = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '');
        let filePath = path.resolve(resolvedOut, `.${path.sep}${normalized}`);

        if (!filePath.startsWith(`${resolvedOut}${path.sep}`) && filePath !== resolvedOut) {
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Forbidden');
          return;
        }

        const isReadableFile = async (p) => {
          try {
            const st = await fs.promises.stat(p);
            return st.isFile();
          } catch {
            return false;
          }
        };

        if (!(await isReadableFile(filePath))) {
          const withHtml = `${filePath}.html`;
          if (await isReadableFile(withHtml)) {
            filePath = withHtml;
          } else {
            filePath = path.join(resolvedOut, 'index.html');
          }
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const data = await fs.promises.readFile(filePath);
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000',
        });
        res.end(data);
      } catch {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Internal Server Error');
      }
    });

    const listenOnPort = (port) => {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && port !== 0) {
          listenOnPort(0);
        } else {
          reject(err);
        }
      });
      server.listen(port, '127.0.0.1', () => {
        const addr = server.address();
        resolve({ server, port: addr.port });
      });
    };

    listenOnPort(PREFERRED_PORT);
  });
}

function createWindow(url, outDir) {
  const iconPath = path.join(outDir, 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 420,
    minHeight: 560,
    title: '여백 — Yeobaek',
    backgroundColor: '#FAF9F6',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  Menu.setApplicationMenu(null);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Allow Google OAuth popups only for exact allowed HTTPS hosts; open other links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    try {
      const parsed = new URL(targetUrl);
      const allowedOAuthHosts = new Set(['accounts.google.com', 'content.googleapis.com']);
      if (parsed.protocol === 'https:' && allowedOAuthHosts.has(parsed.hostname)) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 520,
            height: 660,
            autoHideMenuBar: true,
            webPreferences: {
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
            },
          },
        };
      }
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        void shell.openExternal(targetUrl);
      }
    } catch {
      // Ignore malformed URLs
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(url);
}

// Enforce single instance so IndexedDB stays clean
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    setupAutoUpdater();
    registerIpcHandlers();

    const outDir = resolveOutDir();
    const devUrl = process.env.ELECTRON_START_URL;
    if (devUrl) {
      createWindow(devUrl, outDir);
      return;
    }

    const { server, port } = await startStaticServer(outDir);
    staticServer = server;
    createWindow(`http://localhost:${port}`, outDir);

    // Check for updates quietly 5 seconds after launch so startup remains instant
    if (app.isPackaged) {
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch(() => {
          // Silently ignore offline / unreachable release checks on background startup
        });
      }, 5000);
    }
  });

  app.on('window-all-closed', () => {
    if (staticServer) {
      staticServer.close();
      staticServer = null;
    }
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
