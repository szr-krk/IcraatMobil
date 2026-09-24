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
- Normal görevlerde kart ayrıntısında sabit sekmeler Ceza Ekle, Kontroller, Kazalar ve İcraat'tır. İcraat sekmesi birinci projenin ekip faaliyet metnini, ayrıca Hız/Kemer/Alkol adetlerini gösterir; EVK'ya bağlı not girişi ve sistem metin paylaşımı sunar.
- Radar görevlerinde `Ekip · Yüzüne`, `Operatör · Plakaya` ve `İcraat` sekmeleri gösterilir; Kontroller, Kazalar ve standart ceza arama arayüzü gösterilmez.

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
- Kontroller sekmesindeki kartlarda yalnızca kontrol kodu ve adet alanı gösterilir; açıklama metni gösterilmez.
- Radar görevindeki iki ceza sekmesi de `51/2-b-1` ile `51/2-b-9` arasındaki dokuz maddeyi yalnızca madde kodu ve adet alanıyla gösterir. Ekip sekmesindeki adetler `RADAR_TEAM`/`DRIVER`, operatör sekmesindekiler `RADAR_OPERATOR`/`PLATE` olarak mevcut `payload.penalties` listesine otomatik kaydedilir. Boş veya sıfır adet ilgili kaydın kaldırılmasıdır.
- Radar adet ekranı açıldığında hiçbir giriş alanı otomatik odaklanmaz; klavye yalnızca kullanıcının seçtiği alana dokunmasıyla açılır.
- Radar İcraat sekmesi birinci projenin radar faaliyet metnini kullanır: K3 ve kontrol edilen araç sayısı radar ceza işlemlerinden hesaplanır; ceza maddeleri ekip/operatör ayrımı olmadan toplam adetle listelenir, ardından sürücüye/plakasına toplamları, toplam tutar, not ve `Arz ederim.` satırı gösterilir. Radar için Kontroller, Kazalar ve Hız/Kemer/Alkol ek özeti gösterilmez.
- İcraat başlığı Merkez EVK'larında `Tekirdağ Bölge Trafik Denetleme Şube Müdürlüğü`, Çorlu ve Malkara EVK'larında `Malkara Bölge Trafik Denetleme İstasyon Amirliği` olarak gösterilir. Not `payload.note` alanında saklanır ve EVK JSON aktarımında korunur. Metin paylaşımı Web Share ile WhatsApp dahil cihaz paylaşım ekranını açar; desteklenmiyorsa metni panoya kopyalar.

## Web uzantısı

Tüm birimlerdeki EVK kayıtlarının tek dosyada taşınabilmesi için web sürümü `exportType = ALL_EVK` ve karışık paketlerde `sourceUnit = MIXED` kullanır. Kayıtların içindeki `sourceUnit` değerleri değişmez. Import motoru mevcut `SINGLE_EVK` ve `UNIT_PACKAGE` zarflarını da kayıt bazında kabul eder.

## Açık TODO

- BIRIM_BILGI alanları tanımlanınca IndexedDB store ve form eklenecek.
- PDF alan eşlemesi tanımlanınca ayrı fazda ele alınacak.
- Public kaynak deposu: `https://github.com/szr-krk/IcraatMobil`
- GitHub Pages yayını: `https://szr-krk.github.io/IcraatMobil/`
