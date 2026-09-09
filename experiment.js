/* ============================================================
   Local Video Replay — Prototype v1
   Plays a locally-selected video in fixed segments, pausing
   automatically after each one to collect a Likert response.
   No recording. No DataPipe. Just proving playback works.
   ============================================================ */

// ---- element references ----
const screens = {
  setup: document.getElementById('screen-setup'),
  intro: document.getElementById('screen-intro'),
  playback: document.getElementById('screen-playback'),
  question: document.getElementById('screen-question'),
  complete: document.getElementById('screen-complete'),
};

const videoFileInput = document.getElementById('video-file');
const participantIdInput = document.getElementById('participant-id');
const intervalInput = document.getElementById('interval-seconds');
const btnStart = document.getElementById('btn-start');
const setupError = document.getElementById('setup-error');
const btnBegin = document.getElementById('btn-begin');

const player = document.getElementById('player');
const playbackStatus = document.getElementById('playback-status');

const questionGroups = document.getElementById('question-groups');
const btnContinue = document.getElementById('btn-continue');

const resultsBody = document.getElementById('results-body');
const datapipeStatus = document.getElementById('datapipe-status');
const btnDownload = document.getElementById('btn-download');

// ---- state ----
const DATAPIPE_EXPERIMENT_ID = 'wrr0RTMmykoF';
let participantId = '';
let intervalSeconds = 10;
let segments = [];        // [{index, start, end}]
let currentSegmentIdx = 0;
const questions = [
  { id: 'happy', prompt: 'How happy is this person right now?', minLabel: 'Not at all', maxLabel: 'Extremely' },
  { id: 'sad', prompt: 'How sad is this person right now?', minLabel: 'Not at all', maxLabel: 'Extremely' },
  { id: 'angry', prompt: 'How angry is this person right now?', minLabel: 'Not at all', maxLabel: 'Extremely' },
  { id: 'scared', prompt: 'How scared is this person right now?', minLabel: 'Not at all', maxLabel: 'Extremely' },
  { id: 'surprised', prompt: 'How surprised is this person right now?', minLabel: 'Not at all', maxLabel: 'Extremely' },
  { id: 'disgusted', prompt: 'How disgusted is this person right now?', minLabel: 'Not at all', maxLabel: 'Extremely' },
  { id: 'certainty', prompt: 'How certain are you that you are accurate?', minLabel: 'Not at all certain', maxLabel: 'Extremely certain' },
];
let selectedResponses = {};
let questionShownAt = null;
let results = [];         // recorded rows
let rafId = null;

// ---- setup screen ----
function checkReady() {
  const hasFile = videoFileInput.files.length > 0;
  const hasId = participantIdInput.value.trim().length > 0;
  btnStart.disabled = !(hasFile && hasId);
}
videoFileInput.addEventListener('change', checkReady);
participantIdInput.addEventListener('input', checkReady);

btnStart.addEventListener('click', () => {
  setupError.hidden = true;

  participantId = participantIdInput.value.trim();
  intervalSeconds = parseFloat(intervalInput.value) || 10;

  const file = videoFileInput.files[0];
  const url = URL.createObjectURL(file);
  player.src = url;

  player.addEventListener('loadedmetadata', onMetadataLoaded, { once: true });
  player.addEventListener('error', () => {
    setupError.textContent = 'Could not load that video file. Try a different file or format (MP4/H.264 is safest).';
    setupError.hidden = false;
  }, { once: true });
});

function onMetadataLoaded() {
  const duration = player.duration;
  segments = buildSegments(duration, intervalSeconds);
  currentSegmentIdx = 0;
  results = [];

  showScreen('intro');
}

function buildSegments(duration, interval) {
  const segs = [];
  let start = 0;
  let i = 0;
  while (start < duration) {
    const end = Math.min(start + interval, duration);
    segs.push({ index: i, start, end });
    start = end;
    i++;
  }
  return segs;
}

// ---- playback screen ----
function playSegment(idx) {
  const seg = segments[idx];
  playbackStatus.textContent = `Segment ${idx + 1} of ${segments.length}  (${fmt(seg.start)}–${fmt(seg.end)})`;

  player.currentTime = seg.start;

  const startPlaying = () => {
    player.play();
    watchForSegmentEnd(seg.end);
  };

  // seeking can be async; wait until the seek completes
  player.addEventListener('seeked', startPlaying, { once: true });
}

function watchForSegmentEnd(endTime) {
  function step() {
    if (player.currentTime >= endTime || player.ended) {
      player.pause();
      cancelAnimationFrame(rafId);
      showQuestion();
      return;
    }
    rafId = requestAnimationFrame(step);
  }
  rafId = requestAnimationFrame(step);
}

function fmt(t) {
  const m = Math.floor(t / 60);
  const s = Math.round(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---- intro screen ----
btnBegin.addEventListener('click', () => {
  showScreen('playback');
  playSegment(currentSegmentIdx);
});

// ---- question screen ----
function buildQuestions() {
  questionGroups.innerHTML = '';
  questions.forEach(question => {
    const group = document.createElement('div');
    group.className = 'question-group';
    group.innerHTML = `
      <h2>${question.prompt}</h2>
      <div class="likert" data-question="${question.id}"></div>
      <div class="likert-labels">
        <span>${question.minLabel}</span>
        <span>${question.maxLabel}</span>
      </div>
    `;

    const likert = group.querySelector('.likert');
    for (let value = 1; value <= 7; value++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = value;
      button.addEventListener('click', () => selectResponse(question.id, value, button));
      likert.appendChild(button);
    }
    questionGroups.appendChild(group);
  });
}
buildQuestions();

function selectResponse(questionId, value, button) {
  selectedResponses[questionId] = value;
  const likert = button.parentElement;
  [...likert.children].forEach(option => option.classList.remove('selected'));
  button.classList.add('selected');
}

function showQuestion() {
  selectedResponses = {};
  btnContinue.disabled = false;
  questionGroups.querySelectorAll('.likert button').forEach(button => {
    button.classList.remove('selected');
  });
  questionShownAt = performance.now();
  showScreen('question');
}

btnContinue.addEventListener('click', async () => {
  const seg = segments[currentSegmentIdx];
  const rt = Math.round(performance.now() - questionShownAt);

  results.push({
    participant: participantId,
    segment: seg.index + 1,
    start: seg.start.toFixed(2),
    end: seg.end.toFixed(2),
    ...selectedResponses,
    rt_ms: rt,
  });

  currentSegmentIdx++;
  if (currentSegmentIdx < segments.length) {
    showScreen('playback');
    playSegment(currentSegmentIdx);
  } else {
    await finish();
  }
});

// ---- completion screen ----
function makeCsv() {
  const header = 'participant,segment,video_start,video_end,happy,sad,angry,scared,surprised,disgusted,certainty,reaction_time_ms\n';
  const rows = results.map(r =>
    [r.participant, r.segment, r.start, r.end, ...questions.map(question => r[question.id] ?? ''), r.rt_ms].join(',')
  ).join('\n');
  return header + rows;
}

async function saveToDataPipe(csv) {
  const safeParticipantId = participantId.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filename = `${safeParticipantId}_${Date.now()}.csv`;
  const response = await fetch('https://pipe.jspsych.org/api/data/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: '*/*',
    },
    body: JSON.stringify({
      experimentID: DATAPIPE_EXPERIMENT_ID,
      filename,
      data: csv,
    }),
  });

  const responseText = await response.text();
  let result;
  try {
    result = JSON.parse(responseText);
  } catch {
    result = null;
  }

  if (!response.ok) {
    const detail = result?.message || result?.error || responseText || 'No additional details were provided.';
    throw new Error(`DataPipe returned HTTP ${response.status}: ${detail}`);
  }

  if (result?.error) {
    throw new Error(result.message || result.error);
  }
}

async function finish() {
  resultsBody.innerHTML = '';
  results.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.segment}</td>
      <td>${r.start}</td>
      <td>${r.end}</td>
      <td>${questions.slice(0, -1).map(question => `${question.id}: ${r[question.id] ?? ''}`).join(', ')}</td>
      <td>${r.certainty ?? ''}</td>
      <td>${r.rt_ms}</td>
    `;
    resultsBody.appendChild(tr);
  });
  showScreen('complete');

  const csv = makeCsv();
  datapipeStatus.textContent = 'Saving data to OSF…';
  btnDownload.disabled = true;
  try {
    await saveToDataPipe(csv);
    datapipeStatus.textContent = 'Data saved successfully to OSF.';
  } catch (error) {
    datapipeStatus.textContent = `Could not save data to OSF: ${error.message} You can download the CSV as a backup.`;
  } finally {
    btnDownload.disabled = false;
  }
}

btnDownload.addEventListener('click', () => {
  const csv = makeCsv();

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${participantId || 'participant'}_results.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// ---- screen management ----
function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
}
