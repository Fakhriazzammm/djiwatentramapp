/** Short thoughts the mascot says on its own: money, then slow living, alternating. Wording is in Indonesian; the author is named so it can be looked up. */
const FINANCE = [
  "“Jangan menabung dari sisa belanja. Belanjakan sisa dari tabungan.” Warren Buffett",
  "“Satu sen yang dihemat adalah satu sen yang didapat.” Benjamin Franklin (dikaitkan)",
  "“Berinvestasi pada pengetahuan memberi bunga terbaik.” Benjamin Franklin (dikaitkan)",
  "“Risiko datang dari tidak tahu apa yang sedang kamu lakukan.” Warren Buffett",
  "“Orang berteduh di bawah pohon hari ini karena seseorang menanamnya sejak lama.” Warren Buffett",
  "“Membelanjakan uang untuk pamer seberapa kaya dirimu adalah cara tercepat untuk jadi kurang kaya.” Morgan Housel",
  "“Kekayaan adalah apa yang tidak terlihat: mobil mewah yang tidak jadi dibeli.” Morgan Housel",
  "Aturan 50/30/20: 50% kebutuhan, 30% keinginan, 20% tabungan. Elizabeth Warren dan Amelia Warren Tyagi",
  "“Sebagian dari semua yang kamu hasilkan adalah milikmu untuk disimpan.” George S. Clason, Orang Terkaya di Babilonia",
  "“Bukan yang punya terlalu sedikit yang miskin, tetapi yang selalu menginginkan lebih.” Seneca",
  "“Biaya sebuah barang adalah sebanyak hidup yang harus kamu tukarkan untuknya.” Henry David Thoreau",
  "Rasa rugi terasa kira-kira dua kali lebih kuat daripada rasa untung yang sama besar. Daniel Kahneman dan Amos Tversky",
  "Dana darurat yang ideal: 3 sampai 6 bulan pengeluaran. Pedoman umum perencana keuangan",
  "Bayar dirimu dulu: sisihkan tabungan begitu uang masuk, baru belanja. Prinsip pay yourself first",
  "Bunga majemuk bekerja paling kuat kalau diberi waktu. Mulai kecil, mulai sekarang.",
  "Jangan taruh semua telur dalam satu keranjang. Prinsip diversifikasi",
  "Hemat pangkal kaya. Peribahasa",
];
const SLOW = [
  "“Alam tidak pernah tergesa, namun semuanya selesai.” Lao Tzu (dikaitkan)",
  "“Berjalanlah seakan kakimu mencium bumi.” Thich Nhat Hanh",
  "“Hidup punya lebih banyak arti daripada sekadar menambah kecepatannya.” Mahatma Gandhi (dikaitkan)",
  "“Sederhanakan, sederhanakan.” Henry David Thoreau, Walden",
  "Alon-alon asal kelakon. Pepatah Jawa",
  "Biar lambat asal selamat. Peribahasa",
  "Pelan bukan berarti menolak kecepatan, tetapi mengerjakan sesuatu dengan kecepatan yang tepat. Gagasan Carl Honoré, In Praise of Slowness",
  "“Siapa yang tahu cukup, dialah yang kaya.” Lao Tzu, Tao Te Ching",
  "“Tak ada yang cukup bagi orang yang menganggap cukup itu terlalu sedikit.” Epikuros (dikaitkan)",
  "“Hidup itu panjang kalau kamu tahu cara memakainya.” Seneca",
  "Tarik napas dalam. Uangmu tidak ke mana-mana.",
  "Nikmati secangkir kopinya, bukan hanya kafeinnya.",
  "Satu hal dalam satu waktu. Selesai pelan lebih baik daripada setengah jadi cepat.",
];
/** Finance and slow living interleaved, starting at a random point so the first one is not always the same. */
export function quoteDeck(seed = Math.floor(Math.random() * 1000)): string[] {
  const out: string[] = [];
  for (let i = 0; i < Math.max(FINANCE.length, SLOW.length); i += 1) { if (FINANCE[i]) out.push(FINANCE[i]); if (SLOW[i]) out.push(SLOW[i]); }
  const k = seed % out.length;
  return [...out.slice(k), ...out.slice(0, k)];
}
