# İcraat Mobil Web — Uygulama Notları

## Kapsam

- Hedef platformlar: güncel iPhone/Safari ve Android/Chrome.
- Uygulama PWA olarak GitHub Pages üzerinden sunulacak; ilk yükleme ve güncellemeler dışında çevrimdışı çalışacak.
- EVK verileri cihazdaki IndexedDB içinde saklanır.
- Günlük İcraat PDF, cihazda kayıtlı tüm EVK’lerden tarayıcı içinde ve çevrimdışı üretilebilir.

## Uygulama Durumu

- Kişisel ekip kaydı isteğe bağlıdır ve yeni kurulumlarda en fazla bir adet oluşturulur.
- Ekip ekleme ekranındaki başlangıç/bitiş tarih ve saat alanları iki sütunlu mobil düzende kendi hücre sınırları içinde küçülebilir. iPhone Safari'de yerel kontrolün zorladığı iç genişlik kaldırılır; iki kutunun kenarlıkları üst üste binmez ve saat kutusu ekran dışına taşmaz. Android görünümü ile iOS/Android yerel tarih ve saat seçicileri korunur.
- Ekip → gündüz 20 → gece 20 → 5920 aktarımı kısa, tıklanabilir ve dosyasız özet bağlantılarıyla uygulanmıştır.
- Alınan ekip, gündüz ve birim özetleri kişisel EVK’den ayrı IndexedDB deposunda ve ayrı ana ekran listesinde tutulur.
- **Tüm İcraatleri Görüntüle**, Alınan İcraatlar listesindeki kayıtların tamamını birim ayrımı gözetmeden toplayıp tek kayıt önizlemesiyle aynı Kontroller, Kazalar, Ceza adetleri ve Ceza türleri düzeninde gösterir. Bu ekrandaki **Metin Olarak Paylaş**, uygulama bağlantısı içermeyen ve ekranda görünen bütün birleşik değerleri taşıyan düz metni sistem paylaşım ekranına gönderir; mevcut bağlantılı toplam paylaşımı ayrıca korunur.
- PDF yalnızca **Alınan İcraatlar** listesindeki özetlerden beslenir; kişisel ekip kartı PDF hesabına doğrudan katılmaz. Mevcut PDF veri giriş ekranı ve PDF üreticisi değişmez.

## Birleştirilen özellikler

- `Icraat_pdf`: Ekip türü, ekip kodu, tarih/saat, görevliler ve yollar.
- `IcraatPdfYeni`: Birim seçimi, EVK kimlik/revizyon kuralları, birim odaklı kart listesi, ceza/kontrol/kaza payload yapısı ve JSON sözleşmesi.
- Kişisel ekip kartı sağa kaydırılırsa güncelleme, sola kaydırılırsa onaylı silme açılır; karta dokunmak ayrıntıya girer. Uzun basma menüsü bulunmaz.
- Ekip kartları birinci projedeki kalkan/yıldız ekip simgesini kullanır. Kartın sağındaki paylaşım simgesi ekip özet bağlantısını doğrudan 20'ye göndermek için kullanılır. Kullanıcıya görünen kayıt adı `İcraat`tır; EVK terimi yalnızca veri sözleşmesi ve teknik kimliklerde korunur.
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
- Ana ekrandaki eski Merkez/Çorlu/Malkara sayaç satırı kaldırılmıştır. Kişisel ekip varsa listenin üstünde **Benim İcraatım**, bağlantıyla alınan kayıtlar altta **Alınan İcraatlar** olarak gösterilir. Kişisel ekip yoksa yalnızca alınanlar listelenir.
- Alınan özet kartına dokunulduğunda başlıkta ekip kodu/görev türü, altında birim ve zaman aralığı gösterilir. Ayrıntıda gereksiz ekip toplam bölümü bulunmaz; altı kontrol, dört kaza, sürücü/plaka ve hız/kemer/alkol değerlerinin tamamı eksiksiz kenarlıklı, kompakt iki sütunlu düzende gösterilir. Kart sola kaydırıldığında açık silme onayı istenir; tüm alınan özetler menüden topluca temizlenebilir.
- Görevli ve yol bilgileri ayrıca IndexedDB `settings` deposunda cihaz genelinde seçilebilir rehberler olarak tutulur. İlk kullanımda mevcut EVK payload kayıtları rehberlere alınır. Rehber kaydı güncellenebilir veya silinebilir; silme geçmiş EVK payload verilerini değiştirmez.
- Mobil görevli ve yol rehberlerinde **Yeni** veya **Güncelle** seçildiğinde seçim penceresinden ayrı, tam ekran ve kaydırma gerektirmeyen bir kayıt ekranı açılır. Bu ekranda yalnızca ilgili alanlar ile geri/Kaydet işlemleri bulunur; seçim penceresinin **Tamam** düğmesi gösterilmez ve klavye kendiliğinden açılmaz. Görevli soyadı Türkçe büyük harfe çevrilir. Görevliler seçim listesinde, ekip kaydında ve icraat metninde sayısal sicil numarası küçükten büyüğe sıralanır; sicilsiz kayıtlar listenin sonunda yer alır.
- Ceza ekleme çerçevesi Ceza Ekle sekmesinde ekranın altında sabittir ve sanal klavye açıldığında görünür alanın altına taşınır. Ceza listesi düşey kaydırılabilir; madde arama sonuçları sabit çerçevenin üstünde açılır.
- `assets/ceza_rehberi.json` ağ varken GitHub Pages kaynağından yeniden doğrulanır, ağ yokken Service Worker’daki son geçerli kopya kullanılır; yalnızca rehber içeriği değiştiğinde uygulama kodu güncellemesi gerekmez.
- Ceza çerçevesi dar telefonlarda sonuçlara alan bırakacak sıkı düzendedir. Madde arama alanı odaktayken madde sonucu, ceza türü, radar kaynağı, araç men, otopark ve belge iptal seçimleri arama odağını bozmaz; seri madde seçimi sırasında klavye açık kalır.
- Kontrol ve kaza sayısı alanları klavye açıldığında görünür alanın ortasına kaydırılır; son satırlar için klavye yüksekliği kadar ek kaydırma alanı ayrılır.
- Kullanıcı Kontroller, Kazalar veya radar adetlerinde yaptığı son değişiklikten hemen sonra İcraat sekmesine geçerse bekleyen alanlar önce kaydedilir ve icraat metni güncel verilerle yeniden oluşturulur; sayfayı yenilemek gerekmez.
- Madde filtresi açıkken ceza türü, radar kaynağı, ek işlem kutuları ve seçili madde satırı geçici olarak gizlenir; sonuç penceresinin alt kenarı Madde Ara satırının hemen üstünde kalır.
- Eklenmiş ceza kartı tek bir düz cümlede tür, maddeler, toplam tutar, ek işlemler ve adet bilgisini gösterir. Kart iki yönden de en az 68 piksel kaydırıldığında ek onay istemeden silinir ve yalnızca sonuç bildirimi gösterilir; kart üzerindeki silme düğmesi bulunmaz.
- Normal ceza eklenirken ceza türü, madde kümesi, madde tutarları, araç men, otopark, belge iptal, yalnız otopark ve kaynak bilgileri mevcut bir kayıtla aynıysa yeni kart oluşturulmaz; girilen adet mevcut kartın adedine eklenir. Bu alanlardan herhangi biri farklıysa işlem ayrı kart olarak saklanır.
- Kontroller sekmesindeki kartlarda yalnızca kontrol kodu ve adet alanı gösterilir; açıklama metni gösterilmez.
- Radar görevindeki iki ceza sekmesi de `51/2-b-1` ile `51/2-b-9` arasındaki dokuz maddeyi yalnızca madde kodu ve adet alanıyla gösterir. Ekip sekmesindeki adetler `RADAR_TEAM`/`DRIVER`, operatör sekmesindekiler `RADAR_OPERATOR`/`PLATE` olarak mevcut `payload.penalties` listesine otomatik kaydedilir. Boş veya sıfır adet ilgili kaydın kaldırılmasıdır.
- Radar adet ekranı açıldığında hiçbir giriş alanı otomatik odaklanmaz; klavye yalnızca kullanıcının seçtiği alana dokunmasıyla açılır.
- Radar ekip kartının bağlantılı özet paylaşımında yalnız `RADAR_OPERATOR` + `PLATE` kayıtları taşınır. Ekibin yüzüne yazılan `RADAR_TEAM` cezaları, kontrol ve kaza alanları bağlantı özetine katılmaz; radar ekip adedi ve operatörün plaka/hız toplamları korunur.
- Radar İcraat sekmesi birinci projenin radar faaliyet metnini kullanır: K3 ve kontrol edilen araç sayısı radar ceza işlemlerinden hesaplanır; ceza maddeleri ekip/operatör ayrımı olmadan toplam adetle listelenir, ardından sürücüye/plakasına toplamları, toplam tutar, not ve `Arz ederim.` satırı gösterilir. Radar için Kontroller, Kazalar ve Hız/Kemer/Alkol ek özeti gösterilmez.
- İcraat başlığı Merkez EVK'larında `Tekirdağ Bölge Trafik Denetleme Şube Müdürlüğü`, Çorlu ve Malkara EVK'larında `Malkara Bölge Trafik Denetleme İstasyon Amirliği` olarak gösterilir. Not `payload.note` alanında saklanır ve EVK JSON aktarımında korunur. Ekrandaki ayrıntılı icraat metni değişmez. Normal ekiplerde **Metin Olarak Paylaş**, birinci projedeki kısa WhatsApp metnini (işlem bazlı özet ve Hız/Kemer/Alkol satırları olmadan, madde başına toplam adetle); radar ekiplerinde birinci projedeki ayrıntılı radar metnini üretir. WhatsApp kalınlık işaretleri korunur. Web Share cihaz paylaşım ekranını açar; desteklenmiyorsa metni panoya kopyalar.
- Günlük kullanıcı akışında JSON dosyası indirme, içe aktarma ve toplu JSON paylaşma işlemleri kullanılmaz. Ana menü yalnızca **Günlük İcraat PDF**, **Alınan İcraatları Sil** ve **Kullanım Kılavuzu** işlemlerini gösterir.
- **Kullanım Kılavuzu** ekip, gündüz 20, gece 20 ve 5920 arasındaki bağlantı akışını açıklar.

## Dosyasız Özet Aktarımı

- Özet bağlantısı URL fragmentinde taşınır; GitHub Pages sunucusuna veya başka bir bulut deposuna kaydedilmez.
- Paket türleri `E` (tek ekip), `G` (gündüz toplamı) ve `B` (birim toplamı) olarak sürümlü, sabit sıralı ve Base36 kodlanır. Birim, başlangıç/bitiş zamanı, ekip kodu (yalnız `E`) ve sayısal özet değerleri bütünlük kontrol koduyla korunur.
- Sayısal özet; dört ekip türü, K1/K2-A/K2-B/K4/K5/K6, dört kaza değeri, sürücü/plaka ceza adetleri ve hız/kemer/alkol adetlerinden oluşur. PTS ve KGYS, mevcut PDF öncesi ekranda elle girilmeye devam eder.
- Bir ekip paketi ile yüz ekiplik toplam aynı alan yapısını kullanır; toplam bağlantısında kaynak kayıtlar tek tek taşınmaz, alanlar toplanır. Böylece bağlantı boyutu ekip sayısıyla büyümez.
- Aynı bağlantının tekrar açılması özet kimliğiyle engellenir. Düzeltilmiş içerik yeni kayıt olarak gelir; kullanıcı kendisine bildirilen eski kartı elle siler. Revizyon bilgisi taşınmaz.
- Yalnız `E` kayıtları bulunan cihaz **Tüm İcraatleri Paylaş**, bir `G` kaydı ile gece ekip kayıtları bulunan cihaz **Birim Toplamını Paylaş** işlemini görür. Yalnız `B` kayıtları bulunan cihaz PDF işlemine yönlendirilir.
- PDF işlemi kişisel EVK kayıtlarını dikkate almaz ve o anda **Alınan İcraatlar** listesinde bulunan özetlerin tamamını rapor kaynağı olarak kullanır. Normal akışta 5920 listesi Merkez, Çorlu ve Malkara `B` kayıtlarından oluşur.

## Günlük İcraat PDF

- Ana menüdeki **Günlük İcraat PDF** işlemi yalnızca bağlantıyla alınmış özet kayıtlarını rapora alır. Kişisel ekip kaydı hiçbir durumda PDF hesabına eklenmez; PDF oluşturmak EVK veya özet kayıtlarını değiştirmez.
- Rapor aralığı EVK’lerin en erken başlangıcı ile en geç bitişidir. `12/36`, Gündüz ve Gece ekiplerinin toplamıdır; Ara Ekip ve Radar ayrı satırlardır.
- PDF öncesinde her birim kartında, ekrandaki icraatların `payload.accidents` alanlarından toplanan son 24 saatlik Ölümlü Kaza, Ölü, Yaralanmalı Kaza ve Yaralı değerleri salt okunur bilgi olarak gösterilir. Kullanıcı bunları önceki günün PDF'indeki birikimli değerlere ekleyerek yıllık toplam alanlarını doldurur.
- Merkez, Çorlu ve Malkara için Ölümlü Kaza, Ölü, Yaralanmalı Kaza, Yaralı, KGYS ve PTS alanlarının tamamı elle ve zorunlu olarak girilir; alanlarda yanıltıcı `0` ipucu gösterilmez. Veri yoksa kullanıcı açıkça `0` girmelidir; boş alanlarda **Veri yoksa sıfır giriniz.** uyarısı gösterilir. Bu 18 değer cihazdaki IndexedDB `settings` deposunda yalnızca PDF form tercihi olarak saklanır, ekran yeniden açıldığında geri yüklenir ve **Kayıtlı Verileri Temizle** işlemiyle topluca silinebilir. EVK payload’ına ve JSON aktarımına eklenmez. PTS ve KGYS adetleri ilgili birimin Sürücüye, Plakaya, PTS ve KGYS toplamına katılarak PDF yüzdeleri hesaplanır.
- Birim bazlı K1/A, K2/A, K2/B, K4/A, K5 ve K6 gerçekleşenleri EVK kontrollerinden; hedefleri `assets/reference_data.json` içindeki rapor bitiş ayından gelir.
- Ceza adetleri madde çarpanlarıyla hesaplanır. Radar EVK’de mükerrer ekip/yüzüne değerleri dışlanır; yalnızca `RADAR_OPERATOR` + `PLATE` kayıtları toplu rapora eklenir.
- Şablon `assets/daily_report/template.json` ve iki resmi logodan tarayıcı Canvas’ına çizilir; tek sayfalık A4 PDF cihaz içinde oluşturulur. Kullanıcı önizleyebilir, indirebilir veya desteklenen cihazlarda sistem paylaşım ekranıyla gönderebilir.
- PDF'nin kurumsal görsel dili lacivert başlıklar, ölçülü açık yeşil bölüm başlıkları ve mavi-gri `TOPLAM` alanlarından oluşur. Hedef karşılaştırmalarında başarı/eksik durumları yalnızca renkle değil sırasıyla `✓`/`✕`, gerçekleşme çubuğu ve yön oku ile de belirtilir. Böylece renkli ekranda hızlı okunur, siyah-beyaz yazıcı çıktısında anlamını ve tablo hiyerarşisini korur.
- PDF şablonundaki bütün mevcut tablo ve hücre kenarlıkları, kaynak şablondaki renk ve kalınlık farklarından bağımsız olarak ince (`1 px`) siyah çizgiyle oluşturulur. Hedef/gerçekleşme çubuklarının dış çerçevesi de aynı stili kullanır.
- `reference_data.json` Service Worker tarafından ağ öncelikli okunur; ağ yoksa son geçerli çevrimdışı kopya kullanılır. Yeni ay hedefleri eklenirken uygulama kodu değişmez.

## Açık TODO

- BIRIM_BILGI alanları tanımlanınca IndexedDB store ve form eklenecek.
- Uzak aylık hedef kaynağının nihai adresi belirlendiğinde yerel `reference_data.json` için sürümlü güncelleme mekanizması eklenecek.
- Public kaynak deposu: `https://github.com/szr-krk/IcraatMobil`
- GitHub Pages yayını: `https://szr-krk.github.io/IcraatMobil/`
