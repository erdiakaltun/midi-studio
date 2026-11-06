(function () {
  var socket = null;
  var octave = 4;
  var currentChannel = 0;
  var velocity = 100;
  var localVolume = 100;
  var audioContext = null;
  var audioMaster = null;
  var audioEnabled = false;
  var audioVoices = {};
  var activeTouches = {};
  var activeNotes = {};
  var mouseNotes = {};
  var whiteNotes = [0, 2, 4, 5, 7, 9, 11];
  var blackNotes = [1, 3, 6, 8, 10];
  var blackPositions = [1, 2, 4, 5, 6];
  var whiteContainer = document.getElementById('whiteKeys');
  var blackContainer = document.getElementById('blackKeys');
  var drumNotes = [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51];
  var drumNames = ['Kick', 'Side Stick', 'Snare', 'Clap', 'E. Snare', 'Low Tom', 'Closed Hat', 'High Tom', 'Pedal Hat', 'Low-Mid Tom', 'Open Hat', 'Mid Tom', 'High-Mid Tom', 'Crash', 'High Tom', 'Ride'];
  var mixerControls = [
    { name: 'Volume', controller: 7, value: 100 },
    { name: 'Expression', controller: 11, value: 127 },
    { name: 'Pan', controller: 10, value: 64 },
    { name: 'Modulation', controller: 1, value: 0 }
  ];

  function send(data) {
    if (socket && socket.readyState === 1) socket.send(JSON.stringify(data));
  }

  function connect() {
    var protocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
    socket = new WebSocket(protocol + location.host + '/ws');
    socket.onopen = function () {
      send({ type: 'hello', role: 'controller' });
      document.getElementById('connection').innerHTML = '● Server connected';
      document.getElementById('connection').className = 'online';
    };
    socket.onmessage = function (event) {
      var msg = JSON.parse(event.data);
      if (msg.type === 'status') {
        document.getElementById('bridgeLed').className = msg.bridgeOnline ? 'led online' : 'led';
        document.getElementById('bridgeText').innerHTML = msg.bridgeOnline ? 'Mac MIDI Bridge bağlı' : 'Mac MIDI Bridge bekleniyor';
      }
    };
    socket.onclose = function () {
      document.getElementById('connection').innerHTML = '● Bağlantı kesildi';
      document.getElementById('connection').className = 'offline';
      setTimeout(connect, 2000);
    };
  }

  function startLocalTone(note, id, noteVelocity) {
    if (!audioEnabled || !audioContext || !audioMaster) return;
    stopLocalTone(id);
    var oscillator = audioContext.createOscillator();
    var gain = audioContext.createGain();
    var now = audioContext.currentTime;
    var level = noteVelocity || velocity;
    oscillator.type = 'triangle';
    oscillator.frequency.value = 440 * Math.pow(2, (note - 69) / 12);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18 * level / 100, now + 0.02);
    oscillator.connect(gain);
    gain.connect(audioMaster);
    oscillator.start(0);
    audioVoices[id] = { oscillator: oscillator, gain: gain };
  }

  function stopLocalTone(id) {
    var voice = audioVoices[id];
    if (!voice || !audioContext) return;
    delete audioVoices[id];
    var now = audioContext.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + 0.05);
    if (voice.oscillator.stop) voice.oscillator.stop(now + 0.06);
    else if (voice.oscillator.noteOff) voice.oscillator.noteOff(now + 0.06);
  }

  function noteOn(note, id, channel) {
    if (activeNotes[id]) return;
    var noteChannel = channel === undefined ? currentChannel : channel;
    activeNotes[id] = { note: note, channel: noteChannel };
    startLocalTone(note, id, velocity);
    send({ type: 'note_on', note: note, velocity: velocity, channel: noteChannel });
    updateKey(note, true);
  }

  function noteOff(id) {
    if (!activeNotes[id]) return;
    var active = activeNotes[id];
    delete activeNotes[id];
    stopLocalTone(id);
    send({ type: 'note_off', note: active.note, velocity: 0, channel: active.channel });
    updateKey(active.note, false);
  }

  function releaseAllNotes() {
    var ids = [];
    var id;
    for (id in activeNotes) if (activeNotes.hasOwnProperty(id)) ids.push(id);
    for (var i = 0; i < ids.length; i++) noteOff(ids[i]);
    mouseNotes = {};
  }

  function updateKey(note, active) {
    var key = document.querySelector('[data-note="' + note + '"]');
    if (key && active) key.className += ' active';
    else if (key) key.className = key.className.replace(' active', '');
  }

  function bindTouch(element, note, id, channel) {
    element.addEventListener('touchstart', function (event) {
      event.preventDefault();
      for (var i = 0; i < event.changedTouches.length; i++) {
        var touchId = id + ':' + event.changedTouches[i].identifier;
        activeTouches[touchId] = true;
        noteOn(note, touchId, channel);
      }
    }, false);
    element.addEventListener('touchend', function (event) {
      event.preventDefault();
      releaseChangedTouches(event);
    }, false);
    element.addEventListener('touchcancel', function (event) {
      releaseChangedTouches(event);
    }, false);
    element.addEventListener('mousedown', function (event) {
      if (event.button !== 0) return;
      mouseNotes[id] = true;
      noteOn(note, 'mouse:' + id, channel);
    }, false);
  }

  function releaseChangedTouches(event) {
    for (var i = 0; i < event.changedTouches.length; i++) {
      var touchId = 'touch:' + event.changedTouches[i].identifier;
      var ids = [];
      var id;
      for (id in activeNotes) {
        if (activeNotes.hasOwnProperty(id) && id.indexOf(':' + event.changedTouches[i].identifier) !== -1) ids.push(id);
      }
      for (var j = 0; j < ids.length; j++) noteOff(ids[j]);
      delete activeTouches[touchId];
    }
  }

  document.addEventListener('mouseup', function () {
    var id;
    for (id in mouseNotes) if (mouseNotes.hasOwnProperty(id)) noteOff('mouse:' + id);
    mouseNotes = {};
  }, false);

  function createKey(element, note, id) {
    element.setAttribute('data-note', note);
    bindTouch(element, note, id, currentChannel);
  }

  function render() {
    var base = (octave + 1) * 12;
    whiteContainer.innerHTML = '';
    blackContainer.innerHTML = '';
    for (var i = 0; i < whiteNotes.length; i++) {
      var white = document.createElement('div');
      white.className = 'white-key';
      white.innerHTML = ['C', 'D', 'E', 'F', 'G', 'A', 'B'][i];
      whiteContainer.appendChild(white);
      createKey(white, base + whiteNotes[i], 'white' + i);
    }
    for (var j = 0; j < blackNotes.length; j++) {
      var black = document.createElement('div');
      black.className = 'black-key';
      black.style.left = (blackPositions[j] / 7 * 100) + '%';
      blackContainer.appendChild(black);
      createKey(black, base + blackNotes[j], 'black' + j);
    }
    document.getElementById('octaveLabel').innerHTML = 'OCTAVE ' + octave;
    document.getElementById('pianoChannelInfo').innerHTML = 'CHANNEL: ' + (currentChannel + 1);
    document.getElementById('mixerChannelInfo').innerHTML = 'CHANNEL: ' + (currentChannel + 1);
  }

  function buildChannels() {
    var select = document.getElementById('channelSelect');
    for (var channel = 1; channel <= 16; channel++) {
      var option = document.createElement('option');
      option.value = channel - 1;
      option.innerHTML = channel;
      select.appendChild(option);
    }
    select.value = '0';
    select.addEventListener('change', function () {
      currentChannel = Number(this.value) || 0;
      render();
    }, false);
  }

  function buildPads() {
    var grid = document.getElementById('padGrid');
    for (var i = 0; i < drumNotes.length; i++) {
      var pad = document.createElement('button');
      pad.type = 'button';
      pad.className = 'pad';
      pad.innerHTML = drumNames[i] + '<br><small>' + drumNotes[i] + '</small>';
      grid.appendChild(pad);
      bindTouch(pad, drumNotes[i], 'pad' + i, 9);
    }
  }

  function buildMixer() {
    var grid = document.getElementById('mixerGrid');
    for (var i = 0; i < mixerControls.length; i++) {
      var control = mixerControls[i];
      var strip = document.createElement('div');
      strip.className = 'mixer-strip';
      strip.innerHTML = '<label>' + control.name + ' <span id="ccValue' + control.controller + '">' + control.value + '</span></label>' +
        '<input type="range" min="0" max="127" value="' + control.value + '" data-controller="' + control.controller + '">';
      grid.appendChild(strip);
      bindMixerControl(strip.getElementsByTagName('input')[0], control);
    }
  }

  function bindMixerControl(input, control) {
    var lastValue = String(control.value);
    function update() {
      var value = Number(input.value);
      document.getElementById('ccValue' + control.controller).innerHTML = value;
      if (String(value) !== lastValue) {
        lastValue = String(value);
        send({ type: 'control_change', controller: control.controller, value: value, channel: currentChannel });
      }
    }
    input.addEventListener('input', update, false);
    input.addEventListener('change', update, false);
  }

  function bindRange(input, callback) {
    input.addEventListener('input', callback, false);
    input.addEventListener('change', callback, false);
  }

  var volumeInput = document.getElementById('localVolume');
  bindRange(volumeInput, function () {
    localVolume = Number(volumeInput.value);
    document.getElementById('localVolumeValue').innerHTML = localVolume + '%';
    if (audioMaster) audioMaster.gain.value = localVolume / 100;
  });

  var velocityInput = document.getElementById('velocityControl');
  bindRange(velocityInput, function () {
    velocity = Number(velocityInput.value);
    document.getElementById('velocityValue').innerHTML = velocity;
    document.getElementById('pianoVelocityInfo').innerHTML = 'VELOCITY: ' + velocity;
  });

  var localAudioToggle = document.getElementById('localAudioToggle');
  var lastAudioTouch = 0;
  function toggleLocalAudio(event) {
    if (event && event.type === 'touchend') {
      event.preventDefault();
      lastAudioTouch = new Date().getTime();
    } else if (event && event.type === 'click' && new Date().getTime() - lastAudioTouch < 800) {
      return;
    }
    if (!audioEnabled) {
      var AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextConstructor) {
        localAudioToggle.innerHTML = 'Ses desteklenmiyor';
        return;
      }
      try {
        if (!audioContext) {
          audioContext = new AudioContextConstructor();
          audioMaster = audioContext.createGain ? audioContext.createGain() : audioContext.createGainNode();
          audioMaster.gain.value = localVolume / 100;
          audioMaster.connect(audioContext.destination);
        }
        if (audioContext.resume) audioContext.resume();
        audioEnabled = true;
        localAudioToggle.innerHTML = 'Cihaz sesi: Açık';
        localAudioToggle.className = 'audio-toggle active';
        startLocalTone((octave + 1) * 12, 'preview', velocity);
        setTimeout(function () { stopLocalTone('preview'); }, 350);
      } catch (error) {
        audioEnabled = false;
        localAudioToggle.innerHTML = 'Ses açılamadı';
      }
    } else {
      audioEnabled = false;
      localAudioToggle.innerHTML = 'Cihaz sesi: Kapalı';
      localAudioToggle.className = 'audio-toggle';
      var voiceId;
      for (voiceId in audioVoices) if (audioVoices.hasOwnProperty(voiceId)) stopLocalTone(voiceId);
    }
  }
  localAudioToggle.addEventListener('touchend', toggleLocalAudio, false);
  localAudioToggle.addEventListener('click', toggleLocalAudio, false);

  var tabs = document.querySelectorAll('.mode-tab');
  for (var t = 0; t < tabs.length; t++) {
    tabs[t].addEventListener('click', function () {
      releaseAllNotes();
      var view = this.getAttribute('data-view');
      var panels = ['piano', 'pads', 'mixer'];
      for (var p = 0; p < panels.length; p++) {
        document.getElementById(panels[p] + 'Panel').className = panels[p] === view ? 'view-panel active' : 'view-panel';
      }
      for (var k = 0; k < tabs.length; k++) tabs[k].className = tabs[k] === this ? 'mode-tab active' : 'mode-tab';
      document.getElementById('instrumentName').innerHTML = view === 'piano' ? 'PIANO' : view === 'pads' ? 'DRUM PADS' : 'MIDI MIXER';
      document.getElementById('performanceControls').style.display = view === 'mixer' ? 'none' : '';
      document.getElementById('octaveControls').style.display = view === 'piano' ? 'flex' : 'none';
    }, false);
  }

  document.getElementById('octDown').onclick = function () {
    if (octave > 1) { octave--; render(); }
  };
  document.getElementById('octUp').onclick = function () {
    if (octave < 7) { octave++; render(); }
  };

  document.addEventListener('touchend', function (event) {
    releaseChangedTouches(event);
  }, false);

  buildChannels();
  buildPads();
  buildMixer();
  render();
  connect();
}());
/* Keyboard-first controls; existing MIDI controls are moved, not recreated. */
(function () {
  var main = document.querySelector('main');
  var shell = main && main.querySelector('section.panel:first-child');
  var piano = document.getElementById('pianoPanel');
  var keyboard = document.getElementById('keyboard');
  if (!main || !shell || !piano || !keyboard || document.getElementById('focusDock')) return;

  var dock = document.createElement('div');
  dock.id = 'focusDock';
  dock.className = 'focus-dock';
  dock.setAttribute('role', 'toolbar');
  dock.setAttribute('aria-label', 'Klavye ayarları');
  dock.innerHTML = '<button type="button" data-open-tab="instrument" aria-label="Enstrüman ve oktav" title="Enstrüman ve oktav">♫</button>' +
    '<button type="button" data-open-tab="touch" aria-label="Tuş ayarları" title="Tuş ayarları">☷</button>' +
    '<button type="button" data-open-tab="status" aria-label="Bağlantı durumu" title="Bağlantı durumu">●</button>';
  shell.appendChild(dock);

  var overlay = document.createElement('div');
  overlay.id = 'midiSettingsOverlay';
  overlay.className = 'midi-settings-overlay';
  overlay.innerHTML = '<div class="midi-settings-card" role="dialog" aria-modal="true" aria-label="Klavye ayarları">' +
    '<div class="midi-settings-head"><span id="settingsTitle">Enstrüman ve oktav</span><button type="button" class="midi-settings-close" aria-label="Kapat">×</button></div>' +
    '<div class="midi-settings-tabs"><button type="button" data-tab="instrument" class="active">Enstrüman</button><button type="button" data-tab="touch">Tuş ayarları</button><button type="button" data-tab="status">Bağlantı</button></div>' +
    '<div class="midi-settings-content active" data-content="instrument"></div>' +
    '<div class="midi-settings-content" data-content="touch"></div>' +
    '<div class="midi-settings-content" data-content="status"><div class="midi-settings-status"></div></div>' +
    '</div>';
  shell.appendChild(overlay);

  var instrument = overlay.querySelector('[data-content="instrument"]');
  var touch = overlay.querySelector('[data-content="touch"]');
  var status = overlay.querySelector('.midi-settings-status');
  var toolbar = shell.querySelector('.toolbar');
  var viewTabs = shell.querySelector('.view-tabs');
  var settings = piano.querySelector('.settings-row');
  var footer = piano.querySelector('.footer');
  var statusPanel = main.querySelector('section.panel.info');
  function move(node, parent) { if (node) parent.appendChild(node); }
  move(toolbar, instrument);
  move(viewTabs, instrument);
  move(settings, touch);
  move(footer, status);
  if (statusPanel) {
    while (statusPanel.firstChild) status.appendChild(statusPanel.firstChild);
    statusPanel.parentNode.removeChild(statusPanel);
  }

  var title = overlay.querySelector('#settingsTitle');
  var labels = { instrument: 'Enstrüman ve oktav', touch: 'Tuş ayarları', status: 'Bağlantı durumu' };
  function selectTab(name) {
    var tabs = overlay.querySelectorAll('.midi-settings-tabs button');
    var contents = overlay.querySelectorAll('.midi-settings-content');
    var i;
    for (i = 0; i < tabs.length; i++) tabs[i].className = tabs[i].getAttribute('data-tab') === name ? 'active' : '';
    for (i = 0; i < contents.length; i++) contents[i].className = 'midi-settings-content' + (contents[i].getAttribute('data-content') === name ? ' active' : '');
    title.textContent = labels[name] || labels.instrument;
  }
  function open(name) { selectTab(name); overlay.className = 'midi-settings-overlay open'; }
  function close() { overlay.className = 'midi-settings-overlay'; }
  dock.addEventListener('click', function (event) {
    var name = event.target.getAttribute('data-open-tab');
    if (name) open(name);
  }, false);
  overlay.querySelector('.midi-settings-close').addEventListener('click', close, false);
  overlay.addEventListener('click', function (event) { if (event.target === overlay) close(); }, false);
  overlay.querySelector('.midi-settings-tabs').addEventListener('click', function (event) {
    var name = event.target.getAttribute('data-tab');
    if (name) selectTab(name);
  }, false);
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') close(); }, false);
}());
