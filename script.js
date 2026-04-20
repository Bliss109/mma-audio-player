/* State */
const audio = new Audio();
let isPlaying = false;
let isMuted = false;
let isLooped = false;
let waveformData = [];

/* Element references */
const $ = (id) => document.getElementById(id);
const E = {
  fileInput: $("file-input"),
  fileName: $("file-name"),
  trackTitle: $("track-title"),
  trackSub: $("track-sub"),
  statusDot: $("status-dot"),
  statusText: $("status-text"),
  btnPlay: $("btn-play"),
  playIcon: $("play-icon"),
  btnMute: $("btn-mute"),
  volIcon: $("vol-icon"),
  btnLoop: $("btn-loop"),
  btnSkipBack: $("btn-skip-back"),
  btnSkipFwd: $("btn-skip-fwd"),
  volSlider: $("vol-slider"),
  volVal: $("vol-val"),
  speedSelect: $("speed-select"),
  progressTrack: $("progress-track"),
  progressFill: $("progress-fill"),
  progressThumb: $("progress-thumb"),
  timeCur: $("time-cur"),
  timeDur: $("time-dur"),
  waveformCanvas: $("waveform-canvas"),
  waveformBar: $("waveform-bar"),
  waveformOverlay: $("waveform-overlay"),
  alertBar: $("alert-bar"),
  alertMsg: $("alert-msg"),
};

/* Helpers */
function fmt(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
}

function showAlert(message) {
  E.alertMsg.textContent = message;
  E.alertBar.style.display = "flex";
  setTimeout(() => {
    E.alertBar.style.display = "none";
  }, 3200);
}

/* Waveform rendering */
function drawWaveform(data) {
  const canvas = E.waveformCanvas;
  const bar = E.waveformBar;

  canvas.width = bar.clientWidth || 480;
  canvas.height = bar.clientHeight || 56;

  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const mid = height / 2;
  const step = Math.max(1, Math.floor(data.length / width));

  ctx.clearRect(0, 0, width, height);

  for (let x = 0; x < width; x++) {
    let peak = 0;

    for (let j = 0; j < step; j++) {
      const value = Math.abs(data[x * step + j] || 0);
      if (value > peak) peak = value;
    }

    const barHeight = Math.max(1, peak * mid * 0.88);
    const alpha = 0.4 + peak * 0.6;

    ctx.strokeStyle = `rgba(99,153,34,${alpha.toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, mid - barHeight);
    ctx.lineTo(x, mid + barHeight);
    ctx.stroke();
  }
}

/* Volume icon updates based on mute/volume state */
function updateVolIcon(muted, volume) {
  let path;

  if (muted || volume === 0) {
    path =
      '<path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25A6.957 6.957 0 0 1 14 18.98v2.06c1.52-.44 2.9-1.21 4.07-2.21l1.66 1.67L21 19l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"/>';
  } else if (volume < 50) {
    path =
      '<path d="M18.5 12A4.5 4.5 0 0 0 16 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>';
  } else {
    path =
      '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77 0-4.28-2.99-7.86-7-8.77z"/>';
  }

  E.volIcon.innerHTML = path;
}

/* UI play/pause state updates */
function setPlayState(playing) {
  isPlaying = playing;

  E.playIcon.innerHTML = playing
    ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'
    : '<path d="M8 5v14l11-7z"/>';

  E.statusDot.className = `status-dot${playing ? " playing" : ""}`;
  E.statusText.textContent = playing ? "Playing" : "Paused";
  E.trackSub.textContent = playing ? "Now playing" : "Paused";
}

/* Progress bar and timers */
function updateProgress() {
  if (!audio.duration) return;

  const pct = (audio.currentTime / audio.duration) * 100;
  E.progressFill.style.width = `${pct}%`;
  E.progressThumb.style.left = `${pct}%`;
  E.waveformOverlay.style.width = `${pct}%`;
  E.timeCur.textContent = fmt(audio.currentTime);
}

/* Shared seek helper for progress bar and waveform */
function seekTo(pct) {
  if (!audio.duration) return;
  audio.currentTime = pct * audio.duration;
}

/* File load and waveform extraction */
E.fileInput.addEventListener("change", function onFileChange() {
  const file = this.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  audio.src = url;
  audio.load();

  const name = file.name.replace(/\.[^.]+$/, "");
  E.trackTitle.textContent = name;
  E.fileName.textContent = file.name;
  E.trackSub.textContent = "Ready - press play";
  E.statusText.textContent = "Loaded";
  E.timeDur.textContent = "...";

  // Decode audio with Web Audio API to draw a lightweight waveform preview.
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const actx = new AudioCtx();
  const reader = new FileReader();

  reader.onload = function onReaderLoad(ev) {
    actx.decodeAudioData(
      ev.target.result,
      function onDecodeSuccess(buffer) {
        const raw = buffer.getChannelData(0);
        const samples = 1400;
        const step = Math.max(1, Math.floor(raw.length / samples));

        waveformData = [];
        for (let i = 0; i < samples; i++) {
          waveformData.push(raw[i * step] || 0);
        }

        drawWaveform(waveformData);
      },
      function onDecodeError() {
        const flat = new Float32Array(600).fill(0.05);
        drawWaveform(flat);
      }
    );
  };

  reader.readAsArrayBuffer(file);
});

/* Audio events */
audio.addEventListener("loadedmetadata", function onLoadedMetadata() {
  E.timeDur.textContent = fmt(audio.duration);
});

audio.addEventListener("timeupdate", updateProgress);

audio.addEventListener("ended", function onEnded() {
  if (!isLooped) setPlayState(false);
});

/* Main controls */
E.btnPlay.addEventListener("click", function onPlayClick() {
  if (!audio.src) {
    showAlert("Please load an audio file first");
    return;
  }

  if (isPlaying) {
    audio.pause();
    setPlayState(false);
    return;
  }

  audio.play();
  setPlayState(true);
});

E.btnMute.addEventListener("click", function onMuteClick() {
  isMuted = !isMuted;
  audio.muted = isMuted;
  E.btnMute.classList.toggle("active", isMuted);
  updateVolIcon(isMuted, parseInt(E.volSlider.value, 10));

  if (isMuted) showAlert("Muted");
});

E.btnLoop.addEventListener("click", function onLoopClick() {
  isLooped = !isLooped;
  audio.loop = isLooped;
  E.btnLoop.classList.toggle("active", isLooped);
  showAlert(isLooped ? "Loop on" : "Loop off");
});

E.btnSkipBack.addEventListener("click", function onSkipBack() {
  audio.currentTime = Math.max(0, audio.currentTime - 10);
});

E.btnSkipFwd.addEventListener("click", function onSkipForward() {
  audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10);
});

/* Secondary controls */
E.volSlider.addEventListener("input", function onVolumeChange() {
  const volume = parseInt(this.value, 10);
  audio.volume = volume / 100;
  E.volVal.textContent = `${volume}%`;
  updateVolIcon(isMuted, volume);
});

E.speedSelect.addEventListener("change", function onSpeedChange() {
  audio.playbackRate = parseFloat(this.value);
  showAlert(`Speed: ${this.value}×`);
});

/* Seeking interactions */
E.progressTrack.addEventListener("click", function onProgressClick(e) {
  const rect = this.getBoundingClientRect();
  seekTo((e.clientX - rect.left) / rect.width);
});

E.waveformBar.addEventListener("click", function onWaveformClick(e) {
  const rect = this.getBoundingClientRect();
  seekTo((e.clientX - rect.left) / rect.width);
});

/* Keyboard shortcuts */
document.addEventListener("keydown", function onKeyDown(e) {
  const tag = document.activeElement.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

  switch (e.code) {
    case "Space":
      e.preventDefault();
      E.btnPlay.click();
      break;

    case "KeyM":
      E.btnMute.click();
      break;

    case "KeyL":
      E.btnLoop.click();
      break;

    case "ArrowLeft":
      e.preventDefault();
      audio.currentTime = Math.max(0, audio.currentTime - 10);
      break;

    case "ArrowRight":
      e.preventDefault();
      audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10);
      break;

    case "ArrowUp": {
      e.preventDefault();
      const volume = Math.min(100, parseInt(E.volSlider.value, 10) + 5);
      E.volSlider.value = volume;
      audio.volume = volume / 100;
      E.volVal.textContent = `${volume}%`;
      updateVolIcon(isMuted, volume);
      break;
    }

    case "ArrowDown": {
      e.preventDefault();
      const volume = Math.max(0, parseInt(E.volSlider.value, 10) - 5);
      E.volSlider.value = volume;
      audio.volume = volume / 100;
      E.volVal.textContent = `${volume}%`;
      updateVolIcon(isMuted, volume);
      break;
    }
  }
});

/* Initialization */
audio.volume = 0.8;

// Draw a subtle random placeholder waveform until a real file is loaded.
window.addEventListener("load", function onWindowLoad() {
  const placeholder = new Float32Array(600);

  for (let i = 0; i < 600; i++) {
    placeholder[i] = Math.random() * 0.06 - 0.03;
  }

  drawWaveform(placeholder);
});
