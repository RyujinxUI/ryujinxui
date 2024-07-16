const { ipcRenderer, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

let games = [];
let currentGameIndex = 0;
let ryujinxProcess = null;
let config = {};

document.addEventListener('DOMContentLoaded', () => {
  ipcRenderer.on('config-paths', (event, configData) => {
    config = configData;
    prefetchGameCovers(config.games_path);
    fetchGames(config.games_path, config.ryujinx_path);
  });
  setupGamepadListener();
});

ipcRenderer.on('profile-icon-updated', (event, filePath) => {
  const profileIcon = document.getElementById('profile-icon');
  if (profileIcon) {
    profileIcon.src = filePath;
  }
});

async function fetchGames(gamesPath, ryujinxPath) {
  let gameIds = {};
  const gamesJsonPath = path.join(gamesPath, 'games.json');
  
  try {
    const gamesJson = fs.readFileSync(gamesJsonPath);
    gameIds = JSON.parse(gamesJson);
  } catch (error) {
    console.error('Error reading games.json:', error);
    return;
  }

  try {
    games = fs.readdirSync(gamesPath)
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return (ext === '.xci' || ext === '.nsp') && file.toLowerCase() !== 'media';
      })
      .map(file => {
        const gameName = cleanGameName(path.parse(file).name);
        const gameId = gameIds[gameName]?.id || null;
        return {
          name: gameName,
          id: gameId,
          extension: path.extname(file),
          image: getGameCover(path.join(gamesPath, 'media'), gameName),
          screenshot: getGameScreenshot(path.join(gamesPath, 'media/screenshottitle'), gameName),
          path: path.join(gamesPath, file),
          background: getGameBackground(path.join(gamesPath, 'media/background'), gameName)
        };
      });
  } catch (error) {
    console.error('Error reading games directory:', error);
    return;
  }

  const gameList = document.getElementById('game-list');
  gameList.innerHTML = ''; // Clear any existing game elements
  for (const [index, game] of games.entries()) {
    const gameElement = document.createElement('div');
    gameElement.classList.add('game-item');
    gameElement.innerHTML = `<div class="game-cover">
                               <img src="${game.image}" alt="${game.name}" data-index="${index}">
                               ${getExtensionBadge(game.extension)}
                             </div>`;
    gameElement.addEventListener('mouseover', () => showGameInfo(game));
    gameElement.addEventListener('mouseover', () => changeBackground(game.background));
    gameList.appendChild(gameElement);
  }

  // Automatically hover the first game
  if (games.length > 0) {
    highlightGame(0);
  }
}

function getGameScreenshot(screenshotPath, gameName) {
  let screenshotImage = 'contents/default_screenshot.png'; // Default image if none found

  try {
    if (fs.existsSync(screenshotPath)) {
      const screenshotFiles = fs.readdirSync(screenshotPath);
      const screenshotFile = screenshotFiles.find(file => file.toLowerCase().startsWith(gameName.toLowerCase()) && /\.(jpg|jpeg|png)$/i.test(file));
      if (screenshotFile) {
        screenshotImage = path.join(screenshotPath, screenshotFile);
      }
    }
  } catch (error) {
    console.error('Error reading screenshot directory:', error);
  }

  return screenshotImage;
}

function highlightGame(index) {
  const gameList = document.getElementById('game-list');
  const gameItems = gameList.getElementsByClassName('game-item');

  // Remove highlight from all games
  for (const item of gameItems) {
    item.querySelector('.game-cover img').classList.remove('highlight');
  }

  // Highlight the selected game
  const selectedGame = gameItems[index].querySelector('.game-cover img');
  selectedGame.classList.add('highlight');
  showGameInfo(games[index]);

  // Scroll into view
  selectedGame.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

function showGameInfo(game) {
  const gameInfo = document.getElementById('game-info');
  gameInfo.innerHTML = `<h2 class="game-info-title">${game.name}</h2>
                        <hr class="game-info-line">`;
}

function getGameCover(mediaPath, gameName) {
  let coverImage = 'contents/default_card.png'; // Default image if none found

  try {
    if (fs.existsSync(mediaPath)) {
      const mediaFiles = fs.readdirSync(mediaPath);
      const imageFile = mediaFiles.find(file => file.toLowerCase().startsWith(gameName.toLowerCase()) && /\.(jpg|jpeg|png)$/i.test(file));
      if (imageFile) {
        coverImage = path.join(mediaPath, imageFile);
      }
    }
  } catch (error) {
    console.error('Error reading media directory:', error);
  }

  return coverImage;
}

function getGameBackground(backgroundPath, gameName) {
  let backgroundImage = 'contents/default_background.jpg'; // Default image if none found

  try {
    if (fs.existsSync(backgroundPath)) {
      const backgroundFiles = fs.readdirSync(backgroundPath);
      const backgroundFile = backgroundFiles.find(file => file.toLowerCase().startsWith(gameName.toLowerCase()) && /\.(jpg|jpeg|png)$/i.test(file));
      if (backgroundFile) {
        backgroundImage = path.join(backgroundPath, backgroundFile);
      }
    }
  } catch (error) {
    console.error('Error reading background directory:', error);
  }

  return backgroundImage;
}

function cleanGameName(name) {
  return name.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();
}

function getExtensionBadge(extension) {
  if (extension === '.xci' || extension === '.nsp') {
    return `<span class="extension-badge">${extension.toUpperCase()}</span>`;
  }
  return '';
}

function setupGamepadListener() {
  window.addEventListener("gamepadconnected", (event) => {
    console.log("A gamepad connected:", event.gamepad);
    showGamepadNotification('Gamepad connected');
    setInterval(pollGamepads, 100); // Polling buttons every 100ms
  });

  window.addEventListener("gamepaddisconnected", (event) => {
    console.log("A gamepad disconnected:", event.gamepad);
    showGamepadNotification('Gamepad disconnected');
  });
}

function pollGamepads() {
  const gamepads = navigator.getGamepads();
  for (const gamepad of gamepads) {
    if (gamepad) {
      if (gamepad.axes[0] < -0.5) {
        navigateLeft();
      } else if (gamepad.axes[0] > 0.5) {
        navigateRight();
      }
      if (gamepad.buttons[14].pressed) {
        navigateLeft();
      } else if (gamepad.buttons[15].pressed) {
        navigateRight();
      }
      if (gamepad.buttons[1].pressed) {
        launchGame();
      }
    }
  }
}

function navigateLeft() {
  if (currentGameIndex > 0) {
    currentGameIndex--;
    highlightGame(currentGameIndex);
  }
}

function navigateRight() {
  if (currentGameIndex < games.length - 1) {
    currentGameIndex++;
    highlightGame(currentGameIndex);
  }
}

function launchGame() {
  const selectedGame = games[currentGameIndex];
  currentGameId = selectedGame.id;

  if (ryujinxProcess) {
    console.log('A game is already running.');
    return;
  }

  showLoadingPopup(); // Show loading popup

  ryujinxProcess = exec(`"${config.ryujinx_path}" "${selectedGame.path}"`);

  ryujinxProcess.on('close', (code) => {
    console.log(`Ryujinx exited with code ${code}`);
    hideLoadingPopup(); // Hide loading popup
    ryujinxProcess = null;
    currentGameId = null;
  });
}

function changeBackground(backgroundImage) {
  const body = document.querySelector('body');
  body.style.backgroundImage = `url(${backgroundImage})`;
}

function showLoadingPopup() {
  const loadingPopup = document.createElement('div');
  loadingPopup.id = 'loading-popup';
  loadingPopup.innerHTML = `<div class="loading-content">
                              <div class="loading-box">
                                <div class="spinner"></div>
                                <p>Launching Ryujinx...</p>
                              </div>
                            </div>`;
  document.body.appendChild(loadingPopup);
}

function hideLoadingPopup() {
  const loadingPopup = document.getElementById('loading-popup');
  if (loadingPopup) {
    document.body.removeChild(loadingPopup);
  }
}

function prefetchGameCovers(gamesPath) {
  const mediaPath = path.join(gamesPath, 'media');
  try {
    if (fs.existsSync(mediaPath)) {
      const mediaFiles = fs.readdirSync(mediaPath);
      mediaFiles.forEach(file => {
        if (/\.(jpg|jpeg|png)$/i.test(file)) {
          const img = new Image();
          img.src = path.join(mediaPath, file);
        }
      });
    }
  } catch (error) {
    console.error('Error prefetching game covers:', error);
  }
}

// Nouvelle fonction pour afficher la notification de la manette
function showGamepadNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'gamepad-notification';
  notification.innerText = message;
  
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.top = '0';
  }, 10); // Timeout pour permettre le repaint avant d'animer

  setTimeout(() => {
    notification.style.top = '-50px';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 500); // Timeout pour permettre l'animation de remontée
  }, 2000); // Timeout pour afficher pendant 2 secondes
}

// Ajouter le CSS pour la notification de la manette
const style = document.createElement('style');
style.innerHTML = `
  .gamepad-notification {
    position: fixed;
    top: -50px;
    left: 50%;
    transform: translateX(-50%);
    background-color: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 10px 20px;
    border-radius: 8px;
    transition: top 0.5s ease;
    z-index: 1000;
  }
`;
document.head.appendChild(style);
