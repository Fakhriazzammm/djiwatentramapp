# Djiwa Pay — scan & unggah struk (prototipe alur)

Prototipe statis (data dummy) untuk alur pencatatan lewat foto atau unggahan struk.
- `index.html`: interaktif, panel kiri melompat ke layar mana pun. `?s=<key>` membuka satu layar.
- `flows.html`: diagram user flow, galeri 23 layar/sheet, dan keputusan teknis.
- Gaya: `../djiwapay-redesign/styles.css` + `../djiwapay-catat/catat.css` + `struk.css`.

Model OCR: `qwen-vl-ocr` di Helipod AI Gateway (Rp 1.433 input / Rp 3.275 output per 1 jt token), cadangan `qwen3-vl-plus`. Belum diuji pada struk asli; adu 20 struk nyata sebelum dibangun.
Belum ada backend, tabel, atau perubahan di app djiwapay.
