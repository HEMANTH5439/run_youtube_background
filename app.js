// On-Screen Console Logger
const consoleEl = document.getElementById('log-console');
function log(message, type = 'info') {
  const time = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerText = `[${time}] ${message}`;
  consoleEl.appendChild(entry);
  consoleEl.scrollTop = consoleEl.scrollHeight;
  console.log(`[${type.toUpperCase()}] ${message}`);
}

// Global runtime error logger to catch any silent failures
window.addEventListener('error', (event) => {
  log(`Global JS Error: ${event.message} at ${event.filename}:${event.lineno}`, 'error');
});

// Clear logs helper
document.getElementById('btn-clear-logs').addEventListener('click', () => {
  consoleEl.innerHTML = '';
  log('Logs cleared.', 'system');
});

// Real-time Visibility API monitoring
document.addEventListener('visibilitychange', () => {
  const state = document.visibilityState;
  document.getElementById('visibility-state').innerText = state;
  if (state === 'hidden') {
    log('Visibility State: HIDDEN (App is backgrounded or screen locked)', 'system');
  } else {
    log('Visibility State: VISIBLE (App returned to foreground)', 'system');
  }
});

/* ==========================================================================
   NATIVE HTML5 AUDIO PLAYER TESTER
   ========================================================================== */
const nativeAudio = new Audio();
nativeAudio.src = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'; // Safe public royalty-free track
nativeAudio.preload = 'auto';

// Pre-cached YouTube audio stream URL (filled when user loads a YT video)
let cachedStreamUrl = null;
let cachedStreamTitle = 'YouTube Audio';
let cachedStreamAuthor = 'YouTube Stream';
let cachedStreamVideoId = null;
let isPrefetching = false;

// Debug: log all audio errors with detail
nativeAudio.addEventListener('error', () => {
  const err = nativeAudio.error;
  const codes = { 1: 'MEDIA_ERR_ABORTED', 2: 'MEDIA_ERR_NETWORK', 3: 'MEDIA_ERR_DECODE', 4: 'MEDIA_ERR_SRC_NOT_SUPPORTED' };
  log(`Audio Error: ${codes[err?.code] || 'UNKNOWN'} — ${err?.message || 'no message'}`, 'error');
});

// --- SILENT VIDEO DECOY (keeps browser media pipeline alive in background) ---
let decoyVideo = null;

function createDecoyVideo() {
  // Create a 1x1 canvas with a static frame
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 1, 1);

  // Capture the canvas as a video stream at 1fps
  const videoStream = canvas.captureStream(1);

  // Create a silent audio track and add it to the stream
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = 0.001; // near-silent but not zero (zero might get optimized away)
  oscillator.connect(gainNode);
  const dest = audioCtx.createMediaStreamDestination();
  gainNode.connect(dest);
  oscillator.start();

  // Add the silent audio track to the video stream
  dest.stream.getAudioTracks().forEach(track => videoStream.addTrack(track));

  // Create the decoy video element
  decoyVideo = document.createElement('video');
  decoyVideo.srcObject = videoStream;
  decoyVideo.setAttribute('playsinline', '');
  decoyVideo.style.cssText = 'position:fixed;top:-1px;left:-1px;width:1px;height:1px;opacity:0.01;pointer-events:none;';
  decoyVideo.loop = true;
  decoyVideo.muted = false; // IMPORTANT: must NOT be muted so browser treats as active media
  document.body.appendChild(decoyVideo);

  // Resume AudioContext (required in user gesture on mobile)
  audioCtx.resume();

  return { decoyVideo, audioCtx };
}

// --- PRE-FETCH: warms server cache when user loads a YouTube video ---
function prefetchAudioStream(videoId) {
  if (isPrefetching || cachedStreamVideoId === videoId) return;
  isPrefetching = true;
  log(`Pre-warming server cache for background play...`, 'system');
  
  fetch(`/api/get_audio?v=${videoId}`)
    .then(r => r.json())
    .then(data => {
      if (data.ready) {
        cachedStreamTitle = data.title || 'YouTube Audio';
        cachedStreamAuthor = data.author || 'YouTube Stream';
        cachedStreamVideoId = videoId;
        log(`✅ Server cache ready! Tap "Load Background Stream" now.`, 'event');
      } else if (data.error) {
        log(`Pre-warm failed: ${data.error}`, 'error');
      }
    })
    .catch(err => {
      log(`Pre-warm failed: ${err.message}`, 'error');
    })
    .finally(() => {
      isPrefetching = false;
    });
}

const btnPlayAudio = document.getElementById('btn-play-audio');
const btnPauseAudio = document.getElementById('btn-pause-audio');

// Setup native audio listeners
nativeAudio.addEventListener('play', () => {
  log('Native Audio: Play started', 'event');
  btnPlayAudio.disabled = true;
  btnPauseAudio.disabled = false;
  updateMediaSession('native', 'playing');
});

nativeAudio.addEventListener('pause', () => {
  log('Native Audio: Paused', 'event');
  btnPlayAudio.disabled = false;
  btnPauseAudio.disabled = true;
  updateMediaSession('native', 'paused');
});

nativeAudio.addEventListener('ended', () => {
  log('Native Audio: Finished playing', 'event');
  btnPlayAudio.disabled = false;
  btnPauseAudio.disabled = true;
  updateMediaSession('native', 'paused');
});

nativeAudio.addEventListener('error', (e) => {
  log(`Native Audio Error: Unable to play. Check connection.`, 'error');
});

btnPlayAudio.addEventListener('click', () => {
  // Ensure we stop YouTube before starting native audio
  stopYouTubePlayback();
  
  log('Initiating Native Audio playback (User triggered)...');
  nativeAudio.play()
    .then(() => log('Native Audio: Playback playing successfully.'))
    .catch(err => log(`Playback failed: ${err.message}`, 'error'));
});

btnPauseAudio.addEventListener('click', () => {
  nativeAudio.pause();
});


/* ==========================================================================
   YOUTUBE PLAYER TESTER (IFrame API)
   ========================================================================== */
let ytPlayer = null;
let ytApiReady = false;

const btnLoadYt = document.getElementById('btn-load-yt');
const btnPlayYt = document.getElementById('btn-play-yt');
const btnPauseYt = document.getElementById('btn-pause-yt');
const btnPipYt = document.getElementById('btn-pip-yt');
const btnStreamYt = document.getElementById('btn-stream-yt');
const ytVideoIdInput = document.getElementById('yt-video-id');

// Callback when API loads
window.onYouTubeIframeAPIReady = function() {
  log('YouTube Player API ready.', 'system');
  ytApiReady = true;
  initYouTubePlayer(extractVideoId(ytVideoIdInput.value));
};

// Check if YT script is already loaded (from a previous session or fast cache)
if (window.YT && window.YT.Player) {
  log('YouTube Player API already detected in cache.', 'system');
  ytApiReady = true;
  // Manually invoke callback since script loaded before script hook
  window.onYouTubeIframeAPIReady();
} else {
  // Dynamically inject YouTube Iframe Player API script
  log('Loading YouTube Player API script...');
  const tag = document.createElement('script');
  tag.src = "https://www.youtube.com/iframe_api";
  const firstScriptTag = document.getElementsByTagName('script')[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

function initYouTubePlayer(videoId) {
  if (!ytApiReady) {
    log('YouTube API is not loaded yet. Check your connection or refresh the page.', 'error');
    return;
  }
  
  log(`Initializing YouTube player with ID: ${videoId}...`);
  
  // Clear any existing player container and recreate it to avoid duplication issues
  const wrapper = document.querySelector('.video-preview-wrapper');
  wrapper.innerHTML = '<div id="youtube-player"></div>';

  try {
    ytPlayer = new YT.Player('youtube-player', {
      height: '100%',
      width: '100%',
      videoId: videoId,
      playerVars: {
        'playsinline': 1, // Crucial for mobile integration to prevent full-screen takeover
        'controls': 1
      },
      events: {
        'onReady': onPlayerReady,
        'onStateChange': onPlayerStateChange,
        'onError': onPlayerError
      }
    });
  } catch (e) {
    log(`Failed to create YT player object: ${e.message}`, 'error');
  }
}

function onPlayerReady(event) {
  log('YouTube Player: Ready to play.', 'system');
  btnPlayYt.disabled = false;
  btnPauseYt.disabled = true;
  btnPipYt.disabled = false;
  btnStreamYt.disabled = false;
}

function onPlayerStateChange(event) {
  // YT.PlayerState: UNSTARTED (-1), ENDED (0), PLAYING (1), PAUSED (2), BUFFERING (3), CUED (5)
  switch (event.data) {
    case YT.PlayerState.PLAYING:
      log('YouTube Player State: PLAYING', 'event');
      btnPlayYt.disabled = true;
      btnPauseYt.disabled = false;
      // Stop native audio if active
      if (!nativeAudio.paused) nativeAudio.pause();
      updateMediaSession('youtube', 'playing');
      break;
    case YT.PlayerState.PAUSED:
      log('YouTube Player State: PAUSED', 'event');
      btnPlayYt.disabled = false;
      btnPauseYt.disabled = true;
      updateMediaSession('youtube', 'paused');
      break;
    case YT.PlayerState.ENDED:
      log('YouTube Player State: ENDED', 'event');
      btnPlayYt.disabled = false;
      btnPauseYt.disabled = true;
      updateMediaSession('youtube', 'paused');
      break;
    case YT.PlayerState.BUFFERING:
      log('YouTube Player State: BUFFERING', 'info');
      break;
  }
}

function onPlayerError(event) {
  log(`YouTube Player Error occurred. Code: ${event.data}`, 'error');
}

function extractVideoId(url) {
  if (!url) return '';
  url = url.trim();
  
  // If it's already just an 11-char ID, return it
  if (url.length === 11 && !url.includes('/') && !url.includes('?')) {
    return url;
  }
  
  // Try matching against common URL structures
  const patterns = [
    /youtube\.com\/watch\?v=([^&\s]+)/,
    /youtu\.be\/([^?\s]+)/,
    /youtube\.com\/embed\/([^?\s]+)/,
    /youtube\.com\/shorts\/([^?\s]+)/,
    /youtube\.com\/live\/([^?\s]+)/,
    /youtube\.com\/v\/([^?\s]+)/
  ];
  
  for (let pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      const id = match[1].substring(0, 11);
      if (id.length === 11) return id;
    }
  }
  
  // Fallback query param parser
  try {
    const parsed = new URL(url);
    const vParam = parsed.searchParams.get('v');
    if (vParam && vParam.length === 11) return vParam;
  } catch (e) {}
  
  return url; // fallback
}

btnLoadYt.addEventListener('click', () => {
  let val = ytVideoIdInput.value.trim();
  if (!val) {
    log('Please enter a valid YouTube Video ID or URL', 'error');
    return;
  }
  
  const videoId = extractVideoId(val);
  if (videoId && videoId.length === 11) {
    log(`Parsed YouTube Video ID: ${videoId}`, 'system');
    ytVideoIdInput.value = videoId;
    initYouTubePlayer(videoId);
    // Pre-fetch the audio stream URL in the background so it's ready instantly
    prefetchAudioStream(videoId);
  } else {
    log(`Could not extract clean 11-character video ID. Trying to load raw input...`, 'error');
    initYouTubePlayer(val);
  }
});

btnPlayYt.addEventListener('click', () => {
  if (ytPlayer && typeof ytPlayer.playVideo === 'function') {
    log('Initiating YouTube Playback (User triggered)...');
    ytPlayer.playVideo();
  }
});

btnPauseYt.addEventListener('click', () => {
  if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
    ytPlayer.pauseVideo();
  }
});

function stopYouTubePlayback() {
  if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
    ytPlayer.pauseVideo();
  }
}

// Picture-in-Picture implementation
btnPipYt.addEventListener('click', async () => {
  log('Attempting to trigger Picture-in-Picture mode...');
  
  // YouTube iframe embeds elements in a document, so we look for the video tag inside the iframe
  const iframe = document.querySelector('iframe');
  if (!iframe) {
    log('YouTube player iframe not found.', 'error');
    return;
  }
  
  try {
    // Note: Due to standard cross-origin browser security, standard web documents cannot directly request 
    // Picture-in-Picture on a cross-origin YouTube iframe's internal video tag directly.
    // However, some browsers support custom toggles, or standard HTML5 video elements support it cleanly.
    // Let's try requesting PiP on a native video wrapper, or notify the user of standard OS controls.
    
    // As a modern workaround, some Safari engines let us request PiP on the iframe block or through user gestures.
    if (document.pictureInPictureEnabled) {
      log('Native PiP is enabled. To play in the background on mobile, click play on your video and tap the system Picture-in-Picture/Home gesture on your device.');
    } else {
      log('Picture-in-Picture API is not supported by your current browser.', 'error');
    }
  } catch (err) {
    log(`Picture-in-Picture request failed: ${err.message}`, 'error');
  }
});

btnStreamYt.addEventListener('click', () => {
  const inputVal = ytVideoIdInput.value.trim();
  const videoId = extractVideoId(inputVal);
  if (!videoId || videoId.length !== 11) {
    log('Please load a valid YouTube Video URL first.', 'error');
    return;
  }

  log(`🎬 Starting Silent Video + Audio Overlay hack...`, 'system');

  // ===== STEP 1: Start Silent Decoy Video (MUST be in user gesture) =====
  const { decoyVideo: dv, audioCtx } = createDecoyVideo();
  dv.play()
    .then(() => log('Decoy video started (browser thinks video is active)', 'event'))
    .catch(e => log(`Decoy failed: ${e.message}`, 'error'));

  // ===== STEP 2: Stop YouTube iframe =====
  stopYouTubePlayback();

  // ===== STEP 3: Play real audio via server byte-proxy =====
  // Server extracts URL + pipes audio bytes through itself (no IP-lock, no CORS)
  nativeAudio.src = `/api/stream_audio?v=${videoId}`;
  nativeAudio.play()
    .then(() => log('SUCCESS! Audio playing. Swipe out or lock your phone!', 'event'))
    .catch(err => log(`Play failed: ${err.message}. Try lock screen Play button.`, 'error'));

  // ===== STEP 4: Update UI =====
  const title = cachedStreamVideoId === videoId ? cachedStreamTitle : `YouTube (${videoId})`;
  const author = cachedStreamVideoId === videoId ? cachedStreamAuthor : 'Loading...';
  document.getElementById('native-track-title').innerText = title;
  document.getElementById('native-track-artist').innerText = author;
  updateMediaSession('native', 'playing');

  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title,
      artist: author,
      album: 'BG Media Lab (YT Stream)',
      artwork: [
        { src: `https://img.youtube.com/vi/${videoId}/sddefault.jpg`, sizes: '640x480', type: 'image/jpeg' }
      ]
    });
  }
});


/* ==========================================================================
   MEDIA SESSION API SETUP & STATE SYNCHRONIZATION
   ========================================================================== */
function updateMediaSession(type, state) {
  if (!('mediaSession' in navigator)) {
    log('Media Session API is not supported in this browser.', 'system');
    return;
  }

  // Update visual state status indicators
  const stateVal = document.getElementById('session-state');
  const titleVal = document.getElementById('session-title');
  const artistVal = document.getElementById('session-artist');

  stateVal.innerText = state;
  if (state === 'playing') {
    stateVal.className = 'status-value highlight';
    navigator.mediaSession.playbackState = 'playing';
  } else {
    stateVal.className = 'status-value highlight-blue';
    navigator.mediaSession.playbackState = 'paused';
  }

  if (type === 'native') {
    titleVal.innerText = 'Cyber Lounge';
    artistVal.innerText = 'Lofi Producer';

    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Cyber Lounge (Background Test)',
      artist: 'Lofi Producer',
      album: 'BG Media Lab Tests',
      artwork: [
        { src: 'https://placehold.co/96x96/6366f1/ffffff?text=Lofi', sizes: '96x96', type: 'image/png' },
        { src: 'https://placehold.co/128x128/6366f1/ffffff?text=Lofi', sizes: '128x128', type: 'image/png' },
        { src: 'https://placehold.co/192x192/6366f1/ffffff?text=Lofi', sizes: '192x192', type: 'image/png' }
      ]
    });
  } else if (type === 'youtube') {
    const videoId = ytVideoIdInput.value;
    titleVal.innerText = `YouTube (${videoId})`;
    artistVal.innerText = 'YouTube Player API';

    navigator.mediaSession.metadata = new MediaMetadata({
      title: `YouTube Video: ${videoId}`,
      artist: 'YouTube Player API',
      album: 'BG Media Lab Tests',
      artwork: [
        { src: `https://img.youtube.com/vi/${videoId}/sddefault.jpg`, sizes: '640x480', type: 'image/jpeg' }
      ]
    });
  }

  setupMediaSessionActions(type);
}

function setupMediaSessionActions(activeType) {
  if (!('mediaSession' in navigator)) return;

  log(`Registering Lock Screen (Media Session) Action Handlers for: ${activeType.toUpperCase()}`);

  const playAction = () => {
    log('[Lock Screen Action] Play clicked!', 'system');
    if (activeType === 'native') {
      nativeAudio.play().catch(e => log(`Failed: ${e.message}`, 'error'));
    } else if (activeType === 'youtube' && ytPlayer) {
      ytPlayer.playVideo();
    }
  };

  const pauseAction = () => {
    log('[Lock Screen Action] Pause clicked!', 'system');
    if (activeType === 'native') {
      nativeAudio.pause();
    } else if (activeType === 'youtube' && ytPlayer) {
      ytPlayer.pauseVideo();
    }
  };

  try {
    navigator.mediaSession.setActionHandler('play', playAction);
    navigator.mediaSession.setActionHandler('pause', pauseAction);
    
    // Empty handlers to prevent standard next/previous actions from crashing
    navigator.mediaSession.setActionHandler('previoustrack', () => log('[Lock Screen Action] Prev Track (Ignored)'));
    navigator.mediaSession.setActionHandler('nexttrack', () => log('[Lock Screen Action] Next Track (Ignored)'));
  } catch (err) {
    log(`Failed to set action handler: ${err.message}`, 'error');
  }
}
