const WebSocket = require('ws');
const JZZ = require('jzz');

const SERVER_URL = process.env.MIDI_SERVER_URL || 'ws://192.168.1.11:8765/ws';
const MIDI_OUT_NAME = process.env.MIDI_OUTPUT || 'IAC Sürücüsü Yol 1';

async function start() {
  const engine = await JZZ();
  const midiOut = await engine.openMidiOut(MIDI_OUT_NAME);
  console.log('MIDI çıkışı hazır: ' + midiOut.name());

  function connect() {
    console.log('Sunucuya bağlanılıyor: ' + SERVER_URL);
    const socket = new WebSocket(SERVER_URL);

    socket.on('open', function () {
      console.log('WebSocket bağlantısı kuruldu.');
      socket.send(JSON.stringify({ type: 'hello', role: 'bridge' }));
      console.log('Köprü rolü sunucuya bildirildi.');
    });

    socket.on('message', function (raw) {
      let message;
      try { message = JSON.parse(raw.toString()); }
      catch (error) { console.log('Okunamayan sunucu mesajı atlandı.'); return; }

      const channel = Math.max(0, Math.min(15, Number(message.channel === undefined ? 0 : message.channel)));
      const note = Number(message.note);
      const velocity = Math.max(0, Math.min(127, Number(message.velocity === undefined ? 100 : message.velocity)));

      if (message.type === 'note_on' && note >= 0 && note <= 127) midiOut.noteOn(channel, note, velocity);
      else if (message.type === 'note_off' && note >= 0 && note <= 127) midiOut.noteOff(channel, note, velocity);
      else if (message.type === 'control_change') {
        const controller = Number(message.controller);
        const value = Number(message.value);
        if (controller >= 0 && controller <= 127 && value >= 0 && value <= 127) midiOut.control(channel, controller, value);
      } else if (message.type !== 'hello' && message.type !== 'status') {
        console.log('Desteklenmeyen mesaj türü atlandı: ' + message.type);
      }
    });

    socket.on('error', function (error) { console.error('WebSocket hatası: ' + error.message); });
    socket.on('close', function () {
      console.log('Bağlantı kapandı; 3 saniye sonra yeniden denenecek.');
      setTimeout(connect, 3000);
    });
  }
  connect();
}

start().catch(function (error) {
  console.error('Köprü başlatılamadı: ' + error.message);
  process.exitCode = 1;
});
