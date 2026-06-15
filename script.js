const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbx_kygoX7Yx6n5QeC4Dabx-nJ8cVScZOhkaJj5s5zUL0Bl1gn8A-oDtY394VHh4_dK4/exec";

const loginScreen = document.getElementById("loginScreen");
const quizScreen = document.getElementById("quizScreen");
const resultScreen = document.getElementById("resultScreen");

const loadingScreen = document.getElementById("loadingScreen");
const timerEl = document.getElementById("timer");
const themeToggle = document.getElementById("themeToggle");
const bgMusic = document.getElementById("bgMusic");

const studentNameInput = document.getElementById("studentName");
const studentIdInput = document.getElementById("studentId");
const startBtn = document.getElementById("startBtn");
const loginMessage = document.getElementById("loginMessage");

const questionText = document.getElementById("questionText");
const optionsContainer = document.getElementById("optionsContainer");
const quizMessage = document.getElementById("quizMessage");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");

const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");

const finalScore = document.getElementById("finalScore");
const finalPercentage = document.getElementById("finalPercentage");
const finalTime = document.getElementById("finalTime");
const funMessage = document.getElementById("funMessage");

let studentName = "";
let studentId = "";
let questions = [];
let currentQuestionIndex = 0;
let selectedAnswers = [];
let quizFinished = false;

let timerInterval = null;
let startTime = null;
let finalElapsedTime = "00:00:00:00";
let typingInterval = null;
let renderToken = 0;
let isTransitioning = false;

function showScreen(screen) {
  [loginScreen, quizScreen, resultScreen].forEach((s) => {
    s.classList.remove("active");
  });
  screen.classList.add("active");
}

function showLoading() {
  loadingScreen.classList.remove("hidden");
  loadingScreen.setAttribute("aria-hidden", "false");
}

function hideLoading() {
  loadingScreen.classList.add("hidden");
  loadingScreen.setAttribute("aria-hidden", "true");
}

function setMessage(el, text) {
  el.textContent = text || "";
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatElapsed(ms) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const centiseconds = Math.floor((ms % 1000) / 10);

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
    String(centiseconds).padStart(2, "0")
  ].join(":");
}

function startTimer() {
  timerEl.classList.remove("finished");
  startTime = Date.now();

  timerInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    timerEl.textContent = formatElapsed(elapsed);
  }, 10);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  finalElapsedTime = timerEl.textContent;
  timerEl.classList.add("finished");
}

function resetTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
  }

  timerInterval = null;
  timerEl.textContent = "00:00:00:00";
  timerEl.classList.remove("finished");
}

function safePlayMusic() {
  if (!bgMusic) return;

  try {
    const playPromise = bgMusic.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  } catch (_) {}
}

function safePauseMusic() {
  if (!bgMusic) return;

  try {
    bgMusic.pause();
  } catch (_) {}
}

function applySavedTheme() {
  const savedTheme = localStorage.getItem("quiz-theme") || "light";

  if (savedTheme === "dark") {
    document.body.classList.add("dark");
  } else {
    document.body.classList.remove("dark");
  }
}

function toggleTheme() {
  document.body.classList.toggle("dark");
  localStorage.setItem(
    "quiz-theme",
    document.body.classList.contains("dark") ? "dark" : "light"
  );
}

themeToggle.addEventListener("click", toggleTheme);

function stopTypingEffect() {
  if (typingInterval) {
    clearInterval(typingInterval);
    typingInterval = null;
  }
}

function updateProgress() {
  const total = questions.length || 1;
  const current = Math.min(currentQuestionIndex + 1, total);
  const percentage = (current / total) * 100;

  progressText.textContent = `Question ${current} / ${total}`;
  progressFill.style.width = `${percentage}%`;
}

function typeText(text, speed = 60, token) {
  stopTypingEffect();
  questionText.textContent = "";

  return new Promise((resolve) => {
    if (!text) {
      resolve();
      return;
    }

    let i = 0;

    typingInterval = setInterval(() => {
      if (token !== renderToken) {
        clearInterval(typingInterval);
        typingInterval = null;
        resolve();
        return;
      }

      questionText.textContent += text.charAt(i);
      i++;

      if (i >= text.length) {
        clearInterval(typingInterval);
        typingInterval = null;
        resolve();
      }
    }, speed);
  });
}

async function checkStudentEligibility(studentIdValue) {
  const url = `${WEB_APP_URL}?action=checkStudent&studentId=${encodeURIComponent(studentIdValue)}`;
  const response = await fetch(url);
  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.message || "Failed to verify student.");
  }

  if (!data.allowed) {
    throw new Error(data.message || "This student has already taken the quiz.");
  }

  return data;
}

async function fetchQuestions() {
  const url = `${WEB_APP_URL}?action=getQuestions`;
  const response = await fetch(url);
  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.message || "Failed to fetch questions.");
  }

  return data.questions || [];
}

function createOptionButton(option, index, currentToken) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "option-btn";
  btn.textContent = `"${option}"`;
  btn.style.animationDelay = `${index * 0.05}s`;

  if (selectedAnswers[currentQuestionIndex] === option) {
    btn.classList.add("selected");
  }

  btn.addEventListener("click", async () => {
    if (quizFinished || isTransitioning || currentToken !== renderToken) return;

    selectedAnswers[currentQuestionIndex] = option;

    if (currentQuestionIndex < questions.length - 1) {
      currentQuestionIndex++;
      await renderQuestion();
    } else {
      await finishQuiz();
    }
  });

  return btn;
}

async function renderQuestion() {
  if (isTransitioning) return;

  const q = questions[currentQuestionIndex];
  if (!q) return;

  isTransitioning = true;
  renderToken++;
  const currentToken = renderToken;

  stopTypingEffect();
  updateProgress();

  optionsContainer.style.opacity = "0";
  optionsContainer.style.transform = "translateY(8px)";
  questionText.style.opacity = "0";
  questionText.style.transform = "translateY(8px)";

  await wait(140);

  if (currentToken !== renderToken) {
    isTransitioning = false;
    return;
  }

  questionText.textContent = "";
  optionsContainer.innerHTML = "";

  q.options.forEach((option, index) => {
    optionsContainer.appendChild(createOptionButton(option, index, currentToken));
  });

  prevBtn.disabled = currentQuestionIndex === 0;
  nextBtn.disabled = currentQuestionIndex === questions.length - 1;

  setMessage(quizMessage, "");

  questionText.style.opacity = "1";
  questionText.style.transform = "translateY(0)";
  optionsContainer.style.opacity = "1";
  optionsContainer.style.transform = "translateY(0)";

  await typeText(q.questionText || "", 60, currentToken);

  if (currentToken === renderToken) {
    isTransitioning = false;
  }
}

function calculateScore() {
  let score = 0;

  questions.forEach((q, index) => {
    const chosen = (selectedAnswers[index] || "").trim().toLowerCase();
    const correct = (q.correctAnswer || "").trim().toLowerCase();

    if (chosen && chosen === correct) {
      score++;
    }
  });

  return score;
}

function buildAnswersPayload() {
  return questions.map((q, index) => {
    const selectedAnswer = selectedAnswers[index] || "";
    const correctAnswer = q.correctAnswer || "";

    return {
      questionId: q.questionId,
      questionText: q.questionText,
      selectedAnswer,
      correctAnswer,
      isCorrect:
        selectedAnswer.trim().toLowerCase() ===
        correctAnswer.trim().toLowerCase()
    };
  });
}

async function submitQuiz() {
  const score = calculateScore();
  const totalQuestions = questions.length;
  const percentage = totalQuestions
    ? Math.round((score / totalQuestions) * 100)
    : 0;

  const payload = {
    studentId,
    studentName,
    score,
    totalQuestions,
    percentage,
    elapsedTime: finalElapsedTime,
    answers: buildAnswersPayload()
  };

  const response = await fetch(`${WEB_APP_URL}?action=submitQuiz`, {
    method: "POST",
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.message || "Failed to submit quiz.");
  }

  return { score, totalQuestions, percentage };
}

function getFunMessage(percentage) {
  if (percentage === 100) return "Perfect. Suspiciously perfect.";
  if (percentage >= 80) return "Excellent work. Very civilized.";
  if (percentage >= 60) return "Nice job. You survived with style.";
  if (percentage >= 40) return "Not bad. The quiz showed mercy.";
  return "Well... at least the submit button worked.";
}

async function finishQuiz() {
  if (quizFinished) return;

  quizFinished = true;
  showLoading();
  stopTimer();
  stopTypingEffect();
  safePauseMusic();

  try {
    const result = await submitQuiz();

    finalScore.textContent = result.score;
    finalPercentage.textContent = `${result.percentage}%`;
    finalTime.textContent = finalElapsedTime;
    funMessage.textContent = getFunMessage(result.percentage);

    await wait(350);
    showScreen(resultScreen);
  } catch (err) {
    quizFinished = false;
    setMessage(quizMessage, err.message || "Failed to finish quiz.");
  } finally {
    hideLoading();
  }
}

prevBtn.addEventListener("click", async () => {
  if (quizFinished || isTransitioning) return;
  if (currentQuestionIndex > 0) {
    currentQuestionIndex--;
    await renderQuestion();
  }
});

nextBtn.addEventListener("click", async () => {
  if (quizFinished || isTransitioning) return;
  if (currentQuestionIndex < questions.length - 1) {
    currentQuestionIndex++;
    await renderQuestion();
  }
});

startBtn.addEventListener("click", async () => {
  studentName = studentNameInput.value.trim();
  studentId = studentIdInput.value.trim();

  if (!studentName || !studentId) {
    setMessage(loginMessage, "Student name and student ID are required.");
    return;
  }

  showLoading();
  setMessage(loginMessage, "");

  try {
    await checkStudentEligibility(studentId);
    questions = await fetchQuestions();

    if (!questions.length) {
      throw new Error("No questions found.");
    }

    selectedAnswers = new Array(questions.length).fill("");
    currentQuestionIndex = 0;
    quizFinished = false;
    renderToken = 0;
    isTransitioning = false;

    resetTimer();
    showScreen(quizScreen);
    await wait(250);
    await renderQuestion();
    startTimer();
    safePlayMusic();
  } catch (err) {
    setMessage(loginMessage, err.message || "Unable to start quiz.");
  } finally {
    hideLoading();
  }
});

applySavedTheme();
resetTimer();
showScreen(loginScreen);
