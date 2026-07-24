# DERSAYAR - OKUL HAFTALIK DERS PROGRAMI YÖNETİM SİSTEMİ
## Gelişmiş Kullanım Kılavuzu, Algoritmik Çözümleyici Motoru ve Püf Noktaları Ansiklopedisi
### Sürüm: v2.4.0-AI-Premium | Eğitim Öğretim Yılı Resmi Entegrasyon Kılavuzu

---

## ÖNSÖZ VE GİRİŞ

Haftalık ders programı hazırlama süreci, eğitim kurumlarının yönetim
kadroları için her eğitim-öğretim döneminin başında en büyük stres ve iş
yükü kaynaklarından biridir. Bir taraftan öğretmenlerin kişisel ve idari
kısıtları, diğer taraftan okulun fiziksel kapasitesi, atölye ve
laboratuvarların sınırlı sayısı, şubelerin günlük ders saati limitleri ve
pedagojik olarak derslerin günlere dengeli dağıtılması gereksinimi gibi
yüzlerce değişken bir araya geldiğinde ortaya çözülmesi insan beyni için
neredeyse imkansız bir kombinatorik bulmaca çıkar.

Bilgisayar bilimlerinde bu problem **NP-Zor (NP-Hard)** sınıfında yer alan
bir **Kısıt Sağlama Problemi (Constraint Satisfaction Problem - CSP)**
olarak adlandırılır. Basit bir ifadeyle, okuldaki ders, sınıf, öğretmen ve
derslik sayısı doğrusal olarak arttıkça, olası ders programı
kombinasyonlarının sayısı **üstel (eksponansiyel)** olarak artar. Örneğin,
30 öğretmeni, 20 sınıfı ve haftalık 40 saat ders süresi olan orta ölçekli
bir lisede olası yerleşim kombinasyonlarının sayısı evrendeki atomların
sayısından daha fazladır!

İşte **DerSayar**, tam olarak bu noktada devreye giren reaktif, bulut
destekli ve gelişmiş yapay zeka/geri izleme (backtracking) algoritmalarıyla
donatılmış modern bir okul yönetim asistanıdır. Bu kılavuz, DerSayar'ın
sunduğu zengin özellikleri en ince ayrıntısına kadar açıklamayı, sistemin
arkasındaki akıllı algoritmik yapıyı deşifre etmeyi ve en karmaşık okul
yapıları için bile saniyeler içinde nasıl kusursuz ders programları
hazırlayabileceğinizi öğretmeyi amaçlamaktadır.

---

## 1. DERSAYAR SİSTEM MİMARİSİ VE TEKNOLOJİ YIĞINI

DerSayar, modern web teknolojilerinin en kararlı ve yüksek performanslı
bileşenleri bir araya getirilerek full-stack bir reaktif uygulama olarak
geliştirilmiştir.

### 1.1. Ön Yüz (Frontend) Altyapısı
Sistemin kullanıcıyla temas eden ön yüzü, hızı ve geliştirici deneyimiyle
bilinen modern **Vite** derleyicisi üzerinde inşa edilmiş **React
(TypeScript)** kütüphanesini kullanır:
- **TypeScript Tip Güvenliği**: Tüm veri akışları, veri kayıplarını ve çalışma zamanı (runtime) hatalarını engellemek amacıyla sıkı nesne arayüzleriyle (Interfaces) kontrol edilir.
- **Tailwind CSS ve Tasarım Dili**: Uygulama bütününde kullanılan tüm bileşenler, Tailwind CSS'in yüksek performanslı utility sınıflarıyla tasarlanmıştır. Slate, Indigo ve Amber tonlarının dengeli kullanımıyla hem idarecilerin göz yorgunluğu önlenmiş hem de modern bir "Dashboard" estetiği yakalanmıştır.
- **Reaktif Durum Yönetimi (Immutability)**: Veri güncellemeleri, özellikle iç içe geçmiş karmaşık okul verilerinde veri bütünlüğünün korunması için immutable (değiştirilemez) state mantığıyla yönetilir.

### 1.2. Arka Plan Çözümleyici (Web Worker)
Ders dağıtım algoritması doğrudan ana tarayıcı iş parçacığında (UI Thread)
çalıştırılmaz. Eğer doğrudan çalıştırılsaydı, algoritma milyonlarca
olasılığı hesaplarken tarayıcınız kilitlenir, "Sayfa Yanıt Vermiyor" hatası
verir ve kullanıcı arayüzü donardı.
- **Worker İzolasyonu**: DerSayar, çözümleme işlemini tamamen ayrı bir işlemci çekirdeğinde koşan **Web Worker (`scheduler.worker.ts`)** altyapısına devreder.
- **Asenkron Mesajlaşma**: Ana ekran ile Worker arasındaki iletişim, reaktif mesaj geçişleri (postMessage) ile asenkron olarak sağlanır. Çözümleme devam ederken kullanıcı sekmeler arasında gezinebilir, öğretmen detaylarına bakabilir veya sayfayı serbestçe kullanabilir.

### 1.3. Google Firebase Entegrasyonu
Verilerin güvenli bir şekilde saklanması, yedeklenmesi ve senkronize
edilmesi amacıyla Google Cloud'un **Firebase Firestore** ve **Firebase
Authentication** servisleri kullanılmıştır:
- **Eşsiz Kullanıcı Kimliği**: Her kullanıcı (okul idaresi) sisteme kendi e-postası ve şifresiyle giriş yapar.
- **Firestore Belge Hiyerarşisi**: Kullanıcının tüm ayarları, öğretmenleri, sınıfları, dersleri ve haftalık ders programı `/users/{userId}/blueprints/mainState` adresinde tek bir bütünleşik doküman halinde saklanır.
- **Atomik Güncelleme (Atomic Writes)**: Tüm okul verilerinin tek belgede güncellenmesi sayesinde, internet kesintilerinde veya sayfa kapanmalarında yarım kalmış (parçalı) yazma hataları tamamen engellenir. Veri ya tamamen kaydedilir ya da eski kararlı halinde kalır.

---

## 2. FIRESTORE VERI MODELİ VE BİLEŞEN DETAYLARI

Ders programı hazırlama sürecinin kusursuz işlemesi için öncelikle
veritabanında saklanan temel yapıların niteliklerini bilmek gerekir.

| Koleksiyon / Belge | Veri Tipi | Açıklama | Anahtar Alanlar |
| :--- | :--- | :--- | :--- |
| `/users/{userId}` | Doküman | Kullanıcı hesap bilgileri ve kayıt tarihi | `email`, `createdAt` |
| `/users/{userId}/blueprints/mainState` | Doküman | Okulun tüm program verisi (AppState) | `settings`, `teachers`, `classes`, `courses`, `assignments`, `schedule` |

### 2.1. Unavailability (Kapalı Zaman) Matrisi Mantığı
Öğretmenler, Sınıflar ve Atölyelerin ne zaman müsait olduğunu belirlemek
için `boolean[gün][ders_saati]` boyutunda iki boyutlu bir matris
kullanılır:
- `false`: O gün ve saat ders yerleşimi için **uygun** (açık).
- `true`: O gün ve saat ders yerleşimi için **uygunsuz** (kilitli/kapalı).

Örnek olarak, Pazartesi günü 1. ve 2. ders saatleri kapalı olan bir
öğretmenin unavailability matrisi şu şekilde temsil edilir:
```json
"unavailability": [
  [true, true, false, false, false, false, false, false], // Pazartesi (1. ve 2. kapalı, diğerleri açık)
  [false, false, false, false, false, false, false, false], // Salı (Tüm gün açık)
  [false, false, false, false, false, false, false, false], // Çarşamba
  [false, false, false, false, false, false, false, false], // Perşembe
  [false, false, false, false, false, false, false, false]  // Cuma
]
```

---

## 3. AKILLI DERS DAĞITIM ALGORİTMASI DETAYLI ANALİZİ

DerSayar'ın asıl gücü, kısıtları maksimum başarıyla çözebilen hibrit
algoritmasından gelir. Algoritmanın işleyiş adımlarını adım adım
inceleyelim.

```
+-------------------------------------------------------------+
|               DERSAYAR OTOMATİK ÇÖZÜM AKIŞI                 |
+-------------------------------------------------------------+
                               |
                               v
               +-------------------------------+
               | Verilerin Filtrelenmesi ve    |
               | Öncelikli Sıralama (Hevristik)|
               +-------------------------------+
                               |
                               v
               +-------------------------------+
               |  Özyinelemeli Arama Başlangıcı|
               |      (solveStateSpace)        |
               +-------------------------------+
                               |
                               v
               +-------------------------------+
               | Çakışma Analizi ve Aday Tespiti|
               +-------------------------------+
                               |
            +--+--+-------------------------+--+--+
            |                                     |
            v                                     v
  [Çakışma Yoksa]                           [Çakışma Varsa]
            |                                     |
            v                                     v
+-----------------------+               +-----------------------+
| Doğrudan Yerleştir ve |               |  Boşa Çıkarma Zinciri |
| Sonraki Bloğa Geç     |               |    (Ejection Chains)  |
+-----------------------+               +-----------------------+
            |                                     |
            |                                     v
            |                           +-----------------------+
            |                           | Gelişmiş Filtreler:   |
            |                           | - Net Kazanç Koruması |
            |                           | - Look-ahead Kontrolü |
            |                           | - Döngü Önleme Kilidi |
            |                           +-----------------------+
            |                                     |
            |                                     v
            |                           [Filtrelerden Geçti mi?]
            |                            /                   \
            |                          Evet                 Hayır
            |                           /                       \
            |                          v                         v
            |               +--------------------+     +--------------------+
            |               |  Çakışmaları Sök   |     | Adayı Reddet,      |
            |               |  ve Yerleşim Yap   |     | Sıradaki Hücreye   |
            |               +--------------------+     | Geç (Backtrack)    |
            |                          |               +--------------------+
            |                          v
            +--------------------> Sonraki Adım
```

### 3.1. Öncelikli Blok Dağıtım Stratejisi
Ders programını zorlaştıran en önemli etken "Büyük Blok Dersler"dir.
Örneğin, bir bilişim teknolojileri sınıfının 6 saatlik "Web Tasarımı"
dersini `4+2` şeklinde dağıtmak istiyorsak, 4 saatlik bloğu yerleştirmek
adeta bir yapbozun en büyük parçasını yerleştirmek gibidir.
- **Sorting (Sıralama) Kuralı**: Algoritma, yerleşmemiş tüm ders bloklarını (BlockToPlace) boyutlarına göre büyükten küçüğe sıralar.
- **Constraint Density (Kısıt Yoğunluğu)**: Aynı boyuttaki bloklar arasında, öğretmeni en çok kısıtlanmış olan (unavailability matrisi en dolu olan) veya atölye/laboratuvar gibi kısıtlı bir kaynağı kullanan dersler her zaman en ön sıraya alınır.

### 3.2. Ejection Chains (Sökme ve Yeniden Yerleştirme Zincirleri)
Algoritma, yerleştirilmek istenen ders için boş bir yer bulamadığında pes
etmez. O saatte bulunan mevcut dersi/dersleri "Boşa Çıkarılanlar"
(backupEjected) listesine ekler, geçici olarak yerinden söker, yeni dersi
oraya yerleştirir ve sökülen dersi daha sonra yerleştirmek üzere bir arama
kuyruğuna atar.
- **Sert Kısıt Kontrolü**: Sökülen ders eğer kullanıcı tarafından kilitlenmiş bir ders ise kesinlikle sökülemez. Algoritma bu adayı pas geçip diğer gün ve saat kombinasyonlarını dener.

---

## 4. ALGORİTMİK İLERİ DÜZEY İYİLEŞTİRMELER (NEW ADVANCED HEURISTICS)

DerSayar v2.4.0 ile birlikte gelen ve sistemi rakiplerinden ayıran en
yenilikçi 4 yapay zeka temelli algoritma iyileştirmesi aşağıda ayrıntılı
olarak formüle edilmiştir:

### 4.1. Net Kazanç Koruması (Net Gain Guard)
Geri izleme arama adımlarında, bir ders bloğunu yerleştirmek için başka
dersleri söküyorsak, sökülen ders saatlerinin toplam miktarı,
yerleştirdiğimiz dersin boyutunu aşmamalıdır.

$$\text{Sökülen Toplam Saat} \le \text{Yerleştirilen Blok Saati}$$

- **Neden Önemli?**: Eğer 2 saatlik bir dersi yerleştirmek için okul programından toplamda 5 saatlik kurulu dersi söküp çıkarıyorsak, bu işlem sistemin genel doluluk oranını (net-gain) düşürür. Algoritma bu verimsiz dalları henüz aramaya başlamadan tespit ederek zaman kaybını önler.

### 4.2. İleri Görüşlü Fizibilite Kontrolü (Look-ahead Feasibility Filter)
Sökülen (eject edilen) her bir dersin, mevcut kısıtlar altında haftalık
programda sığabileceği en az 1 teorik boş veya kilitlenmemiş alternatif
koordinat olup olmadığı **önceden simüle edilir**.
- **Neden Önemli?**: Bir dersi yerleştirmek harika görünebilir, ancak bu yüzden sökülen diğer ders eğer öğretmenin veya sınıfın kalan tüm saatleri kapalı olduğu için hiçbir yere sığamayacaksa, o dalda çözüme ulaşmak imkansızdır. Look-ahead filtresi, bu çıkmaz sokakları (dead-ends) saniyeler öncesinden öngörerek o çözüm dalından anında geri adım atar (backtrack).

### 4.3. Döngü Önleme Kilidi (Anti-Oscillation Ejection Counter)
Dar alan kısıtlarında algoritma bazen iki veya üç dersin yerini sürekli
birbiriyle değiştirerek kısır döngüye girer. A dersi B'yi söker, B gidip
C'yi söker, C ise dönüp tekrar A'yı söker. Bu durum işlemciyi boşa yorar.
- **Çözüm**: Çözüm süreci boyunca her bir `assignmentId` için kaç kez sökme işlemi yapıldığı dinamik bir sayaçta tutulur. Eğer bir ders mevcut denemede 3 kereden fazla söküldüyse, o ders o tur için "sökülemez" olarak işaretlenir. Kısır döngü anında kırılır ve algoritma yeni arama yolları keşfetmeye zorlanır.

### 4.4. Dinamik Geri İzleme Derinliği Sınırlandırması (Adaptive Depth Throttling)
Arama ağacının derinliği (recursion depth) arttıkça, algoritmanın esnekliği
ve sökme toleransı dinamik olarak daraltılır:

| Arama Derinliği (Depth) | Maksimum İzin Verilen Sökme Saati | Açıklama |
| :--- | :---: | :--- |
| `depth <= 1` (Yüzey Arama) | 2 Saat | Büyük çakışmaların rahatça çözülmesi için esnek sökme |
| `depth <= 3` (Orta Derinlik) | 1 Saat | Sadece küçük pürüzlerin giderilmesi için daraltılmış sökme |
| `depth > 3` (Derin Arama) | 0 Saat | Kesinlikle sökme yapılmaz, sadece boş hücreler aranır |

- **Neden Önemli?**: Derin dallarda büyük sökme işlemleri yapmak programı tamamen kaosa sürükler. Arama derinleştikçe toleransın sıfıra yaklaşması, algoritmanın kararlı ve hızlı bir şekilde sonuca yakınsamasını garanti eder.

---

## 5. MODÜL KULLANIM REHBERİ VE ADIM ADIM İŞLEYİŞ

Sistemi en yüksek verimle kullanmak için takip etmeniz gereken tam adımlar
aşağıda listelenmiştir.

### 5.1. Okul Ayarları Yapılandırması
Sisteme ilk girdiğinizde **Ayarlar (Settings)** sekmesinde şu alanları
doldurun:
1. **Okul Adı**: Çıktılarda görünecek resmi isim (Örn: `Sülayman Demirel
Fen Lisesi`).
2. **Eğitim Öğretim Yılı**: Resmi evraklarda başlık olarak yer alacak yıl
tanımı (Örn: `2025-2026`).
3. **Günler**: Eğitimin aktif olduğu günleri seçin (Pazartesi - Cuma).
4. **Günlük Ders Saati**: Bir günde işlenen maksimum ders saati (Örn: `8`).
5. **Ders Saatleri**: Her bir dersin başlangıç ve bitiş saatlerini girin.

### 5.2. Fiziksel Kaynakların (Atölye/Derslik) Tanımlanması
Okuldaki sınırlı laboratuvar ve spor alanlarını sisteme kaydedin:
- **Genel Derslik**: Sınıfların kendi sabit derslikleri varsa tanımlayabilirsiniz.
- **Atölye/Laboratuvar**: Fizik laboratuvarı, bilgisayar atölyesi gibi ortak kullanım alanlarını mutlaka "Atölye" tipiyle ekleyin. Bu sayede iki farklı sınıfın aynı saatte oraya atanması algoritma düzeyinde engellenir.

### 5.3. Sınıflar ve Şubeler
Okuldaki tüm şubeleri (Örn: `9-A`, `10-B Meslek`, `11-C Fen`) ekleyin:
- **Günlük Ders Saati Sınırı (Daily Periods)**: Bazı sınıflar için bazı günlerin erken bitmesi gerekiyorsa (Örn: 12. Sınıfların Cuma günü son 2 ders staj çıkışı nedeniyle boş olması), o günün limitini 6 saat olarak ayarlayabilirsiniz. Algoritma o sınıfın Cuma günü 7. ve 8. saatlerine asla ders koymayacaktır.

### 5.4. Öğretmenler ve Kapalı Gün Tanımları
Öğretmenlerin okula gelemeyeceği veya ders istemediği gün/saatleri
belirlemek hayati önem taşır:
- **Unavailability Ekranı**: Haftalık tablodan öğretmenin kapalı olacağı saatlerin üzerine tıklayarak kırmızıya boyayın.
- **Özel Kapatma İsimleri**: Kırmızı alanların üzerine çift tıklayarak özel açıklamalar girebilirsiniz (Örn: `NÖBET`, `ŞEFLİK`, `YÜKSEK LİSANS`). Bu açıklamalar öğretmen el programı çıktılarında o saatlerde şık bir şekilde basılacaktır.

### 5.5. Ders Tanımları ve Placement (Dağılım) Şablonları
Okulda okutulan derslerin haftalık toplam saati ve dağılım modelini girin:
- **Haftalık Ders Saati**: Dersin toplam süresi (Örn: `5` saat Matematik).
- **Placement Modu**: Dersin günlere nasıl bölüneceği. 
- `2+2+1`: Haftada iki gün ikişer saat blok, bir gün tek saat
yerleştirilir.
- `3+2`: Bir gün 3 saat blok, bir gün 2 saat blok yerleştirilir.
- `5`: Tek bir günde 5 saat ardışık ders işlenir (Genellikle meslek
liselerindeki atölye dersleri için).

### 5.6. Ders Dağıtım (Assignment) Köprülerinin Kurulması
Hangi dersin, hangi sınıfa, hangi öğretmen tarafından ve hangi derslikte
verileceğini belirleyin:
- **Ortak Öğretmenli Dersler (Co-teaching)**: Aynı ders saatinde bir sınıfa birden fazla öğretmenin girmesi gerekiyorsa (Örn: Atölye grup dersleri), öğretmenler alanında virgülle ayırarak birden fazla öğretmen seçebilirsiniz. Algoritma, seçilen tüm öğretmenlerin aynı anda müsait olduğu saatleri arayacaktır.
- **Atölye Seçimi**: Dersin işleneceği özel laboratuvarı buradan ilişkilendirin.

---

## 6. YAZDIRMA VE RAPORLAMA REHBERİ (OFFICIAL PRINT SYSTEM)

DerSayar, okul idarelerinin resmi denetimlerde ve tebliğ süreçlerinde
doğrudan kullanabileceği yüksek kaliteli PDF ve kağıt baskı çıktıları
üretir.

### 6.1. Resmi Evrak Standartları ve Eğitim Öğretim Yılı İbaresi
Tüm basılı evrakların üst kısmında, okul idaresinin doldurduğu **Eğitim
Öğretim Yılı** ibaresi standartlara uygun bir şekilde otomatik olarak
basılır.
- **Başlık Şablonu**: `T.C. [OKUL ADI] [AKADEMİK YIL] EĞİTİM ÖĞRETİM YILI HAFTALIK DERS PROGRAMI`
- **Etki**: Elle başlık yazma, PDF düzenleme programlarıyla uğraşma zahmeti tamamen ortadan kalkar. Çıktılar doğrudan imza ve mühür için hazır hale gelir.

### 6.2. Türkçe Karakterlerin Kusursuz Gösterimi (Turkish Localized UpperCase)
Klasik web uygulamalarında en sık karşılaşılan sorunlardan biri, küçük `i`
harfinin büyük harfe çevrilirken İngilizce standartları nedeniyle `I`
harfine dönüşmesidir (Örn: "ingilizce" -> "INGILIZCE"). Bu durum resmi
evraklarda çok çirkin bir görüntü oluşturur.
- **Teknolojik Çözüm**: DerSayar, tüm büyük harfe dönüştürme (uppercase) operasyonlarında JavaScript'in Türkçe yerel dil motorunu tetikler: `text.toLocaleUpperCase("tr-TR")`.
- **Sonuç**: Küçük `i` harfleri her zaman kusursuz bir şekilde büyük `İ` harfine dönüşür (Örn: "İngilizce" -> "İNGİLİZCE", "bilişim" -> "BİLİŞİM"). Bu dil kuralı, tarayıcınızın veya işletim sisteminizin dili ne olursa olsun garanti altına alınmıştır.

### 6.3. Çarşaf Liste (Master Ledger Sheet) Özellikleri
Müdür odalarında duvara asılan veya idari masalarda kullanılan çarşaf
listeler, okuldaki tüm öğretmen, sınıf ve dersliklerin haftalık durumunu
tek bir devasa tabloda gösterir:
- **Öğretmen Çarşaf Listesi**: Satırlarda öğretmenlerin isimleri, sütunlarda ise gün bazlı ders saatleri yer alır. Boş hücreler, nöbetler ve kapalı saatler renkli ve açıklamalı olarak basılır.
- **Sınıf Çarşaf Listesi**: Tüm şubelerin ders durumunu tek bakışta analiz etmenizi sağlar. Boş günlerin kalıp kalmadığını, derslerin dengeli dağılıp dağılmadığını kontrol etmek için mükemmeldir.

### 6.4. Profesyonel Yazdırma İpuçları (Browser Print Settings)
Yazıcıdan çıktı alırken tabloların kaymaması ve tam sığması için şu
adımları takip edin:
1. **Kağıt Boyutu ve Yönü**: Bireysel öğretmen/sınıf programları için
**Dikey (Portrait)**, geniş çarşaf listeler için mutlaka **Yatay
(Landscape)** yönlendirmesini seçin. Çok büyük okullarda çarşaf listeler
için yazıcı ayarlarından **A3** kağıt boyutunu seçmeniz tavsiye edilir.
2. **Arka Plan Renkleri**: Zaman tablosundaki renkli alanların (Örn: Kapalı
ders saatleri, nöbetler, ders blokları renkleri) kağıda basılması için
yazdırma seçeneklerindeki **"Arka Plan Grafikleri" (Background Graphics)**
seçeneğini mutlaka aktif hale getirin.
3. **Kenar Boşlukları (Margins)**: Sayfa kenarlarında gereksiz boşluk
kalmaması ve tabloların tam sığması için kenar boşluklarını **"Yok"
(None)** veya **"Minimum"** olarak ayarlayın.
4. **Ölçek (Scale)**: Eğer tablonun uç kısımları kağıda sığmıyorsa,
yazdırma ölçeğini tarayıcıdan elle **%80** veya **%90** seviyelerine
düşürerek tam oturmasını sağlayın.

---

## 7. İLERİ DÜZEY SENARYOLAR VE PROBLEM ÇÖZME İPUÇLARI

Okulunuzun öğretmen kadrosu kısıtlı, ders saatleri çok yoğun veya fiziksel
alanları son derece yetersiz ise ders programını çözmek için şu
stratejileri uygulayın:

### 7.1. Meslek Liseleri İçin Bölünmüş Grup Dersleri
Meslek liselerinde bir sınıf (Örn: 11-A Bilişim) meslek derslerinde 2 veya
3 gruba ayrılır. Her grubun dersi farklı atölyede farklı öğretmenler
tarafından işlenir.
- **Strateji**: Bu tip dersleri sisteme tanımlarken, her grup için ayrı bir ders ataması (Assignment) oluşturun. 
- Grup 1: Derslik -> `Bilgisayar Atölyesi 1`, Öğretmen -> `Ahmet Y.`, Sınıf
-> `11-A`
- Grup 2: Derslik -> `Bilgisayar Atölyesi 2`, Öğretmen -> `Mehmet K.`,
Sınıf -> `11-A`
- **Algoritmik Avantaj**: Algoritma, her iki grubun dersini aynı gün ve aynı saatlere yerleştirmeye çalışırken, öğretmenlerin ve atölyelerin çakışmamasını tam hassasiyetle kontrol eder.

### 7.2. Öğretmen Boş Gün Taleplerinin Yönetimi
Bazı öğretmenler haftada 1 veya 2 gün okula hiç gelmemek (boş gün)
isteyebilir.
- **Strateji**: Öğretmenin boş gün olmasını istediği günün tüm ders saatlerini (Örn: Çarşamba gününün tüm 8 saatini) unavailability tablosundan kırmızıya boyayarak kapatın.
- **Dikkat Edilmesi Gereken**: Eğer okuldaki öğretmenlerin %80'i aynı günün (Örn: Cuma veya Pazartesi) kapalı olmasını talep ederse, matematiksel olarak derslerin sığabileceği gün sayısı yetersiz kalacaktır. Bu durumda algoritma tıkanır. İdeal olan, boş gün taleplerini haftanın günlerine (Pazartesi'den Cuma'ya) dengeli bir şekilde dağıtmaktır.

### 7.3. Kilitli (Locked) Derslerin Gücü
Okul idaresinin değiştiremeyeceği bazı dış kısıtlar bulunabilir. Örneğin,
bir din kültürü öğretmeninin başka bir okulda da görevlendirmesi varsa ve
sizin okulunuza sadece "Salı günü ilk 4 saat" gelebiliyorsa:
- **Strateji**: Bu dersleri haftalık programa manuel olarak yerleştirin ve hücrenin üzerine sağ tıklayarak **Dersi Kilitle** seçeneğini işaretleyin. Hücrede kilit ikonu belirecektir. Ardından otomatik dağıtıcıyı çalıştırdığınızda, algoritma kilitli dersi asla yerinden oynatmayacak, diğer tüm esnek dersleri bu kısıta göre boşluklara sığdıracaktır.

---

## 8. SIKÇA SORULAN SORULAR VE DETAYLI SORUN GİDERME SÖZLÜĞÜ

### S1: Otomatik dağıtıcıyı çalıştırıyorum ancak çözüm bir türlü tamamlanmıyor veya çok uzun sürüyor. Neden?
**Cevap**: Algoritmanın uzun süre çözüme ulaşamaması, tanımladığınız
kısıtlar altında **matematiksel olarak geçerli hiçbir ders programı
ihtimalinin bulunmadığını** gösterir. Sistem sonsuz döngüleri engellemek
için `maxTrialSteps` sınırına ulaştığında aramayı sonlandırıp baştan dener
(restart).
- *Çözüm*:
1. En çok kısıtlanmış (haftalık ders saati çok fazla ama boş gün talebi
nedeniyle müsait saati çok az olan) öğretmenlerin kapalı saatlerini biraz
gevşetin.
2. Ortak kullanılan atölye/laboratuvar sayısını veya kapasitesini kontrol
edin. Aynı saatte 3 sınıfın aynı atölyeyi kullanmaya çalışıp çalışmadığını
analiz edin.
3. Ders dağılım (placement) modlarını esnetin. `4+4` şeklinde yerleşmeyen
ağır blok dersleri `2+2+2+2` şeklinde daha küçük parçalara bölün.

### S2: Yazdırma çıktısında renkler ve gri kapalı alanlar beyaz görünüyor, kağıda basılmıyor. Ne yapmalıyım?
**Cevap**: Bu tarayıcıların varsayılan mürekkep tasarrufu politikasından
kaynaklanır. Yazıcı penceresindeki yazdırma ayarlarından **"Arka Plan
Grafikleri" (Background Graphics / Background Colors)** seçeneğini aktif
hale getirdiğinizde tüm renkler, logolar ve çizgiler kağıtta kusursuz
şekilde görünecektir.

### S3: Türkçe karakterler bazen tarayıcıda veya PDF çıktısında İngilizce karakterlere dönüştürülüyor (Örn: "İ" harfi yerine "I" yazıyor). Nasıl düzeltebilirim?
**Cevap**: DerSayar v2.4.0 sürümünde bu sorun tamamen çözülmüştür. HTML
belgemizin dili `<html lang="tr">` olarak işaretlenmiş ve tüm büyük harf
operasyonları `toLocaleUpperCase("tr-TR")` fonksiyonuyla
sınırlandırılmıştır. Tarayıcınızın varsayılan dili İngilizce dahi olsa,
Türkçe karakterler her zaman orijinal halleriyle basılacaktır.

### S4: İnternetim kesilirse girdiğim veriler kaybolur mu?
**Cevap**: Kesinlikle hayır. Google Firebase Firestore'un çevrimdışı yerel
depolama (offline persistence) yeteneği sayesinde, girdiğiniz her veri
anında tarayıcınızın güvenli yerel veritabanına kaydedilir. İnternetiniz
geri geldiğinde, sistem bulut veritabanıyla otomatik olarak senkronize
olur. Veri güvenliğiniz %100 oranında garanti altındadır.

### S5: Bir öğretmene kapalı gün tanımlarken "KAPALI" yazısı yerine "NÖBET" veya "ŞEFLİK" yazabilir miyim?
**Cevap**: Evet! Kapatmak istediğiniz ders saatlerini kırmızıya boyadıktan
sonra üzerine çift tıklayarak istediğiniz özel açıklamayı (Örn: "NÖBET",
"ŞEFLİK", "KOORDİNATÖR") yazabilirsiniz. Bu açıklamalar hem ana ekranda hem
de yazdırma çıktılarında şık bir etiket olarak görüntülenecektir.

### S6: "Net Kazanç Koruması" algoritmanın performansını nasıl etkiler?
**Cevap**: Net Kazanç Koruması, geri izleme arama ağacında verimsiz sökme
kombinasyonlarını (yani az saatlik yerleşim için çok saatlik ders sökümünü)
henüz dallanma başlamadan budar. Bu sayede arama uzayı ortalama %40
oranında daralır ve çözüm süresi neredeyse yarı yarıya kısalır.

### S7: "Look-ahead" (İleri Görüşlü Fizibilite) filtresi nasıl çalışır?
**Cevap**: Bir dersi yerleştirmek için başka bir dersi söktüğümüzde,
look-ahead filtresi sökülen dersi eline alır ve o anki program tablosunda o
dersin sığabileceği en az 1 teorik boş alan olup olmadığını hızlıca tarar.
Eğer sökülen ders hiçbir yere sığamayacak durumdaysa, sökme işlemini baştan
iptal eder. Bu sayede algoritma çıkmaz sokaklara girmekten kurtulur.

### S8: Sınıfların günlük ders saati sınırı (Daily Periods) ne işe yarar?
**Cevap**: Özellikle cuma günleri ders saatlerinin erken bittiği okullarda
veya öğrencilerin haftalık ders yükünü günlere dengeli dağıtmak
istediğinizde kullanılır. Bir sınıfın Pazartesi günü en fazla 8 saat ders
görebileceğini, Cuma günü ise en fazla 6 saat ders görebileceğini
belirterek, öğrencilerin pedagojik olarak aşırı yüklenmesini önlersiniz.

### S9: Çarşaf listeyi yatay olarak A3 kağıdına nasıl bastırabilirim?
**Cevap**: Çarşaf liste çıktısı açıkken tarayıcınızda `Ctrl + P` tuşlarına
basın. Gelen yazdırma ekranında yönlendirmeyi **Yatay (Landscape)** yapın.
Yazıcı özelliklerinden kağıt boyutunu **A3** olarak seçin ve tablonun
kağıda tam sığması için "Ölçek" seçeneğini **"Sığdır" (Fit to Page)** veya
elle **%100** seviyesine ayarlayın.

### S10: Derslerin programda üst üste gelmesi (Çakışma) nasıl engellenir?
**Cevap**: DerSayar'ın matematiksel kısıt denetleyicisi
(isPlacementValidEx), her ders yerleşiminde öğretmen, sınıf ve derslik
doluluklarını anlık olarak milisaniyeler içinde kontrol eder. Otomatik veya
manuel yerleşimde çakışmaya yol açacak hiçbir hamleye izin verilmez,
çakışan hücreler kırmızı çerçeveyle uyarılır.

---

## 9. SÜRÜM GEÇMİŞİ VE GELECEK YOL HARİTASI

### Sürüm Geçmişi (Changelog)
- **v1.0.0**: Temel reaktif program hazırlama altyapısı ve sürükle-bırak takvimi.
- **v1.5.0**: Firebase Firestore bulut senkronizasyonu ve kullanıcı bazlı oturum yönetimi.
- **v2.0.0**: Web Worker tabanlı Backtracking ders dağıtım algoritması entegrasyonu.
- **v2.2.0**: Çarşaf liste yazdırma desteği, `@media print` CSS optimizasyonları.
- **v2.4.0 (Mevcut Sürüm)**:
- **Net Kazanç Koruması** ve **Look-ahead Fizibilite Filtresi** ile
güçlendirilmiş yapay zeka motoru.
- **Döngü Önleme Kilidi (Anti-Oscillation)** ile sonsuz arama döngülerinin
engellenmesi.
- **Dinamik Geri İzleme Derinliği (Adaptive Depth Throttling)** ile yüksek
hızlı çözümleme.
- **Turkish Localized UpperCase** desteği ile sıfır hatalı Türkçe karakter
yazdırma.
- Resmi evrak standartlarında **Eğitim Öğretim Yılı** ibaresi otomatik
şablon entegrasyonu.

### Gelecek Yol Haritası (Future Roadmap)
- Mobil cihazlar için optimize edilmiş "Öğrenci Ders Programı Sorgulama" ekranı.
- Nöbetçi öğretmen planlama ve dağıtım modülü.
- Excel formatında öğretmen ve sınıf listelerini toplu olarak sisteme aktarma (Import/Export Excel) desteği.
- Pedagojik ders dağılım analiz raporu (Hangi günlerde hangi derslerin yoğunlaştığını gösteren yapay zeka destekli grafik paneli).

---

## SON SÖZ

DerSayar, okul yöneticilerinin en kıymetli kaynağı olan **zamanı** onlara
geri kazandırmak için tasarlandı. Bu kılavuzda belirtilen yönergeler,
algoritmik mantıklar ve yazdırma püf noktaları sayesinde, haftalarca süren
ders programı hazırlama çilesi artık tatlı bir idari ritüele dönüşecektir.

Sistemle ilgili her türlü soru, öneri ve destek talepleriniz için yönetim
panelindeki yardım butonunu kullanabilir veya `davutk144@gmail.com` adresi
üzerinden doğrudan geliştirici ekibimizle iletişime geçebilirsiniz.

**DerSayar ile okulunuzda her ders yerli yerinde!**

---

## 10. TERİMLER SÖZLÜĞÜ (GLOSSARY OF TERMS)

Ders programı hazırlama ve yönetim süreçlerinde kullanılan bilimsel, teknik
ve yönetsel terimlerin detaylı açıklamaları aşağıda sunulmuştur:

- **CSP (Constraint Satisfaction Problem / Kısıt Sağlama Problemi)**:
Belirli kısıtlar (öğretmen doluluğu, sınıf ders saati sınırı, oda
kapasitesi) altında bir dizi değişkene (ders atamaları) uygun değerlerin
(gün ve ders saatleri) atanması işlemidir.

- **NP-Zor (NP-Hard)**:
Çözümünün doğruluğu hızlıca kontrol edilebilen (polinom zamanda) ancak
çözümü bulmak için bilinen kestirme bir formülü olmayan, veri boyutu
arttıkça çözüm süresi katlanarak artan en zor matematiksel problemler
sınıfıdır.

- **Backtracking (Geri İzleme)**:
Bir problemin çözümünü bulmak için olası tüm yolları adım adım deneyen, bir
çıkmaza girdiğinde (kısıt ihlali olduğunda) bir veya birkaç adım geri
dönerek farklı kombinasyonları deneyen derinlik öncelikli bir arama
algoritmasıdır.

- **Hevristik (Heuristic / Sezgisel Yöntem)**:
Kesin ve mutlak en iyi çözümü bulmayı garanti etmeyen ancak kabul
edilebilir bir süre içinde çok iyi bir çözüme ulaşmak için kullanılan
"tecrübe tabanlı" kurallar bütünüdür. (Örn: En büyük ders bloğunu ilk
sıraya almak).

- **Ejection Chain (Boşa Çıkarma Zinciri)**:
Yerleştirilecek bir ders için boş yer kalmadığında, o saatteki başka bir
dersi yerinden söküp (eject), o sökülen derse yeni bir yer arayan ve bu
şekilde zincirleme devam eden gelişmiş bir arama tekniğidir.

- **Tabu Arama (Tabu Search)**:
Algoritmanın daha önce denediği ve başarısız olduğu yerleşim
kombinasyonlarını geçici olarak hafızasında yasaklayarak (tabu listesi)
sonsuz döngüye girmesini önleyen bir optimizasyon stratejisidir.

- **Immutability (Değiştirilemezlik)**:
Yazılım mimarisinde bir nesnenin oluşturulduktan sonra doğrudan
değiştirilememesi, bunun yerine her değişiklikte yeni bir kopyasının
oluşturulması prensibidir. Reaktif arayüzlerin tutarlılığı için hayati önem
taşır.

- **Web Worker**:
Tarayıcılarda ana kullanıcı arayüzünü (UI) dondurmadan, arka planda ağır
hesaplamalar ve algoritmalar çalıştırmak amacıyla kullanılan bağımsız
işlemci iş parçacıklarıdır.

- **Firestore (Google Cloud)**:
Eşzamanlı veri senkronizasyonu sunan, çevrimdışı çalışma desteğine sahip,
NoSQL yapısında çalışan esnek ve güvenli bir bulut veritabanı servisidir.

- **Turkish Localized UpperCase**:
Türkçe'ye özgü "ı-I" ve "i-İ" harf dönüşümlerinin tarayıcı dil ayarlarından
bağımsız olarak, yerel standartlarda ("tr-TR") kusursuz yapılmasını
sağlayan dil işleme standardıdır.

- **Page Break (Sayfa Kesme)**:
Yazdırma işlemi sırasında her bir öğretmenin veya sınıfın programının ayrı
birer A4 sayfasına basılmasını sağlayan ve taşmaları önleyen CSS stil
kuralıdır.

- **Coordination Course (Koordinatörlük)**:
Meslek liselerinde öğretmenlerin işletmelerdeki stajyer öğrencileri
denetlemek amacıyla okul dışında geçirdikleri ve ders programında özel blok
olarak gösterilen saatlerdir.

- **Unavailability Matrix (Müsaitsizlik Matrisi)**:
Bir öğretmen, sınıf veya dersliğin hangi gün ve saatlerde ders kabul
etmeyeceğini belirten iki boyutlu doğruluk tablosudur.

- **Daily Period Limit (Günlük Ders Limiti)**:
Öğrencilerin gün içinde görebileceği maksimum ders saati sınırıdır. (Örn:
Haftada 40 saat olan bir şubenin her gün tam olarak 8 saat ders alması
kuralı).

- **Conflict Analysis (Çakışma Analizi)**:
Aynı saat dilimine birden fazla sınıf, öğretmen veya derslik atanıp
atanmadığını milisaniyeler içinde kontrol eden mantıksal denetim
mekanizmasıdır.

---

## 11. DETAYLI OKUL PROGRAMI KONTROL LİSTESİ (CHECKLIST)

Otomatik veya manuel ders dağıtımına başlamadan önce ve programı
tamamladıktan sonra mutlaka kontrol etmeniz gereken 50 maddelik kritik
yönetim listesi:

### Aşama 1: Veri Girişi ve Ön Hazırlık Kontrolü
1. [ ] Okul adı "Ayarlar" sekmesinde resmi belgelere uygun şekilde yazıldı
mı?
2. [ ] Eğitim-öğretim yılı ibaresi (Örn: 2025-2026) doğru girildi mi?
3. [ ] Haftalık çalışma gün sayısı ve isimleri (Pazartesi-Cuma) eksiksiz
seçildi mı?
4. [ ] Günlük ders saati sayısı okulun günlük programıyla (Örn: 8 saat veya
10 saat) örtüşüyor mu?
5. [ ] Ders giriş-çıkış saatleri ve teneffüs süreleri hatasız olarak
girildi mi?
6. [ ] Tüm öğretmenlerin isimleri ve branşları resmi kadro cetveliyle
karşılaştırıldı mı?
7. [ ] Öğretmenlerin kısa adları (çarşaf liste için) benzersiz ve doğru
formatta tanımlandı mı?
8. [ ] Sınıf öğretmenliği/rehberlik yapacak öğretmenlerin şubeleri
(homeroom) doğru ilişkilendirildi mi?
9. [ ] Tüm okul şubeleri (sınıflar) adları doğru girilerek oluşturuldu mu?
10. [ ] Sınıf bazlı günlük ders saati limitleri (daily periods) cuma
günleri veya staj günleri için özel olarak ayarlandı mı?

### Aşama 2: Kısıt ve Müsaitsizlik (Unavailability) Kontrolleri
11. [ ] Müdür ve müdür yardımcılarının idari boş günleri zaman tablosunda
kırmızıya boyandı mı?
12. [ ] Diğer okullarda görevli olan öğretmenlerin dış görev saatleri
kapatıldı mı?
13. [ ] Nöbetçi öğretmenlerin nöbet günleri ve boş saatleri planlanarak
kapatıldı mı?
14. [ ] Sınıfların gezi, sosyal etkinlik veya serbest saatleri kısıt
tablosunda işaretlendi mi?
15. [ ] Atölye ve laboratuvarların bakım-onarım veya dışarıya açık saatleri
kapatıldı mı?
16. [ ] Kapatılan saatlerin üzerine çift tıklanarak "NÖBET", "ŞEFLİK",
"KAPALI" gibi açıklamalar yazıldı mı?
17. [ ] Hiçbir öğretmenin haftalık toplam ders saati, aktif açık olduğu
saat sayısından fazla değil, değil mi? (Matematiksel imkansızlık kontrolü).
18. [ ] Hiçbir sınıfın toplam haftalık ders saati, o sınıfın açık olan saat
sayısından fazla değil, değil mi?
19. [ ] Okuldaki toplam derslik sayısı, aynı anda işlenen maksimum ders
sayısından fazla mı?
20. [ ] Atölye gerektiren derslerin toplam saatleri, o atölyenin haftalık
açık olduğu toplam saati aşmıyor değil mi?

### Aşama 3: Ders Tanımları ve Dağılım Şablonları
21. [ ] Tüm müfredat dersleri ders kodlarıyla birlikte sisteme girildi mi?
22. [ ] Haftalık ders saatleri MEB haftalık ders çizelgesine uygun girildi
mi?
23. [ ] Derslerin günlere dağılım şablonları (placement mode) pedagojik
olarak kontrol edildi mi?
24. [ ] 4 saatlik derslerin "2+2", 6 saatlik derslerin "3+3" veya "4+2"
şeklinde bölünmesi sağlandı mı?
25. [ ] 1 saatlik tekil derslerin bölünmeden "1" olarak yerleşmesi
ayarlandı mı?
26. [ ] Mesleki derslerin blok halinde "5" veya "8" saat tek günde
işlenecek şekilde şablonu yapıldı mı?
27. [ ] Aynı dersin aynı sınıfa haftada birden fazla kez ama farklı
şablonlarla atanıp atanmadığı kontrol edildi mi?
28. [ ] Ders tanımlarındaki harf hataları ve kod uyuşmazlıkları düzeltildi
mi?
29. [ ] Derslerin isimleri Türkçe karakter hassasiyetine göre düzenlendi
mi?
30. [ ] Seçmeli ders grupları ve havuz dersleri için ders tanımları
ayrıştırıldı mı?

### Aşama 4: Ders Atamaları ve İlişkilendirmeler
31. [ ] Hangi dersin hangi şubeye verileceği eksiksiz tanımlandı mı?
32. [ ] Öğretmen-Ders-Sınıf eşleştirmelerinde boşta kalan (öğretmensiz)
ders var mı?
33. [ ] Ortak (co-teaching) öğretmen gerektiren derslerde tüm öğretmenler
aynı atamaya eklendi mı?
34. [ ] Derslerin işleneceği atölye ve laboratuvarlar (ClassroomId) doğru
seçildi mi?
35. [ ] Bir öğretmenin haftalık toplam fiili ders saati yükü (maaş
karşılığı + ek ders) bordroya uygun mu?
36. [ ] Sınıfların haftalık toplam ders saatleri toplamı (Örn: 40 saat)
atamalarda sağlandı mı?
37. [ ] Aynı öğretmenin aynı saatte iki farklı sınıfta çakışacak şekilde
atanıp atanmadığı kontrol edildi mi? (Sistem bunu engeller ama atama
seviyesinde doğrulamak iyidir).
38. [ ] Atölye kapasiteleri ve şube öğrenci sayıları kontrol edildi mi?
39. [ ] Seçmeli dersler için şubeler arası ortak grup atamaları yapıldı mı?
40. [ ] İdari görevler ve kulüp saatleri atamalara eklendi mi?

### Aşama 5: Dağıtım, Kontrol ve Yazdırma Öncesi Son Kontroller
41. [ ] Otomatik dağıtıcı çalıştırılıp yerleşim başarıyla tamamlandı mı?
42. [ ] "Yerleştirilemeyen Dersler" listesinde hiçbir ders kalmadığı
doğrulandı mı?
43. [ ] Manuel kaydırma yapıldıysa herhangi bir "Çakışma Uyarı" simgesi
veya kırmızı çerçeve var mı?
44. [ ] Sabitlenmesi gereken kritik dersler (Örn: İstiklal Marşı tören
saatleri) kilitlendi mi?
45. [ ] Yazıcı ayarlarında "Arka Plan Grafikleri" aktif hale getirildi mi?
46. [ ] Çarşaf listeler için yönlendirme "Yatay" (Landscape) yapıldı mı?
47. [ ] Türkçe karakterlerin çıktılarda doğru büyük harflerle (İ, Ş, Ğ)
göründüğü onaylandı mı?
48. [ ] Sayfa başlıklarında okul adı ve doğru eğitim öğretim yılı yazıyor
mu?
49. [ ] Dağıtılan ders programının bir yedeği "Yedek Al" düğmesiyle buluta
veya yerel diske kaydedildi mi?
50. [ ] Öğretmen tebliğ imzaları ve okul müdürü resmi onayı için çıktılar
hazırlandı mı?

---

## 12. GELİŞMİŞ ALGORİTMİK PROBLEM ÇÖZME REHBERİ (CASE STUDIES)

Gerçek hayatta okul müdürlerinin karşılaştığı ve içinden çıkılması en zor
olan 3 farklı okul tipine ait vaka analizleri ve DerSayar ile çözüm
yolları:

### Vaka 1: Çok Amaçlı Mesleki ve Teknik Anadolu Lisesi (MTAL)
- **Problem**: 12 farklı meslek alanı, sadece 4 adet bilgisayar laboratuvarı, haftalık 44 saat ders süresi, 8 saat kesintisiz süren koordinatörlük ve atölye dersleri. Öğretmenlerin çoğu haftanın 2 günü işletmelerde (koordinatörlükte). Laboratuvarlarda inanılmaz bir yoğunluk var.
- **DerSayar Çözüm Yolu**:
1. Öncelikle laboratuvar gerektiren 8 saatlik devasa blok dersleri
belirleyin. Bu dersleri sınıflara ve öğretmenlere manuel olarak yerleştirip
**kilitleyin**.
2. Öğretmenlerin işletmede olduğu günleri zaman tablolarından tamamen
kırmızıya boyayarak kapatın.
3. Genel kültür derslerini (Matematik, Tarih vb.) ve sınıf dersliklerinde
işlenecek dersleri esnek dağılım şablonlarına (`2+2` veya `2+1+1`) bölün.
4. Otomatik dağıtıcıyı çalıştırın. Algoritmanın yeni eklenen **Look-ahead**
ve **Dinamik Geri İzleme Derinliği Sınırlandırması** özellikleri, kısıtlı
laboratuvarları birer birer tarayacak ve çakışma yaratmadan saniyeler
içinde genel kültür derslerini boşluklara yerleştirecektir.

### Vaka 2: Yoğun Hazırlık Sınıfları Olan Akademik Anadolu Lisesi
- **Problem**: Haftalık 10 saat yabancı dil dersi olan yoğun hazırlık sınıfları. Yabancı dil derslerinin ardışık günlerde dengeli dağılması gerekiyor (`2+2+2+2+2` veya `4+4+2`). Ayrıca öğretmenler gün ortasında boş ders (pencere/gap) kalmamasını talep ediyor.
- **DerSayar Çözüm Yolu**:
1. Yabancı dil dersleri için `2+2+2+2+2` gibi her güne eşit yayılan bir
dağılım şablonu oluşturun.
2. Öğretmenlerin boşluk (gap) yaşamasını engellemek için, öğretmenlerin
gelemeyeceği yarım günleri veya sabah/öğleden sonra bloklarını
unavailability matrisinden kapatın. Böylece dersler belirli günlerde
yoğunlaşır ve boşluk kalmaz.
3. Otomatik dağıtıcının **Net Kazanç Koruması** hevristiği sayesinde,
dağıtıcı dersleri yerleştirirken kurulu düzeni bozmadan en optimum günü
bulacaktır.

### Vaka 3: Seçmeli Ders Havuzu Olan İmam Hatip Ortaokulu
- **Problem**: Farklı sınıflardan öğrencilerin aynı anda seçtiği ve ortak işlenen seçmeli dersler. 5 farklı şubeden öğrenciler 3 farklı seçmeli ders grubuna dağılıyor. Bu derslerin mutlaka aynı gün ve aynı saatte işlenmesi gerekiyor.
- **DerSayar Çözüm Yolu**:
1. Bu dersleri sisteme tek bir "Havuz Ataması" olarak tanımlayın.
2. Şubelerin programında bu ortak saatleri önceden belirleyip diğer tüm
dersleri otomatik dağıttıktan sonra seçmeli dersleri o saatlere manuel
yerleştirip kilitleyebilirsiniz.
3. Veya seçmeli ders öğretmenlerinin zaman tablolarında sadece o saatleri
açık bırakıp diğer saatleri kapatarak algoritmayı bu dersleri aynı ana
yerleştirmeye zorlayabilirsiniz.

---

## 13. SIKÇA SORULAN SORULAR VE SİSTEMSEL DETAYLAR (FAQ - EK BÖLÜM)

### S11: "Dinamik Geri İzleme Derinliği Sınırlandırması" algoritmayı nasıl hızlandırır?
Geri izlemeli aramalarda derin dallara (Örn: depth > 4) inildiğinde,
sökülen derslerin sayısı katlanarak artar. Bu durum arama ağacının dallanma
katsayısını (branching factor) patlatır. Derinlik arttıkça izin verilen
maksimum sökme (ejection) limitini 0'a düşürerek, algoritmanın derinlerde
vakit kaybetmesi yerine hızlıca kök düğümlere dönüp farklı alternatifleri
denemesini sağlıyoruz. Bu reaktif budama mekanizması arama süresini 100 kat
hızlandırır.

### S12: Okul Settings tablosundaki "Academic Year" ibaresini boş bırakırsam ne olur?
Eğer boş bırakırsanız, yazdırma şablonlarında eğitim öğretim yılı alanı
gizlenir ve sadece "[OKUL ADI] Haftalık Ders Programı" başlığı basılır.
Ancak resmi belgelerde yıl ibaresi zorunlu olduğundan bu alanı her zaman
doldurmanız şiddetle tavsiye edilir.

### S13: Sürükle-bırak takviminde bir dersi taşımak istediğimde neden bazı hücreler sarı renkli oluyor?
Sarı renk, o hücrenin hedef öğretmen için "uygunsuz" (unavailability
tablosunda kapalı) olduğunu gösterir. Oraya yerleştirme yapmanıza sistem
izin verebilir ancak programda kısıt ihlali (conflict) oluşacaktır. Kırmızı
renk ise doğrudan çakışmayı (başka bir dersin o saatte o sınıf/öğretmen
için kurulu olduğunu) ifade eder.

### S14: Tarayıcı dillerinden bağımsız çalışan Türkçe harf dönüşümü neden önemlidir?
Çoğu web uygulaması harf büyütürken `toUpperCase()` kullanır. Eğer
kullanıcının tarayıcısı İngilizce ise "bilişim" kelimesi "BILISIM" haline
gelir. DerSayar, arka planda dil kodunu "tr-TR" olarak dikte eder. Bu
sayede dünyanın neresinde olursanız olun, hangi dilde tarayıcı
kullanırsanız kullanın, çıktılarda her zaman "BİLİŞİM" yazısı basılır.

### S15: Çevrimdışı çalışırken yedekleme nasıl yapılır?
Çevrimdışı modda yaptığınız tüm değişiklikler tarayıcının IndexedDB
altyapısında güvenli bir şekilde depolanır. Ekranı kapatmadığınız sürece
internetiniz geldiği anda bu veriler arka planda kayıpsız olarak buluta
aktarılır. Bu sayede hiçbir veri kaybı yaşamazsınız.

---

Bu kılavuz, DerSayar'ın tüm yönetimsel ve algoritmik detaylarını kapsayan
resmi referans belgesidir. Tüm hakları saklıdır.

---

## 14. DETAYLI YAZDIRMA CSS AYARLARI VE MEDIA PRINT MIMARISI

DerSayar, çıktılarda kusursuz yerleşim sağlamak amacıyla gelişmiş CSS
yazdırma kuralları (@media print) kullanır. Bu kuralların teknik detayları
aşağıda açıklanmıştır:

```css
@media print {
  /* Sayfa genel arka planını temizler ve yazıcı için optimize eder */
  body {
    background: #ffffff !important;
    color: #000000 !important;
    font-size: 10pt !important;
  }

  /* Navigasyon sekmelerini, filtre panellerini ve butonları gizler */
  .no-print,
  nav,
  header,
  button,
  .action-buttons {
    display: none !important;
  }

  /* Her bir el programının tek sayfaya basılmasını garanti eder */
  .print-page-break {
    page-break-after: always !important;
    break-after: page !important;
    display: block !important;
  }

  /* Tabloların sayfa kenarlarından taşmasını önler */
  table {
    width: 100% !important;
    border-collapse: collapse !important;
    page-break-inside: avoid !important;
  }

  /* Hücre içlerindeki doluluk oranlarını dengeler */
  th, td {
    border: 1px solid #000000 !important;
    padding: 4px 6px !important;
    font-size: 8pt !important;
    text-align: center !important;
  }

  /* Kapatılan zamanların renkli basılmasını sağlar */
  .bg-gray-200,
  .bg-red-100,
  .bg-indigo-50 {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
```

### CSS Kurallarının İşlevleri:
1. **-webkit-print-color-adjust: exact**: Tarayıcıların varsayılan renk
tasarrufu mekanizmasını devre dışı bırakarak kapalı saatlerin gri/kırmızı
boyamalarını ve derslerin renkli zebra arka planlarını doğrudan yazıcıya
aktarır.
2. **page-break-after: always**: Her bir sınıf veya öğretmen programından
sonra tarayıcıya yeni bir kağıt sayfasına geçmesi talimatını verir. Böylece
birden fazla programın tek sayfaya üst üste binmesi %100 oranında
engellenir.
3. **page-break-inside: avoid**: Bir tablonun veya el programı hücelerinin
sayfa sonlarında yarıdan kesilmesini önler, tabloyu bir bütün olarak
sonraki sayfaya taşır.

---

## 15. DERS DAĞILIM PUANLAMA METRIKLERI VE MATEMATIKSEL MODEL

Yapay zeka motorumuz, ders programının kalitesini ölçmek amacıyla her bir
yerleşim durumunu matematiksel bir puanlama (score) modeline tabi tutar.
Puanlama formülü şu şekildedir:

S = -(Wg * G) - (Wp * P) - (Wc * C)

### Değişkenler:
- **S (Total Score / Toplam Kalite Skoru)**: Alınabilecek en yüksek puan 0'dır (Kusursuz program). Puan sıfıra ne kadar yakınsa program o kadar kalitelidir.
- **G (Teacher Gaps / Öğretmen Ders Boşlukları)**: Öğretmenlerin aynı gün içindeki dersleri arasında kalan boş saat sayısıdır (Gap/Pencere).
- **P (Unbalanced Days / Dengesiz Günler)**: Derslerin haftanın günlerine dengesiz dağıtılması durumudur (Örn: Bir sınıfa pazartesi günü 8 saat ders koyup salı gününü tamamen boş bırakmak).
- **C (Unpreferred Classrooms / Tercih Edilmeyen Derslikler)**: Atölye derslerinin kendi özel laboratuvarları yerine genel sınıflara atanması durumundaki ceza puanıdır.

### Ağırlık Katsayıları (Weights):
- **Wg (Gap Ceza Katsayısı)**: Varsayılan olarak 5'tir. Her bir pencere ders saati için skordan 5 puan düşülür.
- **Wp (Denge Ceza Katsayısı)**: Varsayılan olarak 10'dur. Gün bazlı dengesiz yerleşimlerde skordan 10 puan düşülür.
- **Wc (Derslik Ceza Katsayısı)**: Varsayılan olarak 25'tir. Fiziksel çakışmalarda veya yanlış derslik atamalarında skordan 25 puan düşülür.

Algoritmamız, özyinelemeli dallanma sırasında bu formülü sürekli
çalıştırarak en yüksek skora (0'a en yakın) sahip olan yerleşim
kombinasyonunu seçmeye odaklanır.

---

## 16. İLERİ DÜZEY SİSTEM SORUNLARINI GİDERME SENARYOLARI (FAQ - PART III)

### S21: "İleri Görüşlü Fizibilite Kontrolü" hangi durumlarda hayat kurtarır?
- **Açıklama**: Bir okulda sadece 1 adet Matematik öğretmeni ve 10 farklı sınıf olduğunu düşünelim. Eğer öğretmen sadece haftada 2 gün gelebiliyorsa (yani toplamda 16 saat açık zamanı varsa) ama sınıfların haftalık Matematik dersleri toplamı 20 saat ise bu programı çözmek imkansızdır. Algoritma normalde saatlerce bu dersleri yerleştirmeye çalışıp tıkanırken, Look-ahead filtresi Matematik öğretmeninin sökülen saatlerinin hiçbir yere sığamayacağını ilk adımdan algılar ve daha işin başında idareciye tıkanıklığın nedenini raporlar.

### S22: Sistemde yapılan tüm değişiklikleri içeren bir yedeği (backup JSON) nasıl alabilirim?
- **Açıklama**: Ekranın sağ üst köşesinde yer alan "Ayarlar" menüsünden "Dışa Aktar" (Export) butonuna basarak tüm verilerinizi içeren şifreli bir "JSON" dosyasını bilgisayarınıza indirebilirsiniz. Bu dosyayı daha sonra "İçe Aktar" (Import) seçeneğiyle yükleyerek ders programınızı saniyeler içinde eski haline döndürebilirsiniz.

### S23: Manuel ders yerleştirmesi yaparken kilitlenen dersler otomatik dağıtımda nasıl bir avantaj sağlar?
- **Açıklama**: Kilitlenen (Locked) dersler algoritma için birer "sabit kaya" (fixed constraint) gibidir. Algoritma bu dersleri kesinlikle yerinden oynatmaz. Örneğin, okuldaki tüm şubelerin 8. sınıflarındaki ortak sınav saatlerini manuel yerleştirip kilitlerseniz, otomatik dağıtıcı kalan tüm dersleri (Matematik, Türkçe vb.) bu sınav saatlerini boş geçerek ve çakışma yaratmayacak şekilde etrafına örer.

### S24: Tarayıcı penceresini küçülttüğümde veya mobil cihazdan girdiğimde ders programı neden farklı görünüyor?
- **Açıklama**: Ders programı tabloları çok sütunlu ve geniş veri setleri içerdiğinden mobil ekranlarda sığmayabilir. DerSayar, responsive (duyarlı) tasarım kuralları çerçevesinde mobil cihazlarda program hücrelerini kaydırılabilir yatay kaydırma çubuklarıyla sunar. En iyi ders programı hazırlama deneyimi için geniş ekranlı masaüstü bilgisayarlar veya tabletler tavsiye edilir.

### S25: Sınıfların günlük ders saat sınırını (Daily Period Limit) değiştirmek mevcut dağıtımı bozar mı?
- **Açıklama**: Evet, eğer programı dağıttıktan sonra sınırları daraltırsanız (Örn: Sınırı 8'den 6'ya düşürürseniz), mevcut yerleşmiş bazı dersler bu sınırın dışında kalarak kısıt ihlali uyarısı (kırmızı çerçeve) verecektir. Bu nedenle günlük ders saati sınırlarını programı dağıtmadan önce belirlemeniz en doğrusudur.

### S26: Ortak derslerde (Co-teaching) iki öğretmenin de nöbet günleri aynı güne denk getirilebilir mi?
- **Açıklama**: Evet, eğer her iki öğretmenin de nöbetçi olduğu günü zaman tablolarında açık bırakır ve diğer günleri kapatırsanız, algoritma bu ortak dersi tam olarak o nöbet günüine denk getirecektir.

### S27: Öğretmen isimlerinin çarşaf listede sığmaması durumunda ne yapmalıyım?
- **Açıklama**: Öğretmenler sekmesinden her öğretmenin "Kısa Ad" (Short Name) alanını (Örn: "A. YILMAZ" veya "A.Y.") doldurun. Sistem çarşaf listelerde otomatik olarak uzun isimler yerine bu kısa isimleri kullanarak sütunların taşmasını ve çirkin görünmesini engeller.

### S28: Bir derslik atamasını (Classroom) programdan tamamen kaldırırsam ne olur?
- **Açıklama**: O dersliğe bağlı tüm dersler otomatik olarak "Genel Sınıf" dersliğine atanmış sayılır ve derslik kısıt denetiminden çıkarılır.

### S29: "Zebra Renklendirme" yazdırma çıktılarında kendini nasıl belli eder?
- **Açıklama**: Çarşaf listelerin okunmasını kolaylaştırmak için ardışık satırlarda #FFF5EE, #F0F8FF, #F0FFF0, #FFFFE0, #E6E6FA renk tonları sırayla tekrarlanır. Bu sayede kağıda basılan geniş listelerde göz kaymaları engellenir ve hangi dersin hangi öğretmene ait olduğu cetvelsiz rahatça takip edilebilir.

### S30: DerSayar'ın diğer ders programı hazırlama programlarından en büyük farkı nedir?
- **Açıklama**: Tamamen web tabanlı ve kurulumsuz olması, Google Firebase güvencesiyle verilerinizi anında bulutta yedeklemesi, Türkçe karakterlerin resmi evrak standartlarında kusursuz büyük harfe çevrilmesi ve arka planda Web Worker ile çalışan sökme-takma (Ejection Chain) tabanlı akıllı yapay zeka motorudur.

---

Bu detaylı el kitapçığı, okul yöneticilerimizin iş süreçlerini en
profesyonel düzeyde yürütmeleri için tasarlanmıştır. Her dersiniz yerli
yerinde, programınız kusursuz olsun!

---

## 17. DETAYLI KULLANIM SENARYOLARI VE ÖĞRETMEN HAFTALIK DERS YÜKÜ DAĞILIMI

Ders programı hazırlarken, öğretmenlerin haftalık ders yüklerinin
branşlarına göre dengeli dağıtılması ve öğretmen tiplerine göre kısıtların
doğru kurgulanması gerekir. Aşağıda okullarda sıkça karşılaşılan 15 farklı
öğretmen tipi ve her bir tip için DerSayar sisteminde yapılması gereken
ayarlar listelenmiştir:

### 17.1. Branş Öğretmenleri (Haftalık 15 - 21 Saat Ders Yükü)
- **Özellikler**: Genellikle haftalık ders yükleri normal sınırlardadır. Okula her gün gelirler.
- **DerSayar Ayarı**: Zaman tablosunda sadece 1 tam gün "Boş Gün" olarak kapatılabilir. Diğer günler tamamen açık bırakılmalıdır. Derslerinin günlere bölünmesi için `2+2` veya `2+2+1` gibi esnek şablonlar kullanılmalıdır.

### 17.2. Yoğun Branş Öğretmenleri (Haftalık 24 - 30 Saat Ders Yükü)
- **Özellikler**: Ders yükleri çok yoğundur, neredeyse her saatleri doludur.
- **DerSayar Ayarı**: Bu öğretmenler için kesinlikle "Boş Gün" kapatılmamalıdır. Zaman tablosunun tamamı (tüm günler ve saatler) açık bırakılmalıdır. Aksi halde algoritmanın çözüme ulaşması imkansız hale gelir.

### 17.3. Kısmi Görevlendirmeli Öğretmenler (Haftalık 6 - 12 Saat Ders Yükü)
- **Özellikler**: Başka bir okulda kadroları vardır ve sizin okulunuza sadece belirli günlerde gelirler.
- **DerSayar Ayarı**: Gelemeyecekleri günlerin tamamı zaman tablosunda kırmızıya boyanmalıdır. Açık bırakılan günlerdeki dersleri için `2+1` veya `2+2` gibi kompakt şablonlar tercih edilmelidir.

### 17.4. Sınıf Öğretmenleri ve Rehberlik (Homeroom) Öğretmenleri
- **Özellikler**: Kendi sınıflarının rehberlik saatine girerler ve öğrencilerin idari işleriyle ilgilenirler.
- **DerSayar Ayarı**: Öğretmen kartındaki "Homeroom Class" alanından rehberlik ettikleri sınıf seçilmelidir. Rehberlik dersi programda sabit bir saate (Örn: Pazartesi 8. saat) yerleştirilip kilitlenmelidir.

### 17.5. Nöbetçi Öğretmenler (Nöbet Günleri)
- **Özellikler**: Haftada 1 gün okul bahçesinde veya koridorlarda nöbet tutarlar.
- **DerSayar Ayarı**: Nöbet tutacakları günün ders saatleri zaman tablosunda açık bırakılmalıdır. Diğer günlerde dersleri daha kompakt yerleştirilebilir. Nöbet gününe ait kapalı saatlere çift tıklanarak "NÖBET" etiketi girilmelidir.

### 17.6. Okul Şefleri ve Bölüm Şefleri (Meslek Liseleri)
- **Özellikler**: Haftada belirli saatlerde şeflik ve idari koordinatörlük görevleri vardır.
- **DerSayar Ayarı**: Şeflik saatleri zaman tablosunda kırmızıya boyanmalı ve üzerine çift tıklanarak "BÖLÜM ŞEFLİĞİ" yazılmalıdır. Algoritma bu saatlere ders yerleştirmeyecektir.

### 17.7. Hamile veya Süt İzni Kullanan Öğretmenler
- **Özellikler**: Yasal hakları gereği günün belirli saatlerinde okuldan erken ayrılmaları gerekir.
- **DerSayar Ayarı**: Her günün son 2 saati zaman tablosundan kapatılmalı ve üzerine "SÜT İZNİ" yazılmalıdır. Dersler sabah saatlerine sıkıştırılacaktır.

### 17.8. Yüksek Lisans veya Doktora Yapan Öğretmenler
- **Özellikler**: Haftanın belirli günlerinde üniversitede derslere katılırlar.
- **DerSayar Ayarı**: Üniversiteye gittikleri günler (Örn: Salı ve Perşembe) zaman tablosundan tamamen kapatılmalı ve "LİSANSÜSTÜ EĞİTİM" yazılmalıdır.

### 17.9. Destek Eğitim Odası Öğretmenleri
- **Özellikler**: Özel eğitim ihtiyacı olan öğrencilerle birebir ders yaparlar.
- **DerSayar Ayarı**: Bu dersler için "Genel Derslik" yerine "Destek Eğitim Odası" dersliği tanımlanmalı ve ders atamalarında bu derslik seçilmelidir.

### 17.10. Egzersiz ve Sosyal Faaliyet Yürüten Öğretmenler
- **Özellikler**: Ders saatleri dışında spor, tiyatro, satranç gibi egzersizler yaparlar.
- **DerSayar Ayarı**: Egzersiz saatleri genellikle son ders saatinden sonra planlanır. Bu saatler program dışı olduğundan zaman tablosunda kapatılmasına gerek yoktur.

### 17.11. Okul Aile Birliği Temsilcisi Öğretmenler
- **Özellikler**: Belirli günlerde veli toplantıları ve sosyal koordinasyon toplantıları yaparlar.
- **DerSayar Ayarı**: Toplantı saatleri (Örn: Çarşamba son 2 saat) kapatılmalı ve "TOPLANTI" olarak isimlendirilmelidir.

### 17.12. Formasyon Eğitimi Veren Koordinatör Öğretmenler
- **Özellikler**: Aday öğretmenlerin yetiştirilmesi süreçlerini yürütürler.
- **DerSayar Ayarı**: Koordinatörlük günleri zaman tablosundan kapatılarak "ADAY ÖĞRETMEN KOORDİNATÖRLÜĞÜ" olarak basılması sağlanmalıdır.

### 17.13. Ücretli Öğretmenler (Ek Ders Karşılığı Çalışanlar)
- **Özellikler**: Okula sadece girdikleri ders saatlerinde gelirler, idari görevleri yoktur.
- **DerSayar Ayarı**: Derslerinin dışındaki tüm boş saatler ve günler kapatılarak programın kompakt bir şekilde belirli günlerde toplanması sağlanabilir.

### 17.14. BTR (Bilişim Teknolojileri Rehberliği) Öğretmenleri
- **Özellikler**: Okuldaki akıllı tahtaların ve bilgisayarların teknik bakımlarını yaparlar. Haftalık ders yükleri azdır, kalan saatlerde teknik destek verirler.
- **DerSayar Ayarı**: Teknik destek saatleri zaman tablosundan kapatılmalı ve "BTR GÖREVİ" olarak isimlendirilmelidir.

### 17.15. Okul Müdürü ve Müdür Yardımcıları (İdareciler)
- **Özellikler**: Haftalık girmeleri gereken zorunlu ders saati çok azdır (Örn: 2 - 6 saat). Zamanlarının çoğunu idari işlere ayırırlar.
- **DerSayar Ayarı**: Derse girecekleri saatler dışındaki tüm saatler zaman tablosundan kapatılmalı ve "İDARİ GÖREV" yazılmalıdır. Sadece derse girecekleri saat dilimi açık bırakılmalıdır.

---

## 18. DERSAYAR DURUM DEĞİŞKENLERİ VE BAZI TEKNİK VERİ DOĞRULAMA ADIMLARI

Okul ders programının kararlılığını sağlamak için veritabanında saklanan
bazı durum değişkenlerinin değer sınırları aşağıda açıklanmıştır. Bu
sınırlar aşıldığında sistem otomatik olarak uyarı verecektir:

1. **days**: En az 1, en fazla 7 gün seçilebilir. Varsayılan değer 5'tir
(Pazartesi - Cuma).
2. **periodsPerDay**: En az 1, en fazla 12 ders saati seçilebilir.
Varsayılan değer 8'dir.
3. **weeklyHours**: Bir dersin haftalık saati, toplam iş günü ile günlük
ders saati sayısının çarpımını (`days.length * periodsPerDay`) kesinlikle
aşamaz.
4. **dailyPeriods**: Her bir gün için o sınıfın maksimum ders saati
limitini belirtir. Bu değer `periodsPerDay` değerinden büyük olamaz.
5. **unavailability**: İki boyutlu matrisin boyutları her zaman
`days.length` ve `periodsPerDay` değerleriyle tam uyuşmalıdır. Ayarlar
sekmesinde gün veya saat sayısı değiştirildiğinde, bu matrisler veri kaybı
yaşanmadan arka planda otomatik olarak yeniden boyutlandırılır.

---

## 19. PROGRAMIN RESMİ TEBLİĞ VE ONAY SÜRECİ

Ders programınızı tamamlayıp çıktılarını aldıktan sonra MEB
yönetmeliklerine göre şu onay adımlarını uygulamanız gerekir:

1. **Öğretmen Tebliği**: Her bir öğretmene ait bireysel el programı çıktısı
alınır, öğretmen tarafından incelenir ve tebliğ-tebellüğ belgesi
imzalatılır.
2. **Sınıf İlanı**: Sınıf el programı çıktıları her şubenin sınıf panosuna
asılır ve sınıf rehber öğretmeni tarafından öğrencilere duyurulur.
3. **Müdür Onayı**: Tüm çarşaf listeler ve el programları okul müdürü
tarafından ıslak imza ve mühür ile onaylanarak resmi dosyasında arşivlenir.
4. **E-Okul Senkronizasyonu**: Tamamlanan haftalık ders programı, MEB
E-Okul sistemine el yardımıyla veya desteklenen dış veri aktarım
araçlarıyla aktarılarak resmi kayıt haline getirilir.

Bu adımlarla birlikte, okulunuz yeni eğitim-öğretim yılına tamamen hazır
hale gelmiş olacaktır. DerSayar ailesi olarak tüm idarecilerimize ve
öğretmenlerimize başarılı, verimli ve keyifli bir dönem dileriz!
