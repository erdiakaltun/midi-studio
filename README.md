# MIDI Stüdyosu

İPad veya başka bir dokunmatik ekrandan çalınan notaları WebSocket üzerinden Mac’e ileten ücretsiz, açık kaynaklı bir MIDI stüdyosu. Ubuntu sunucusu web klavyesini ve MIDI mesajlarını yönetir; Mac köprüsü mesajları macOS IAC sanal MIDI çıkışına aktarır. GarageBand bu çıkışı enstrüman olarak kullanabilir.

## Özellikler

- Dokunmatik piyano klavyesi, ritim pedleri ve MIDI denetim mikseri
- WebSocket üzerinden gerçek zamanlı nota, nota bırakma ve denetim değişikliği iletimi
- Node.js tabanlı Ubuntu sunucusu
- Ücretsiz JZZ ve `ws` paketleriyle macOS MIDI köprüsü
- iPad Safari ve masaüstü tarayıcılar için uyumlu arayüz

## Gereksinimler

- Ubuntu veya başka bir Linux sistemi ve Node.js 18 ya da üzeri
- Mac köprüsü için macOS, Node.js ve GarageBand
- iPad ile Mac’in aynı yerel ağa bağlı olması önerilir

## Ubuntu sunucusunu kurma

```bash
git clone https://github.com/erdiakaltun/midi-studio.git
cd midi-studio
npm ci
npm start
```

Sunucu varsayılan olarak `8765` portunda dinler. Sunucunun yerel ağ IP adresini `hostname -I` komutuyla öğrenin ve iPad’de `http://SUNUCU_IP_ADRESI:8765/` adresini açın. Güvenlik duvarı kullanıyorsanız yalnızca yerel ağınızdan TCP 8765 erişimine izin verin.

Portu değiştirmek için `server/index.js` içindeki `PORT` değerini düzenleyin.

## Mac MIDI köprüsünü kurma

1. **Ses MIDI Ayarları** uygulamasında MIDI Stüdyosu’nu açın, **IAC Sürücüsü**’nü etkinleştirin ve bir MIDI yolu oluşturun.
2. Mac’te Terminal’i açın ve proje içindeki `bridge-macos` klasörüne geçin.
3. Bağımlılıkları kurup köprüyü başlatın:

```bash
cd bridge-macos
npm install
MIDI_SERVER_URL=ws://SUNUCU_IP_ADRESI:8765/ws npm start
```

Varsayılan MIDI çıkışı `IAC Sürücüsü Yol 1`’dir. macOS’unuz portu farklı adla gösteriyorsa `MIDI_OUTPUT` değişkenini kullanın:

```bash
MIDI_OUTPUT='IAC Driver Bus 1' MIDI_SERVER_URL=ws://SUNUCU_IP_ADRESI:8765/ws npm start
```

Mevcut MIDI çıkışlarını görmek için `bridge-macos` klasöründeyken şu komutu çalıştırın:

```bash
node -e "const JZZ=require('jzz'); JZZ().and(function(){console.log(this.info().outputs)})"
```

Köprü çalışırken GarageBand’de bir **Yazılım Enstrümanı** parçası seçin. MIDI notaları IAC yolu üzerinden seçili enstrümana gelir. Köprü Terminal penceresi açık kaldığı sürece çalışır.

## Bağlantı akışı

`iPad tarayıcısı → Ubuntu MIDI Stüdyosu → WebSocket → Mac MIDI Köprüsü → IAC Sürücüsü → GarageBand`

Köprü sunucuya `hello` mesajı ile `role: bridge` bilgisini gönderir. Sunucu `note_on`, `note_off` ve `control_change` mesajlarını köprüye iletir. MIDI kanalları 0–15 aralığında (MIDI kanal 1–16) kodlanır.

## Güvenlik

Bu örnek uygulamada kullanıcı girişi veya WebSocket kimlik doğrulaması yoktur. Sunucuyu yalnızca güvendiğiniz yerel ağda çalıştırın; doğrudan internete açmayın. Dış erişim gerekiyorsa önce kimlik doğrulama, TLS ve ağ erişim kuralları ekleyin. `.env`, özel anahtarlar ve yedekler depoya eklenmez.

## Lisans

Bu proje ISC lisansı altında yayımlanmıştır. Bağımlılıkların kendi lisansları geçerlidir.
