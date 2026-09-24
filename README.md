# İcraat Mobil

HTML, CSS ve JavaScript ile yazılmış; Android ve iPhone için mobil odaklı, çevrimdışı çalışabilen EVK uygulaması.

## Yerelde çalıştırma

Bu klasörde bir HTTP sunucusu açın:

```powershell
python -m http.server 4173
```

Ardından telefondan veya bilgisayardan `http://127.0.0.1:4173` adresini açın. Service worker ve iPhone kurulumu için nihai kullanımda HTTPS gerekir; GitHub Pages bunu ücretsiz sağlar.

## iPhone kullanımı

GitHub Pages adresini Safari ile açın, **Paylaş → Ana Ekrana Ekle** seçeneğini kullanın. İlk açılıştan sonra uygulama kabuğu ve ceza rehberi çevrimdışı kullanılabilir. Veriler Safari/IndexedDB içinde cihazda saklanır; Safari site verileri silinirse kayıtlar da silinir. Bu nedenle düzenli JSON dışa aktarımı önerilir.

## Doğrulama

```powershell
node --test
node --check app.js
node --check db.js
node --check domain.js
node --check sw.js
```

GitHub bağlantısı ve yayınlama bilinçli olarak sonraki aşamaya bırakılmıştır.
