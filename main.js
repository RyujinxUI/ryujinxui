const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    fullscreen: true,
    resizable: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', function () {
    mainWindow = null;
  });

  const packageJsonPath = path.join(__dirname, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const version = packageJson.version;

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('app-version', version);
  });
}

function ensureConfigFile(configPath) {
  if (!fs.existsSync(configPath)) {
    const defaultConfig = {
      "ryujinx_path": "none",
      "games_path": "none"
    };
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  } else {
    const configFile = fs.readFileSync(configPath);
    return JSON.parse(configFile);
  }
}

function checkPaths(config) {
  if (config.ryujinx_path === "none" || config.games_path === "none") {
    dialog.showMessageBoxSync(mainWindow, {
      type: 'error',
      buttons: ['Open Config Folder', 'Close'],
      title: 'Error01 : Configuration Error',
      message: 'The paths in config.json are not set. Please set the ryujinx_path and games_path.',
    }).then(result => {
      if (result.response === 0) {
        const configFolder = path.dirname(configPath);
        require('child_process').exec(`start "" "${configFolder}"`);
      } else {
        app.quit();
      }
    });
    return false;
  }
  return true;
}

function checkMediaFolder(config) {
  const mediaPath = path.join(config.games_path, 'media');
  if (!fs.existsSync(mediaPath) || !fs.readdirSync(mediaPath).some(file => file.endsWith('.png'))) {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: ['Ignore', 'Close'],
      title: 'Warning01 : Media Warning',
      message: 'The media folder does not contain any PNG images. Some features may not work correctly.'
    });
    if (choice === 1) {
      app.quit();
      return false;
    }
  }
  return true;
}

function watchUserFolder(userPath) {
  const watcher = chokidar.watch(userPath, { persistent: true });

  watcher.on('add', filePath => {
    if (path.extname(filePath).toLowerCase() === '.png') {
      mainWindow.webContents.send('profile-icon-updated', filePath);
    }
  });

  watcher.on('change', filePath => {
    if (path.extname(filePath).toLowerCase() === '.png') {
      mainWindow.webContents.send('profile-icon-updated', filePath);
    }
  });
}

app.on('ready', () => {
  createWindow();

  const configPath = path.join(app.getPath('userData'), 'config.json');
  const config = ensureConfigFile(configPath);

  if (checkPaths(config) && checkMediaFolder(config)) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.send('config-paths', config);
    });

    const userPath = path.join(app.getPath('userData'), 'user');
    if (!fs.existsSync(userPath)) {
      fs.mkdirSync(userPath);
    }
    watchUserFolder(userPath);
  }
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});
