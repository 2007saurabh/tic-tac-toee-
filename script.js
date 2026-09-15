(function () {
  'use strict';

  // ============================================================
  // STATE
  // ============================================================
  let board = Array(9).fill('');
  let currentPlayer = 'X';
  let gameActive = true;
  let winnerCombo = null;
  let mode = 'ai';           // 'ai' | 'pvp'
  let difficulty = 'hard';   // 'easy' | 'medium' | 'hard' | 'impossible'
  let timerDuration = 0;     // seconds, 0 = off

  // Undo / Redo history
  const history = [];        // past states
  const future = [];         // redo states
  let humanFirstPlayer = 'X'; // human is X; AI is O (in ai mode)

  // Timer
  let timerInterval = null;
  let timerRemaining = 0;

  // Keyboard focus
  let focusedCell = 0;

  // Scores
  let scores = { player: 0, ai: 0, draw: 0 };

  // ============================================================
  // DOM
  // ============================================================
  const boardEl = document.getElementById('board');
  const turnIcon = document.getElementById('turnIcon');
  const turnText = document.getElementById('turnText');
  const messageEl = document.getElementById('message');
  const subMessageEl = document.getElementById('subMessage');
  const playerScoreEl = document.getElementById('playerScore');
  const aiScoreEl = document.getElementById('aiScore');
  const drawScoreEl = document.getElementById('drawScore');
  const playerLabel = document.getElementById('playerLabel');
  const aiLabel = document.getElementById('aiLabel');
  const resetBtn = document.getElementById('resetBtn');
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  const modeSelect = document.getElementById('modeSelect');
  const difficultySelect = document.getElementById('difficultySelect');
  const timerSelect = document.getElementById('timerSelect');
  const timerBar = document.getElementById('timerBar');
  const timerFill = document.getElementById('timerFill');

  // ============================================================
  // CONSTANTS
  // ============================================================
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  const taunts = [
    "Hmm, interesting...",
    "I saw that coming!",
    "Nice try!",
    "You're making this too easy 😏",
    "Bold move!",
    "Is that your strategy?",
    "Thinking... thinking...",
    "Let me calculate...",
    "Well played!",
    "Almost had me!"
  ];

  // ============================================================
  // AUDIO (Web Audio API — no files needed)
  // ============================================================
  let audioCtx = null;

  function getAudioCtx() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        return null;
      }
    }
    return audioCtx;
  }

  function playTone(freq, duration, type = 'sine', volume = 0.08) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  const sounds = {
    place: () => playTone(440, 0.1, 'sine'),
    aiPlace: () => playTone(330, 0.1, 'triangle'),
    win: () => {
      playTone(660, 0.12, 'sine');
      setTimeout(() => playTone(880, 0.15, 'sine'), 100);
      setTimeout(() => playTone(1100, 0.2, 'sine'), 220);
    },
    lose: () => {
      playTone(300, 0.15, 'sawtooth', 0.06);
      setTimeout(() => playTone(220, 0.25, 'sawtooth', 0.06), 130);
    },
    draw: () => {
      playTone(400, 0.15, 'triangle');
      setTimeout(() => playTone(400, 0.15, 'triangle'), 180);
    },
    undo: () => playTone(500, 0.08, 'sine'),
    timerTick: () => playTone(800, 0.03, 'square', 0.03),
    timerLow: () => playTone(600, 0.1, 'square', 0.05)
  };

  // ============================================================
  // LOCALSTORAGE
  // ============================================================
  const STORAGE_KEY = 'ttt-advanced-scores';

  function loadScores() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (data && typeof data === 'object') {
        scores = { player: data.player || 0, ai: data.ai || 0, draw: data.draw || 0 };
      }
    } catch (e) { /* ignore */ }
  }

  function saveScores() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
    } catch (e) { /* ignore */ }
  }

  // ============================================================
  // STATE SNAPSHOTS (for undo/redo)
  // ============================================================
  function snapshot() {
    return {
      board: [...board],
      currentPlayer,
      gameActive,
      winnerCombo: winnerCombo ? [...winnerCombo] : null
    };
  }

  function restore(snap) {
    board = [...snap.board];
    currentPlayer = snap.currentPlayer;
    gameActive = snap.gameActive;
    winnerCombo = snap.winnerCombo ? [...snap.winnerCombo] : null;
  }

  function pushHistory() {
    history.push(snapshot());
    if (history.length > 50) history.shift();
    future.length = 0;
    updateUndoRedoButtons();
  }

  function updateUndoRedoButtons() {
    undoBtn.disabled = history.length === 0;
    redoBtn.disabled = future.length === 0;
  }

  function undo() {
    if (history.length === 0) return;
    clearTimer();
    future.push(snapshot());
    restore(history.pop());
    sounds.undo();
    renderBoard();
    updateUI();
    updateUndoRedoButtons();
    // If it's AI's turn after undo, trigger AI
    if (gameActive && mode === 'ai' && currentPlayer === 'O') {
      scheduleAI();
    } else {
      startTimerIfNeeded();
    }
  }

  function redo() {
    if (future.length === 0) return;
    clearTimer();
    history.push(snapshot());
    restore(future.pop());
    renderBoard();
    updateUI();
    updateUndoRedoButtons();
    if (gameActive && mode === 'ai' && currentPlayer === 'O') {
      scheduleAI();
    } else {
      startTimerIfNeeded();
    }
  }

  // ============================================================
  // TIMER
  // ============================================================
  function clearTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    timerBar.classList.remove('active');
    timerFill.style.width = '100%';
  }

  function startTimerIfNeeded() {
    clearTimer();
    if (timerDuration <= 0 || !gameActive) return;
    // Only run timer during human's turn (in ai mode) or both (in pvp)
    if (mode === 'ai' && currentPlayer === 'O') return;

    timerRemaining = timerDuration;
    timerBar.classList.add('active');
    timerFill.style.width = '100%';

    timerInterval = setInterval(() => {
      timerRemaining -= 0.1;
      const pct = Math.max(0, (timerRemaining / timerDuration) * 100);
      timerFill.style.width = pct + '%';

      if (timerRemaining <= 2 && timerRemaining > 0) {
        sounds.timerLow();
      }

      if (timerRemaining <= 0) {
        clearTimer();
        handleTimeout();
      }
    }, 100);
  }

  function handleTimeout() {
    if (!gameActive) return;
    // Auto-play a random available move (or a smart blocking move)
    const empty = board.map((v, i) => v === '' ? i : -1).filter(i => i !== -1);
    if (empty.length === 0) return;
    const randomMove = empty[Math.floor(Math.random() * empty.length)];
    messageEl.textContent = '⏰ Time out! Playing a random move...';
    if (mode === 'ai' && currentPlayer === 'X') {
      humanMove(randomMove);
    } else if (mode === 'ai' && currentPlayer === 'O') {
      aiMove(randomMove);
    } else {
      // pvp
      humanMove(randomMove);
    }
  }

  // ============================================================
  // RENDER
  // ============================================================
  function renderBoard() {
    boardEl.innerHTML = '';
    board.forEach((value, index) => {
      const cell = document.createElement('div');
      cell.classList.add('cell');
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', `Cell ${index + 1}`);

      if (value === 'X') {
        cell.classList.add('x-move');
        cell.textContent = 'X';
      } else if (value === 'O') {
        cell.classList.add('o-move');
        cell.textContent = 'O';
      }

      if (winnerCombo && winnerCombo.includes(index)) {
        cell.classList.add('winner');
      }

      if (!gameActive || value !== '' || winnerCombo) {
        cell.classList.add('disabled');
      } else {
        cell.addEventListener('click', () => handleCellClick(index));
      }

      if (index === focusedCell) {
        cell.classList.add('keyboard-focus');
      }

      boardEl.appendChild(cell);
    });
  }

  function handleCellClick(index) {
    if (!gameActive) return;
    if (board[index] !== '') {
      // Shake the cell
      const cell = boardEl.children[index];
      if (cell) {
        cell.classList.add('shake');
        setTimeout(() => cell.classList.remove('shake'), 400);
      }
      return;
    }
    focusedCell = index;

    if (mode === 'ai') {
      if (currentPlayer === 'X') humanMove(index);
      // ignore clicks when it's AI's turn
    } else {
      humanMove(index);
    }
  }

  // ============================================================
  // MOVES
  // ============================================================
  function humanMove(index) {
    if (!gameActive || board[index] !== '') return;
    clearTimer();

    pushHistory();
    board[index] = currentPlayer;
    sounds.place();
    renderBoard();

    if (checkGameStatus()) return;

    currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
    updateUI();
    renderBoard();

    if (mode === 'ai' && currentPlayer === 'O') {
      scheduleAI();
    } else {
      startTimerIfNeeded();
    }
  }

  function aiMove(index) {
    if (!gameActive || board[index] !== '') return;
    clearTimer();
    pushHistory();
    board[index] = 'O';
    sounds.aiPlace();
    renderBoard();

    if (checkGameStatus()) return;

    currentPlayer = 'X';
    updateUI();
    renderBoard();
    startTimerIfNeeded();
  }

  function scheduleAI() {
    // Show a random taunt
    const taunt = taunts[Math.floor(Math.random() * taunts.length)];
    subMessageEl.textContent = `🤖 ${taunt}`;

    setTimeout(() => {
      if (!gameActive || currentPlayer !== 'O') return;
      const move = computeAIMove();
      if (move >= 0) aiMove(move);
    }, 350 + Math.random() * 250);
  }

  // ============================================================
  // AI LOGIC
  // ============================================================
  function computeAIMove() {
    const empty = board.map((v, i) => v === '' ? i : -1).filter(i => i !== -1);
    if (empty.length === 0) return -1;

    // Easy: random
    if (difficulty === 'easy') {
      return empty[Math.floor(Math.random() * empty.length)];
    }

    // Medium: 50% perfect, 50% random
    if (difficulty === 'medium' && Math.random() < 0.5) {
      return empty[Math.floor(Math.random() * empty.length)];
    }

    // Hard / Impossible: winning → blocking → minimax
    const winMove = findWinningMove('O');
    if (winMove !== -1) return winMove;

    const blockMove = findWinningMove('X');
    if (blockMove !== -1) return blockMove;

    // Impossible: full minimax (unbeatable)
    // Hard: minimax but with 20% chance of suboptimal (2nd best)
    const result = minimax([...board], 'O', 0, -Infinity, Infinity);

    if (difficulty === 'hard' && Math.random() < 0.2) {
      // Pick a random non-optimal move occasionally
      const alternatives = empty.filter(i => i !== result.index);
      if (alternatives.length > 0) {
        return alternatives[Math.floor(Math.random() * alternatives.length)];
      }
    }

    return result.index;
  }

  function findWinningMove(player) {
    for (let i = 0; i < 9; i++) {
      if (board[i] === '') {
        board[i] = player;
        const win = checkWin(board, player);
        board[i] = '';
        if (win) return i;
      }
    }
    return -1;
  }

  function checkWin(boardState, player) {
    return winPatterns.some(([a, b, c]) =>
      boardState[a] === player && boardState[b] === player && boardState[c] === player
    );
  }

  function minimax(boardState, player, depth, alpha, beta) {
    const opponent = player === 'O' ? 'X' : 'O';

    if (checkWin(boardState, 'O')) return { score: 10 - depth };
    if (checkWin(boardState, 'X')) return { score: depth - 10 };
    if (!boardState.includes('')) return { score: 0 };

    const moves = boardState.map((v, i) => v === '' ? i : -1).filter(i => i !== -1);

    if (player === 'O') {
      let best = { score: -Infinity, index: -1 };
      for (const move of moves) {
        boardState[move] = 'O';
        const result = minimax(boardState, opponent, depth + 1, alpha, beta);
        boardState[move] = '';
        if (result.score > best.score) best = { score: result.score, index: move };
        alpha = Math.max(alpha, best.score);
        if (beta <= alpha) break;
      }
      return best;
    } else {
      let best = { score: Infinity, index: -1 };
      for (const move of moves) {
        boardState[move] = 'X';
        const result = minimax(boardState, opponent, depth + 1, alpha, beta);
        boardState[move] = '';
        if (result.score < best.score) best = { score: result.score, index: move };
        beta = Math.min(beta, best.score);
        if (beta <= alpha) break;
      }
      return best;
    }
  }

  // ============================================================
  // GAME STATUS
  // ============================================================
  function checkGameStatus() {
    for (const pattern of winPatterns) {
      const [a, b, c] = pattern;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        winnerCombo = pattern;
        gameActive = false;
        clearTimer();

        if (board[a] === 'X') {
          scores.player++;
          sounds.win();
          messageEl.textContent = '✨ Victory! You win! ✨';
        } else {
          scores.ai++;
          sounds.lose();
          messageEl.textContent = '🤖 AI wins. Better luck next time!';
        }
        saveScores();
        renderBoard();
        updateUI();
        return true;
      }
    }

    if (!board.includes('')) {
      gameActive = false;
      winnerCombo = null;
      scores.draw++;
      sounds.draw();
      messageEl.textContent = "🤝 It's a draw!";
      saveScores();
      renderBoard();
      updateUI();
      return true;
    }

    return false;
  }

  // ============================================================
  // UI UPDATE
  // ============================================================
  function updateUI() {
    if (!gameActive) {
      if (winnerCombo) {
        if (board[winnerCombo[0]] === 'X') {
          turnIcon.className = 'turn-icon x-marker';
          turnIcon.textContent = 'X';
          turnText.textContent = 'You win!';
        } else {
          turnIcon.className = 'turn-icon o-marker';
          turnIcon.textContent = 'O';
          turnText.textContent = mode === 'ai' ? 'AI wins' : 'Player O wins';
        }
      } else {
        turnIcon.className = 'turn-icon';
        turnIcon.textContent = '—';
        turnText.textContent = 'Draw';
      }
    } else {
      if (currentPlayer === 'X') {
        turnIcon.className = 'turn-icon x-marker';
        turnIcon.textContent = 'X';
        turnText.textContent = mode === 'ai' ? 'Your turn' : "Player X's turn";
      } else {
        turnIcon.className = 'turn-icon o-marker';
        turnIcon.textContent = 'O';
        turnText.textContent = mode === 'ai' ? 'AI thinking...' : "Player O's turn";
      }
    }

    playerScoreEl.textContent = scores.player;
    aiScoreEl.textContent = scores.ai;
    drawScoreEl.textContent = scores.draw;

    // Labels
    playerLabel.textContent = mode === 'ai' ? 'You' : 'P1 (X)';
    aiLabel.textContent = mode === 'ai' ? 'AI' : 'P2 (O)';
  }

  // ============================================================
  // RESET / NEW GAME
  // ============================================================
  function resetGame() {
    clearTimer();
    board = Array(9).fill('');
    currentPlayer = 'X';
    gameActive = true;
    winnerCombo = null;
    history.length = 0;
    future.length = 0;
    focusedCell = 0;
    updateUndoRedoButtons();
    renderBoard();
    updateUI();
    messageEl.textContent = mode === 'ai' ? 'Your move — click a square' : "Player X starts — click a square";
    subMessageEl.textContent = 'Use arrow keys + Enter, or click a square';
    startTimerIfNeeded();
  }

  // ============================================================
  // KEYBOARD NAVIGATION
  // ============================================================
  function handleKeydown(e) {
    if (!gameActive) {
      // Allow undo even when game over
      if (e.key === 'Backspace' || (e.ctrlKey && e.key === 'z')) {
        e.preventDefault();
        undo();
      }
      if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        redo();
      }
      return;
    }

    const row = Math.floor(focusedCell / 3);
    const col = focusedCell % 3;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        focusedCell = ((row - 1 + 3) % 3) * 3 + col;
        renderBoard();
        break;
      case 'ArrowDown':
        e.preventDefault();
        focusedCell = ((row + 1) % 3) * 3 + col;
        renderBoard();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        focusedCell = row * 3 + ((col - 1 + 3) % 3);
        renderBoard();
        break;
      case 'ArrowRight':
        e.preventDefault();
        focusedCell = row * 3 + ((col + 1) % 3);
        renderBoard();
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        handleCellClick(focusedCell);
        break;
      case 'Backspace':
        e.preventDefault();
        undo();
        break;
      case 'z':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        }
        break;
      case 'y':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          redo();
        }
        break;
    }
  }

  // ============================================================
  // EVENT LISTENERS
  // ============================================================
  resetBtn.addEventListener('click', resetGame);
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);

  modeSelect.addEventListener('change', (e) => {
    mode = e.target.value;
    // In AI mode, human is always X, AI is always O
    resetGame();
  });

  difficultySelect.addEventListener('change', (e) => {
    difficulty = e.target.value;
  });

  timerSelect.addEventListener('change', (e) => {
    timerDuration = parseInt(e.target.value, 10) || 0;
    startTimerIfNeeded();
  });

  document.addEventListener('keydown', handleKeydown);

  // ============================================================
  // SERVICE WORKER (PWA)
  // ============================================================
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('SW registration failed:', err);
      });
    });
  }

  // ============================================================
  // INIT
  // ============================================================
  function init() {
    loadScores();
    renderBoard();
    updateUI();
    updateUndoRedoButtons();
    startTimerIfNeeded();
  }

  init();

  // Debug API
  window.ttt = {
    reset: resetGame,
    undo, redo,
    getScores: () => ({ ...scores }),
    clearScores: () => {
      scores = { player: 0, ai: 0, draw: 0 };
      saveScores();
      updateUI();
    },
    setDifficulty: (d) => {
      difficulty = d;
      difficultySelect.value = d;
    }
  };
})();