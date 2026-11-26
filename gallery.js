const results = document.querySelector('#results');
const template = document.querySelector('#result-template');
const status = document.querySelector('#status');
const searchProgress = document.querySelector('#search-progress');
const progressBar = document.querySelector('#progress-bar');
const number = new Intl.NumberFormat();
const feed = document.querySelector('meta[name="gallery-feed"]').content;
const hosted = feed.endsWith('.json');
const publishedAt = document.querySelector('#published-at');
const showMore = document.querySelector('#show-more');
const rendered = new Map();
let latestResults = [];
let visibleCount = 12;

const spellings = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const letters = 'CDEFGAB';
const pitchName = pitch => spellings[pitch % 12] + (Math.floor(pitch / 12) - 1);
const displayChord = text => text.replace(/([A-G])#/g, '$1♯')
  .replace(/([A-G])b/g, '$1♭').replace(/,/g, ', ');
const diatonic = pitch => 7 * (Math.floor(pitch / 12) - 1) + letters.indexOf(spellings[pitch % 12][0]);

function renderScore(canvas, result) {
  const scale = window.devicePixelRatio || 1;
  const spacing = 59;
  const left = 84;
  const step = 4.5;
  const treble = 4 * 7 + 2;  // E4
  const bass = 2 * 7 + 4;    // G2
  const highest = Math.max(...result.frames.map(frame => Math.max(...frame.slice(1).map(diatonic))));
  const lowest = Math.min(...result.frames.map(frame => diatonic(frame[0])));
  const trebleY = Math.max(85, 52 + (highest - treble) * step);
  const bassY = trebleY + 68;
  const width = left + (result.frames.length - 1) * spacing + 67;
  const height = bassY + Math.max(22, (bass - lowest) * step + 11) + 22;
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.setAttribute('aria-label', 'Grand staff, one chord per pulse. ' + result.frames.map((frame, i) =>
    `Move ${i}: ${frame.map(pitchName).join(', ')}`).join('. '));

  const context = canvas.getContext('2d');
  context.scale(scale, scale);
  const checkpoints = new Map(result.checkpoints.map(point => [point.step, displayChord(point.chord)]));
  const positions = result.frames.map((_, i) => left + i * spacing);

  function line(x1, y1, x2, y2) {
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
  }

  function staff(y, clef, clefSize, clefOffset) {
    context.lineWidth = 0.75;
    context.strokeStyle = '#7f9488';
    for (let i = 0; i < 5; i++) line(13, y - 2 * step * i, width - 18, y - 2 * step * i);
    context.fillStyle = '#172720';
    context.textAlign = 'left';
    context.font = `${clefSize}px "Bravura", "Apple Symbols", "Noto Music", serif`;
    context.fillText(clef, 18, y + clefOffset);
  }

  function chord(pitches, x, bottom, base, carry) {
    const notes = [...new Set(pitches)].sort((a, b) => a - b).map(pitch => ({
      offset: diatonic(pitch) - base,
      accidental: spellings[pitch % 12][1] || '',
    }));
    const accidentals = [];
    let last = -Infinity;
    let shifted = false;
    context.fillStyle = context.strokeStyle = '#172720';
    context.lineWidth = 1;
    for (const note of notes) {
      shifted = note.offset <= last + 1 && !shifted;
      last = note.offset;
      const head = x + (shifted ? 9 : 0);
      const y = bottom - note.offset * step;
      for (let ledger = -2; ledger >= note.offset; ledger -= 2) {
        line(head - 8, bottom - ledger * step, head + 8, bottom - ledger * step);
      }
      for (let ledger = 10; ledger <= note.offset; ledger += 2) {
        line(head - 8, bottom - ledger * step, head + 8, bottom - ledger * step);
      }
      context.beginPath();
      context.ellipse(head, y, 5.3, 3.5, -.28, 0, Math.PI * 2);
      context.fill();
      if (note.accidental || carry.get(note.offset)) {
        let column = accidentals.findIndex(lastY => Math.abs(lastY - y) >= 13);
        if (column === -1) column = accidentals.length;
        accidentals[column] = y;
        context.font = '17px "Apple Symbols", serif';
        context.textAlign = 'right';
        context.fillText(note.accidental || '♮', x - 8 - column * 10, y + 5);
      }
      carry.set(note.offset, note.accidental);
    }
    line(x + 4.5, bottom - notes[0].offset * step, x + 4.5, bottom - last * step - 24);
  }

  function draw(active = -1) {
    context.clearRect(0, 0, width, height);
    if (active >= 0) {
      context.fillStyle = '#d7eedf';
      context.fillRect(positions[active] - 25, 4, 50, height - 8);
    }
    staff(trebleY, '𝄞', 45, 3);
    staff(bassY, '𝄢', 36, -4);
    const bassAccidentals = new Map();
    const trebleAccidentals = new Map();
    result.frames.forEach(([low, ...high], i) => {
      const x = positions[i];
      if (checkpoints.has(i)) {
        context.font = '600 14px system-ui, sans-serif';
        context.fillStyle = '#205942';
        context.textAlign = 'center';
        context.fillText(checkpoints.get(i), Math.min(x, width - 63), 22, 140);
      }
      chord(high, x, trebleY, treble, trebleAccidentals);
      chord([low], x, bassY, bass, bassAccidentals);
      context.font = '13px system-ui, sans-serif';
      context.fillStyle = checkpoints.has(i) ? '#205942' : '#4a6155';
      context.textAlign = 'center';
      context.fillText(i, x, height - 9);
    });
  }

  draw();
  return active => {
    draw(active);
    if (active >= 0) {
      const viewport = canvas.parentElement;
      const position = positions[active];
      if (active === 0 || position < viewport.scrollLeft) viewport.scrollLeft = Math.max(0, position - left);
      if (position + 31 > viewport.scrollLeft + viewport.clientWidth) {
        viewport.scrollLeft = position - viewport.clientWidth / 2;
      }
    }
  };
}

let audio;
let playback;
const playbackError = document.querySelector('#playback-error');

function finishPlayback() {
  if (!playback) return;
  const { button, highlight, master, animation } = playback;
  cancelAnimationFrame(animation);
  master?.disconnect();
  button.textContent = '▶ Play';
  button.setAttribute('aria-pressed', 'false');
  highlight(-1);
  playback = undefined;
}

async function play(button, result, highlight) {
  const wasPlaying = playback?.button === button;
  finishPlayback();
  if (wasPlaying) return;
  playbackError.hidden = true;
  const session = { button, highlight };
  playback = session;
  button.textContent = '■ Stop';
  button.setAttribute('aria-pressed', 'true');

  try {
    audio ||= new AudioContext();
    await audio.resume();
    if (playback !== session) return;
    const master = audio.createGain();
    session.master = master;
    master.gain.value = .25;
    master.connect(audio.destination);
    const pulse = .46;
    const start = audio.currentTime + .025;
    result.frames.forEach((frame, i) => {
      const onset = start + i * pulse;
      frame.forEach((pitch, voice) => {
        const oscillator = audio.createOscillator();
        const envelope = audio.createGain();
        oscillator.type = 'triangle';
        oscillator.frequency.value = 440 * 2 ** ((pitch - 69) / 12);
        envelope.gain.setValueAtTime(.0001, onset);
        envelope.gain.exponentialRampToValueAtTime(voice === 0 ? .27 : .17, onset + .018);
        envelope.gain.exponentialRampToValueAtTime(.0001, onset + pulse - .012);
        oscillator.connect(envelope).connect(master);
        oscillator.start(onset);
        oscillator.stop(onset + pulse);
      });
    });
    let last = -1;
    function tick() {
      const now = Math.floor((audio.currentTime - start) / pulse);
      if (now >= result.frames.length) {
        finishPlayback();
        return;
      }
      if (now >= 0 && now !== last) highlight(now);
      last = now;
      session.animation = requestAnimationFrame(tick);
    }
    tick();
  } catch (error) {
    if (playback === session) finishPlayback();
    playbackError.textContent = 'Playback failed. Try opening the page in a browser with Web Audio enabled.';
    playbackError.hidden = false;
    console.error(error);
  }
}

function card(result) {
  const article = template.content.firstElementChild.cloneNode(true);
  const title = displayChord(result.title);
  article.querySelector('h2').textContent = title;
  article.querySelector('.evidence').textContent = result.archived
    ? `From the archive · ${result.evidence}` : result.evidence;
  article.querySelector('.question').textContent = result.question;
  const scope = result.archived ? '' : ' Each marked chord has four distinct pitch classes.';
  article.querySelector('.answer').textContent =
    `${number.format(result.count)} of ${number.format(result.total)} possible move orders satisfies the marked checkpoints.${scope}`;

  const details = article.querySelector('details');
  details.hidden = result.relaxations.length === 0;
  if (!result.archived) {
    article.querySelector('.relaxation-rule').textContent =
      'At the omitted checkpoint, any chord with four distinct pitch classes is allowed.';
  } else {
    article.querySelector('.relaxation-rule').hidden = true;
  }
  const list = details.querySelector('dl');
  for (const change of result.relaxations) {
    const point = document.createElement('dt');
    const count = document.createElement('dd');
    point.textContent = `Move ${change.removed}`;
    count.textContent = `${number.format(change.count)} paths`;
    list.append(point, count);
  }

  const highlight = renderScore(article.querySelector('canvas'), result);
  const button = article.querySelector('button');
  button.setAttribute('aria-label', `Play or stop ${title}`);
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => play(button, result, highlight));
  return article;
}

function showResults() {
  const visible = latestResults.slice(0, visibleCount);
  const retained = new Set(visible.map(result => result.id));
  for (const [id, article] of rendered) {
    if (!retained.has(id)) {
      if (playback && article.contains(playback.button)) finishPlayback();
      article.remove();
      rendered.delete(id);
    }
  }
  visible.forEach((result, index) => {
    let node = rendered.get(result.id);
    if (!node) {
      node = card(result);
      rendered.set(result.id, node);
    }
    if (node !== results.children[index]) results.insertBefore(node, results.children[index] ?? null);
  });
  showMore.hidden = visible.length === latestResults.length;
}

showMore.addEventListener('click', () => {
  const firstNew = visibleCount;
  visibleCount += 12;
  showResults();
  results.children[firstNew]?.querySelector('button').focus();
});

async function refresh() {
  let delay = hosted ? 60000 : 1000;
  try {
    const response = await fetch(feed, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const library = await response.json();
    const count = library.results.length;
    document.querySelector('#result-count').textContent = `${number.format(count)} ${count === 1 ? 'sequence' : 'sequences'}`;
    const finished = library.total !== null && library.completed >= library.total;
    const state = hosted ? 'Published results'
      : library.error ? 'Search stopped with an error'
      : finished ? 'Search batch complete'
      : library.total === null ? 'Preparing the search' : 'Searching for shape cycles';
    if (status.textContent !== state) status.textContent = state;
    if (library.total !== null) {
      searchProgress.textContent = `${number.format(library.completed)} of ${number.format(library.total)} search jobs complete`;
      progressBar.max = library.total;
      progressBar.value = library.completed;
      progressBar.hidden = hosted || finished || library.error;
    } else if (hosted) {
      searchProgress.textContent = `${number.format(library.completed)} search jobs complete`;
    }
    if (hosted && library.publishedAt) {
      publishedAt.dateTime = library.publishedAt;
      publishedAt.textContent = `Published ${new Date(library.publishedAt).toLocaleString()}`;
      publishedAt.hidden = false;
    }
    latestResults = library.results;
    showResults();
    if (!hosted && (finished || library.error)) delay = 5000;
  } catch (error) {
    status.textContent = hosted ? 'Checking again for published results' : 'Reconnecting to the search';
    console.error(error);
    if (!hosted) delay = 3000;
  } finally {
    setTimeout(refresh, delay);
  }
}

refresh();
