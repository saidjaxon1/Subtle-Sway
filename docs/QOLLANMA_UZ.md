# Subtle Sway sayti — qo'llanma

Bu qo'llanma subtlesway.com saytini boshqarish uchun. Unda sayt qanday ishlashi, yangi mahsulot qo'shish, tahrirlash va muammolarni hal qilish yo'llari tushuntirilgan.

---

## 1. Sayt qanday ishlaydi

| Qism | Qayerda | Vazifasi |
|---|---|---|
| **Sayt** | GitHub: `saidjaxon1/Subtle-Sway` (ochiq) | subtlesway.com shu yerdan ochiladi. Saytda faqat siz Publish qilgan mahsulotlar turadi |
| **Draftlar** | GitHub: `saidjaxon1/Subtle-Sway-drafts` (**yopiq**) | Import qilingan, hali saytga chiqmagan mahsulotlar. Ularni faqat siz ko'rasiz |
| **Importer** | Sizning kompyuteringizda (`npm run import`) | Wall Art papkasidan **faqat** `Mock ups/` va `ETSY_LISTING.md` ni o'qiydi va draft yaratadi |
| **Admin panel** | `subtlesway.com/admin/` | Draftni tekshirasiz, Etsy havolasini qo'yasiz va **Publish** qilasiz |
| **GitHub Actions** | Avtomatik | Har bir o'zgarishdan keyin sahifalarni 1–2 daqiqada qayta yasaydi |

**Asosiy qoidalar:**
- Importer **hech qachon** print fayllarga (`Aspect Ratio …`, `A1, A2…`) va `_` bilan boshlanadigan papkalarga tegmaydi. Buni testlar tekshiradi.
- Importer **hech qachon Publish qilmaydi**. Uning tokeni ochiq saytga yozishga ruxsatga ega emas.
- Mahsulot saytga faqat siz to'g'ri Etsy havolasini qo'yib, **Publish** tugmasini bosganingizda chiqadi.
- Saytda narx ko'rsatilmaydi. Narx faqat Etsy'da turadi.

---

## 2. Bir martalik sozlash

Bu bosqichda quyidagilar **allaqachon bajarilgan**:
- Node.js, ffmpeg va git o'rnatilgan;
- yopiq `Subtle-Sway-drafts` repozitoriyasi yaratilgan;
- importer tokeni `.env` fayliga yozilgan.

### 2.1. Admin panel uchun token

Admin panelga **alohida** token kerak, chunki u ikkala repoga yoza olishi kerak.

1. Brauzerda shu manzilni oching: `https://github.com/settings/personal-access-tokens/new`
2. Maydonlarni shunday to'ldiring:
   - **Token name:** `subtlesway-admin`
   - **Expiration:** eng uzun ruxsat etilgan muddat (masalan, 90 kun)
   - **Repository access:** **Only select repositories** ni tanlang va **Subtle-Sway** bilan **Subtle-Sway-drafts** ni belgilang (ikkalasini ham)
   - **Permissions → Contents:** **Read and write**
   - **Permissions → Workflows:** **Read and write**. Bu ruxsat faqat kompyuterdan `git push` qilganda kerak, chunki loyihada GitHub Actions fayli bor
3. **Generate token** tugmasini bosing va tokenni nusxalang. Uni parol menejeringizga (masalan, Bitwarden) saqlab qo'ying.
4. `subtlesway.com/admin/` sahifasini oching va tokenni joylab, **Kirish** tugmasini bosing.
   - Shu kompyuterda doim kirib turish uchun **"eslab qolish"** belgisini qo'ying.
   - Begona kompyuterda bu belgini qo'ymang va ishni tugatgach **Chiqish** tugmasini bosing.

⚠️ Tokenni hech kimga, hatto AI yordamchiga ham chatda yubormang.

### 2.2. Importer tokeni (bajarilgan)

Importer tokeni `.env` faylida, `IMPORT_TOKEN=` qatorida turadi. Faylni ochish uchun:
```bash
xdg-open /mnt/F2540508856C9A8C/Claude/site/Subtle-Sway/.env
```

---

## 3. Yangi mahsulotni saytga qo'shish

**Avval** mahsulotni Etsy'ga qo'ying. Saytga faqat Etsy'da bor mahsulot chiqadi.

**1-qadam. Importni sinab ko'ring.** Bu buyruq faqat nima bo'lishini ko'rsatadi, hech narsa yuklamaydi.
```bash
cd /mnt/F2540508856C9A8C/Claude/site/Subtle-Sway
npm run import -- --dry-run --only "part 5/03_Moody_Floral_Still_Life"
```
Natijada `Yangi draftlar: 1` va ogohlantirishlar ro'yxati chiqishi kerak.

**2-qadam. Haqiqiy import.**
```bash
npm run import -- --only "part 5/03_Moody_Floral_Still_Life"
```
Bitta mahsulot taxminan 20 soniyada import bo'ladi. Oxirida `Import tugadi. Yangi draftlar: 1` yozuvi chiqadi.

**3-qadam. Admin panelda tekshiring.** `subtlesway.com/admin/` → **Mahsulotlar** → mahsulotni oching. U yerda:
- nomi, katalogi va rasmlar tartibini tekshiring;
- alt matni bo'sh rasmlarga qisqa inglizcha tavsif yozing (ixtiyoriy, lekin SEO uchun foydali);
- **Ko'rib chiqish** tugmasi bilan sahifaning saytdagi ko'rinishini tekshiring.

**4-qadam. Etsy havolasini qo'ying.** Havolani Etsy'da **Share** tugmasi orqali olsangiz yaxshi. Oddiy `www.etsy.com/listing/...` havolasi ham ishlaydi, admin panel uni o'zi kerakli ko'rinishga o'tkazadi.

**5-qadam. Publish.** Tugmani bosgach, taxminan 1–2 daqiqada mahsulot `subtlesway.com/products/<nom>/` manzilida, katalogda va sitemap'da paydo bo'ladi.

**`ETSY_LISTING.md` fayli bo'lmagan papkalar** (masalan, `part 1`, ya'ni Fern) "to'liq emas" draft bo'lib keladi. Ularda tavsif bo'sh bo'ladi. Etsy'dagi tavsifni nusxalab, admin paneldagi **Tavsif** maydoniga qo'ying, katalogni tanlang va **Saqlash** tugmasini bosing. Shundan keyin Publish ishlaydi.

**Bir nechta mahsulotni birdan import qilish:** `--only` qismini olib tashlang. Shunda hamma papka import qilinadi. Faqat Etsy'ga qo'yilganlarini Publish qilasiz, qolganlari draftligicha qoladi.
```bash
npm run import
```

**Kuzatish rejimi (ixtiyoriy).** Bu rejimda importer `Mock ups/` yoki `ETSY_LISTING.md` o'zgarganini sezadi va o'sha mahsulotni avtomatik qayta import qiladi. To'xtatish uchun **Ctrl+C** bosing.
```bash
npm run import:watch
```

---

## 4. Tahrirlash va saytdan olish

**Mahsulot havolasi hech qachon o'zgarmaydi.** `subtlesway.com/products/<nom>/` havolasi birinchi importda bir marta beriladi. Uni Pinterest'ga bemalol qo'yishingiz mumkin:
- mahsulot **nomini** o'zgartirsangiz ham havola o'zgarmaydi;
- papka **raqamini** o'zgartirsangiz yoki uni boshqa `part` ga ko'chirsangiz ham havola saqlanadi. Masalan, `03_Moody_…` papkasi `07_Moody_…` ga aylansa, havola o'sha-o'sha qoladi;
- mahsulotni **saytdan olsangiz**, eski havola 404 bermaydi va katalog sahifasiga yo'naltiradi. Qayta Publish qilsangiz, o'sha havola yana mahsulotni ochadi.

Faqat papka nomidagi **dizayn nomi** o'zgartirilsa, masalan `Moody_Floral` → `Dark_Roses`, importer uni yangi mahsulot deb hisoblaydi. Bunda eski havola baribir ishlashda davom etadi.

- **Saytdagi mahsulotni tahrirlash:** admin panelda o'zgartiring va **Saqlash** tugmasini bosing. Sayt o'zi yangilanadi.
- **"✎ admin'da tahrirlangan"** belgisi qo'yilgan maydon importda o'zgarmaydi. Papkadagi matnni qaytarish uchun yonidagi **"folderdagi versiyani olish"** ni bosing va keyin saqlang.
- **Saytdan olish:** **Saytdan olish** tugmasini bosing. Mahsulot draft bo'lib qoladi, Etsy havolasi ham saqlanadi. Keyin yana Publish qilish mumkin.
- **Arxivlash:** ro'yxatda belgilab, **Arxivlash** ni bosing. Arxivdagi mahsulot ro'yxatda ko'rinmaydi, lekin o'chib ketmaydi.
- **Papka o'chirilsa:** mahsulot "Manba topilmadi" deb belgilanadi. Hech narsa avtomatik o'chirilmaydi.

---

## 5. Kataloglar va Etsy bo'limlari

1. Etsy'da Shop Manager → **Listings** → **Sections** bo'limida bo'lim yarating, masalan "Botanical & Floral".
2. Do'koningizda o'sha bo'limni oching va brauzer manzil satridagi havolani nusxalang. U `...?section_id=123456` ko'rinishida bo'ladi.
3. Admin panelda **Kataloglar** ga kiring, kerakli katalogning **Etsy bo'lim havolasi** maydoniga havolani qo'ying va **Saqlang**.

Shundan keyin saytdagi o'sha katalogda **"View on Etsy"** tugmasi chiqadi va xaridorni Etsy'dagi bo'limga olib boradi. Havola qo'yilmagan katalogdagi tugma butun do'konga olib boradi.

---

## 6. Sahifalar va sozlamalar

- **Sahifalar** (About, FAQ, Contact, Privacy, Terms, Disclaimer): matn ingliz tilida yoziladi. Quyidagi belgilashlarni ishlatish mumkin:
  - `## Sarlavha` — sarlavha;
  - `- ro'yxat` — ro'yxat qatori;
  - `**qalin**` — qalin matn;
  - `[matn](https://...)` — havola.

  Privacy, Terms yoki Disclaimer'ni o'zgartirsangiz, **Bugun** tugmasi bilan sanani yangilang.
- **Sozlamalar:** do'kon nomi, Etsy havolasi, bosh sahifa matnlari, email va ijtimoiy tarmoqlar.

---

## 7. Token muddati tugaganda

GitHub muddat tugashidan oldin emailga ogohlantirish yuboradi. Muddat tugasa:
- **Importer** shunday xabar chiqaradi: *"GitHub tokeni ishlamayapti: muddati tugagan yoki noto'g'ri…"*;
- **Admin panel** shunday xabar chiqaradi: *"Token noto'g'ri yoki muddati tugagan."*

**Yechim:** GitHub'da Settings → Developer settings → Fine-grained tokens → tokenni oching → **Regenerate token**. Shundan keyin:
- importer tokeni bo'lsa, yangisini `.env` fayliga yozing;
- admin tokeni bo'lsa, admin panelga qayta kiriting.

---

## 8. Domen (Namecheap)

Domen allaqachon GitHub Pages'ga ulangan. **Hech narsani o'zgartirmang.** Faqat ma'lumot uchun, to'g'ri sozlamalar quyidagicha:

| Turi | Host | Qiymat |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | saidjaxon1.github.io |

GitHub'da `Subtle-Sway` → **Settings → Pages** bo'limida **Custom domain: subtlesway.com** va **Enforce HTTPS** yoqilgan bo'lishi kerak. Domenni har yili Namecheap'da uzaytirishni unutmang.

---

## 9. Zaxira nusxa

Saytning ham, draftlarning ham to'liq tarixi GitHub'da saqlanadi. Qo'shimcha nusxa olish uchun oyiga bir marta kompyuteringizda quyidagini bajaring:
```bash
cd /mnt/F2540508856C9A8C/Claude/site/Subtle-Sway && git pull
```
Draftlar uchun ham bir xil buyruq ishlatiladi. Birinchi marta `git clone https://github.com/saidjaxon1/Subtle-Sway-drafts.git` buyrug'i bilan nusxalab olasiz. Repo yopiq bo'lgani uchun GitHub login so'raydi.

---

## 10. Muammolar

| Belgi | Sababi va yechimi |
|---|---|
| Publish tugmasi bosilmaydi | Etsy havolasi noto'g'ri, boshqa do'konga tegishli, yoki mahsulotda tavsif, ko'rinadigan rasm yoki katalog yo'q. Tugma ostidagi qizil yozuvni o'qing |
| Saytda o'zgarish ko'rinmayapti | 2 daqiqa kuting va **Ctrl+F5** bosing. Keyin GitHub'da `Subtle-Sway` → **Actions** bo'limida oxirgi ishga tushish yashil ✓ ekanini tekshiring |
| `ffmpeg topilmadi` | `sudo apt install ffmpeg` |
| `--only "…" papkasi topilmadi` | Papka nomini to'liq va aynan yozing, masalan `"part 5/03_Moody_Floral_Still_Life"` |
| "Manba topilmadi" | Papka o'chirilgan yoki nomi o'zgargan. Nomini qaytaring yoki mahsulotni arxivlang |

---

## Eng ko'p ishlatiladigan 5 ta buyruq

Har bir buyruqdan oldin loyiha papkasiga o'ting:
```bash
cd /mnt/F2540508856C9A8C/Claude/site/Subtle-Sway
```

| # | Buyruq | Nima qiladi |
|---|---|---|
| 1 | `npm run import -- --dry-run --only "part 5/…"` | Nima import bo'lishini ko'rsatadi, hech narsa yuklamaydi |
| 2 | `npm run import -- --only "part 5/…"` | Bitta mahsulotni draft qiladi |
| 3 | `npm run import` | Barcha papkalarni import qiladi yoki yangilaydi |
| 4 | `npm test` | Xavfsizlik va qoidalar testlari: `fail 0` chiqishi kerak |
| 5 | `npm run dev` | Saytni kompyuterda `http://localhost:8080` manzilida ochadi |
