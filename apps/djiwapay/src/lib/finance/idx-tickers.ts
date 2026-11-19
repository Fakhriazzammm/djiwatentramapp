/** Popular IDX codes for the quick search. Any 4-letter code is accepted; this list only helps people find theirs. */
export const IDX_TICKERS: readonly (readonly [string, string])[] = [
  ["BBCA", "Bank Central Asia"], ["BBRI", "Bank Rakyat Indonesia"], ["BMRI", "Bank Mandiri"], ["BBNI", "Bank Negara Indonesia"], ["BRIS", "Bank Syariah Indonesia"], ["BBTN", "Bank Tabungan Negara"],
  ["BNGA", "Bank CIMB Niaga"], ["ARTO", "Bank Jago"], ["BFIN", "BFI Finance Indonesia"], ["NISP", "Bank OCBC NISP"],
  ["TLKM", "Telkom Indonesia"], ["EXCL", "XL Axiata"], ["ISAT", "Indosat Ooredoo Hutchison"], ["TOWR", "Sarana Menara Nusantara"], ["MTEL", "Dayamitra Telekomunikasi"],
  ["ASII", "Astra International"], ["UNTR", "United Tractors"], ["GOTO", "GoTo Gojek Tokopedia"], ["BUKA", "Bukalapak.com"], ["EMTK", "Elang Mahkota Teknologi"],
  ["ADRO", "Alamtri Resources Indonesia"], ["ADMR", "Adaro Minerals Indonesia"], ["AMMN", "Amman Mineral Internasional"], ["ANTM", "Aneka Tambang"], ["INCO", "Vale Indonesia"],
  ["MDKA", "Merdeka Copper Gold"], ["MBMA", "Merdeka Battery Materials"], ["NCKL", "Trimegah Bangun Persada"], ["PTBA", "Bukit Asam"], ["ITMG", "Indo Tambangraya Megah"],
  ["INDY", "Indika Energy"], ["HRUM", "Harum Energy"], ["BYAN", "Bayan Resources"], ["PGAS", "Perusahaan Gas Negara"], ["MEDC", "Medco Energi Internasional"],
  ["AKRA", "AKR Corporindo"], ["ESSA", "Surya Esa Perkasa"], ["BREN", "Barito Renewables Energy"], ["BRPT", "Barito Pacific"], ["TPIA", "Chandra Asri Pacific"], ["DSSA", "Dian Swastatika Sentosa"],
  ["UNVR", "Unilever Indonesia"], ["ICBP", "Indofood CBP Sukses Makmur"], ["INDF", "Indofood Sukses Makmur"], ["MYOR", "Mayora Indah"], ["CPIN", "Charoen Pokphand Indonesia"], ["JPFA", "Japfa Comfeed Indonesia"],
  ["KLBF", "Kalbe Farma"], ["SIDO", "Sido Muncul"], ["MIKA", "Mitra Keluarga Karyasehat"], ["HEAL", "Medikaloka Hermina"], ["HMSP", "HM Sampoerna"], ["GGRM", "Gudang Garam"],
  ["CTRA", "Ciputra Development"], ["BSDE", "Bumi Serpong Damai"], ["SMRA", "Summarecon Agung"], ["PWON", "Pakuwon Jati"], ["SMGR", "Semen Indonesia"], ["INTP", "Indocement Tunggal Prakarsa"],
  ["MAPI", "Mitra Adiperkasa"], ["ACES", "Aspirasi Hidup Indonesia"], ["ERAA", "Erajaya Swasembada"], ["AMRT", "Sumber Alfaria Trijaya"], ["INKP", "Indah Kiat Pulp & Paper"], ["TKIM", "Pabrik Kertas Tjiwi Kimia"],
  ["SRTG", "Saratoga Investama Sedaya"], ["JSMR", "Jasa Marga"], ["TINS", "Timah"], ["CUAN", "Petrindo Jaya Kreasi"],
];
export const TICKER_NAME = new Map<string, string>(IDX_TICKERS as unknown as [string, string][]);
export const isTicker = (v: string) => /^[A-Z]{4}$/.test(v);
const PALETTE = ["#1a5dc6", "#c9461b", "#5b6b7f", "#4f7a2b", "#a05d00", "#6a4c93", "#16a3b8", "#e0568a", "#2f7d6d", "#d9480f"];
/** A stable colour per ticker, so a stock keeps its sticker colour everywhere. */
export const tickerColor = (t: string) => PALETTE[[...t].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length];
/** Company logos are shipped for the listed codes (public/assets/idx-logos, 160px, round). Any other code falls back to a coloured tile. */
export const hasLogo = (t: string) => TICKER_NAME.has(t);
export const logoSrc = (t: string) => `/assets/idx-logos/${t}.png`;
