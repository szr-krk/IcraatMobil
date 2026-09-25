# İcraat Mobil

HTML, CSS ve JavaScript ile yazılmış; Android ve iPhone için mobil odaklı İcraat uygulaması.

Ekip özetleri dosya indirmeden tıklanabilir bağlantıyla ekipten gündüz 20'ye, gündüz 20'den gece 20'ye ve birim toplamı olarak 5920'ye aktarılır. Bağlantıdaki sabit sıralı Base36 veri cihazda çözülür; bir ekip ile yüz ekibin toplam paketi aynı küçük yapıyı kullanır.

Uygulama kayıtlı EVK’lerden Excel düzenine denk tek sayfalık A4 Günlük İcraat PDF üretir. PDF öncesinde ekiplerden gelen son 24 saatlik kaza toplamları birim bazında gösterilir; kullanıcı yılbaşından rapor gününe kadar birikmiş kaza, PTS ve KGYS değerlerini girer. Çıktı önizlenebilir, indirilebilir veya cihazın paylaşım ekranıyla gönderilebilir. Kurumsal renkler, durum simgeleri, gerçekleşme çubukları ve yön okları renkli ekranda hızlı okuma sağlarken siyah-beyaz yazıcı çıktısında da anlamını korur.

Canlı uygulama: https://szr-krk.github.io/IcraatMobil/

## Yerelde çalıştırma

Bu klasörde bir HTTP sunucusu açın:

```powershell
python -m http.server 4173
```

Ardından telefondan veya bilgisayardan `http://127.0.0.1:4173` adresini açın. Service worker ve iPhone kurulumu için nihai kullanımda HTTPS gerekir; GitHub Pages bunu ücretsiz sağlar.

## iPhone kullanımı

GitHub Pages adresini Safari ile açın. WhatsApp üzerinden gelen özet bağlantıları aynı adreste açılır ve alınan kayıtlar Safari/IndexedDB içinde cihazda saklanır. Safari site verileri silinirse kişisel ekip ve alınan özetler de silinir.

## Doğrulama

```powershell
node --test
node --check app.js
node --check db.js
node --check domain.js
node --check report.js
node --check transfer.js
node --check pdf-report.js
node --check sw.js
```

Kaynak depo: https://github.com/szr-krk/IcraatMobil
