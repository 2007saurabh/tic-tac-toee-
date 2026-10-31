# ⭕ Tic-Tac-Toe · Advanced Edition

A modern, feature-rich Tic-Tac-Toe game built with vanilla HTML, CSS, and JavaScript.

## ✨ Features
- 🤖 AI opponent with 4 difficulty levels
- 👥 2-player local mode
- ↩️ Undo / Redo support
- 🔊 Sound effects
- ⏱️ Move timer
- ⌨️ Keyboard navigation
- 📱 PWA-ready and installable
- 💾 Persistent score tracking

## 🎮 Play Online
👉 [Play the game](https://2007saurabh.github.io/tic-tac-toee-/)

## 🕹️ How to Play
1. Choose a game mode: Human vs Human or Human vs AI.
2. Select the difficulty level for the AI.
3. Take turns placing marks on the 3x3 board.
4. Win by aligning three marks in a row, column, or diagonal.
5. Use undo/redo if needed and try to beat the timer.

## 🚀 Run Locally
1. Clone the repository:
   ```bash
   git clone https://github.com/2007saurabh/tic-tac-toee-.git
   cd tic-tac-toee-
   ```

2. Start a local web server:
   ```bash
   python3 -m http.server 8000
   ```

3. Open the game in your browser:
   ```text
   http://localhost:8000
   ```

> Note: A local server is recommended because the PWA/service worker setup works best when served over HTTP.

## 🛠️ Tech Stack
- HTML5
- CSS3 (Grid, Flexbox, Animations)
- Vanilla JavaScript (ES6+)
- Minimax-based AI logic
- Web Audio API
- Service Worker + Manifest for PWA support

## 📁 Project Structure
```text
tic-tac-toee-/
├── index.html
├── style.css
├── script.js
├── manifest.json
├── sw.js
├── README.md
└── assets/
```

## 📄 License
MIT
