# İcraat Mobil Web — Uygulama Notları

## Kapsam

- Hedef platformlar: güncel iPhone/Safari ve Android/Chrome.
- Uygulama PWA olarak GitHub Pages üzerinden sunulacak; ilk yükleme ve güncellemeler dışında çevrimdışı çalışacak.
- EVK verileri cihazdaki IndexedDB içinde saklanır.
- PDF üretimi bu fazın kapsamında değildir.

## Birleştirilen özellikler

- `Icraat_pdf`: Ekip türü, ekip kodu, tarih/saat, görevliler ve yollar.
- `IcraatPdfYeni`: Birim seçimi, EVK kimlik/revizyon kuralları, birim odaklı kart listesi, ceza/kontrol/kaza payload yapısı ve JSON sözleşmesi.
- Kart sağa kaydırılırsa güncelleme, sola kaydırılırsa onaylı silme açılır. Uzun basma aynı işlemleri menüyle sunar.
- Kart ayrıntısında sabit sekmeler: Ceza Ekle, Kontroller, Kazalar, İcraat. İcraat içeriği bu fazda boştur.

## Veri kuralları

- `evkId` oluşturulduktan sonra değişmez.
- Yeni EVK `revision = 0` ile başlar.
- Yerel kullanıcı düzenlemeleri revision artırmaz; yalnızca `updatedAt` değişir.
- JSON paylaşımı/dışa aktarımı hazırlanırken ilgili EVK revision değeri artırılır.
- Import sırasında her EVK kendi kimlik, revision ve updatedAt değerleriyle ayrı değerlendirilir.
- Daha eski kayıt otomatik olarak daha yeni kaydın üzerine yazılmaz.
- Bilinmeyen payload alanları korunur.
- Görevli ve yol listeleri, birinci projenin modelleriyle uyumlu olarak `payload.personnel` ve `payload.roads` alanlarında taşınır.

## Web uzantısı

Tüm birimlerdeki EVK kayıtlarının tek dosyada taşınabilmesi için web sürümü `exportType = ALL_EVK` ve karışık paketlerde `sourceUnit = MIXED` kullanır. Kayıtların içindeki `sourceUnit` değerleri değişmez. Import motoru mevcut `SINGLE_EVK` ve `UNIT_PACKAGE` zarflarını da kayıt bazında kabul eder.

## Açık TODO

- BIRIM_BILGI alanları tanımlanınca IndexedDB store ve form eklenecek.
- PDF alan eşlemesi tanımlanınca ayrı fazda ele alınacak.
- GitHub deposu ve GitHub Pages yayını kullanıcı onayıyla son aşamada bağlanacak.
