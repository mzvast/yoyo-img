const setupEvents = require('./setupEvents')
if (setupEvents.handleSquirrelEvent()) {
  // squirrel event handled and app will exit in 1000ms, so don't do anything else
  return;
}

const { app, BrowserWindow, ipcMain, Menu, dialog, clipboard } = require('electron')
const path = require('path')
const url = require('url')
const moment = require('moment')
const configuration = require('./configuration.js')
const qn = require('qn');
require('electron-debug')({ showDevTools: true });
let URLHistory = [];
let currentURL;

function addURLtoHistory(newURL){
  URLHistory.push(newURL);
  currentURL = newURL;
}

function saveHistoryToJSON(){
  let oldHistory = configuration.readSettings('URLHistory');
  configuration.saveSettings('URLHistory',oldHistory.concat(URLHistory));
}

function cpCurrentURL(){
  if(!currentURL) {return promptErr('No history')};
  setClipboardURL(currentURL,0);
}
function cpCurrentMD(){
  if(!currentURL) {return promptErr('No history')};
  setClipboardURL(currentURL,1);
}
/**
 * Temp dep
 */
const temp = require('temp'),
  fs = require('fs'),
  util = require('util'),
  exec = require('child_process').exec;
// Automatically track and cleanup files at exit
temp.track();


function promptErr(msg) {
  dialog.showErrorBox('Error', msg);
}

function getClient() {
  return qn.create(getKeys())
}

function getKeys() {
  return {
    accessKey: configuration.readSettings('keys')[0],
    secretKey: configuration.readSettings('keys')[1],
    bucket: configuration.readSettings('keys')[2],
    origin: configuration.readSettings('keys')[3],
  }
}
function makeName(filename) {
  let prefix = configuration.readSettings('prefix') + '-';
  let suffix = '-' + configuration.readSettings('suffix');
  let dateStr = "-" + moment().format();
  let timefix = configuration.readSettings('timefix') ? dateStr : '';
  return prefix + filename + suffix + timefix;
}
/**
 * 
 * @param {*} rawURL 原始URL
 * @param {*} type 是否markdown，0否，1是
 */
function setClipboardURL(rawURL, type) {
  if (!rawURL) return;
  let finalURL;
  console.log('type=',type);
  if (type === 0) {
    finalURL = rawURL;
  } else {
    finalURL = "![](" + rawURL + ")";
  }
  currentURL = rawURL;
  clipboard.writeText(finalURL);
}

ipcMain.on('upload', (event, arg) => {
  console.log(arg);
  let filepath = arg;
  let fileNameArr = path.normalize(arg).split('\\');
  let fileNameLen = fileNameArr.length;
  let filename = fileNameArr[fileNameLen - 1];

  let key = makeName(filename);

  console.log(filepath, key);
  // doUpload(filename,key);
  let client = getClient();

  doUpload(filepath, key);
})

function checkConfigBeforeUpload() {
  let keys = configuration.readSettings('keys');
  for (let i = 0; i < 4; i++) {
    if (!keys[i]) {
      promptErr('Please check settings!');
      return false;
    }
  }
  return true;
}

function doUpload(filepath, key) {
  if(!checkConfigBeforeUpload()) return;

  let client = getClient();
  client.uploadFile(filepath, { key: key }, function (err, result) {
    console.log(result);
    dialog.showMessageBox(null, {
      type: "info",
      buttons: ['Ok'],
      message: '已经复制到剪贴板',
      title: '上传成功'
    }, () => {
      let markdownOn = configuration.readSettings('markdown');
      setClipboardURL(result.url, markdownOn);
    });
  });
}

let win

function createWindow() {
  if (win) {
    return;
  }

  configuration.initConfig();

  win = new BrowserWindow({ width: 300, height: 400, alwaysOnTop: false, y: 80, x: 0, icon: __dirname + '/app/img/app-icon.ico' })

  win.setMenu(menu)

  win.loadURL(url.format({
    pathname: path.join(__dirname, '/app/index.html'),
    protocol: 'file:',
    slashes: true
  }))

  // Emitted when the window is closed.
  win.on('closed', () => {
    win = null
  })
}

app.on('ready', createWindow)

app.on('window-all-closed', () => {
  saveHistoryToJSON();

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (win === null) {
    createWindow()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

let settingsWindow = null;

function openSettingsWindow() {
  if (settingsWindow) {
    return;
  }

  settingsWindow = new BrowserWindow({
    height: 650, width: 400, alwaysOnTop: false, y: 80, x: 300
  });
  settingsWindow.setMenu(null);

  settingsWindow.loadURL(url.format({
    pathname: path.join(__dirname, '/app/settings.html'),
    protocol: 'file:',
    slashes: true
  }))

  // Open the DevTools.
  // settingsWindow.webContents.openDevTools()

  settingsWindow.on('closed', function () {
    settingsWindow = null;
  });
}


function closeSettingsWindow() {
  settingsWindow.close();
  console.log('cancel!');
}

function addBucket(bucket_name) {
  configuration.addSettings('buckets', bucket_name);
}
function addDomain(domain_name) {
  configuration.addSettings('domains', domain_name);
}
function removeBucket(bucket_name) {
  configuration.removeSettings('buckets', bucket_name);
}
function removeDomain(domain_name) {
  configuration.removeSettings('domains', domain_name);
}


function getClipboardIMG() {
  let img = clipboard.readImage();
  return img;
}
function uploadClipboard(){
  if(!checkConfigBeforeUpload()) return;
  let img = getClipboardIMG();
  temp.open('picorzimg', function (err, info) {
    if (!err) {
      fs.write(info.fd, img.toPNG());
      fs.close(info.fd, function (err) {
        console.log(info.path);
        let newname = makeName('pasteshot')+"-" + moment().format()
        doUpload(info.path, newname);
      })
    }
  })
}


ipcMain.on('close-settings-window', closeSettingsWindow)
ipcMain.on('open-settings-window', openSettingsWindow)
ipcMain.on('add-bucket', addBucket)
ipcMain.on('remove-bucket', removeBucket)
ipcMain.on('add-domain', addDomain)
ipcMain.on('remove-domain', removeDomain)
ipcMain.on('upload-clipboard', uploadClipboard)
ipcMain.on('cp-URL',cpCurrentURL);
ipcMain.on('cp-MD',cpCurrentMD);

const template = [
  {
    label: 'Tools',
    submenu: [
      {
        label: 'Settings',
        click() {
          openSettingsWindow();
        }
      }
    ]
  },
  {
    label: 'About',
    submenu: [
      {
        label: 'Support',
        click() { require('electron').shell.openExternal('https://github.com/mzvast/Picorz') }
      },
      {
        label: 'Update',
        click() { require('electron').shell.openExternal('https://github.com/mzvast/Picorz/releases') }
      },
      {
        label: 'v' + app.getVersion()
      }
    ]
  }
]

const menu = Menu.buildFromTemplate(template)
// Menu.setApplicationMenu(menu)