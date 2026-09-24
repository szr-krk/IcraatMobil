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
- Açılış özet satırı Merkez, Çorlu ve Malkara birimlerinin kayıtlı EVK sayılarını (kayıt yoksa `0`) sabit sırayla gösterir.
- Görevli ve yol bilgileri ayrıca IndexedDB `settings` deposunda cihaz genelinde seçilebilir rehberler olarak tutulur. İlk kullanımda mevcut EVK payload kayıtları rehberlere alınır. Rehber kaydı güncellenebilir veya silinebilir; silme geçmiş EVK payload verilerini değiştirmez.
- Ceza ekleme çerçevesi Ceza Ekle sekmesinde ekranın altında sabittir ve sanal klavye açıldığında görünür alanın altına taşınır. Ceza listesi düşey kaydırılabilir; madde arama sonuçları sabit çerçevenin üstünde açılır.
- Ceza çerçevesi dar telefonlarda sonuçlara alan bırakacak sıkı düzendedir. Madde arama alanı odaktayken madde sonucu, ceza türü, radar kaynağı, araç men, otopark ve belge iptal seçimleri arama odağını bozmaz; seri madde seçimi sırasında klavye açık kalır.
- Kontrol ve kaza sayısı alanları klavye açıldığında görünür alanın ortasına kaydırılır; son satırlar için klavye yüksekliği kadar ek kaydırma alanı ayrılır.
- Madde filtresi açıkken ceza türü, radar kaynağı, ek işlem kutuları ve seçili madde satırı geçici olarak gizlenir; sonuç penceresinin alt kenarı Madde Ara satırının hemen üstünde kalır.
- Eklenmiş ceza kartı tek bir düz cümlede tür, maddeler, toplam tutar, ek işlemler ve adet bilgisini gösterir. Kart iki yönden de en az 68 piksel kaydırıldığında ek onay istemeden silinir ve yalnızca sonuç bildirimi gösterilir; kart üzerindeki silme düğmesi bulunmaz.

## Web uzantısı

Tüm birimlerdeki EVK kayıtlarının tek dosyada taşınabilmesi için web sürümü `exportType = ALL_EVK` ve karışık paketlerde `sourceUnit = MIXED` kullanır. Kayıtların içindeki `sourceUnit` değerleri değişmez. Import motoru mevcut `SINGLE_EVK` ve `UNIT_PACKAGE` zarflarını da kayıt bazında kabul eder.

## Açık TODO

- BIRIM_BILGI alanları tanımlanınca IndexedDB store ve form eklenecek.
- PDF alan eşlemesi tanımlanınca ayrı fazda ele alınacak.
- Public kaynak deposu: `https://github.com/szr-krk/IcraatMobil`
- GitHub Pages yayını: `https://szr-krk.github.io/IcraatMobil/`
