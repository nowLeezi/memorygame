// 귀여운 친구들 카드 뒤집기 게임
// 주요 변수 및 데이터 구조 정의

const LEVELS = [
  { rows: 3, cols: 4, pairs: 6, time: 180, flips: 20, hints: 2 },
  { rows: 4, cols: 4, pairs: 8, time: 240, flips: 30, hints: 2 },
  { rows: 4, cols: 5, pairs: 10, time: 300, flips: 35, hints: 1 },
  { rows: 5, cols: 5, pairs: 12, time: 360, flips: 40, hints: 1, joker: true },
  { rows: 5, cols: 6, pairs: 15, time: 420, flips: 45, hints: 0 },
  { rows: 6, cols: 6, pairs: 18, time: 480, flips: 50, hints: 0 },
];

const CHARACTERS = [
  '🐰','🐱','🐶','🐼','🐘','🦁', // 1~2
  '🐧','🐻','🦊','🐑','🐵','🐷', // 3~4
  '🦄','🐲','🦒','🦛','🦘','🦉','🐢','🐦' // 5~6
];

// 화면 요소 참조
const screens = {
  main: document.getElementById('main-screen'),
  level: document.getElementById('level-screen'),
  game: document.getElementById('game-screen'),
  complete: document.getElementById('complete-screen'),
};
const modal = document.getElementById('modal');
const modalContent = document.getElementById('modal-content');

// localStorage 키
const STORAGE_KEY = 'cute-cardup';

// 저장/불러오기
function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
function loadData() {
  const d = localStorage.getItem(STORAGE_KEY);
  return d ? JSON.parse(d) : null;
}

// 화면 전환 함수
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// 모달 표시 함수
function showModal(html) {
  modalContent.innerHTML = html;
  modal.classList.remove('hidden');
}
function hideModal() {
  modal.classList.add('hidden');
}
modal.addEventListener('click', (e) => {
  if (e.target === modal) hideModal();
});

// 레벨 잠금/별점 임시 데이터 (실제 구현 시 localStorage 연동)
let levelStars = [1, 2, 2, 0, 0, 0]; // 각 레벨별 별점 (예시)

// 레벨 잠금 해제 조건 함수
function isLevelUnlocked(idx) {
  if (idx === 0) return true;
  if (idx === 1) return levelStars[0] >= 1;
  if (idx === 2) return levelStars[1] >= 2;
  if (idx === 3) return levelStars[2] >= 2;
  if (idx === 4) return levelStars[3] === 3;
  if (idx === 5) return levelStars[4] === 3;
  return false;
}

// 게임 데이터 저장/불러오기
function getDefaultSave() {
  return {
    bestScores: [0,0,0,0,0,0],
    stars: [0,0,0,0,0,0],
    stickers: [],
    stats: { playTime: 0, totalMatch: 0 },
    soundOn: true,
  };
}
let saveDataObj = loadData() || getDefaultSave();

// 별점 계산
function calcStars(success) {
  if (!success) return 0;
  const lv = LEVELS[currentLevel];
  const used = flipCount;
  const timeUsed = lv.time - timeLeft;
  let star = 1;
  if (used <= Math.floor(lv.flips*0.8)) star = 2;
  if (used <= Math.floor(lv.flips*0.6) && timeUsed <= Math.floor(lv.time*0.7)) star = 3;
  return star;
}

// 스티커 획득 (성공 시 랜덤, 중복X)
function earnSticker() {
  const pool = CHARACTERS.filter(c => !saveDataObj.stickers.includes(c));
  if (pool.length === 0) return null;
  const pick = pool[Math.floor(Math.random()*pool.length)];
  saveDataObj.stickers.push(pick);
  return pick;
}

// 레벨 그리드 생성
function renderLevelGrid() {
  const grid = document.getElementById('level-grid');
  grid.innerHTML = '';
  for (let i=0; i<LEVELS.length; i++) {
    const unlocked = isLevelUnlocked(i);
    const stars = '★'.repeat(saveDataObj.stars[i]||0) + '☆'.repeat(3-(saveDataObj.stars[i]||0));
    const cardInfo = `${LEVELS[i].cols}×${LEVELS[i].rows}`;
    const div = document.createElement('div');
    div.className = 'level-cell';
    div.innerHTML = `
      <div class="level-title">레벨 ${i+1}</div>
      <div class="level-stars">${stars}</div>
      <div class="level-cards">${cardInfo}</div>
      <div class="level-lock">${unlocked ? '' : '🔒'}</div>
    `;
    if (unlocked) {
      div.classList.add('unlocked');
      div.addEventListener('click', () => startLevel(i));
    } else {
      div.classList.add('locked');
      div.addEventListener('click', () => showModal('<p>이 레벨은 잠겨 있습니다.<br>이전 레벨을 먼저 클리어하세요!</p>'));
    }
    grid.appendChild(div);
  }
}

// 카드 셔플 함수 (Fisher-Yates)
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// 현재 게임 상태 변수
let currentLevel = 0;
let cardData = [];
let flipped = [];
let matched = [];
let flipCount = 0;
let score = 0;
let timer = null;
let timeLeft = 0;
let gameActive = false;
let hintLeft = 0;
let paused = false;

// 사운드 효과
let soundOn = true;
const sfx = {
  flip: () => { if (soundOn) document.getElementById('sfx-flip').play(); },
  match: () => { if (soundOn) document.getElementById('sfx-match').play(); },
  fail: () => { if (soundOn) document.getElementById('sfx-fail').play(); },
  clear: () => { if (soundOn) document.getElementById('sfx-clear').play(); },
};

// 카드 그리드 생성 및 렌더링
function renderCardGrid(levelIdx) {
  const lv = LEVELS[levelIdx];
  // 캐릭터/조커 카드 준비
  let chars = CHARACTERS.slice(0, lv.pairs);
  let cards = chars.concat(chars); // 쌍 만들기
  if (lv.joker) cards.push('🃏'); // 조커 카드
  cards = shuffle(cards);
  cardData = cards.map((c, i) => ({ id: i, value: c, matched: false }));
  flipped = [];
  matched = [];
  flipCount = 0;
  score = 0;
  // 그리드 스타일 적용
  const grid = document.getElementById('card-grid');
  grid.style.gridTemplateColumns = `repeat(${lv.cols}, 1fr)`;
  grid.innerHTML = '';
  cardData.forEach((card, idx) => {
    const div = document.createElement('div');
    div.className = 'card';
    div.dataset.idx = idx;
    div.innerHTML = '<div class="card-inner"><div class="card-front">?</div><div class="card-back">'+card.value+'</div></div>';
    div.addEventListener('click', () => onCardClick(idx));
    grid.appendChild(div);
  });
  // 상단 UI 초기화
  document.getElementById('timer').textContent = `⏰ ${formatTime(lv.time)}`;
  document.getElementById('score').textContent = `점수: 0`;
  document.getElementById('flip-count').textContent = `횟수: 0/${lv.flips}`;
}

// 카드 클릭 핸들러
function onCardClick(idx) {
  if (!gameActive || paused) return;
  if (flipped.length >= 2 || cardData[idx].matched || flipped.includes(idx)) return;
  sfx.flip();
  flipCard(idx, true);
  flipped.push(idx);
  if (flipped.length === 2) {
    flipCount++;
    document.getElementById('flip-count').textContent = `횟수: ${flipCount}/${LEVELS[currentLevel].flips}`;
    setTimeout(checkMatch, 700);
  }
}

// 카드 뒤집기/복원
function flipCard(idx, show) {
  const grid = document.getElementById('card-grid');
  const cardDiv = grid.children[idx];
  if (show) cardDiv.classList.add('flipped');
  else cardDiv.classList.remove('flipped');
}

// 매칭 확인
function checkMatch() {
  const [a, b] = flipped;
  if (cardData[a].value === cardData[b].value) {
    cardData[a].matched = cardData[b].matched = true;
    matched.push(a, b);
    score += 50;
    document.getElementById('score').textContent = `점수: ${score}`;
    // 매칭 성공 효과
    sfx.match();
    const grid = document.getElementById('card-grid');
    grid.children[a].classList.add('matched');
    grid.children[b].classList.add('matched');
    setTimeout(() => {
      grid.children[a].classList.remove('matched');
      grid.children[b].classList.remove('matched');
    }, 700);
  } else {
    sfx.fail();
    flipCard(a, false);
    flipCard(b, false);
  }
  flipped = [];
  // 게임 종료 체크
  if (matched.length === cardData.length) {
    sfx.clear();
    endGame(true);
  } else if (flipCount >= LEVELS[currentLevel].flips) {
    endGame(false);
  }
}

// 시간 포맷
function formatTime(sec) {
  const m = Math.floor(sec/60);
  const s = sec%60;
  return `${m}:${s.toString().padStart(2,'0')}`;
}

// 레벨 시작 함수 (임시)
function startLevel(idx) {
  currentLevel = idx;
  showScreen('game');
  renderCardGrid(idx);
  clearInterval(timer);
  timeLeft = LEVELS[idx].time;
  gameActive = true;
  paused = false;
  timer = setInterval(() => {
    if (!gameActive || paused) return;
    timeLeft--;
    document.getElementById('timer').textContent = `⏰ ${formatTime(timeLeft)}`;
    if (timeLeft <= 0) {
      endGame(false);
    }
  }, 1000);
  hintLeft = LEVELS[idx].hints || 0;
  updateHintBtn();
  setTimeout(showStartGuide, 300);
}

function updateHintBtn() {
  const btn = document.getElementById('hint-btn');
  if (hintLeft > 0) {
    btn.disabled = false;
    btn.textContent = `힌트 (${hintLeft})`;
  } else {
    btn.disabled = true;
    btn.textContent = '힌트 없음';
  }
}

function useHint() {
  if (!gameActive || hintLeft <= 0) return;
  hintLeft--;
  updateHintBtn();
  // 매칭 쌍 찾기
  let pairs = {};
  cardData.forEach((c, i) => {
    if (c.matched) return;
    if (!pairs[c.value]) pairs[c.value] = [];
    pairs[c.value].push(i);
  });
  let showIdx = [];
  for (let k in pairs) {
    if (pairs[k].length === 2) showIdx.push(...pairs[k]);
  }
  // 카드 모두 뒤집기
  showIdx.forEach(idx => flipCard(idx, true));
  setTimeout(() => {
    showIdx.forEach(idx => {
      if (!cardData[idx].matched && !flipped.includes(idx)) flipCard(idx, false);
    });
  }, 1000);
}

function endGame(success) {
  gameActive = false;
  clearInterval(timer);
  if (success) {
    setTimeout(() => showCompleteScreen(true), 600);
  } else {
    setTimeout(() => showCompleteScreen(false), 600);
  }
}

function showCompleteScreen(success) {
  showScreen('complete');
  const info = document.getElementById('complete-info');
  let star = calcStars(success);
  let sticker = null;
  if (success) {
    info.innerHTML = `<div>🎉 모든 카드를 맞췄어요!</div><div>점수: ${score}</div><div>남은 시간: ${formatTime(timeLeft)}</div><div>사용 횟수: ${flipCount}</div>`;
    document.getElementById('complete-msg').textContent = '축하합니다! 🎉';
    // 별점/최고점수 갱신
    if (score > saveDataObj.bestScores[currentLevel]) saveDataObj.bestScores[currentLevel] = score;
    if (star > (saveDataObj.stars[currentLevel]||0)) saveDataObj.stars[currentLevel] = star;
    // 스티커 획득
    sticker = earnSticker();
  } else {
    info.innerHTML = `<div>😢 제한 시간 또는 횟수를 초과했어요.</div><div>점수: ${score}</div><div>진행도: ${matched.length/2}쌍</div>`;
    document.getElementById('complete-msg').textContent = '실패했습니다.';
  }
  // 별점 표시
  const starDiv = document.getElementById('star-rating');
  starDiv.innerHTML = '⭐'.repeat(star) + '☆'.repeat(3-star);
  // 스티커 표시
  const stickerDiv = document.getElementById('earned-stickers');
  stickerDiv.innerHTML = sticker ? `획득 스티커: <span style="font-size:2rem">${sticker}</span>` : '';
  // 저장
  saveData(saveDataObj);
  // 버튼 활성화
  document.getElementById('retry-btn').onclick = () => startLevel(currentLevel);
  document.getElementById('complete-home-btn').onclick = () => showScreen('main');
  document.getElementById('next-level-btn').onclick = () => {
    if (currentLevel < 5 && isLevelUnlocked(currentLevel+1)) startLevel(currentLevel+1);
    else showModal('<p>다음 레벨이 잠겨 있습니다.</p>');
  };
  // 스티커 현황 갱신
  document.getElementById('sticker-count').textContent = saveDataObj.stickers.length;
}

// 메인화면 최고점수/스티커 현황 표시
function renderMainInfo() {
  let best = Math.max(...saveDataObj.bestScores);
  document.getElementById('best-score').textContent = `최고 점수: ${best}`;
  document.getElementById('sticker-count').textContent = saveDataObj.stickers.length;
}

function pauseGame() {
  if (!gameActive || paused) return;
  paused = true;
  showModal(`
    <h3>일시정지</h3>
    <button id='resume-btn' class='big-btn'>계속하기</button><br>
    <button id='restart-btn'>다시시작</button>
    <button id='pause-home-btn'>홈으로</button>
  `);
  // 카드 내용 숨김
  document.querySelectorAll('.card').forEach(card => {
    if (!cardData[card.dataset.idx].matched) card.classList.remove('flipped');
  });
}
function resumeGame() {
  paused = false;
  hideModal();
}
function restartGame() {
  hideModal();
  startLevel(currentLevel);
}
function pauseHome() {
  hideModal();
  showScreen('main');
}

// 게임 시작 안내 메시지
function showStartGuide() {
  showModal('<h3>카드를 뒤집어 같은 친구를 찾아보세요!<br>제한 시간과 횟수에 주의하세요.</h3><button onclick="document.getElementById(\'modal\').classList.add(\'hidden\')">시작!</button>');
}

// 설정 모달 확장
function showSettings() {
  showModal(`
    <h3>설정</h3>
    <label><input type='checkbox' id='sound-toggle' ${soundOn ? 'checked' : ''}/> 사운드 효과</label><br>
    <button onclick="document.getElementById('modal').classList.add('hidden')">닫기</button>
  `);
  setTimeout(() => {
    document.getElementById('sound-toggle').onchange = e => {
      soundOn = e.target.checked;
      saveDataObj.soundOn = soundOn;
      saveData(saveDataObj);
    };
  }, 100);
}

// 초기화
window.addEventListener('DOMContentLoaded', () => {
  showScreen('main');
  renderMainInfo();
  // 메인화면: 게임 시작 버튼
  document.getElementById('start-btn').addEventListener('click', () => {
    showScreen('level');
    renderLevelGrid();
  });
  // 메인화면: 설정 버튼
  document.getElementById('settings-btn').addEventListener('click', showSettings);
  document.getElementById('level-home-btn').addEventListener('click', () => showScreen('main'));
  document.getElementById('hint-btn').addEventListener('click', useHint);
  document.getElementById('pause-btn').addEventListener('click', pauseGame);
  // 모달 내 버튼 위임
  modal.addEventListener('click', (e) => {
    if (e.target.id === 'resume-btn') resumeGame();
    if (e.target.id === 'restart-btn') restartGame();
    if (e.target.id === 'pause-home-btn') pauseHome();
  });
  // 사운드 설정 불러오기
  if (saveDataObj.soundOn === false) soundOn = false;
}); 