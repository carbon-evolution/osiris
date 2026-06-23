import type { CctvCamera } from './types';

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CameraEntry {
  id: string;
  lat: number;
  lng: number;
  name: string;
  city: string;
  stream_url: string;
}

interface Waypoint { km: number; lat: number; lng: number; }

function interpolateKm(wp: Waypoint[], km: number): { lat: number; lng: number } {
  // Clamp out-of-range KM to the road's endpoints rather than extrapolating.
  // Extrapolation sent mislabelled markers (e.g. cumulative "KM 772" on a
  // road whose waypoints span km 44–55) far off the road and into the ocean.
  const first = wp[0], last = wp[wp.length - 1];
  if (km <= first.km) return { lat: first.lat, lng: first.lng };
  if (km >= last.km) return { lat: last.lat, lng: last.lng };
  for (let i = 0; i < wp.length - 1; i++) {
    const a = wp[i], b = wp[i + 1];
    if (km >= a.km && km <= b.km) {
      const t = b.km === a.km ? 0 : (km - a.km) / (b.km - a.km);
      return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    }
  }
  return { lat: last.lat, lng: last.lng };
}

function parseKm(name: string): number | null {
  const m = name.match(/KM\s*(\d+)(?:\+(\d+))?/);
  return m ? parseInt(m[1]) + (parseInt(m[2] || '0') / 1000) : null;
}

// ═══════════════════════════════════════════════
//  ROAD GEOMETRIES
// ═══════════════════════════════════════════════

// JTC (Dalam Kota) — Cawang → Kuningan → Semanggi → Slipi → Tomang
const JTC_WP: Waypoint[] = [
  { km: 0, lat: -6.2423, lng: 106.8720 },   // Cawang
  { km: 3, lat: -6.2440, lng: 106.8550 },   // Cawang–Kuningan
  { km: 5, lat: -6.2390, lng: 106.8380 },   // Kuningan
  { km: 7, lat: -6.2280, lng: 106.8230 },   // Semanggi
  { km: 10, lat: -6.2100, lng: 106.8100 },  // Semanggi–Slipi
  { km: 13, lat: -6.1720, lng: 106.7960 },  // Slipi
  { km: 16, lat: -6.1705, lng: 106.7980 },  // Grogol
  { km: 19, lat: -6.1740, lng: 106.8030 },  // Tomang
];

// Jagorawi — Cawang → Cimanggis → Cibinong → Citeureup → Ciawi
const JGW_WP: Waypoint[] = [
  { km: 0, lat: -6.2423, lng: 106.8720 },   // Cawang
  { km: 10, lat: -6.3100, lng: 106.8650 },  // Cimanggis
  { km: 15, lat: -6.3300, lng: 106.8600 },  // Cibinong
  { km: 25, lat: -6.4200, lng: 106.8380 },  // Citeureup
  { km: 35, lat: -6.5200, lng: 106.8200 },  // Bojonggede
  { km: 45, lat: -6.6400, lng: 106.8500 },  // Ciawi
];

// Jakarta-Cikampek — Cawang → Bekasi → Cikarang → Cibitung → Karawang → Klari → Cikampek
const CKP_WP: Waypoint[] = [
  { km: 0, lat: -6.2423, lng: 106.8720 },   // Cawang
  { km: 5, lat: -6.2490, lng: 106.9220 },   // Bekasi Timur
  { km: 10, lat: -6.2560, lng: 106.9720 },  // Bekasi Barat
  { km: 15, lat: -6.2620, lng: 107.0220 },  // Tambun
  { km: 18, lat: -6.2680, lng: 107.0820 },  // Cikarang Barat
  { km: 22, lat: -6.2750, lng: 107.1250 },  // Cikarang
  { km: 28, lat: -6.2880, lng: 107.1950 },  // Cibitung
  { km: 33, lat: -6.2980, lng: 107.2600 },  // Karawang Barat
  { km: 40, lat: -6.3100, lng: 107.3400 },  // Karawang
  { km: 47, lat: -6.3400, lng: 107.4000 },  // Klari
  { km: 54, lat: -6.3700, lng: 107.4700 },  // Cikampek
  { km: 62, lat: -6.3950, lng: 107.5000 },  // Cikampek Timur
  { km: 72, lat: -6.4130, lng: 107.4600 },  // Cikampek Utama
];

// Jakarta-Tangerang — Tomang → Kebon Jeruk → Meruya → Tangerang
const JGR_WP: Waypoint[] = [
  { km: 0, lat: -6.1740, lng: 106.8030 },   // Tomang
  { km: 4, lat: -6.1770, lng: 106.7520 },   // Kebon Jeruk
  { km: 8, lat: -6.1780, lng: 106.7000 },   // Meruya
  { km: 15, lat: -6.1780, lng: 106.6600 },  // Tangerang
  { km: 25, lat: -6.1780, lng: 106.6300 },  // Tangerang Barat
];

// JORR E — Cakung → Bambu Apus → Rorotan → Cilincing
const JORE_WP: Waypoint[] = [
  { km: 34, lat: -6.2250, lng: 106.9370 },  // Cakung
  { km: 38, lat: -6.2180, lng: 106.9700 },  // Bambu Apus
  { km: 42, lat: -6.2100, lng: 106.9970 },  // Rorotan
  { km: 48, lat: -6.1850, lng: 107.0000 },  // Marunda
  { km: 53, lat: -6.1680, lng: 106.9960 },  // Cilincing
  { km: 57, lat: -6.1550, lng: 106.9880 },  // Cilincing Timur
];

// MBZ (Jalan Layang MBZ) — parallel to Jakarta-Cikampek (elevated)
const MBZ_WP: Waypoint[] = [
  { km: 10, lat: -6.2560, lng: 106.9720 },  // Bekasi Barat
  { km: 15, lat: -6.2620, lng: 107.0220 },  // Tambun
  { km: 18, lat: -6.2680, lng: 107.0820 },  // Cikarang Barat
  { km: 22, lat: -6.2750, lng: 107.1250 },  // Cikarang
  { km: 28, lat: -6.2880, lng: 107.1950 },  // Cibitung
  { km: 33, lat: -6.2980, lng: 107.2600 },  // Karawang Barat
  { km: 40, lat: -6.3150, lng: 107.3200 },  // Karawang
  { km: 48, lat: -6.3400, lng: 107.3800 },  // MBZ end
];

// Cimanggis-Cibitung — Jagorawi junction → Cibitung
const CMC_WP: Waypoint[] = [
  { km: 24, lat: -6.3300, lng: 106.8600 },  // Cimanggis (Jagorawi junction)
  { km: 35, lat: -6.3250, lng: 106.9200 },
  { km: 45, lat: -6.3150, lng: 107.0000 },
  { km: 55, lat: -6.2930, lng: 107.1100 },
  { km: 65, lat: -6.2830, lng: 107.2000 },
  { km: 73, lat: -6.2800, lng: 107.2600 },  // Cibitung
];

// JORR S — Cawang → Pancoran → Kebon Jeruk
const JORS_WP: Waypoint[] = [
  { km: 19, lat: -6.2423, lng: 106.8720 },  // Cawang
  { km: 20, lat: -6.2430, lng: 106.8500 },
  { km: 21, lat: -6.2440, lng: 106.8100 },  // Pancoran
  { km: 22, lat: -6.2380, lng: 106.7800 },
  { km: 23, lat: -6.2300, lng: 106.7600 },
  { km: 24, lat: -6.2250, lng: 106.7430 },  // Kebon Jeruk
];


// ═══════════════════════════════════════════════
//  NEW INFTOL ROAD GEOMETRIES
// ═══════════════════════════════════════════════

// ═══════════════════════════════════════════════
//  NEW INFTOL ROADS (added by scraper)
// ═══════════════════════════════════════════════

// BELMERA
const BLM_WP: Waypoint[] = [
  { km: 0, lat: 3.595, lng: 98.675 },
  { km: 12, lat: 3.615, lng: 98.68 },
  { km: 24, lat: 3.58, lng: 98.685 },
  { km: 33, lat: 3.565, lng: 98.69 },
  { km: 42, lat: 3.555, lng: 98.72 },
  { km: 52, lat: 3.54, lng: 98.76 },
  { km: 61, lat: 3.525, lng: 98.785 },
];

// Terbanggi Besar–Pematang Panggang–Kayu Agung
const TBP_WP: Waypoint[] = [
  { km: 0, lat: -4.685, lng: 105.385 },
  { km: 30, lat: -4.245, lng: 105.175 },
  { km: 60, lat: -3.81, lng: 104.83 },
];

// Tangerang–Merak
const TMR_WP: Waypoint[] = [
  { km: 0, lat: -6.178, lng: 106.63 },
  { km: 15, lat: -6.12, lng: 106.45 },
  { km: 30, lat: -6.08, lng: 106.25 },
  { km: 45, lat: -6.03, lng: 106.05 },
  { km: 55, lat: -5.98, lng: 106 },
];

// Surabaya–Gempol
const SBG_WP: Waypoint[] = [
  { km: 0, lat: -7.275, lng: 112.74 },
  { km: 15, lat: -7.35, lng: 112.67 },
  { km: 30, lat: -7.46, lng: 112.58 },
  { km: 45, lat: -7.52, lng: 112.49 },
  { km: 60, lat: -7.565, lng: 112.4 },
];

// Solo–Ngawi
const SNG_WP: Waypoint[] = [
  { km: 0, lat: -7.565, lng: 110.86 },
  { km: 20, lat: -7.52, lng: 111.05 },
  { km: 40, lat: -7.47, lng: 111.24 },
  { km: 60, lat: -7.42, lng: 111.38 },
  { km: 75, lat: -7.38, lng: 111.5 },
];

// Serang–Panimbang Seksi 1 (Serang–Rangkasbitung)
const SPN_WP: Waypoint[] = [
  { km: 0, lat: -6.12, lng: 106.15 },
  { km: 25, lat: -6.35, lng: 106.08 },
];

// Sedyatmo (Akses Bandara Soekarno–Hatta)
const SDY_WP: Waypoint[] = [
  { km: 0, lat: -6.174, lng: 106.803 },
  { km: 5, lat: -6.168, lng: 106.78 },
  { km: 12, lat: -6.148, lng: 106.74 },
  { km: 18, lat: -6.128, lng: 106.7 },
  { km: 22, lat: -6.115, lng: 106.68 },
];

// Pekanbaru–Dumai
const PBD_WP: Waypoint[] = [
  { km: 0, lat: 0.54, lng: 101.45 },
  { km: 30, lat: 0.72, lng: 101.35 },
  { km: 60, lat: 0.98, lng: 101.24 },
  { km: 90, lat: 1.22, lng: 101.15 },
  { km: 110, lat: 1.37, lng: 101.1 },
];

// Pandaan–Malang
const PDM_WP: Waypoint[] = [
  { km: 55, lat: -7.67, lng: 112.69 },
  { km: 65, lat: -7.75, lng: 112.67 },
  { km: 80, lat: -7.86, lng: 112.65 },
  { km: 90, lat: -7.95, lng: 112.63 },
];

// Palembang–Indralaya
const PLI_WP: Waypoint[] = [
  { km: 0, lat: -2.99, lng: 104.755 },
  { km: 15, lat: -3.08, lng: 104.7 },
  { km: 25, lat: -3.15, lng: 104.66 },
];

// Ngawi–Kertosono–Kediri (JNK)
const JNK_WP: Waypoint[] = [
  { km: 575, lat: -7.4, lng: 111.45 },
  { km: 590, lat: -7.47, lng: 111.55 },
  { km: 605, lat: -7.54, lng: 111.66 },
  { km: 620, lat: -7.6, lng: 111.82 },
  { km: 635, lat: -7.7, lng: 111.9 },
];

// Mojokerto–Surabaya
const MJS_WP: Waypoint[] = [
  { km: 700, lat: -7.48, lng: 112.43 },
  { km: 720, lat: -7.42, lng: 112.55 },
  { km: 740, lat: -7.34, lng: 112.68 },
  { km: 755, lat: -7.275, lng: 112.74 },
];

// Krian–Legundi–Bunder–Manyar (KLBM)
const KLB_WP: Waypoint[] = [
  { km: 0, lat: -7.4, lng: 112.58 },
  { km: 10, lat: -7.38, lng: 112.55 },
  { km: 20, lat: -7.35, lng: 112.52 },
  { km: 30, lat: -7.32, lng: 112.49 },
];

// Kertosono–Mojokerto
const KRM_WP: Waypoint[] = [
  { km: 615, lat: -7.59, lng: 111.82 },
  { km: 635, lat: -7.55, lng: 111.95 },
  { km: 660, lat: -7.51, lng: 112.15 },
];

// Jogja–Solo
const JJS_WP: Waypoint[] = [
  { km: 0, lat: -7.79, lng: 110.38 },
  { km: 15, lat: -7.75, lng: 110.45 },
  { km: 30, lat: -7.71, lng: 110.52 },
  { km: 45, lat: -7.65, lng: 110.61 },
  { km: 55, lat: -7.565, lng: 110.86 },
];

// Gempol–Pasuruan
const GPS_WP: Waypoint[] = [
  { km: 770, lat: -7.58, lng: 112.7 },
  { km: 785, lat: -7.61, lng: 112.76 },
  { km: 800, lat: -7.64, lng: 112.83 },
  { km: 815, lat: -7.66, lng: 112.9 },
];


// Gempol–Pandaan
const GPD_WP: Waypoint[] = [
  { km: 44, lat: -7.57, lng: 112.69 },
  { km: 48, lat: -7.59, lng: 112.7 },
  { km: 55, lat: -7.65, lng: 112.69 },
];

const ATP_WP: Waypoint[] = [
  { km: 0, lat: -6.155, lng: 106.89 },
  { km: 5, lat: -6.135, lng: 106.88 },
  { km: 10, lat: -6.11, lng: 106.87 },
];

// Tol Dalam Kota (Kelapa Gading–Pulo Gebang)
const KDG_WP: Waypoint[] = [
  { km: 0, lat: -6.16, lng: 106.9 },
  { km: 8, lat: -6.175, lng: 106.95 },
  { km: 15, lat: -6.195, lng: 106.99 },
];

// Padalarang–Cileunyi (Padaleunyi)
const PAD_WP: Waypoint[] = [
  { km: 92, lat: -6.84, lng: 107.52 },
  { km: 100, lat: -6.87, lng: 107.57 },
  { km: 110, lat: -6.89, lng: 107.63 },
  { km: 120, lat: -6.92, lng: 107.7 },
  { km: 130, lat: -6.94, lng: 107.77 },
];

// BORR (Sentul Barat–Simpang Yasmin)
const BOR_WP: Waypoint[] = [
  { km: 0, lat: -6.54, lng: 106.77 },
  { km: 3, lat: -6.545, lng: 106.8 },
  { km: 7, lat: -6.55, lng: 106.83 },
];

// JORR W2U (Ulujami–Kembangan)
const W2U_WP: Waypoint[] = [
  { km: 8, lat: -6.23, lng: 106.74 },
  { km: 10, lat: -6.225, lng: 106.75 },
  { km: 13, lat: -6.213, lng: 106.75 },
  { km: 16, lat: -6.195, lng: 106.745 },
];

// JORR 2 (Serpong–Kunciran)
const JSK_WP: Waypoint[] = [
  { km: 14, lat: -6.28, lng: 106.68 },
  { km: 18, lat: -6.27, lng: 106.7 },
  { km: 23, lat: -6.255, lng: 106.72 },
];


// JORR 2 (Kunciran–Cengkareng)
const JKC_WP: Waypoint[] = [
  { km: 1, lat: -6.24, lng: 106.71 },
  { km: 4, lat: -6.225, lng: 106.7 },
  { km: 7, lat: -6.205, lng: 106.69 },
];

// JORR W1 (Pondok Pinang–Ulujami)
const W1_WP: Waypoint[] = [
  { km: 0, lat: -6.240, lng: 106.755 },   // Pondok Pinang
  { km: 2, lat: -6.240, lng: 106.765 },   // Cipete
  { km: 4, lat: -6.241, lng: 106.775 },   // Fatmawati
  { km: 6, lat: -6.242, lng: 106.785 },   // Pancoran
  { km: 8, lat: -6.230, lng: 106.740 },   // Ulujami
];

// ═══════════════════════════════════════════════
//  EXISTING BINA MARGA CAMERAS
// ═══════════════════════════════════════════════

const ITS_CAMERAS: CameraEntry[] = [
  { id: 'bm-its-33', lat: -6.26267497, lng: 107.06284490, name: 'Tambun Selatan', city: 'Bekasi', stream_url: 'https://its.binamarga.pu.go.id:8989/play/hls/CT-01/index.m3u8' },
  { id: 'bm-its-34', lat: -6.26816649, lng: 107.08261440, name: 'Cikarang Barat - Jl Sultan Hasanudin', city: 'Bekasi', stream_url: 'https://its.binamarga.pu.go.id:8989/play/hls/CT-02/index.m3u8' },
  { id: 'bm-its-35', lat: -6.27027193, lng: 107.17884990, name: 'Cikarang Utara', city: 'Bekasi', stream_url: 'https://its.binamarga.pu.go.id:8989/play/hls/CT-03/index.m3u8' },
  { id: 'bm-its-36', lat: -6.27094002, lng: 107.19144800, name: 'Cikarang Barat - Jl Raya Teuku Umar', city: 'Bekasi', stream_url: 'https://its.binamarga.pu.go.id:8989/play/hls/CT-04/index.m3u8' },
  { id: 'bm-its-37', lat: -6.27040206, lng: 107.20349340, name: 'Cakung Timur 1', city: 'Bekasi', stream_url: 'https://its.binamarga.pu.go.id:8989/play/hls/CT-05/index.m3u8' },
  { id: 'bm-its-38', lat: -6.26958082, lng: 107.23444880, name: 'Cakung Timur 2', city: 'Bekasi', stream_url: 'https://its.binamarga.pu.go.id:8989/play/hls/CT-06/index.m3u8' },
  { id: 'bm-its-39', lat: -6.26697691, lng: 107.24707050, name: 'Kedungwaringin', city: 'Bekasi', stream_url: 'https://its.binamarga.pu.go.id:8989/play/hls/CT-07/index.m3u8' },
  { id: 'bm-its-40', lat: -6.28815227, lng: 107.31444820, name: 'Karawang Barat', city: 'Karawang', stream_url: 'https://its.binamarga.pu.go.id:8989/play/hls/CT-08/index.m3u8' },
  { id: 'bm-its-41', lat: -6.35050184, lng: 107.34448860, name: 'Klari', city: 'Karawang', stream_url: 'https://its.binamarga.pu.go.id:8989/play/hls/CT-09/index.m3u8' },
  { id: 'bm-its-42', lat: -6.39650755, lng: 107.43447360, name: 'Cikampek', city: 'Karawang', stream_url: 'https://its.binamarga.pu.go.id:8989/play/hls/CT-10/index.m3u8' },
];

const BRIDGE_CAMERAS: CameraEntry[] = [
  { id: 'bm-ch-48',  lat: -6.76176496, lng: 108.13398153, name: 'Jembatan Cimanuk', city: 'Sumedang', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/6/index.m3u8' },
  { id: 'bm-ch-49',  lat: -6.16387100, lng: 106.65700446, name: 'Jembatan Batuceper 2', city: 'Tangerang', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/8/index.m3u8' },
  { id: 'bm-ch-50',  lat: -6.76602496, lng: 108.16292734, name: 'Jembatan Cilutung', city: 'Sumedang', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/9/index.m3u8' },
  { id: 'bm-ch-51',  lat: -7.47797005, lng: 108.59778247, name: 'Jembatan Ciputra Haji', city: 'Ciamis', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/29/index.m3u8' },
  { id: 'bm-ch-52',  lat: -7.36778700, lng: 108.54212051, name: 'Jembatan Citanduy', city: 'Banjar', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/30/index.m3u8' },
  { id: 'bm-ch-53',  lat: -7.42594890, lng: 109.07328654, name: 'Jembatan Karang Bawang', city: 'Banyumas', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/27/index.m3u8' },
  { id: 'bm-ch-54',  lat: -8.21427170, lng: 111.07760263, name: 'Jembatan Teleng', city: 'Pacitan', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/20/index.m3u8' },
  { id: 'bm-ch-55',  lat: -8.24781128, lng: 111.30917254, name: 'Jembatan Kangkung', city: 'Pacitan', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/21/index.m3u8' },
  { id: 'bm-ch-56',  lat: -8.01743509, lng: 111.92481700, name: 'Jembatan Ngujang', city: 'Tulungagung', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/17/index.m3u8' },
  { id: 'bm-ch-57',  lat: -7.82734499, lng: 112.00890446, name: 'Jembatan Bandarngalim', city: 'Kediri', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/16/index.m3u8' },
  { id: 'bm-ch-58',  lat: -8.31108544, lng: 114.04733491, name: 'Jembatan Kalitakir', city: 'Banyuwangi', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/31/index.m3u8' },
  { id: 'bm-ch-59',  lat: -7.16364136, lng: 111.86806319, name: 'Jembatan Jetak', city: 'Bojonegoro', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/25/index.m3u8' },
  { id: 'bm-ch-60',  lat: -6.86920524, lng: 109.03481673, name: 'Jembatan Pemali', city: 'Brebes', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/14/index.m3u8' },
  { id: 'bm-ch-61',  lat: -7.53840023, lng: 109.13385600, name: 'Jembatan Margasana', city: 'Banyumas', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/11/index.m3u8' },
  { id: 'bm-ch-62',  lat: -6.92339566, lng: 110.57368637, name: 'Jembatan Wonokerto', city: 'Demak', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/33/index.m3u8' },
  { id: 'bm-ch-63',  lat: -6.71942057, lng: 111.14779281, name: 'Jembatan Juana', city: 'Pati', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/23/index.m3u8' },
  { id: 'bm-ch-64',  lat: -6.71493150, lng: 111.64053873, name: 'Jembatan Pang', city: 'Rembang', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/24/index.m3u8' },
  { id: 'bm-ch-65',  lat: -7.56578288, lng: 110.86082200, name: 'Jembatan Jurug', city: 'Surakarta', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/22/index.m3u8' },
  { id: 'bm-ch-66',  lat: -6.62862790, lng: 108.52517254, name: 'Jembatan Karang Sembung', city: 'Cirebon', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/19/index.m3u8' },
  { id: 'bm-ch-67',  lat: -6.59654615, lng: 108.51419400, name: 'Jembatan Sigranela', city: 'Cirebon', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/28/index.m3u8' },
  { id: 'bm-ch-68',  lat: -6.74945700, lng: 108.58828637, name: 'Jembatan Kalijaga', city: 'Cirebon', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/15/index.m3u8' },
  { id: 'bm-ch-69',  lat: -6.78090152, lng: 108.61687408, name: 'Jembatan Kanci', city: 'Cirebon', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/13/index.m3u8' },
  { id: 'bm-ch-70',  lat: -6.31650638, lng: 107.69816354, name: 'Jembatan Ciasem', city: 'Subang', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/32/index.m3u8' },
  { id: 'bm-ch-71',  lat: -6.56135916, lng: 107.43358546, name: 'Jembatan Cikao', city: 'Purwakarta', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/12/index.m3u8' },
  { id: 'bm-ch-72',  lat: -6.72395726, lng: 108.28079173, name: 'Jembatan Cikeruh', city: 'Majalengka', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/10/index.m3u8' },
  { id: 'bm-ch-73',  lat: -6.17543767, lng: 106.62879673, name: 'Jembatan Cisadane', city: 'Tangerang', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/5/index.m3u8' },
  { id: 'bm-ch-74',  lat: -6.16524166, lng: 105.85449908, name: 'Jembatan Tawing', city: 'Cilegon', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/4/index.m3u8' },
  { id: 'bm-ch-75',  lat: -6.16378566, lng: 106.65698300, name: 'Jembatan Batuceper', city: 'Tangerang', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/7/index.m3u8' },
  { id: 'bm-ch-76',  lat: -8.09480414, lng: 111.74495446, name: 'Jembatan Munjungan', city: 'Trenggalek', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/39/index.m3u8' },
  { id: 'bm-ch-77',  lat: -8.18699358, lng: 113.74692200, name: 'Jembatan Wirolegi', city: 'Jember', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/40/index.m3u8' },
  { id: 'bm-ch-78',  lat: -7.16315007, lng: 108.99299200, name: 'Jembatan Pedes', city: 'Brebes', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/38/index.m3u8' },
  { id: 'bm-ch-79',  lat: -6.28293772, lng: 107.82202800, name: 'Jembatan Cigadung', city: 'Subang', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/36/index.m3u8' },
  { id: 'bm-ch-80',  lat: -6.36983443, lng: 107.54910637, name: 'Jembatan Cilamaya', city: 'Karawang', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/34/index.m3u8' },
  { id: 'bm-ch-82',  lat: -6.96018563, lng: 110.44079363, name: 'Jembatan Kalibanger', city: 'Semarang', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/37/index.m3u8' },
  { id: 'bm-ch-83',  lat: -6.28852840, lng: 107.79629400, name: 'Jembatan Cipangaritan', city: 'Subang', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/18/index.m3u8' },
  { id: 'bm-ch-84',  lat: -6.70054404, lng: 107.43553002, name: 'Jembatan Cisomang', city: 'Purwakarta', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/41/index.m3u8' },
  { id: 'bm-ch-85',  lat: -6.93264497, lng: 107.50571254, name: 'Jembatan Batujajar', city: 'Bandung Barat', stream_url: 'https://apps.ptbtu.com:8078/hls-proxy/35/index.m3u8' },
];

// ═══════════════════════════════════════════════
//  JAKARTA TOLL ROAD CAMERAS
//  Source: infotol.id (Jasa Marga, CCT Indonesia)
//  All stream URLs are exact from live pages.
//  Coordinates estimated from KM markers via road interpolation.
// ═══════════════════════════════════════════════

// ── JTC (Jakarta Dalam Kota) — 21 cameras ──
const JTC_CAMERAS: CameraEntry[] = [
  { id: 'jm-jtc-01', lat: 0, lng: 0, name: 'JTC KM 00+400 A', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/2/cae3d8a2-d644-4e71-9800-5e9e7a3d92e2/index.m3u8' },
  { id: 'jm-jtc-02', lat: 0, lng: 0, name: 'JTC KM 00+400 B', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/2/66ad87b4-756b-4b01-bb3b-4ca6d6f72fe3/index.m3u8' },
  { id: 'jm-jtc-03', lat: 0, lng: 0, name: 'JTC KM 00+400 | Cawang-Cililitan', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/2/3e0fe39b-c832-4780-b264-7fb3fa3c1f16/index.m3u8' },
  { id: 'jm-jtc-04', lat: 0, lng: 0, name: 'JTC KM 00+400 | Halim', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/2/3846c024-0a93-430f-b47d-ce29a851f3c6/index.m3u8' },
  { id: 'jm-jtc-05', lat: 0, lng: 0, name: 'JTC KM 00+700', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/2/c4fdc36f-b21b-422d-8a7c-69cfe036473d/index.m3u8' },
  { id: 'jm-jtc-06', lat: 0, lng: 0, name: 'JTC KM 02+100', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/2/8f14385e-748a-48ee-9b17-a26246aea373/index.m3u8' },
  { id: 'jm-jtc-07', lat: 0, lng: 0, name: 'JTC KM 03+800', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/2/beda9b4c-432e-48df-9757-fc01788c3475/index.m3u8' },
  { id: 'jm-jtc-08', lat: 0, lng: 0, name: 'JTC KM 05+000 A', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/2/9336f25a-4aea-4baf-9940-3f1dfe7c720c/index.m3u8' },
  { id: 'jm-jtc-09', lat: 0, lng: 0, name: 'JTC KM 05+000 B', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/2/93a8bf57-22c8-493b-9309-9879d613f575/index.m3u8' },
  { id: 'jm-jtc-10', lat: 0, lng: 0, name: 'JTC KM 06+000', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/2/f58d8e52-bf83-44df-a936-7be270b5a69f/index.m3u8' },
  { id: 'jm-jtc-11', lat: 0, lng: 0, name: 'JTC KM 07+000', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/2/95511b6c-3053-443f-ba5d-72496afee4a3/index.m3u8' },
  { id: 'jm-jtc-12', lat: 0, lng: 0, name: 'JTC KM 10+100', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/2/cb9e4793-7c45-4796-a7d9-6801ae7891ff/index.m3u8' },
  { id: 'jm-jtc-13', lat: 0, lng: 0, name: 'JTC KM 10+600', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/2/f78c8183-fc63-4460-8850-477af3b134eb/index.m3u8' },
  { id: 'jm-jtc-14', lat: 0, lng: 0, name: 'JTC KM 11+000', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/2/6ed62d27-930d-4ab3-824d-961086def7e3/index.m3u8' },
  { id: 'jm-jtc-15', lat: 0, lng: 0, name: 'JTC KM 12+000', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/2/da7d5391-4c0d-4d59-8553-9764deed6edf/index.m3u8' },
  { id: 'jm-jtc-16', lat: 0, lng: 0, name: 'JTC KM 13+200', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/2/f304652b-4502-48d1-8b57-5720dd5ffefa/index.m3u8' },
  { id: 'jm-jtc-17', lat: 0, lng: 0, name: 'JTC KM 14+000', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/2/93352138-d980-4930-a38e-cec7ac5af901/index.m3u8' },
  { id: 'jm-jtc-18', lat: 0, lng: 0, name: 'JTC KM 16+100', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/2/c88ddb55-98e9-4e4b-9841-4d2dae1cd0e8/index.m3u8' },
  { id: 'jm-jtc-19', lat: 0, lng: 0, name: 'JTC KM 17+000', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/2/eb21e77d-756a-49a5-b96d-b916813228ed/index.m3u8' },
  { id: 'jm-jtc-20', lat: 0, lng: 0, name: 'JTC KM 18+200', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/2/e7351e86-e117-436c-b20c-9bc15252587c/index.m3u8' },
  { id: 'jm-jtc-21', lat: 0, lng: 0, name: 'JTC KM 19+000', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/2/7168409d-9056-4cef-8401-e48dbfddf388/index.m3u8' },
];

// ── Jagorawi — 24 cameras ──
const JGW_CAMERAS: CameraEntry[] = [
  { id: 'jm-jgw-01', lat: -6.5953, lng: 106.8475, name: 'JAGORAWI BOGOR EXIT', city: 'Bogor', stream_url: 'https://jmlive.jasamarga.com/hls/1/f970e4d2-18bc-43d0-82c2-84d1f9c40620/index.m3u8' },
  { id: 'jm-jgw-02', lat: 0, lng: 0, name: 'JAGORAWI KM 04+500 | B', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/1/69676a83-18cb-4c66-a0eb-de046168625e/index.m3u8' },
  { id: 'jm-jgw-03', lat: 0, lng: 0, name: 'JAGORAWI KM 05+000 | B', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/1/1a32cda0-395b-4d9a-98c4-6e3c64095f42/index.m3u8' },
  { id: 'jm-jgw-04', lat: 0, lng: 0, name: 'JAGORAWI KM 05+500 | B', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/1/41dd9b40-690b-4658-a72b-a5d44e0c7c3c/index.m3u8' },
  { id: 'jm-jgw-05', lat: 0, lng: 0, name: 'JAGORAWI KM 06+000', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/1/9a30304d-3765-4c24-b9fd-5a5b6fa067db/index.m3u8' },
  { id: 'jm-jgw-06', lat: 0, lng: 0, name: 'JAGORAWI KM 07+000 | B', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/1/a409d5f2-9b6d-4dd0-8ff7-3b8d07066782/index.m3u8' },
  { id: 'jm-jgw-07', lat: 0, lng: 0, name: 'JAGORAWI KM 08+000 | B', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/1/c8e82f89-7212-4440-ac32-8dab22cdda29/index.m3u8' },
  { id: 'jm-jgw-08', lat: 0, lng: 0, name: 'JAGORAWI KM 09+200 | B', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/1/1a52e0ea-3ce2-4f2d-bc3b-038aadec14f0/index.m3u8' },
  { id: 'jm-jgw-09', lat: 0, lng: 0, name: 'JAGORAWI KM 10+350 | B', city: 'Cimanggis', stream_url: 'https://jmlive.jasamarga.com/hls/1/b3737911-fd82-48a1-bfcd-93293d732a9e/index.m3u8' },
  { id: 'jm-jgw-10', lat: 0, lng: 0, name: 'JAGORAWI KM 12+150', city: 'Cimanggis', stream_url: 'https://jmlive.jasamarga.com/hls/1/c16c4e6f-9d2e-41fb-815b-193c4b42cb5b/index.m3u8' },
  { id: 'jm-jgw-11', lat: 0, lng: 0, name: 'JAGORAWI KM 13+150 | B', city: 'Cimanggis', stream_url: 'https://jmlive.jasamarga.com/hls/1/b67a991d-eded-4cca-a840-10d7b973a6ab/index.m3u8' },
  { id: 'jm-jgw-12', lat: 0, lng: 0, name: 'JAGORAWI KM 14+000 | TUNNEL CBBR EXIT', city: 'Cibinong', stream_url: 'https://jmlive.jasamarga.com/hls/1/8d089608-46e4-47a5-8bf3-dc407756735a/index.m3u8' },
  { id: 'jm-jgw-13', lat: 0, lng: 0, name: 'JAGORAWI KM 14+500B', city: 'Cibinong', stream_url: 'https://jmlive.jasamarga.com/hls/1/cb5ee9d6-e5e8-462e-aa15-c55a2a562355/index.m3u8' },
  { id: 'jm-jgw-14', lat: 0, lng: 0, name: 'JAGORAWI KM 15+000 | A', city: 'Cibinong', stream_url: 'https://jmlive.jasamarga.com/hls/1/cca0ebe5-8693-4829-81b6-1cd6d4643c79/index.m3u8' },
  { id: 'jm-jgw-15', lat: 0, lng: 0, name: 'JAGORAWI KM 15+500 | B', city: 'Cibinong', stream_url: 'https://jmlive.jasamarga.com/hls/1/bdb0c9c8-6b9c-4f13-8d4e-4503c480768a/index.m3u8' },
  { id: 'jm-jgw-16', lat: 0, lng: 0, name: 'JAGORAWI KM 16+400', city: 'Cibinong', stream_url: 'https://jmlive.jasamarga.com/hls/1/348664cd-7969-4f49-b105-16effa80a924/index.m3u8' },
  { id: 'jm-jgw-17', lat: 0, lng: 0, name: 'JAGORAWI KM 16+400 | JPO RAFLES HILLS', city: 'Cibinong', stream_url: 'https://jmlive.jasamarga.com/hls/1/67d01609-df52-4cbf-8447-e483a9623d44/index.m3u8' },
  { id: 'jm-jgw-18', lat: 0, lng: 0, name: 'JAGORAWI KM 17+500', city: 'Citeureup', stream_url: 'https://jmlive.jasamarga.com/hls/1/f9dd06ae-f5e6-4f8e-901c-db8ea76d7367/index.m3u8' },
  { id: 'jm-jgw-19', lat: 0, lng: 0, name: 'JAGORAWI KM 18+400', city: 'Citeureup', stream_url: 'https://jmlive.jasamarga.com/hls/1/9404d205-0dd6-4ee4-a1c2-5f0026b2614a/index.m3u8' },
  { id: 'jm-jgw-20', lat: 0, lng: 0, name: 'JAGORAWI KM 19+600 | B', city: 'Citeureup', stream_url: 'https://jmlive.jasamarga.com/hls/1/d5a20179-4523-4783-a14a-98f3568e9b5d/index.m3u8' },
  { id: 'jm-jgw-21', lat: 0, lng: 0, name: 'JAGORAWI KM 24+000B | SS GUNUNG PUTRI', city: 'Bogor', stream_url: 'https://jmlive.jasamarga.com/hls/1/0b00d5db-8143-4700-88b5-d0afa8246a34/index.m3u8' },
  { id: 'jm-jgw-22', lat: 0, lng: 0, name: 'JAGORAWI KM 30+400 | B', city: 'Bogor', stream_url: 'https://jmlive.jasamarga.com/hls/1/aa7ceef5-e4a7-4bef-9f63-27fb183a9af1/index.m3u8' },
  { id: 'jm-jgw-23', lat: 0, lng: 0, name: 'JAGORAWI KM 38+400 | B', city: 'Bogor', stream_url: 'https://jmlive.jasamarga.com/hls/1/22a49d79-b2f9-46ea-addf-ee16edd420d0/index.m3u8' },
  { id: 'jm-jgw-24', lat: 0, lng: 0, name: 'JAGORAWI KM 45+000B', city: 'Ciawi', stream_url: 'https://jmlive.jasamarga.com/hls/1/d6de3a13-45a7-4404-885a-47657eea62df/index.m3u8' },
];

// ── Jakarta-Cikampek — 64 cameras ──
const CKP_CAMERAS: CameraEntry[] = [
  { id: 'jm-ckp-01', lat: 0, lng: 0, name: 'CIKAMPEK KM 01+000', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/5/59e300cc-f0ff-41ec-9578-8d931a7deb84/index.m3u8' },
  { id: 'jm-ckp-02', lat: 0, lng: 0, name: 'CIKAMPEK KM 03+000', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/5/1f52907c-e70d-4faf-9958-289dd49e425d/index.m3u8' },
  { id: 'jm-ckp-03', lat: 0, lng: 0, name: 'CIKAMPEK KM 04+000', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/5/8bd4f6b6-b4e6-4a3e-9cf1-dbb4903c7049/index.m3u8' },
  { id: 'jm-ckp-04', lat: 0, lng: 0, name: 'CIKAMPEK KM 05+000', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/5/0464493d-3fa6-4464-b3bc-fa9bccb4e820/index.m3u8' },
  { id: 'jm-ckp-05', lat: 0, lng: 0, name: 'CIKAMPEK KM 07+000', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/5/b2b5580c-ee3a-4166-95b9-2c3bbb25dcd4/index.m3u8' },
  { id: 'jm-ckp-06', lat: 0, lng: 0, name: 'CIKAMPEK KM 09+000', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/5/05a541fd-50ff-4fc6-8a50-48e70ad195d7/index.m3u8' },
  { id: 'jm-ckp-07', lat: 0, lng: 0, name: 'CIKAMPEK KM 11+000', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/5/677f5781-1203-43b2-8d8e-7e48ee265bd7/index.m3u8' },
  { id: 'jm-ckp-08', lat: -6.2585, lng: 106.9780, name: 'CIKAMPEK KM 12+600', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/5/e3c93f29-83f8-49d5-8b5f-a233d5b93949/index.m3u8' },
  { id: 'jm-ckp-09', lat: 0, lng: 0, name: 'CIKAMPEK KM 14+000', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/5/417261e4-44a4-4627-a4b2-f1b4034643e6/index.m3u8' },
  { id: 'jm-ckp-10', lat: 0, lng: 0, name: 'CIKAMPEK KM 18+000', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/5/0bbf01b5-c598-4d0a-ac96-cf54e2d8aa50/index.m3u8' },
  { id: 'jm-ckp-11', lat: 0, lng: 0, name: 'CIKAMPEK KM 20+000', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/5/c4315003-cda1-4013-9640-3966a9f30c96/index.m3u8' },
  { id: 'jm-ckp-12', lat: 0, lng: 0, name: 'CIKAMPEK KM 22+000', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/5/ee523dc9-053d-4088-b0f6-ed0b42fde5ca/index.m3u8' },
  { id: 'jm-ckp-13', lat: 0, lng: 0, name: 'CIKAMPEK KM 24+000', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/5/7d9a4751-92a2-4205-b8b0-76aa492e7d5f/index.m3u8' },
  { id: 'jm-ckp-14', lat: 0, lng: 0, name: 'CIKAMPEK KM 26+000', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/5/3041036d-f9fe-4f48-897c-472d336e65d4/index.m3u8' },
  { id: 'jm-ckp-15', lat: 0, lng: 0, name: 'CIKAMPEK KM 28+000', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/5/19a29af0-9bd8-48a7-a6f7-ddb111ca312e/index.m3u8' },
  { id: 'jm-ckp-16', lat: 0, lng: 0, name: 'CIKAMPEK KM 31+000 | CIKARANG BARAT', city: 'Cikarang', stream_url: 'https://jmlive.jasamarga.com/hls/5/613a48ca-9eef-439e-95df-fec87288f57d/index.m3u8' },
  { id: 'jm-ckp-17', lat: 0, lng: 0, name: 'CIKAMPEK KM 33+000', city: 'Cikarang', stream_url: 'https://jmlive.jasamarga.com/hls/5/81ab7606-5aad-4491-b0d6-445eb6543917/index.m3u8' },
  { id: 'jm-ckp-18', lat: 0, lng: 0, name: 'CIKAMPEK KM 35+000', city: 'Cikarang', stream_url: 'https://jmlive.jasamarga.com/hls/5/29f147d4-d769-4ef4-867d-519af7cd3875/index.m3u8' },
  { id: 'jm-ckp-19', lat: 0, lng: 0, name: 'CIKAMPEK (EWS) KM 35+000 B', city: 'Cikarang', stream_url: 'https://jmlive.jasamarga.com/hls/5/a414daa4-f93f-4503-b61a-17a9fe78f16c/index.m3u8' },
  { id: 'jm-ckp-20', lat: 0, lng: 0, name: 'CIKAMPEK KM 37+000', city: 'Cikarang', stream_url: 'https://jmlive.jasamarga.com/hls/5/86497250-8d04-44d4-91e6-3597291e7e21/index.m3u8' },
  { id: 'jm-ckp-21', lat: 0, lng: 0, name: 'CIKAMPEK KM 38+000', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/5/d368ef35-d259-499c-a4fc-57dffbe9f839/index.m3u8' },
  { id: 'jm-ckp-22', lat: 0, lng: 0, name: 'CIKAMPEK KM 40+500', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/5/0a4a96e4-ef36-44eb-b52e-27342a15f5e9/index.m3u8' },
  { id: 'jm-ckp-23', lat: 0, lng: 0, name: 'CIKAMPEK KM 42+000', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/5/53383d51-3a8b-4852-8a7a-c85869f66194/index.m3u8' },
  { id: 'jm-ckp-24', lat: 0, lng: 0, name: 'CIKAMPEK KM 44+000', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/5/4f2c8fcb-b1d6-4445-8e52-e0eaad47f341/index.m3u8' },
  { id: 'jm-ckp-25', lat: 0, lng: 0, name: 'CIKAMPEK KM 47+200', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/5/21ad3cdd-6c48-4815-8dd5-71b9bfa02e98/index.m3u8' },
  { id: 'jm-ckp-26', lat: 0, lng: 0, name: 'CIKAMPEK KM 49+000', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/5/625b37ff-57c1-4c90-8304-f285b1e832fa/index.m3u8' },
  { id: 'jm-ckp-27', lat: 0, lng: 0, name: 'CIKAMPEK KM 49+000 Median (Surv)', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/5/535b4d5b-438d-4efc-b529-2926b384f775/index.m3u8' },
  { id: 'jm-ckp-28', lat: 0, lng: 0, name: 'CIKAMPEK KM 51+000', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/5/b8e53921-e5f8-43e0-b666-68aef8af590b/index.m3u8' },
  { id: 'jm-ckp-29', lat: 0, lng: 0, name: 'CIKAMPEK KM 53+000', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/5/69a8e357-38bb-446a-9fd8-63f05319f5f2/index.m3u8' },
  { id: 'jm-ckp-30', lat: 0, lng: 0, name: 'CIKAMPEK KM 54+300', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/5/e5501779-5340-4f01-b042-0bd2b4ce7d23/index.m3u8' },
  { id: 'jm-ckp-31', lat: 0, lng: 0, name: 'CIKAMPEK KM 56+000', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/5/2e1e6993-d973-4475-984d-a8609d225d33/index.m3u8' },
  { id: 'jm-ckp-32', lat: 0, lng: 0, name: 'CIKAMPEK KM 58+000', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/5/c690af10-c80c-4bad-80de-ca9a66702a5e/index.m3u8' },
  { id: 'jm-ckp-33', lat: 0, lng: 0, name: 'CIKAMPEK KM 60+000', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/5/8df66c66-85d2-4487-8314-b4c1da490f02/index.m3u8' },
  { id: 'jm-ckp-34', lat: 0, lng: 0, name: 'CIKAMPEK KM 62+000', city: 'Cikampek', stream_url: 'https://jmlive.jasamarga.com/hls/5/c0a65ce8-2e72-4b78-9877-9d3c9c407501/index.m3u8' },
  { id: 'jm-ckp-35', lat: 0, lng: 0, name: 'CIKAMPEK KM 62+200', city: 'Cikampek', stream_url: 'https://jmlive.jasamarga.com/hls/5/7b284460-fe33-48c1-b1b1-6f971f383939/index.m3u8' },
  { id: 'jm-ckp-36', lat: 0, lng: 0, name: 'CIKAMPEK KM 64+000', city: 'Cikampek', stream_url: 'https://jmlive.jasamarga.com/hls/5/9ab4193c-68fb-49b0-89ad-8deece874da9/index.m3u8' },
  { id: 'jm-ckp-37', lat: 0, lng: 0, name: 'CIKAMPEK KM 66+000', city: 'Cikampek', stream_url: 'https://jmlive.jasamarga.com/hls/5/9cc027b7-78b6-403f-b516-cb407b1c96f1/index.m3u8' },
  { id: 'jm-ckp-38', lat: 0, lng: 0, name: 'CIKAMPEK KM 67+000', city: 'Cikampek', stream_url: 'https://jmlive.jasamarga.com/hls/5/33f64813-22e9-4e97-ad55-1d0f0240fe9e/index.m3u8' },
  { id: 'jm-ckp-39', lat: -6.4000, lng: 107.5050, name: 'CIKAMPEK KM 67+200 | DAWUAN', city: 'Cikampek', stream_url: 'https://jmlive.jasamarga.com/hls/5/0e706f3c-7507-4c55-a705-b61dcb39eaff/index.m3u8' },
  { id: 'jm-ckp-40', lat: 0, lng: 0, name: 'CIKAMPEK KM 68+000', city: 'Cikampek', stream_url: 'https://jmlive.jasamarga.com/hls/5/81395293-9c9a-439e-adb3-62c600097979/index.m3u8' },
  { id: 'jm-ckp-41', lat: 0, lng: 0, name: 'CIKAMPEK KM 69+000', city: 'Cikampek', stream_url: 'https://jmlive.jasamarga.com/hls/5/a143cb9e-86d4-4b40-a29b-cf6899038efa/index.m3u8' },
  { id: 'jm-ckp-42', lat: 0, lng: 0, name: 'CIKAMPEK KM 71+000', city: 'Cikampek', stream_url: 'https://jmlive.jasamarga.com/hls/5/bc4077f9-c44f-4a3b-aa32-8ad643389218/index.m3u8' },
  { id: 'jm-ckp-43', lat: -6.4130, lng: 107.4600, name: 'CIKAMPEKKM 72+000', city: 'Cikampek', stream_url: 'https://jmlive.jasamarga.com/hls/5/576f4db9-3ea0-4194-8a12-33b0d61da145/index.m3u8' },
  { id: 'jm-ckp-44', lat: -6.2560, lng: 106.9720, name: 'CIKAMPEK Cikatama 1 ROW', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/5/4e905fc9-c066-4979-9be5-7cd55f459c21/index.m3u8' },
  { id: 'jm-ckp-45', lat: -6.2580, lng: 106.9780, name: 'CIKAMPEK CIKATAMA 3 SATELITE', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/5/fe620a27-f230-4e32-acfa-edf2aafd8b8e/index.m3u8' },
  { id: 'jm-ckp-46', lat: -6.2580, lng: 106.9800, name: 'CIKAMPEK CIKATAMA 4 SATELITE', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/5/4c11346c-0db0-49ea-aaac-e9b85bc3ef61/index.m3u8' },
  { id: 'jm-ckp-47', lat: -6.2580, lng: 106.9820, name: 'CIKAMPEK CIKATAMA 5 SATELITE', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/5/c23d0d00-5516-4c12-b251-2bc3472e82b8/index.m3u8' },
  { id: 'jm-ckp-48', lat: -6.2580, lng: 106.9840, name: 'CIKAMPEK CIKATAMA 6 SATELITE', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/5/9af2a74c-5175-495b-ad3e-e1ca94a223a8/index.m3u8' },
  { id: 'jm-ckp-49', lat: -6.2580, lng: 106.9700, name: 'CIKAMPEK CIKATAMA TOWER', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/5/86f3cdff-2bf2-4ebd-abf7-fb04272ac80c/index.m3u8' },
  { id: 'jm-ckp-50', lat: -6.2800, lng: 107.1800, name: 'CIKAMPEK GT CIBITUNG 8', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/5/6bc091b7-57d9-46d0-9241-8a972433cfb8/index.m3u8' },
  { id: 'jm-ckp-51', lat: -6.4020, lng: 107.4550, name: 'CIKAMPEK GT CIKAMPEK TOWER', city: 'Cikampek', stream_url: 'https://jmlive.jasamarga.com/hls/5/d839d840-4245-42b2-9ab4-f9271c220f3a/index.m3u8' },
  { id: 'jm-ckp-52', lat: -6.4020, lng: 107.4550, name: 'CIKAMPEK GT CIKAMPEK UTAMA 2', city: 'Cikampek', stream_url: 'https://jmlive.jasamarga.com/hls/5/efcd16c1-e26e-47d6-99fc-ff71292304e5/index.m3u8' },
  { id: 'jm-ckp-53', lat: -6.4020, lng: 107.4550, name: 'CIKAMPEK GT UTAMA 1', city: 'Cikampek', stream_url: 'https://jmlive.jasamarga.com/hls/5/5e3d9eda-c6af-471c-9e8b-df38d1b6ce92/index.m3u8' },
  { id: 'jm-ckp-54', lat: -6.2800, lng: 107.1800, name: 'CIKAMPEK GT. CIBITUNG 3', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/5/55317e4d-768e-402e-afb2-b7d9548c8b59/index.m3u8' },
  { id: 'jm-ckp-55', lat: -6.2680, lng: 107.0820, name: 'CIKAMPEK GT. CKR BRT 3 ENTR', city: 'Cikarang', stream_url: 'https://jmlive.jasamarga.com/hls/5/1a97de8e-b8d4-460a-aa37-1398c565cf1d/index.m3u8' },
  { id: 'jm-ckp-56', lat: -6.2680, lng: 107.0820, name: 'CIKAMPEK GT. CKR BRT 4 ENTR', city: 'Cikarang', stream_url: 'https://jmlive.jasamarga.com/hls/5/7a2c1691-7258-4e96-81b0-6f42382ab4f2/index.m3u8' },
  { id: 'jm-ckp-57', lat: -6.2680, lng: 107.0820, name: 'CIKAMPEK GT. CKR BRT 5 ENTR', city: 'Cikarang', stream_url: 'https://jmlive.jasamarga.com/hls/5/b0b1e2ba-5acd-445a-901f-ea24b4c18997/index.m3u8' },
  { id: 'jm-ckp-58', lat: -6.2440, lng: 106.8720, name: 'CIKAMPEK GT. KALIHURIP 1', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/5/b9ce7f65-5c7a-461e-9a99-7a1fbde7d410/index.m3u8' },
  { id: 'jm-ckp-59', lat: -6.2440, lng: 106.8720, name: 'CIKAMPEK GT. KALIHURIP 2', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/5/b38d6dd4-ef00-4a55-add4-583a9f6871cc/index.m3u8' },
  { id: 'jm-ckp-60', lat: -6.2400, lng: 106.8700, name: 'CIKAMPEK GT. PGB 1', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/5/668f2bbb-b8b0-4e06-a342-8de224e17036/index.m3u8' },
  { id: 'jm-ckp-61', lat: -6.2400, lng: 106.8700, name: 'CIKAMPEK GT. PGB 2', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/5/614d3a74-192e-482c-9e7a-7cff12bf9d1f/index.m3u8' },
  { id: 'jm-ckp-62', lat: -6.4000, lng: 107.5000, name: 'CIKAMPEK SURVEILLANCE', city: 'Cikampek', stream_url: 'https://jmlive.jasamarga.com/hls/5/f4b3889c-c5ca-496b-9340-3db49e8bf015/index.m3u8' },
  { id: 'jm-ckp-63', lat: -6.3300, lng: 107.7900, name: 'CIPULARANG REST AREA KM 88A COUNT IN', city: 'Subang', stream_url: 'https://jmlive.jasamarga.com/hls/5/96d3f43a-d7f2-4c47-a5a2-0efba714bc80/index.m3u8' },
  { id: 'jm-ckp-64', lat: -6.3300, lng: 107.7900, name: 'CIPULARANG REST AREA KM 88A COUNT OUT', city: 'Subang', stream_url: 'https://jmlive.jasamarga.com/hls/5/128dc053-0d5d-4994-a7c1-b45273c60413/index.m3u8' },
];

// ── Jakarta-Tangerang — 11 cameras ──
const JGR_CAMERAS: CameraEntry[] = [
  { id: 'jm-jgr-01', lat: -6.1780, lng: 106.7000, name: 'JANGER GT. MERUYA 2', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/4/f7af8422-0ee7-40a9-85c2-640ed7d444dc/index.m3u8' },
  { id: 'jm-jgr-02', lat: 0, lng: 0, name: 'JANGER KM 00+600', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/4/cad4d026-76ec-438e-b065-7aa357c7f2ca/index.m3u8' },
  { id: 'jm-jgr-03', lat: 0, lng: 0, name: 'JANGER KM 04+600', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/4/8f288ff0-0a6d-494d-89c3-ad6420c5c09c/index.m3u8' },
  { id: 'jm-jgr-04', lat: 0, lng: 0, name: 'JANGER KM 07+200', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/4/f777f92c-be7c-4a0b-94aa-d2dcee6759d6/index.m3u8' },
  { id: 'jm-jgr-05', lat: 0, lng: 0, name: 'JANGER KM 10+600', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/4/70fbe9ef-37dc-4b63-9061-9def00685476/index.m3u8' },
  { id: 'jm-jgr-06', lat: 0, lng: 0, name: 'JANGER KM 11+600', city: 'Tangerang', stream_url: 'https://jmlive.jasamarga.com/hls/4/2a35fba9-4564-4419-a86b-973a97ce7ca5/index.m3u8' },
  { id: 'jm-jgr-07', lat: 0, lng: 0, name: 'JANGER KM 13+600', city: 'Tangerang', stream_url: 'https://jmlive.jasamarga.com/hls/4/3bb62f75-f1f8-4968-813f-a198beeb0c91/index.m3u8' },
  { id: 'jm-jgr-08', lat: 0, lng: 0, name: 'JANGER KM 15+500', city: 'Tangerang', stream_url: 'https://jmlive.jasamarga.com/hls/4/983614dc-f186-4f9c-8e85-27c26c3cbb9c/index.m3u8' },
  { id: 'jm-jgr-09', lat: 0, lng: 0, name: 'JANGER KM 17+600', city: 'Tangerang', stream_url: 'https://jmlive.jasamarga.com/hls/4/1f7b417b-12c3-4a9c-867c-1120a790c8f9/index.m3u8' },
  { id: 'jm-jgr-10', lat: 0, lng: 0, name: 'JANGER KM 19+300', city: 'Tangerang', stream_url: 'https://jmlive.jasamarga.com/hls/4/9bbaeb69-9e52-4d33-b9a8-42f8ad96362f/index.m3u8' },
  { id: 'jm-jgr-11', lat: 0, lng: 0, name: 'JANGER KM 25+500', city: 'Tangerang', stream_url: 'https://jmlive.jasamarga.com/hls/4/08419ad7-d07e-4d7c-96f2-9715cd3f4290/index.m3u8' },
];

// ── JORR E — 23 cameras ──
const JORE_CAMERAS: CameraEntry[] = [
  { id: 'jm-jore-01', lat: 0, lng: 0, name: 'JORR E KM 34+800', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/8/5297cb25-b8a1-4ad6-a597-f116d82f84de/index.m3u8' },
  { id: 'jm-jore-02', lat: 0, lng: 0, name: 'JORR E KM 35+600', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/8/35418eb2-4dec-4f8a-9c4d-b24c38e72330/index.m3u8' },
  { id: 'jm-jore-03', lat: 0, lng: 0, name: 'JORR E KM 36+000', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/8/e6a9ef55-9f14-4f20-8138-85ff18782491/index.m3u8' },
  { id: 'jm-jore-04', lat: 0, lng: 0, name: 'JORR E KM 37+000', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/8/26a7d2a0-af99-41ea-b31e-18baef1d40ac/index.m3u8' },
  { id: 'jm-jore-05', lat: 0, lng: 0, name: 'JORR E KM 38+000', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/8/71e5a844-7863-4427-b918-e118f6463bde/index.m3u8' },
  { id: 'jm-jore-06', lat: 0, lng: 0, name: 'JORR E KM 39+400', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/8/7d8d2bbe-92f7-4804-9724-ee8a7ebf8482/index.m3u8' },
  { id: 'jm-jore-07', lat: 0, lng: 0, name: 'JORR E KM 40+000', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/8/4c4de27a-a4be-4823-9364-76f90a67ce29/index.m3u8' },
  { id: 'jm-jore-08', lat: 0, lng: 0, name: 'JORR E KM 41+000', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/8/f009d373-df06-452e-8ceb-5447295f801e/index.m3u8' },
  { id: 'jm-jore-09', lat: 0, lng: 0, name: 'JORR E KM 42+000', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/8/501e4819-4e96-4623-ae0c-[REDACTED]c1/index.m3u8' },
  { id: 'jm-jore-10', lat: 0, lng: 0, name: 'JORR E KM 43+000', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/8/2cf34c8d-69b2-445b-9368-65660719f251/index.m3u8' },
  { id: 'jm-jore-11', lat: 0, lng: 0, name: 'JORR E KM 44+050', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/8/d1d49d87-0c37-4db7-b3cc-37a00b0f811e/index.m3u8' },
  { id: 'jm-jore-12', lat: 0, lng: 0, name: 'JORR E KM 45+700', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/8/e47ef9ec-872b-438a-9206-b7f15030e226/index.m3u8' },
  { id: 'jm-jore-13', lat: 0, lng: 0, name: 'JORR E KM 46+500', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/8/a9d39a2f-417f-4a59-99fc-c9c9d2e46289/index.m3u8' },
  { id: 'jm-jore-14', lat: 0, lng: 0, name: 'JORR E KM 47+200', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/8/97066214-a2b7-4916-951a-04b6acf55519/index.m3u8' },
  { id: 'jm-jore-15', lat: 0, lng: 0, name: 'JORR E KM 48+000', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/8/22a4a533-7cfb-43bb-a998-5e8d5bd78cd3/index.m3u8' },
  { id: 'jm-jore-16', lat: 0, lng: 0, name: 'JORR E KM 49+000', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/8/bdc40568-885d-4317-9afd-b42ff004feae/index.m3u8' },
  { id: 'jm-jore-17', lat: 0, lng: 0, name: 'JORR E KM 51+000', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/8/ac0586fd-9e46-4f3c-9d07-e47a846fd079/index.m3u8' },
  { id: 'jm-jore-18', lat: 0, lng: 0, name: 'JORR E KM 52+000', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/8/766452bd-2dfd-4997-bad8-0f0bdbc056ba/index.m3u8' },
  { id: 'jm-jore-19', lat: 0, lng: 0, name: 'JORR E KM 53+000', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/8/0ca389a7-338b-4f68-8bf6-8ff34647dfae/index.m3u8' },
  { id: 'jm-jore-20', lat: 0, lng: 0, name: 'JORR E KM 54+000', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/8/766ad459-0e53-47d0-a3c1-734a1bf828f7/index.m3u8' },
  { id: 'jm-jore-21', lat: 0, lng: 0, name: 'JORR E KM 55+500', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/8/600e6c22-80ae-4f07-8362-1ca3baf9ac6f/index.m3u8' },
  { id: 'jm-jore-22', lat: 0, lng: 0, name: 'JORR E KM 56+500', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/8/f49038bd-39a5-4a27-a3fd-b7bddcda00ee/index.m3u8' },
  { id: 'jm-jore-23', lat: 0, lng: 0, name: 'JORR E KM 57+000', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/8/ec772a8f-3812-4212-9e64-9e0dcce15658/index.m3u8' },
];

// ── MBZ (Jalan Layang MBZ) — 48 cameras ──
const MBZ_CAMERAS: CameraEntry[] = [
  { id: 'jm-mbz-01', lat: 0, lng: 0, name: '(MBZ) KM 10+000 | B L', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/29/45198e61-d334-400a-8931-507b66a71344/index.m3u8' },
  { id: 'jm-mbz-02', lat: 0, lng: 0, name: '(MBZ) KM 10+500 | A L', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/29/4ba500c4-0396-4f03-935c-aff93765800e/index.m3u8' },
  { id: 'jm-mbz-03', lat: 0, lng: 0, name: '(MBZ) KM 11+000 L', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/29/68c4e958-7494-43fd-8ce0-36dce26e5f04/index.m3u8' },
  { id: 'jm-mbz-04', lat: 0, lng: 0, name: '(MBZ) KM 12+000 L', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/29/b3113c9a-7fc9-4a59-a583-5726f0d06bf6/index.m3u8' },
  { id: 'jm-mbz-05', lat: 0, lng: 0, name: '(MBZ) KM 13+000 L', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/29/1121b6a4-374b-47ef-a515-a71fca1c8103/index.m3u8' },
  { id: 'jm-mbz-06', lat: 0, lng: 0, name: '(MBZ) KM 14+000 L', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/29/45420ada-a78c-408b-afb6-abb6556a4a94/index.m3u8' },
  { id: 'jm-mbz-07', lat: 0, lng: 0, name: '(MBZ) KM 15+000 L', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/29/7d5dd0e2-db2a-454d-8609-ac741b23e408/index.m3u8' },
  { id: 'jm-mbz-08', lat: 0, lng: 0, name: '(MBZ) KM 16+000 L', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/29/2bbe647e-0e5e-4c42-b604-0ae3ebbc4edf/index.m3u8' },
  { id: 'jm-mbz-09', lat: 0, lng: 0, name: '(MBZ) KM 17+000 L', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/29/0371d337-bcc7-4dd2-b92e-d8ecc9fce2c7/index.m3u8' },
  { id: 'jm-mbz-10', lat: 0, lng: 0, name: '(MBZ) KM 18+000 L', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/29/cb2382d6-9656-4330-a6bb-c1980407ad32/index.m3u8' },
  { id: 'jm-mbz-11', lat: 0, lng: 0, name: '(MBZ) KM 19+000 L', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/29/05e77463-5ab2-44d3-a484-33b421056fdb/index.m3u8' },
  { id: 'jm-mbz-12', lat: 0, lng: 0, name: '(MBZ) KM 20+000 L', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/29/f13b0b39-6c0c-44ed-bc69-ca782840233b/index.m3u8' },
  { id: 'jm-mbz-13', lat: 0, lng: 0, name: '(MBZ) KM 21+000 L', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/29/518a071a-7ca2-4157-af73-e945fce7e977/index.m3u8' },
  { id: 'jm-mbz-14', lat: 0, lng: 0, name: '(MBZ) KM 22+000 L', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/29/e4c31249-c6d3-4d9d-929b-d50509fecc6a/index.m3u8' },
  { id: 'jm-mbz-15', lat: 0, lng: 0, name: '(MBZ) KM 23+000 L', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/29/f2ad19c2-d5d5-4870-8385-34d5e62b4c7c/index.m3u8' },
  { id: 'jm-mbz-16', lat: 0, lng: 0, name: '(MBZ) KM 24+000 L', city: 'Cikarang', stream_url: 'https://jmlive.jasamarga.com/hls/29/93beb253-63d5-47d6-ba84-301d02cf2666/index.m3u8' },
  { id: 'jm-mbz-17', lat: 0, lng: 0, name: '(MBZ) KM 25+000 L', city: 'Cikarang', stream_url: 'https://jmlive.jasamarga.com/hls/29/77a62eec-9794-45a0-8762-294cbad8cd80/index.m3u8' },
  { id: 'jm-mbz-18', lat: 0, lng: 0, name: '(MBZ) KM 26+000 L', city: 'Cikarang', stream_url: 'https://jmlive.jasamarga.com/hls/29/029d4b49-58d1-4983-a3bf-63b40fbf8833/index.m3u8' },
  { id: 'jm-mbz-19', lat: 0, lng: 0, name: '(MBZ) KM 27+000 L', city: 'Cikarang', stream_url: 'https://jmlive.jasamarga.com/hls/29/500a63be-bb83-4111-a50c-d84b649f4a76/index.m3u8' },
  { id: 'jm-mbz-20', lat: 0, lng: 0, name: '(MBZ) KM 28+000 L', city: 'Cikarang', stream_url: 'https://jmlive.jasamarga.com/hls/29/f43f1894-0193-40b7-b8e5-f57a69468373/index.m3u8' },
  { id: 'jm-mbz-21', lat: 0, lng: 0, name: '(MBZ) KM 29+000 L', city: 'Cikarang', stream_url: 'https://jmlive.jasamarga.com/hls/29/a53903c4-f97b-4910-98d3-5d1c2c70193b/index.m3u8' },
  { id: 'jm-mbz-22', lat: 0, lng: 0, name: '(MBZ) KM 30+000 L', city: 'Cikarang', stream_url: 'https://jmlive.jasamarga.com/hls/29/3e06a2c5-44af-49c2-8434-d29fcdecea3b/index.m3u8' },
  { id: 'jm-mbz-23', lat: 0, lng: 0, name: '(MBZ) KM 31+000 L', city: 'Cikarang', stream_url: 'https://jmlive.jasamarga.com/hls/29/1522dadd-4a82-4ef3-ac84-cf15b529d4e0/index.m3u8' },
  { id: 'jm-mbz-24', lat: 0, lng: 0, name: '(MBZ) KM 32+000 L', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/29/9840fddb-26b5-429b-a624-bd852e89216f/index.m3u8' },
  { id: 'jm-mbz-25', lat: 0, lng: 0, name: '(MBZ) KM 33+000 L', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/29/b037b32c-79fa-4231-b5b4-8c1d4bf6e687/index.m3u8' },
  { id: 'jm-mbz-26', lat: 0, lng: 0, name: '(MBZ) KM 34+000 L', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/29/998f9349-89f4-46ad-b4f7-2a31d84732cd/index.m3u8' },
  { id: 'jm-mbz-27', lat: 0, lng: 0, name: '(MBZ) KM 35+000 L', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/29/26aafc03-b135-4418-a4fa-5689211dc0f7/index.m3u8' },
  { id: 'jm-mbz-28', lat: 0, lng: 0, name: '(MBZ) KM 36+000 L', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/29/e42c4ff7-7a9d-4fa5-95a8-e42577009389/index.m3u8' },
  { id: 'jm-mbz-29', lat: 0, lng: 0, name: '(MBZ) KM 37+000 L', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/29/aa55089b-33e7-492f-925d-663d93ea9ace/index.m3u8' },
  { id: 'jm-mbz-30', lat: 0, lng: 0, name: '(MBZ) KM 38+000 L', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/29/5f701283-c849-4256-8503-304a876d1622/index.m3u8' },
  { id: 'jm-mbz-31', lat: 0, lng: 0, name: '(MBZ) KM 39+000 | A L', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/29/3ffa727d-9603-4f36-97be-72b3492368cb/index.m3u8' },
  { id: 'jm-mbz-32', lat: 0, lng: 0, name: '(MBZ) KM 39+000 | B L', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/29/f8fe3e17-144d-4d19-8864-5ed3283d90c4/index.m3u8' },
  { id: 'jm-mbz-33', lat: 0, lng: 0, name: '(MBZ) KM 40+000 L', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/29/a97ed5d7-f539-4509-9a2b-30afa876557a/index.m3u8' },
  { id: 'jm-mbz-34', lat: 0, lng: 0, name: '(MBZ) KM 40+000 | A L', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/29/c854e453-a110-493d-bee2-466228d74430/index.m3u8' },
  { id: 'jm-mbz-35', lat: 0, lng: 0, name: '(MBZ) KM 41+000 | A L', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/29/69a9b9c4-16e5-4a71-b809-69edc6595fc4/index.m3u8' },
  { id: 'jm-mbz-36', lat: 0, lng: 0, name: '(MBZ) KM 41+000 | B L', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/29/b0914ae3-8e3d-4cec-846d-d02950ba18ad/index.m3u8' },
  { id: 'jm-mbz-37', lat: 0, lng: 0, name: '(MBZ) KM 42+000 | A L', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/29/a51ead50-965b-4fbd-be05-33f791cb6c9a/index.m3u8' },
  { id: 'jm-mbz-38', lat: 0, lng: 0, name: '(MBZ) KM 42+000 | B L', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/29/1e0b38b5-b2b1-4fca-9c72-a3326ef43125/index.m3u8' },
  { id: 'jm-mbz-39', lat: 0, lng: 0, name: '(MBZ) KM 43+000 | A L', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/29/83d33e19-cf5d-49fe-9e4c-5edbd26d2017/index.m3u8' },
  { id: 'jm-mbz-40', lat: 0, lng: 0, name: '(MBZ) KM 43+000 | B L', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/29/a0dbe538-d543-46f8-b727-17ede2b3683f/index.m3u8' },
  { id: 'jm-mbz-41', lat: 0, lng: 0, name: '(MBZ) KM 44+000 | A L', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/29/cae9fd5a-ccce-43f5-b9be-699c99b96b7f/index.m3u8' },
  { id: 'jm-mbz-42', lat: 0, lng: 0, name: '(MBZ) KM 44+000 | B L', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/29/fd57dfd9-dbb5-449c-ac9a-e702261f37f8/index.m3u8' },
  { id: 'jm-mbz-43', lat: 0, lng: 0, name: '(MBZ) KM 45+000 | A L', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/29/0d350a52-95ef-43eb-a281-eb1903abfa49/index.m3u8' },
  { id: 'jm-mbz-44', lat: 0, lng: 0, name: '(MBZ) KM 46+000 | A L', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/29/53a88fc5-38d9-489f-a989-325eb12d6415/index.m3u8' },
  { id: 'jm-mbz-45', lat: 0, lng: 0, name: '(MBZ) KM 46+000 | B L', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/29/71d62e23-8af5-4c37-8f23-76f029d11f8a/index.m3u8' },
  { id: 'jm-mbz-46', lat: 0, lng: 0, name: '(MBZ) KM 47+000 | A L', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/29/98a0a165-817c-4aed-9014-b0cec9dcc224/index.m3u8' },
  { id: 'jm-mbz-47', lat: 0, lng: 0, name: '(MBZ) KM 47+000 | B L', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/29/c046bc04-aced-4350-ac26-895a09d171f5/index.m3u8' },
  { id: 'jm-mbz-48', lat: 0, lng: 0, name: '(MBZ) KM 48+000 | B L', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/29/76b5fde3-2b9e-4d1d-86e6-51f282559d15/index.m3u8' },
  { id: 'jm-mbz-49', lat: -6.2580, lng: 106.9750, name: '(MBZ) OFF RAMP ARAH CIKUNIR 6 JALUR B', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/29/0827ae32-8b92-493a-b933-1c3f0999e97f/index.m3u8' },
  { id: 'jm-mbz-50', lat: -6.2560, lng: 106.9750, name: '(MBZ) ON RAMP JATI ASIH 2 JALUR A', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/29/eaa7bf83-c25f-4a3b-b7a2-ec959d95b711/index.m3u8' },
  { id: 'jm-mbz-51', lat: -6.2560, lng: 106.9750, name: '(MBZ) ON RAMP JATI ASIH 4 JALUR A', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/29/93ac9483-cab2-4129-900d-c6e522f8fd87/index.m3u8' },
  { id: 'jm-mbz-52', lat: -6.2560, lng: 106.9750, name: '(MBZ) ON RAMP PERTEMUAN JALUR A', city: 'Bekasi', stream_url: 'https://jmlive.jasamarga.com/hls/29/6ac09dcf-49a9-4e0c-a352-78d29e240375/index.m3u8' },
  { id: 'jm-mbz-53', lat: -6.3200, lng: 107.3200, name: '(MBZ) PARKING BAY KM 40+000 L JALUR B', city: 'Karawang', stream_url: 'https://jmlive.jasamarga.com/hls/29/9fd46f06-1958-4d4e-91d2-ad0939ae91d3/index.m3u8' },
];

// ── JORR S — 19 cameras (extstream.hk-opt2.com) ──
const JORS_CAMERAS: CameraEntry[] = [
  { id: 'cct-jors-01', lat: 0, lng: 0, name: '19+850', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/675323017321643087627650.m3u8' },
  { id: 'cct-jors-02', lat: 0, lng: 0, name: '20+300', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/977760504019242121012038.m3u8' },
  { id: 'cct-jors-03', lat: 0, lng: 0, name: '20+800', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/052053429007064876625130.m3u8' },
  { id: 'cct-jors-04', lat: 0, lng: 0, name: '21+300', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/743206696886685995011480.m3u8' },
  { id: 'cct-jors-05', lat: 0, lng: 0, name: '21+800', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/977787495230088227640516.m3u8' },
  { id: 'cct-jors-06', lat: 0, lng: 0, name: '22+400', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/269363542266933731794240.m3u8' },
  { id: 'cct-jors-07', lat: 0, lng: 0, name: '23+000', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/121810470572829194057319.m3u8' },
  { id: 'cct-jors-08', lat: 0, lng: 0, name: '23+200', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/271820726275436138198288.m3u8' },
  { id: 'cct-jors-09', lat: 0, lng: 0, name: '23+600', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/101502919369166746058073.m3u8' },
  { id: 'cct-jors-10', lat: 0, lng: 0, name: '24+000', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/222888349210580537521273.m3u8' },
  { id: 'cct-jors-11', lat: -6.2440, lng: 106.8400, name: 'JORRS GT AMPERA 1', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/314944433014333275671534.m3u8' },
  { id: 'cct-jors-12', lat: -6.2440, lng: 106.8400, name: 'JORRS GT AMPERA 2', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/645733666909706688403926.m3u8' },
  { id: 'cct-jors-13', lat: -6.2440, lng: 106.8600, name: 'JORRS GT DUKUH 1', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/464822683082385104405863.m3u8' },
  { id: 'cct-jors-14', lat: -6.2440, lng: 106.8150, name: 'JORRS GT FATMAWATI 2', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/837865507132921558450011.m3u8' },
  { id: 'cct-jors-15', lat: -6.2430, lng: 106.8550, name: 'JORRS GT GEDONG 2', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/420058855294412322884038.m3u8' },
  { id: 'cct-jors-16', lat: -6.2430, lng: 106.8700, name: 'JORRS GT KP RAMBUTAN', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/501026346597024351642009.m3u8' },
  { id: 'cct-jors-17', lat: -6.2440, lng: 106.8500, name: 'JORRS GT LENTENG 1', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/439272921460954347649828.m3u8' },
  { id: 'cct-jors-18', lat: -6.2440, lng: 106.8550, name: 'JORRS GT LENTENG AGUNG 2', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/720556408093325199948146.m3u8' },
  { id: 'cct-jors-19', lat: -6.2430, lng: 106.8650, name: 'JORRS Tunnel Pasar Rebo A', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/338106711025024740618299.m3u8' },
];

// ── Cimanggis-Cibitung — 24 cameras (streaming-cct.co.id) ──
const CMC_CAMERAS: CameraEntry[] = [
  { id: 'cct-cmc-01', lat: -6.3280, lng: 106.8620, name: 'GT Jatikarya 1', city: 'Bekasi', stream_url: 'https://streaming-cct.co.id/LiveApp/streams/395563568012170999809057.m3u8' },
  { id: 'cct-cmc-02', lat: -6.3280, lng: 106.8620, name: 'GT Jatikarya 2', city: 'Bekasi', stream_url: 'https://streaming-cct.co.id/LiveApp/streams/086623470392836343757862.m3u8' },
  { id: 'cct-cmc-03', lat: 0, lng: 0, name: 'KM 24+100', city: 'Bekasi', stream_url: 'https://streaming-cct.co.id/LiveApp/streams/862319596737576314743177.m3u8' },
  { id: 'cct-cmc-04', lat: 0, lng: 0, name: 'KM 25+000', city: 'Bekasi', stream_url: 'https://streaming-cct.co.id/LiveApp/streams/418964061815952674729554.m3u8' },
  { id: 'cct-cmc-05', lat: -6.3120, lng: 106.9150, name: 'KM 51+000', city: 'Bekasi', stream_url: 'https://streaming-cct.co.id/LiveApp/streams/418964061815952674729554.m3u8' },
  { id: 'cct-cmc-06', lat: 0, lng: 0, name: 'KM 53+400', city: 'Bekasi', stream_url: 'https://streaming-cct.co.id/LiveApp/streams/728033679170510237677933.m3u8' },
  { id: 'cct-cmc-07', lat: 0, lng: 0, name: 'KM 53+500', city: 'Bekasi', stream_url: 'https://streaming-cct.co.id/LiveApp/streams/728033679170510237677933.m3u8' },
  { id: 'cct-cmc-08', lat: 0, lng: 0, name: 'KM 54+000', city: 'Bekasi', stream_url: 'https://streaming-cct.co.id/LiveApp/streams/513568218162926065451774.m3u8' },
  { id: 'cct-cmc-09', lat: 0, lng: 0, name: 'KM 54+400', city: 'Bekasi', stream_url: 'https://streaming-cct.co.id/LiveApp/streams/042926552556500254096382.m3u8' },
  { id: 'cct-cmc-10', lat: 0, lng: 0, name: 'KM 55+000', city: 'Bekasi', stream_url: 'https://streaming-cct.co.id/LiveApp/streams/240320474473743062493512.m3u8' },
  { id: 'cct-cmc-11', lat: 0, lng: 0, name: 'KM 55+400', city: 'Bekasi', stream_url: 'https://streaming-cct.co.id/LiveApp/streams/419578865556916403624234.m3u8' },
  { id: 'cct-cmc-12', lat: 0, lng: 0, name: 'KM 55+650', city: 'Bekasi', stream_url: 'https://streaming-cct.co.id/LiveApp/streams/753814245775591052124656.m3u8' },
  { id: 'cct-cmc-13', lat: 0, lng: 0, name: 'KM 56+000', city: 'Bekasi', stream_url: 'https://streaming-cct.co.id/LiveApp/streams/808428562383454739684500.m3u8' },
  { id: 'cct-cmc-14', lat: 0, lng: 0, name: 'KM 59+400', city: 'Bekasi', stream_url: 'https://streaming-cct.co.id/LiveApp/streams/309234587115641908709722.m3u8' },
  { id: 'cct-cmc-15', lat: 0, lng: 0, name: 'KM 61+600', city: 'Bekasi', stream_url: 'https://streaming-cct.co.id/LiveApp/streams/859389239238521120834932.m3u8' },
  { id: 'cct-cmc-16', lat: 0, lng: 0, name: 'KM 64+400', city: 'Bekasi', stream_url: 'https://streaming-cct.co.id/LiveApp/streams/167013141883764986350307.m3u8' },
  { id: 'cct-cmc-17', lat: 0, lng: 0, name: 'KM 65+800', city: 'Bekasi', stream_url: 'https://streaming-cct.co.id/LiveApp/streams/380686335677885377945037.m3u8' },
  { id: 'cct-cmc-18', lat: 0, lng: 0, name: 'KM 68+000', city: 'Bekasi', stream_url: 'https://streaming-cct.co.id/LiveApp/streams/507909711721836488619938.m3u8' },
  { id: 'cct-cmc-19', lat: 0, lng: 0, name: 'KM 70+400', city: 'Bekasi', stream_url: 'https://streaming-cct.co.id/LiveApp/streams/871311996681478545431857.m3u8' },
  { id: 'cct-cmc-20', lat: 0, lng: 0, name: 'KM 72+600', city: 'Bekasi', stream_url: 'https://streaming-cct.co.id/LiveApp/streams/506841805129051037322084.m3u8' },
  { id: 'cct-cmc-21', lat: 0, lng: 0, name: 'KM 73+400', city: 'Bekasi', stream_url: 'https://streaming-cct.co.id/LiveApp/streams/222170400250068902122953.m3u8' },
  { id: 'cct-cmc-22', lat: -6.3280, lng: 106.8620, name: 'On Ramp Jatikarya', city: 'Bekasi', stream_url: 'https://streaming-cct.co.id/LiveApp/streams/364231033851578471527863.m3u8' },
  { id: 'cct-cmc-23', lat: -6.3280, lng: 106.8620, name: 'Traffic Light Jatikarya', city: 'Bekasi', stream_url: 'https://streaming-cct.co.id/LiveApp/streams/364231033851578471527863.m3u8' },
  { id: 'cct-cmc-24', lat: -6.3280, lng: 106.8620, name: 'VMS On Ramp Jatikarya', city: 'Bekasi', stream_url: 'https://streaming-cct.co.id/LiveApp/streams/692570761636324091874119.m3u8' },
];

// ═══════════════════════════════════════════════
//  BALI TOWER CITY CAMERAS
// ═══════════════════════════════════════════════

const BALI_TOWER_CAMERAS: CameraEntry[] = [
  { id: 'bt-jkt-01', lat: -6.1870, lng: 106.8230, name: 'Bundaran HI', city: 'Jakarta', stream_url: 'https://cctv.balitower.co.id/bundaranhi/embed.html?proto=hls' },
  { id: 'bt-jkt-02', lat: -6.2180, lng: 106.8020, name: 'GBK (Gelora Bung Karno)', city: 'Jakarta', stream_url: 'https://cctv.balitower.co.id/gbk/embed.html?proto=hls' },
  { id: 'bt-jkt-03', lat: -6.2100, lng: 106.8500, name: 'Manggarai', city: 'Jakarta', stream_url: 'https://cctv.balitower.co.id/manggarai/embed.html?proto=hls' },
  { id: 'bt-jkt-04', lat: -6.1700, lng: 106.7910, name: 'Tomang', city: 'Jakarta', stream_url: 'https://cctv.balitower.co.id/tomang/embed.html?proto=hls' },
  { id: 'bt-jkt-05', lat: -6.1750, lng: 106.7850, name: 'Tanjung Duren', city: 'Jakarta', stream_url: 'https://cctv.balitower.co.id/tanjungduren/embed.html?proto=hls' },
  { id: 'bt-jkt-06', lat: -6.1800, lng: 106.7800, name: 'Jati Pulo', city: 'Jakarta', stream_url: 'https://cctv.balitower.co.id/jatipulo/embed.html?proto=hls' },
  { id: 'bt-jkt-07', lat: -6.2100, lng: 106.8450, name: 'Pasar Manggis', city: 'Jakarta', stream_url: 'https://cctv.balitower.co.id/pasarmanggis/embed.html?proto=hls' },
  { id: 'bt-jkt-08', lat: -6.2250, lng: 106.8000, name: 'Senayan', city: 'Jakarta', stream_url: 'https://cctv.balitower.co.id/senayan/embed.html?proto=hls' },
  { id: 'bt-jkt-09', lat: -6.2400, lng: 106.8380, name: 'Kuningan', city: 'Jakarta', stream_url: 'https://cctv.balitower.co.id/kuningan/embed.html?proto=hls' },
  { id: 'bt-jkt-10', lat: -6.2100, lng: 106.8200, name: 'Bendungan Hilir', city: 'Jakarta', stream_url: 'https://cctv.balitower.co.id/bendunganhilir/embed.html?proto=hls' },
  { id: 'bt-jkt-11', lat: -6.2350, lng: 106.8600, name: 'Cikoko', city: 'Jakarta', stream_url: 'https://cctv.balitower.co.id/cikoko/embed.html?proto=hls' },
];


// ═══════════════════════════════════════════════
//  INFTOL ROADS — JAVA, SUMATRA, SULAWESI
//  Source: infotol.id (Jasa Marga, CCT Indonesia)
// ═══════════════════════════════════════════════

// ── BELMERA — 5 cameras ──
const BLM_CAMERAS: CameraEntry[] = [
  { id: 'jm-blm-01', lat: 0, lng: 0, name: '(BELMERA) KM 18+000 Utara', city: 'Medan', stream_url: 'https://jmlive.jasamarga.com/hls/24/335b97e3-4daf-4065-8ea3-302e46bf2459/index.m3u8' },
  { id: 'jm-blm-02', lat: 0, lng: 0, name: '(BELMERA) KM 25+200 Selatan', city: 'Medan', stream_url: 'https://jmlive.jasamarga.com/hls/24/98985d1e-ece2-474a-bafc-5b5fea5788dc/index.m3u8' },
  { id: 'jm-blm-03', lat: 0, lng: 0, name: '(BELMERA) KM 31+000 Selatan', city: 'Medan', stream_url: 'https://jmlive.jasamarga.com/hls/24/6db17dcc-c4a2-4d3b-bda7-5f6a423c22bd/index.m3u8' },
  { id: 'jm-blm-04', lat: 0, lng: 0, name: 'GT Belawan', city: 'Medan', stream_url: 'https://jmlive.jasamarga.com/hls/24/27fe0c21-d849-4f36-962c-d9eee73c69ac/index.m3u8' },
  { id: 'jm-blm-05', lat: 0, lng: 0, name: 'GT Tanjung Morawa', city: 'Medan', stream_url: 'https://jmlive.jasamarga.com/hls/24/97ee556b-242e-45ea-9651-d6dfe3331774/index.m3u8' },
];

// ── Terbanggi Besar–Pematang Panggang–Kayu Agung — 18 cameras ──
const TBP_CAMERAS: CameraEntry[] = [
  { id: 'jm-tbp-01', lat: 0, lng: 0, name: 'cctv_terpeka_1', city: 'Lampung', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/RR6x4meTVvyF1678163317194.m3u8' },
  { id: 'jm-tbp-02', lat: 0, lng: 0, name: 'cctv_terpeka_2', city: 'Lampung', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/zseTdMT4F4k71675840224773.m3u8' },
  { id: 'jm-tbp-03', lat: 0, lng: 0, name: 'cctv_terpeka_3', city: 'Lampung', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/H8SldyRHjwEE1675840265034.m3u8' },
  { id: 'jm-tbp-04', lat: 0, lng: 0, name: 'cctv_terpeka_4', city: 'Lampung', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/1CgtcZsGfhab1675840288909.m3u8' },
  { id: 'jm-tbp-05', lat: 0, lng: 0, name: 'cctv_terpeka_5', city: 'Lampung', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/59mjV0gznWTK1675840319332.m3u8' },
  { id: 'jm-tbp-06', lat: 0, lng: 0, name: 'cctv_terpeka_6', city: 'Lampung', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/wROy4zaNh2pI1675840341308.m3u8' },
  { id: 'jm-tbp-07', lat: 0, lng: 0, name: 'cctv_terpeka_7', city: 'Lampung', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/Sz66S9K9q8wO1676355519747.m3u8' },
  { id: 'jm-tbp-08', lat: 0, lng: 0, name: 'cctv_terpeka_8', city: 'Lampung', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/OYvGskpG5Xgx1675840402605.m3u8' },
  { id: 'jm-tbp-09', lat: 0, lng: 0, name: 'cctv_terpeka_9', city: 'Lampung', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/t8nGJjBmGrrn1675840443964.m3u8' },
  { id: 'jm-tbp-10', lat: 0, lng: 0, name: 'cctv_terpeka_10', city: 'Lampung', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/OAAGJkYZD1c41675840461119.m3u8' },
  { id: 'jm-tbp-11', lat: 0, lng: 0, name: 'cctv_terpeka_11', city: 'Lampung', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/573719682132674232374119.m3u8' },
  { id: 'jm-tbp-12', lat: 0, lng: 0, name: 'cctv_terpeka_12', city: 'Lampung', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/750868815034303281401685.m3u8' },
  { id: 'jm-tbp-13', lat: 0, lng: 0, name: 'cctv_terpeka_13', city: 'Lampung', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/Ejm7G1kVMWaB1672387226340.m3u8' },
  { id: 'jm-tbp-14', lat: 0, lng: 0, name: 'cctv_terpeka_14', city: 'Lampung', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/1LVctZlG1CpM1672387244952.m3u8' },
  { id: 'jm-tbp-15', lat: 0, lng: 0, name: 'cctv_terpeka_15', city: 'Lampung', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/y3173vty9vYS1672387738008.m3u8' },
  { id: 'jm-tbp-16', lat: 0, lng: 0, name: 'cctv_terpeka_16', city: 'Lampung', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/EZH5qh3F5Tjb1676357562389.m3u8' },
  { id: 'jm-tbp-17', lat: 0, lng: 0, name: 'cctv_terpeka_17', city: 'Lampung', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/1djgUtX3uYdt1678172813215.m3u8' },
  { id: 'jm-tbp-18', lat: 0, lng: 0, name: 'cctv_terpeka_18', city: 'Lampung', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/XAe1knZi8mq81671708245874.m3u8' },
];

// ── Tangerang–Merak — 16 cameras ──
const TMR_CAMERAS: CameraEntry[] = [
  { id: 'jm-tmr-01', lat: 0, lng: 0, name: 'balbar', city: 'Tangerang', stream_url: 'https://pantau.margamandala.co.id:3443/balbar/entrance/entrance.m3u8' },
  { id: 'jm-tmr-02', lat: 0, lng: 0, name: 'balbar', city: 'Tangerang', stream_url: 'https://pantau.margamandala.co.id:3443/balbar/exit/exit.m3u8' },
  { id: 'jm-tmr-03', lat: 0, lng: 0, name: 'baltim', city: 'Tangerang', stream_url: 'https://pantau.margamandala.co.id:3443/baltim/entrance/entrance.m3u8' },
  { id: 'jm-tmr-04', lat: 0, lng: 0, name: 'baltim', city: 'Tangerang', stream_url: 'https://pantau.margamandala.co.id:3443/baltim/exit/exit.m3u8' },
  { id: 'jm-tmr-05', lat: 0, lng: 0, name: 'cikupa', city: 'Tangerang', stream_url: 'https://pantau.margamandala.co.id:3443/cikupa/entrance/entrance.m3u8' },
  { id: 'jm-tmr-06', lat: 0, lng: 0, name: 'cikupa', city: 'Tangerang', stream_url: 'https://pantau.margamandala.co.id:3443/cikupa/exit/exit.m3u8' },
  { id: 'jm-tmr-07', lat: 0, lng: 0, name: 'ciltim', city: 'Tangerang', stream_url: 'https://pantau.margamandala.co.id:3443/ciltim/entrance/entrance.m3u8' },
  { id: 'jm-tmr-08', lat: 0, lng: 0, name: 'ciltim', city: 'Tangerang', stream_url: 'https://pantau.margamandala.co.id:3443/ciltim/exit/exit.m3u8' },
  { id: 'jm-tmr-09', lat: 0, lng: 0, name: 'km29', city: 'Tangerang', stream_url: 'https://pantau.margamandala.co.id:3443/km29/bandung/bandung.m3u8' },
  { id: 'jm-tmr-10', lat: 0, lng: 0, name: 'km94', city: 'Tangerang', stream_url: 'https://pantau.margamandala.co.id:3443/km94/ambon/ambon.m3u8' },
  { id: 'jm-tmr-11', lat: 0, lng: 0, name: 'km94', city: 'Tangerang', stream_url: 'https://pantau.margamandala.co.id:3443/km94/bandung/bandung.m3u8' },
  { id: 'jm-tmr-12', lat: 0, lng: 0, name: 'km96', city: 'Tangerang', stream_url: 'https://pantau.margamandala.co.id:3443/km96/ambon/ambon.m3u8' },
  { id: 'jm-tmr-13', lat: 0, lng: 0, name: 'merak', city: 'Tangerang', stream_url: 'https://pantau.margamandala.co.id:3443/merak/entrance/entrance.m3u8' },
  { id: 'jm-tmr-14', lat: 0, lng: 0, name: 'merak', city: 'Tangerang', stream_url: 'https://pantau.margamandala.co.id:3443/merak/exit/exit.m3u8' },
  { id: 'jm-tmr-15', lat: 0, lng: 0, name: 'sertim', city: 'Tangerang', stream_url: 'https://pantau.margamandala.co.id:3443/sertim/entrance/entrance.m3u8' },
  { id: 'jm-tmr-16', lat: 0, lng: 0, name: 'sertim', city: 'Tangerang', stream_url: 'https://pantau.margamandala.co.id:3443/sertim/exit/exit.m3u8' },
];

// ── Surabaya–Gempol — 5 cameras ──
const SBG_CAMERAS: CameraEntry[] = [
  { id: 'jm-sbg-01', lat: 0, lng: 0, name: '(Surabaya–Gempol) KM 12+800', city: 'Surabaya', stream_url: 'https://jmlive.jasamarga.com/hls/19/73f67fc0-3919-4d97-953f-0c049814b9a9/index.m3u8' },
  { id: 'jm-sbg-02', lat: 0, lng: 0, name: '(Surabaya–Gempol) KM 15+300', city: 'Surabaya', stream_url: 'https://jmlive.jasamarga.com/hls/19/40d2e0fd-c15d-4768-8ede-86b1892b8ab7/index.m3u8' },
  { id: 'jm-sbg-03', lat: 0, lng: 0, name: '(Surabaya–Gempol) KM 16+700 | Entrance – Exit Waru', city: 'Surabaya', stream_url: 'https://jmlive.jasamarga.com/hls/19/6126aea4-9d8a-4084-be9d-4ff230860eeb/index.m3u8' },
  { id: 'jm-sbg-04', lat: 0, lng: 0, name: '(Surabaya–Gempol) KM 16+700 | Interchange Medaeng', city: 'Surabaya', stream_url: 'https://jmlive.jasamarga.com/hls/19/eefbb9ce-bbb5-4ef9-bea6-52172d787e9d/index.m3u8' },
  { id: 'jm-sbg-05', lat: 0, lng: 0, name: '(Surabaya–Gempol) KM 16+700 | Overpass Waru 1 & R', city: 'Surabaya', stream_url: 'https://jmlive.jasamarga.com/hls/19/d74fe99b-0711-41a3-816f-4ff27eda1b3f/index.m3u8' },
];

// ── Solo–Ngawi — 17 cameras ──
const SNG_CAMERAS: CameraEntry[] = [
  { id: 'jm-sng-01', lat: 0, lng: 0, name: 'JSN KM 493+600', city: 'Solo', stream_url: 'https://jmlive.jasamarga.com/hls/16/b863ffb4-eff2-4fbd-bad1-9a6ff8f2df8f/index.m3u8' },
  { id: 'jm-sng-02', lat: 0, lng: 0, name: 'JSN KM 500+600', city: 'Solo', stream_url: 'https://jmlive.jasamarga.com/hls/16/cdd533dc-0c69-4b12-ace6-45d7c414de79/index.m3u8' },
  { id: 'jm-sng-03', lat: 0, lng: 0, name: 'JSN KM 505+600', city: 'Solo', stream_url: 'https://jmlive.jasamarga.com/hls/16/69f69442-c254-4874-ae0d-9f6ba936df3e/index.m3u8' },
  { id: 'jm-sng-04', lat: 0, lng: 0, name: 'JSN KM 509+600', city: 'Solo', stream_url: 'https://jmlive.jasamarga.com/hls/16/59612b11-e9e0-472b-84d5-b4a759ce4c80/index.m3u8' },
  { id: 'jm-sng-05', lat: 0, lng: 0, name: 'JSN KM 514+150', city: 'Solo', stream_url: 'https://jmlive.jasamarga.com/hls/16/7b9acf53-6edc-4381-8fc8-52f03fbdb935/index.m3u8' },
  { id: 'jm-sng-06', lat: 0, lng: 0, name: 'JSN KM 520+850', city: 'Solo', stream_url: 'https://jmlive.jasamarga.com/hls/16/798de5ad-4801-4a51-a358-89c0d4595adb/index.m3u8' },
  { id: 'jm-sng-07', lat: 0, lng: 0, name: 'JSN KM 526+850', city: 'Solo', stream_url: 'https://jmlive.jasamarga.com/hls/16/04fe2af7-06e1-4618-ac6f-d31d0147c6a9/index.m3u8' },
  { id: 'jm-sng-08', lat: 0, lng: 0, name: 'JSN KM 529+600', city: 'Solo', stream_url: 'https://jmlive.jasamarga.com/hls/16/bcedf80b-2f0c-4183-b2ee-9849f8d61e6d/index.m3u8' },
  { id: 'jm-sng-09', lat: 0, lng: 0, name: 'JSN KM 535+600', city: 'Solo', stream_url: 'https://jmlive.jasamarga.com/hls/16/0da581ca-7874-4cc7-95d6-48bb47ae081a/index.m3u8' },
  { id: 'jm-sng-10', lat: 0, lng: 0, name: 'JSN KM 541+050', city: 'Solo', stream_url: 'https://jmlive.jasamarga.com/hls/16/54a6cf3a-547e-4849-960a-bece2abe4eaf/index.m3u8' },
  { id: 'jm-sng-11', lat: 0, lng: 0, name: 'JSN KM 546+650', city: 'Solo', stream_url: 'https://jmlive.jasamarga.com/hls/16/1430ff73-fc70-4f78-ba4d-863d5a205964/index.m3u8' },
  { id: 'jm-sng-12', lat: 0, lng: 0, name: 'JSN KM 549+650', city: 'Solo', stream_url: 'https://jmlive.jasamarga.com/hls/16/8bc5eedf-34dc-4f56-940e-90626d18b99d/index.m3u8' },
  { id: 'jm-sng-13', lat: 0, lng: 0, name: 'JSN KM 561+650', city: 'Solo', stream_url: 'https://jmlive.jasamarga.com/hls/16/52ed316f-5dbd-43f9-8ba3-68b0fb922e04/index.m3u8' },
  { id: 'jm-sng-14', lat: 0, lng: 0, name: 'JSN KM 567+650', city: 'Solo', stream_url: 'https://jmlive.jasamarga.com/hls/16/bbe36b7e-3c3c-47c8-b380-0b5fc459ddf7/index.m3u8' },
  { id: 'jm-sng-15', lat: 0, lng: 0, name: 'JSN KM 573+650', city: 'Solo', stream_url: 'https://jmlive.jasamarga.com/hls/16/10971711-5560-486b-bb1b-3d5ed19a7d4b/index.m3u8' },
  { id: 'jm-sng-16', lat: 0, lng: 0, name: 'JSN KM 578+650', city: 'Solo', stream_url: 'https://jmlive.jasamarga.com/hls/16/b09e53d3-0dea-44dc-9ce5-71149d88a52e/index.m3u8' },
  { id: 'jm-sng-17', lat: 0, lng: 0, name: 'JSN KM 582+650', city: 'Solo', stream_url: 'https://jmlive.jasamarga.com/hls/16/30b16097-121e-4b61-adb8-471e4b47875d/index.m3u8' },
];

// ── Serang–Panimbang Seksi 1 (Serang–Rangkasbitung) — 13 cameras ──
const SPN_CAMERAS: CameraEntry[] = [
  { id: 'jm-spn-01', lat: 0, lng: 0, name: 'cctv_sp1', city: 'Serang', stream_url: 'https://cctv.wikaserangpanimbang.com/camera/bearer/tiod/1/23/index.m3u8' },
  { id: 'jm-spn-02', lat: 0, lng: 0, name: 'cctv_sp2', city: 'Serang', stream_url: 'https://cctv.wikaserangpanimbang.com/camera/bearer/tiod/1/17/index.m3u8' },
  { id: 'jm-spn-03', lat: 0, lng: 0, name: 'cctv_sp3', city: 'Serang', stream_url: 'https://cctv.wikaserangpanimbang.com/camera/bearer/tiod/1/3/index.m3u8' },
  { id: 'jm-spn-04', lat: 0, lng: 0, name: 'cctv_sp4', city: 'Serang', stream_url: 'https://cctv.wikaserangpanimbang.com/camera/bearer/tiod/1/4/index.m3u8' },
  { id: 'jm-spn-05', lat: 0, lng: 0, name: 'cctv_sp5', city: 'Serang', stream_url: 'https://cctv.wikaserangpanimbang.com/camera/bearer/tiod/1/5/index.m3u8' },
  { id: 'jm-spn-06', lat: 0, lng: 0, name: 'cctv_sp6', city: 'Serang', stream_url: 'https://cctv.wikaserangpanimbang.com/camera/bearer/tiod/1/6/index.m3u8' },
  { id: 'jm-spn-07', lat: 0, lng: 0, name: 'cctv_sp7', city: 'Serang', stream_url: 'https://cctv.wikaserangpanimbang.com/camera/bearer/tiod/1/7/index.m3u8' },
  { id: 'jm-spn-08', lat: 0, lng: 0, name: 'cctv_sp8', city: 'Serang', stream_url: 'https://cctv.wikaserangpanimbang.com/camera/bearer/tiod/1/8/index.m3u8' },
  { id: 'jm-spn-09', lat: 0, lng: 0, name: 'cctv_sp9', city: 'Serang', stream_url: 'https://cctv.wikaserangpanimbang.com/camera/bearer/tiod/1/13/index.m3u8' },
  { id: 'jm-spn-10', lat: 0, lng: 0, name: 'cctv_sp10', city: 'Serang', stream_url: 'https://cctv.wikaserangpanimbang.com/camera/bearer/tiod/1/14/index.m3u8' },
  { id: 'jm-spn-11', lat: 0, lng: 0, name: 'cctv_sp11', city: 'Serang', stream_url: 'https://cctv.wikaserangpanimbang.com/camera/bearer/tiod/1/15/index.m3u8' },
  { id: 'jm-spn-12', lat: 0, lng: 0, name: 'cctv_sp12', city: 'Serang', stream_url: 'https://cctv.wikaserangpanimbang.com/camera/bearer/tiod/1/2/index.m3u8' },
  { id: 'jm-spn-13', lat: 0, lng: 0, name: 'cctv_sp13', city: 'Serang', stream_url: 'https://cctv.wikaserangpanimbang.com/camera/bearer/tiod/1/1/index.m3u8' },
];

// ── Sedyatmo (Akses Bandara Soekarno–Hatta) — 16 cameras ──
const SDY_CAMERAS: CameraEntry[] = [
  { id: 'jm-sdy-01', lat: 0, lng: 0, name: 'cctv_sd1', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/3/aa6ec19c-a7d3-4ac4-a7b3-232951a52191/index.m3u8' },
  { id: 'jm-sdy-02', lat: 0, lng: 0, name: 'cctv_sd2', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/3/987f834b-7bf5-4951-9584-af7ea19adc09/index.m3u8' },
  { id: 'jm-sdy-03', lat: 0, lng: 0, name: 'cctv_sd3', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/3/551ddcac-1e9a-4fbe-8392-ffec69c5d619/index.m3u8' },
  { id: 'jm-sdy-04', lat: 0, lng: 0, name: 'cctv_sd4', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/3/a31a6b11-179d-4828-9d8d-344f5a2a7d8a/index.m3u8' },
  { id: 'jm-sdy-05', lat: 0, lng: 0, name: 'cctv_sd5', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/3/833ff131-7948-416e-b805-f7df52cd8b84/index.m3u8' },
  { id: 'jm-sdy-06', lat: 0, lng: 0, name: 'cctv_sd6', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/3/f27e2cd3-803c-4e99-a9f4-d97e6678f728/index.m3u8' },
  { id: 'jm-sdy-07', lat: 0, lng: 0, name: 'cctv_sd7', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/3/0ad9a6d2-4d43-4127-a9e3-1c9243ab8001/index.m3u8' },
  { id: 'jm-sdy-08', lat: 0, lng: 0, name: 'cctv_sd8', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/3/e7d75b70-32c1-40e8-b369-a2279b62e89f/index.m3u8' },
  { id: 'jm-sdy-09', lat: 0, lng: 0, name: 'cctv_sd9', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/3/a7c2b7c0-3ac7-4f48-b4b7-88a9edbea1d9/index.m3u8' },
  { id: 'jm-sdy-10', lat: 0, lng: 0, name: 'cctv_sd10', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/3/ccd9c6d6-6259-46a1-9176-a56db8d79a41/index.m3u8' },
  { id: 'jm-sdy-11', lat: 0, lng: 0, name: 'cctv_sd11', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/3/a58aa244-4eb7-4b49-a902-3ba6af727b50/index.m3u8' },
  { id: 'jm-sdy-12', lat: 0, lng: 0, name: 'cctv_sd12', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/3/eb5fd6d6-fdd2-4f1d-8cb4-caf5b751abe3/index.m3u8' },
  { id: 'jm-sdy-13', lat: 0, lng: 0, name: 'cctv_sd13', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/3/751b14e4-b6d1-41f8-9857-113fd8653598/index.m3u8' },
  { id: 'jm-sdy-14', lat: 0, lng: 0, name: 'cctv_sd14', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/3/792008e2-e3a5-44ba-acc9-780a0b614476/index.m3u8' },
  { id: 'jm-sdy-15', lat: 0, lng: 0, name: 'cctv_sd15', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/3/f8c05808-e4ef-4e30-a9ca-b39649238aaf/index.m3u8' },
  { id: 'jm-sdy-16', lat: 0, lng: 0, name: 'cctv_sd16', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/3/f685a914-6931-4683-ba12-c00539856f7e/index.m3u8' },
];

// ── Pekanbaru–Dumai — 15 cameras ──
const PBD_CAMERAS: CameraEntry[] = [
  { id: 'jm-pbd-01', lat: 0, lng: 0, name: 'LiveApp', city: 'Pekanbaru', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/cHJfkfpjPyN41670832571166.m3u8' },
  { id: 'jm-pbd-02', lat: 0, lng: 0, name: 'LiveApp', city: 'Pekanbaru', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/LqeGG9WJKXgD1670832607382.m3u8' },
  { id: 'jm-pbd-03', lat: 0, lng: 0, name: 'LiveApp', city: 'Pekanbaru', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/WK0v67Pn5jD11670832638990.m3u8' },
  { id: 'jm-pbd-04', lat: 0, lng: 0, name: 'LiveApp', city: 'Pekanbaru', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/Lrv8h74cnx5x1670832670743.m3u8' },
  { id: 'jm-pbd-05', lat: 0, lng: 0, name: 'LiveApp', city: 'Pekanbaru', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/WYTBXIGoLM291670832698992.m3u8' },
  { id: 'jm-pbd-06', lat: 0, lng: 0, name: 'LiveApp', city: 'Pekanbaru', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/wtw6QowrpjBX1670832746764.m3u8' },
  { id: 'jm-pbd-07', lat: 0, lng: 0, name: 'LiveApp', city: 'Pekanbaru', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/SusRia9KwywI1670832780373.m3u8' },
  { id: 'jm-pbd-08', lat: 0, lng: 0, name: 'LiveApp', city: 'Pekanbaru', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/uRd3R71wTcTX1670832810113.m3u8' },
  { id: 'jm-pbd-09', lat: 0, lng: 0, name: 'LiveApp', city: 'Pekanbaru', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/sJ5f4j2wtqbj1670832840524.m3u8' },
  { id: 'jm-pbd-10', lat: 0, lng: 0, name: 'LiveApp', city: 'Pekanbaru', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/jMBfWL7lpW2Y1670832877655.m3u8' },
  { id: 'jm-pbd-11', lat: 0, lng: 0, name: 'LiveApp', city: 'Pekanbaru', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/ttIw86J373eV1670837883140.m3u8' },
  { id: 'jm-pbd-12', lat: 0, lng: 0, name: 'LiveApp', city: 'Pekanbaru', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/ON3Czj0YOeyC1670834863310.m3u8' },
  { id: 'jm-pbd-13', lat: 0, lng: 0, name: 'LiveApp', city: 'Pekanbaru', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/4ssD3PWdWcui1670836173329.m3u8' },
  { id: 'jm-pbd-14', lat: 0, lng: 0, name: 'LiveApp', city: 'Pekanbaru', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/tvd1bPHqEyH11670832506577.m3u8' },
  { id: 'jm-pbd-15', lat: 0, lng: 0, name: 'LiveApp', city: 'Pekanbaru', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/5XqSMylVLRJD1670834841328.m3u8' },
];

// ── Pandaan–Malang — 4 cameras ──
const PDM_CAMERAS: CameraEntry[] = [
  { id: 'jm-pdm-01', lat: 0, lng: 0, name: 'Pandaan–Malang KM 63+800', city: 'Malang', stream_url: 'https://jmlive.jasamarga.com/hls/23/c75a4549-c40c-421e-8855-c02aa37a62ee/index.m3u8' },
  { id: 'jm-pdm-02', lat: 0, lng: 0, name: 'Pandaan–Malang KM 75+150', city: 'Malang', stream_url: 'https://jmlive.jasamarga.com/hls/23/869c47e5-163e-4be4-9f1b-b426f1846bec/index.m3u8' },
  { id: 'jm-pdm-03', lat: 0, lng: 0, name: 'Pandaan–Malang KM 95+000', city: 'Malang', stream_url: 'https://jmlive.jasamarga.com/hls/23/6fea78f9-c9cb-46c5-b044-4e6603130ea4/index.m3u8' },
  { id: 'jm-pdm-04', lat: 0, lng: 0, name: 'Pandaan–Malang KM 86+300', city: 'Malang', stream_url: 'https://jmlive.jasamarga.com/hls/23/b5e2d87c-4f77-42cf-abda-aa677b497bb0/index.m3u8' },
];

// ── Palembang–Indralaya — 16 cameras ──
const PLI_CAMERAS: CameraEntry[] = [
  { id: 'jm-pli-01', lat: 0, lng: 0, name: 'cctv_palindra_1', city: 'Palembang', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/267565493547947969759647.m3u8' },
  { id: 'jm-pli-02', lat: 0, lng: 0, name: 'cctv_palindra_2', city: 'Palembang', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/000873119738804749935559.m3u8' },
  { id: 'jm-pli-03', lat: 0, lng: 0, name: 'cctv_palindra_3', city: 'Palembang', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/512039039195007414780648.m3u8' },
  { id: 'jm-pli-04', lat: 0, lng: 0, name: 'cctv_palindra_4', city: 'Palembang', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/098395992445733487844660.m3u8' },
  { id: 'jm-pli-05', lat: 0, lng: 0, name: 'cctv_palindra_5', city: 'Palembang', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/694712410636759959803663.m3u8' },
  { id: 'jm-pli-06', lat: 0, lng: 0, name: 'cctv_palindra_6', city: 'Palembang', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/823069182482598599051789.m3u8' },
  { id: 'jm-pli-07', lat: 0, lng: 0, name: 'cctv_palindra_7', city: 'Palembang', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/297952523991600874156119.m3u8' },
  { id: 'jm-pli-08', lat: 0, lng: 0, name: 'cctv_palindra_8', city: 'Palembang', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/530233880268202462634796.m3u8' },
  { id: 'jm-pli-09', lat: 0, lng: 0, name: 'cctv_palindra_9', city: 'Palembang', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/156545412556986213279533.m3u8' },
  { id: 'jm-pli-10', lat: 0, lng: 0, name: 'cctv_palindra_10', city: 'Palembang', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/620290052888606951595901.m3u8' },
  { id: 'jm-pli-11', lat: 0, lng: 0, name: 'cctv_palindra_11', city: 'Palembang', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/180147138812973317702348.m3u8' },
  { id: 'jm-pli-12', lat: 0, lng: 0, name: 'cctv_palindra_12', city: 'Palembang', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/648176351556242758398370.m3u8' },
  { id: 'jm-pli-13', lat: 0, lng: 0, name: 'cctv_palindra_13', city: 'Palembang', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/425149463316515625544601.m3u8' },
  { id: 'jm-pli-14', lat: 0, lng: 0, name: 'cctv_palindra_14', city: 'Palembang', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/953617100779184492903430.m3u8' },
  { id: 'jm-pli-15', lat: 0, lng: 0, name: 'cctv_palindra_15', city: 'Palembang', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/481851734189142298210171.m3u8' },
  { id: 'jm-pli-16', lat: 0, lng: 0, name: 'cctv_palindra_16', city: 'Palembang', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/100831563641835272155645.m3u8' },
];

// ── Ngawi–Kertosono–Kediri (JNK) — 8 cameras ──
const JNK_CAMERAS: CameraEntry[] = [
  { id: 'jm-jnk-01', lat: 0, lng: 0, name: '(JNK) KM 584+000', city: 'Kediri', stream_url: 'https://jmlive.jasamarga.com/hls/17/a20496f5-989c-4526-9bb0-d4e8a68fd43b/index.m3u8' },
  { id: 'jm-jnk-02', lat: 0, lng: 0, name: '(JNK) KM 585+100', city: 'Kediri', stream_url: 'https://jmlive.jasamarga.com/hls/17/02a58e6c-ef42-4f26-8278-fa3167894e04/index.m3u8' },
  { id: 'jm-jnk-03', lat: 0, lng: 0, name: '(JNK) KM 594+500', city: 'Kediri', stream_url: 'https://jmlive.jasamarga.com/hls/17/32624f0c-a20f-4305-b647-e00c808025fd/index.m3u8' },
  { id: 'jm-jnk-04', lat: 0, lng: 0, name: '(JNK) KM 595+500', city: 'Kediri', stream_url: 'https://jmlive.jasamarga.com/hls/17/6e323f6c-e2fe-4c39-a18d-89673e8a97a9/index.m3u8' },
  { id: 'jm-jnk-05', lat: 0, lng: 0, name: '(JNK) KM 601+000', city: 'Kediri', stream_url: 'https://jmlive.jasamarga.com/hls/17/917922c6-7b78-4d75-955e-7d6b1a146518/index.m3u8' },
  { id: 'jm-jnk-06', lat: 0, lng: 0, name: '(JNK) KM 602+800', city: 'Kediri', stream_url: 'https://jmlive.jasamarga.com/hls/17/ce9f4471-0aa5-419f-8eac-a27abd45e80d/index.m3u8' },
  { id: 'jm-jnk-07', lat: 0, lng: 0, name: '(JNK) KM 613+500', city: 'Kediri', stream_url: 'https://jmlive.jasamarga.com/hls/17/426303ec-6812-4cf4-b06c-8c9f075a8e74/index.m3u8' },
  { id: 'jm-jnk-08', lat: 0, lng: 0, name: '(JNK) KM 616+600', city: 'Kediri', stream_url: 'https://jmlive.jasamarga.com/hls/17/4b2a26fa-579d-40fc-807a-75e116926cda/index.m3u8' },
];

// ── Mojokerto–Surabaya — 3 cameras ──
const MJS_CAMERAS: CameraEntry[] = [
  { id: 'jm-mjs-01', lat: 0, lng: 0, name: '(Surabaya–Mojokerto) KM 715+500', city: 'Surabaya', stream_url: 'https://jmlive.jasamarga.com/hls/18/9f8ab67e-cbfb-42d1-8422-cc4cc1313657/index.m3u8' },
  { id: 'jm-mjs-02', lat: 0, lng: 0, name: '(Surabaya–Mojokerto) KM 735+400', city: 'Surabaya', stream_url: 'https://jmlive.jasamarga.com/hls/18/7e43c305-c80d-42e1-86c6-f40e0756b37e/index.m3u8' },
  { id: 'jm-mjs-03', lat: 0, lng: 0, name: '(Surabaya–Mojokerto) KM 743+500', city: 'Surabaya', stream_url: 'https://jmlive.jasamarga.com/hls/18/bba279d4-a3bf-40dc-b269-84194b301553/index.m3u8' },
];

// ── Krian–Legundi–Bunder–Manyar (KLBM) — 1 cameras ──
const KLB_CAMERAS: CameraEntry[] = [
  { id: 'jm-klb-01', lat: 0, lng: 0, name: 'ENTRANCE BUNDER GRESIK', city: 'Gresik', stream_url: 'https://cctv.waskitabumiwira.com/LiveApp/streams/704245419955557974280759.m3u8' },
];

// ── Kertosono–Mojokerto — 6 cameras ──
const KRM_CAMERAS: CameraEntry[] = [
  { id: 'jm-krm-01', lat: 0, lng: 0, name: 'cctv_kermo_1', city: 'Mojokerto', stream_url: 'https://toljomo.margaharjaya.co.id/video/AKSESBANDARARAHPERAK/aksesbandararahperak.m3u8' },
  { id: 'jm-krm-02', lat: 0, lng: 0, name: 'cctv_kermo_2', city: 'Mojokerto', stream_url: 'https://toljomo.margaharjaya.co.id/video/AKSESJBGARAHJOMKOT/aksesjbgarahjomkot.m3u8' },
  { id: 'jm-krm-03', lat: 0, lng: 0, name: 'cctv_kermo_3', city: 'Mojokerto', stream_url: 'https://toljomo.margaharjaya.co.id/video/KDGBELAKANGARAHMASUK/kdgbelakangarahmasuk.m3u8' },
  { id: 'jm-krm-04', lat: 0, lng: 0, name: 'cctv_kermo_4', city: 'Mojokerto', stream_url: 'https://toljomo.margaharjaya.co.id/video/JOMBANGEXIT/jombangexit.m3u8' },
  { id: 'jm-krm-05', lat: 0, lng: 0, name: 'cctv_kermo_5', city: 'Mojokerto', stream_url: 'https://toljomo.margaharjaya.co.id/video/MOBAREXIT/mobarexit.m3u8' },
  { id: 'jm-krm-06', lat: 0, lng: 0, name: 'cctv_kermo_6', city: 'Mojokerto', stream_url: 'https://toljomo.margaharjaya.co.id/video/BANDAREXIT/bandarexit.m3u8' },
];

// ── Jogja–Solo — 8 cameras ──
const JJS_CAMERAS: CameraEntry[] = [
  { id: 'jm-jjs-01', lat: 0, lng: 0, name: 'cctv_jjs_1', city: 'Yogyakarta', stream_url: 'https://jmlive.jasamarga.com/hls/42/2015cec0-6839-46fc-8680-6e2b720bf016/index.m3u8' },
  { id: 'jm-jjs-02', lat: 0, lng: 0, name: 'cctv_jjs_2', city: 'Yogyakarta', stream_url: 'https://jmlive.jasamarga.com/hls/42/22a6ae1c-197a-45db-89c8-a826ca800d79/index.m3u8' },
  { id: 'jm-jjs-03', lat: 0, lng: 0, name: 'cctv_jjs_3', city: 'Yogyakarta', stream_url: 'https://jmlive.jasamarga.com/hls/42/564eb04b-f08d-4a7e-a09c-6369cb69c46b/index.m3u8' },
  { id: 'jm-jjs-04', lat: 0, lng: 0, name: 'cctv_jjs_4', city: 'Yogyakarta', stream_url: 'https://jmlive.jasamarga.com/hls/42/36488255-5132-4c47-8866-d2cccf7bbdee/index.m3u8' },
  { id: 'jm-jjs-05', lat: 0, lng: 0, name: 'cctv_jjs_5', city: 'Yogyakarta', stream_url: 'https://jmlive.jasamarga.com/hls/42/96c5e8f1-df16-4c56-a02e-19a0eadfd173/index.m3u8' },
  { id: 'jm-jjs-06', lat: 0, lng: 0, name: 'cctv_jjs_6', city: 'Yogyakarta', stream_url: 'https://jmlive.jasamarga.com/hls/42/4c6ffdf7-ba49-48f7-a598-ba542da95b9a/index.m3u8' },
  { id: 'jm-jjs-07', lat: 0, lng: 0, name: 'cctv_jjs_7', city: 'Yogyakarta', stream_url: 'https://jmlive.jasamarga.com/hls/42/2544ac92-a7ca-495a-8b41-e64bc540d446/index.m3u8' },
  { id: 'jm-jjs-08', lat: 0, lng: 0, name: 'cctv_jjs_8', city: 'Yogyakarta', stream_url: 'https://jmlive.jasamarga.com/hls/42/5189c21b-a133-4b18-aea8-63581f7a9659/index.m3u8' },
];

// ── Gempol–Pasuruan — 5 cameras ──
const GPS_CAMERAS: CameraEntry[] = [
  { id: 'jm-gps-01', lat: 0, lng: 0, name: '(Gempol–Pasuruan) KM 775+800', city: 'Pasuruan', stream_url: 'https://jmlive.jasamarga.com/hls/21/bd6cbcf2-d134-4bad-aa34-27d573585d70/index.m3u8' },
  { id: 'jm-gps-02', lat: 0, lng: 0, name: '(Gempol–Pasuruan) KM 781+790', city: 'Pasuruan', stream_url: 'https://jmlive.jasamarga.com/hls/21/caa033a9-e348-4540-9436-3b61a073f446/index.m3u8' },
  { id: 'jm-gps-03', lat: 0, lng: 0, name: '(Gempol–Pasuruan) KM 790+725', city: 'Pasuruan', stream_url: 'https://jmlive.jasamarga.com/hls/21/2d869ea3-2bb0-479b-8d30-40090b05a8ed/index.m3u8' },
  { id: 'jm-gps-04', lat: 0, lng: 0, name: '(Gempol–Pasuruan) KM 801+000', city: 'Pasuruan', stream_url: 'https://jmlive.jasamarga.com/hls/21/3bfa61b5-2c00-4d90-ac43-4bc9ad2bc727/index.m3u8' },
  { id: 'jm-gps-05', lat: 0, lng: 0, name: '(Gempol–Pasuruan) KM 810+000', city: 'Pasuruan', stream_url: 'https://jmlive.jasamarga.com/hls/21/db19ed5b-823d-4507-8aa8-60b0de1616c6/index.m3u8' },
];

// ── Gempol–Pandaan — 4 cameras ──
const GPD_CAMERAS: CameraEntry[] = [
  { id: 'jm-gpd-01', lat: 0, lng: 0, name: 'Gempol–Pandaan KM 48+000', city: 'Pandaan', stream_url: 'https://jmlive.jasamarga.com/hls/22/9f686c64-fe32-430b-a74b-1657556177b8/index.m3u8' },
  { id: 'jm-gpd-02', lat: 0, lng: 0, name: 'Gempol–Pandaan KM 52+000', city: 'Pandaan', stream_url: 'https://jmlive.jasamarga.com/hls/22/6dc011cf-b403-45c9-8f91-84b3cdf9fbcd/index.m3u8' },
  { id: 'jm-gpd-03', lat: 0, lng: 0, name: 'Gempol–Pandaan KM 56+800', city: 'Pandaan', stream_url: 'https://jmlive.jasamarga.com/hls/22/3262bd19-238f-424b-b968-137ab110da4c/index.m3u8' },
  { id: 'jm-gpd-04', lat: 0, lng: 0, name: 'Gempol–Pandaan KM 772+400', city: 'Pandaan', stream_url: 'https://jmlive.jasamarga.com/hls/22/b2e1db80-4367-4e3c-80cf-a95e7b46bace/index.m3u8' },
];

// ── Akses Tanjung Priok — 12 cameras ──
const ATP_CAMERAS: CameraEntry[] = [
  { id: 'jm-atp-01', lat: 0, lng: 0, name: 'cctv_atp_1', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/687489889091511277827377.m3u8' },
  { id: 'jm-atp-02', lat: 0, lng: 0, name: 'cctv_atp_2', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/501264524429471982550467.m3u8' },
  { id: 'jm-atp-03', lat: 0, lng: 0, name: 'cctv_atp_3', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/095660838019901274554950.m3u8' },
  { id: 'jm-atp-04', lat: 0, lng: 0, name: 'cctv_atp_4', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/956464037412277558025165.m3u8' },
  { id: 'jm-atp-05', lat: 0, lng: 0, name: 'cctv_atp_5', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/675323017321643087627650.m3u8' },
  { id: 'jm-atp-06', lat: 0, lng: 0, name: 'cctv_atp_6', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/062223762734246730973930.m3u8' },
  { id: 'jm-atp-07', lat: 0, lng: 0, name: 'cctv_atp_7', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/381024135984437558197100.m3u8' },
  { id: 'jm-atp-08', lat: 0, lng: 0, name: 'cctv_atp_8', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/756751654695732090756915.m3u8' },
  { id: 'jm-atp-09', lat: 0, lng: 0, name: 'cctv_atp_9', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/241370079371388169899174.m3u8' },
  { id: 'jm-atp-10', lat: 0, lng: 0, name: 'cctv_atp_10', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/710404214066673275657182.m3u8' },
  { id: 'jm-atp-11', lat: 0, lng: 0, name: 'cctv_atp_11', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/800925316301503102079844.m3u8' },
  { id: 'jm-atp-12', lat: 0, lng: 0, name: 'cctv_atp_12', city: 'Jakarta', stream_url: 'https://extstream.hk-opt2.com/LiveApp/streams/849705788476171969074221.m3u8' },
];

// ── Tol Dalam Kota (Kelapa Gading–Pulo Gebang) — 6 cameras ──
const KDG_CAMERAS: CameraEntry[] = [
  { id: 'jm-kdg-01', lat: 0, lng: 0, name: 'cctv_kdg_1', city: 'Jakarta', stream_url: 'https://camera.jtd.co.id/camera/share/tios/2/27/index.m3u8' },
  { id: 'jm-kdg-02', lat: 0, lng: 0, name: 'cctv_kdg_2', city: 'Jakarta', stream_url: 'https://camera.jtd.co.id/camera/share/tios/2/25/index.m3u8' },
  { id: 'jm-kdg-03', lat: 0, lng: 0, name: 'cctv_kdg_3', city: 'Jakarta', stream_url: 'https://camera.jtd.co.id/camera/share/tios/2/80/index.m3u8' },
  { id: 'jm-kdg-04', lat: 0, lng: 0, name: 'cctv_kdg_4', city: 'Jakarta', stream_url: 'https://camera.jtd.co.id/camera/share/tios/2/19/index.m3u8' },
  { id: 'jm-kdg-05', lat: 0, lng: 0, name: 'cctv_kdg_5', city: 'Jakarta', stream_url: 'https://camera.jtd.co.id/camera/share/tios/2/81/index.m3u8' },
  { id: 'jm-kdg-06', lat: 0, lng: 0, name: 'cctv_kdg_6', city: 'Jakarta', stream_url: 'https://camera.jtd.co.id/camera/share/tios/2/20/index.m3u8' },
];

// ── Padalarang–Cileunyi (Padaleunyi) — 10 cameras ──
const PAD_CAMERAS: CameraEntry[] = [
  { id: 'jm-pad-01', lat: 0, lng: 0, name: 'cctv_pad_1', city: 'Bandung', stream_url: 'https://jmlive.jasamarga.com/hls/6/d5446193-2caf-4d4b-b1a7-e6a22defe1e7/index.m3u8' },
  { id: 'jm-pad-02', lat: 0, lng: 0, name: 'cctv_pad_2', city: 'Bandung', stream_url: 'https://jmlive.jasamarga.com/hls/6/0242651c-13e4-4c12-94ba-fcc69a8b0013/index.m3u8' },
  { id: 'jm-pad-03', lat: 0, lng: 0, name: 'cctv_pad_3', city: 'Bandung', stream_url: 'https://jmlive.jasamarga.com/hls/6/91a87ec9-604a-434c-b962-2be48d49db46/index.m3u8' },
  { id: 'jm-pad-04', lat: 0, lng: 0, name: 'cctv_pad_4', city: 'Bandung', stream_url: 'https://jmlive.jasamarga.com/hls/6/3c25b40e-ba7f-4384-be56-c3db817272dc/index.m3u8' },
  { id: 'jm-pad-05', lat: 0, lng: 0, name: 'cctv_pad_5', city: 'Bandung', stream_url: 'https://jmlive.jasamarga.com/hls/6/db978143-85df-4467-9ee2-83aa4cd0910a/index.m3u8' },
  { id: 'jm-pad-06', lat: 0, lng: 0, name: 'cctv_pad_6', city: 'Bandung', stream_url: 'https://jmlive.jasamarga.com/hls/6/293cfc9c-ae4a-40cd-b43d-b187c37ad4ef/index.m3u8' },
  { id: 'jm-pad-07', lat: 0, lng: 0, name: 'cctv_pad_7', city: 'Bandung', stream_url: 'https://jmlive.jasamarga.com/hls/6/a3ab90c9-1a42-40a5-bc67-a951bd5bc851/index.m3u8' },
  { id: 'jm-pad-08', lat: 0, lng: 0, name: 'cctv_pad_8', city: 'Bandung', stream_url: 'https://jmlive.jasamarga.com/hls/6/2648e24d-1dfe-4ee4-816b-747ab9f22122/index.m3u8' },
  { id: 'jm-pad-09', lat: 0, lng: 0, name: 'cctv_pad_9', city: 'Bandung', stream_url: 'https://jmlive.jasamarga.com/hls/6/75563235-b332-44b9-ba2f-0e4849c0cabc/index.m3u8' },
  { id: 'jm-pad-10', lat: 0, lng: 0, name: 'cctv_pad_10', city: 'Bandung', stream_url: 'https://jmlive.jasamarga.com/hls/6/46cd4beb-f1e1-45bb-88b4-489c9a79d7a9/index.m3u8' },
];

// ── BORR (Sentul Barat–Simpang Yasmin) — 6 cameras ──
const BOR_CAMERAS: CameraEntry[] = [
  { id: 'jm-bor-01', lat: 0, lng: 0, name: '11', city: 'Bogor', stream_url: 'https://jmlive.jasamarga.com/hls/11/7828d04a-0358-4d10-87e6-5ccbe4eb081e/index.m3u8' },
  { id: 'jm-bor-02', lat: 0, lng: 0, name: '11', city: 'Bogor', stream_url: 'https://jmlive.jasamarga.com/hls/11/cd9a96f0-2764-4cc4-9bbe-f5f04e2973ad/index.m3u8' },
  { id: 'jm-bor-03', lat: 0, lng: 0, name: '11', city: 'Bogor', stream_url: 'https://jmlive.jasamarga.com/hls/11/ec6732d6-50f6-466d-8730-a38751c25ea1/index.m3u8' },
  { id: 'jm-bor-04', lat: 0, lng: 0, name: '11', city: 'Bogor', stream_url: 'https://jmlive.jasamarga.com/hls/11/386867aa-835b-4159-84f5-8cbc24925420/index.m3u8' },
  { id: 'jm-bor-05', lat: 0, lng: 0, name: '11', city: 'Bogor', stream_url: 'https://jmlive.jasamarga.com/hls/11/ed596596-fdd9-4991-ae5a-fcf05f2dea25/index.m3u8' },
  { id: 'jm-bor-06', lat: 0, lng: 0, name: '11', city: 'Bogor', stream_url: 'https://jmlive.jasamarga.com/hls/11/23550176-c255-47ff-b4f4-75a0de899aa2/index.m3u8' },
];

// ── JORR W2U (Ulujami–Kembangan) — 11 cameras ──
const W2U_CAMERAS: CameraEntry[] = [
  { id: 'jm-w2u-01', lat: 0, lng: 0, name: 'cctv_w2u_1', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/10/113a80e2-ba19-4c76-836c-0c4dba5a2177/index.m3u8' },
  { id: 'jm-w2u-02', lat: 0, lng: 0, name: 'cctv_w2u_2', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/10/6c4f6517-bbf4-4637-9571-d27057d07aa3/index.m3u8' },
  { id: 'jm-w2u-03', lat: 0, lng: 0, name: 'cctv_w2u_3', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/10/ba8a5701-8706-44b9-84d8-b298a435913d/index.m3u8' },
  { id: 'jm-w2u-04', lat: 0, lng: 0, name: 'cctv_w2u_4', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/10/79dcee15-4b8f-482d-ad0e-7894dbe2dbae/index.m3u8' },
  { id: 'jm-w2u-05', lat: 0, lng: 0, name: 'cctv_w2u_5', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/10/27009108-0766-4cd6-868e-92f51b3e8a5e/index.m3u8' },
  { id: 'jm-w2u-06', lat: 0, lng: 0, name: 'cctv_w2u_6', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/10/c9d6642c-8e02-41cd-a4c3-511a97603c41/index.m3u8' },
  { id: 'jm-w2u-07', lat: 0, lng: 0, name: 'cctv_w2u_7', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/10/f1852b70-edbf-41b9-8d57-b664b1dd5d95/index.m3u8' },
  { id: 'jm-w2u-08', lat: 0, lng: 0, name: 'cctv_w2u_8', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/10/6fda7cd5-5267-4122-9337-601b0e65d0a4/index.m3u8' },
  { id: 'jm-w2u-09', lat: 0, lng: 0, name: 'cctv_w2u_9', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/10/a66aa826-49cc-4cc0-b02a-8631468e9587/index.m3u8' },
  { id: 'jm-w2u-10', lat: 0, lng: 0, name: 'cctv_w2u_10', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/10/7bc77b6c-95fd-496e-b529-39196ac40dcb/index.m3u8' },
  { id: 'jm-w2u-11', lat: 0, lng: 0, name: 'cctv_w2u_11', city: 'Jakarta', stream_url: 'https://jmlive.jasamarga.com/hls/10/f2285db8-d88c-4d4d-b722-358fff0d32d6/index.m3u8' },
];

// ── JORR 2 (Serpong–Kunciran) — 8 cameras ──
const JSK_CAMERAS: CameraEntry[] = [
  { id: 'jm-jsk-01', lat: 0, lng: 0, name: '(MTN) KM 14+000', city: 'Tangerang', stream_url: 'https://jmlive.jasamarga.com/hls/28/c6e1c1fb-5b45-4b96-a6fe-84c355ddeb4f/index.m3u8' },
  { id: 'jm-jsk-02', lat: 0, lng: 0, name: '(MTN) KM 14+200', city: 'Tangerang', stream_url: 'https://jmlive.jasamarga.com/hls/28/826b43fb-432a-4eac-a3e0-d2848e50eba5/index.m3u8' },
  { id: 'jm-jsk-03', lat: 0, lng: 0, name: '(MTN) KM 16+200', city: 'Tangerang', stream_url: 'https://jmlive.jasamarga.com/hls/28/8d534e53-a8b2-480d-ada9-abbee407a744/index.m3u8' },
  { id: 'jm-jsk-04', lat: 0, lng: 0, name: '(MTN) KM 18+200', city: 'Tangerang', stream_url: 'https://jmlive.jasamarga.com/hls/28/e3344792-2b56-438f-b000-5490e7eac8e7/index.m3u8' },
  { id: 'jm-jsk-05', lat: 0, lng: 0, name: '(MTN) KM 19+200', city: 'Tangerang', stream_url: 'https://jmlive.jasamarga.com/hls/28/2049cdac-54d3-4953-a5f2-90ff05d034fd/index.m3u8' },
  { id: 'jm-jsk-06', lat: 0, lng: 0, name: '(MTN) KM 22+200', city: 'Tangerang', stream_url: 'https://jmlive.jasamarga.com/hls/28/bea15559-d3ed-4cd5-84ed-18d1d93f36e8/index.m3u8' },
  { id: 'jm-jsk-07', lat: 0, lng: 0, name: '(MTN) KM 23+200', city: 'Tangerang', stream_url: 'https://jmlive.jasamarga.com/hls/28/d15da191-01d1-4c14-a7d6-b52c3bd579df/index.m3u8' },
  { id: 'jm-jsk-08', lat: 0, lng: 0, name: '(MTN) KM 25+500', city: 'Tangerang', stream_url: 'https://jmlive.jasamarga.com/hls/28/b59640ea-9fc9-4328-a6e7-4305ef008a10/index.m3u8' },
];

// ── JORR 2 (Kunciran–Cengkareng) — 4 cameras ──
const JKC_CAMERAS: CameraEntry[] = [
  { id: 'jm-jkc-01', lat: 0, lng: 0, name: 'cctv_jorr2_1', city: 'Tangerang', stream_url: 'https://jmlive.jasamarga.com/hls/33/904369e5-e08f-4e20-b383-2fadc145f582/index.m3u8' },
  { id: 'jm-jkc-02', lat: 0, lng: 0, name: 'cctv_jorr2_2', city: 'Tangerang', stream_url: 'https://jmlive.jasamarga.com/hls/33/d169edd0-c063-4e09-878b-3e066fcebf77/index.m3u8' },
  { id: 'jm-jkc-03', lat: 0, lng: 0, name: 'cctv_jorr2_3', city: 'Tangerang', stream_url: 'https://jmlive.jasamarga.com/hls/33/fa3cfb3e-d68b-4a04-8a6d-82f9fe49ed0f/index.m3u8' },
  { id: 'jm-jkc-04', lat: 0, lng: 0, name: 'cctv_jorr2_4', city: 'Tangerang', stream_url: 'https://jmlive.jasamarga.com/hls/33/fd8dafb7-ddaf-469c-b533-3839d6e18bed/index.m3u8' },
];

// ── JORR W1 (Pondok Pinang–Ulujami) — 7 cameras ── (from cctvjorrw1.com)
const W1_CAMERAS: CameraEntry[] = [
  { id: 'cct-w1-01', lat: 0, lng: 0, name: 'JORR W1 KM 01+000', city: 'Jakarta', stream_url: 'https://cctvjorrw1.com/camera/share/tios/2/22/index.m3u8' },
  { id: 'cct-w1-02', lat: 0, lng: 0, name: 'JORR W1 KM 02+000', city: 'Jakarta', stream_url: 'https://cctvjorrw1.com/camera/share/tios/2/24/index.m3u8' },
  { id: 'cct-w1-03', lat: 0, lng: 0, name: 'JORR W1 KM 03+000', city: 'Jakarta', stream_url: 'https://cctvjorrw1.com/camera/share/tios/2/9/index.m3u8' },
  { id: 'cct-w1-04', lat: 0, lng: 0, name: 'JORR W1 KM 04+000', city: 'Jakarta', stream_url: 'https://cctvjorrw1.com/camera/share/tios/2/10/index.m3u8' },
  { id: 'cct-w1-05', lat: 0, lng: 0, name: 'JORR W1 KM 05+000', city: 'Jakarta', stream_url: 'https://cctvjorrw1.com/camera/share/tios/2/11/index.m3u8' },
  { id: 'cct-w1-06', lat: 0, lng: 0, name: 'JORR W1 KM 06+000', city: 'Jakarta', stream_url: 'https://cctvjorrw1.com/camera/share/tios/2/12/index.m3u8' },
  { id: 'cct-w1-07', lat: 0, lng: 0, name: 'JORR W1 KM 07+000', city: 'Jakarta', stream_url: 'https://cctvjorrw1.com/camera/share/tios/2/13/index.m3u8' },
];

// ═══════════════════════════════════════════════
//  POST-PROCESS: fill coordinates from KM markers
// ═══════════════════════════════════════════════

function fillCoords(cams: CameraEntry[], wp: Waypoint[]): void {
  // A camera's "KM nnn" marker is only usable if it falls within this road's
  // waypoint range. Some roads label cameras with cumulative Trans-Java KM
  // (e.g. Solo–Ngawi "KM 493+") while their waypoints use local KM (0–75);
  // those markers are meaningless here and would otherwise all clamp onto the
  // road's last point. Cameras without a usable marker (no marker, or one out
  // of range) are spread evenly along the road by index — array order
  // preserves the cameras' real sequence along the highway.
  const kmMin = wp[0].km, kmMax = wp[wp.length - 1].km;
  const usableKm = (cam: CameraEntry): number | null => {
    const km = parseKm(cam.name);
    return km != null && km >= kmMin && km <= kmMax ? km : null;
  };
  const spread = cams.filter(c => c.lat === 0 && c.lng === 0 && usableKm(c) == null);
  let spreadIdx = 0;
  for (const cam of cams) {
    if (cam.lat === 0 && cam.lng === 0) {
      const km = usableKm(cam);
      let c: { lat: number; lng: number };
      if (km != null) {
        c = interpolateKm(wp, km);
      } else {
        const t = spread.length <= 1 ? 0.5 : spreadIdx / (spread.length - 1);
        c = interpolateKm(wp, kmMin + t * (kmMax - kmMin));
        spreadIdx++;
      }
      cam.lat = c.lat;
      cam.lng = c.lng;
    }
  }
}

fillCoords(JTC_CAMERAS, JTC_WP);
fillCoords(JGW_CAMERAS, JGW_WP);
fillCoords(CKP_CAMERAS, CKP_WP);
fillCoords(JGR_CAMERAS, JGR_WP);
fillCoords(JORE_CAMERAS, JORE_WP);
fillCoords(MBZ_CAMERAS, MBZ_WP);
fillCoords(JORS_CAMERAS, JORS_WP);
fillCoords(CMC_CAMERAS, CMC_WP);
fillCoords(BLM_CAMERAS, BLM_WP);
fillCoords(TBP_CAMERAS, TBP_WP);
fillCoords(TMR_CAMERAS, TMR_WP);
fillCoords(SBG_CAMERAS, SBG_WP);
fillCoords(SNG_CAMERAS, SNG_WP);
fillCoords(SPN_CAMERAS, SPN_WP);
fillCoords(SDY_CAMERAS, SDY_WP);
fillCoords(PBD_CAMERAS, PBD_WP);
fillCoords(PDM_CAMERAS, PDM_WP);
fillCoords(PLI_CAMERAS, PLI_WP);
fillCoords(JNK_CAMERAS, JNK_WP);
fillCoords(MJS_CAMERAS, MJS_WP);
fillCoords(KLB_CAMERAS, KLB_WP);
fillCoords(KRM_CAMERAS, KRM_WP);
fillCoords(JJS_CAMERAS, JJS_WP);
fillCoords(GPS_CAMERAS, GPS_WP);
fillCoords(GPD_CAMERAS, GPD_WP);
fillCoords(ATP_CAMERAS, ATP_WP);
fillCoords(KDG_CAMERAS, KDG_WP);
fillCoords(PAD_CAMERAS, PAD_WP);
fillCoords(BOR_CAMERAS, BOR_WP);
fillCoords(W2U_CAMERAS, W2U_WP);
fillCoords(JSK_CAMERAS, JSK_WP);
fillCoords(JKC_CAMERAS, JKC_WP);
fillCoords(W1_CAMERAS, W1_WP);


// ═══════════════════════════════════════════════
//  EXPORT
// ═══════════════════════════════════════════════

let cached: CctvCamera[] | null = null;
let cacheTs = 0;

function toCctv(cam: CameraEntry, source: string, streamType: 'hls' | 'iframe' = 'hls'): CctvCamera {
  return {
    id: cam.id,
    lat: cam.lat,
    lng: cam.lng,
    name: cam.name,
    city: cam.city,
    country: 'Indonesia',
    stream_url: cam.stream_url,
    stream_type: streamType,
    source,
  };
}

export async function fetchIndonesiaCameras(): Promise<CctvCamera[]> {
  if (cached && Date.now() - cacheTs < CACHE_TTL_MS) return cached;

  const cameras: CctvCamera[] = [];

  for (const cam of ITS_CAMERAS) cameras.push(toCctv(cam, 'Bina Marga'));
  for (const cam of BRIDGE_CAMERAS) cameras.push(toCctv(cam, 'Bina Marga'));

  for (const cam of JTC_CAMERAS) cameras.push(toCctv(cam, 'Jasa Marga'));
  for (const cam of JGW_CAMERAS) cameras.push(toCctv(cam, 'Jasa Marga'));
  for (const cam of CKP_CAMERAS) cameras.push(toCctv(cam, 'Jasa Marga'));
  for (const cam of JGR_CAMERAS) cameras.push(toCctv(cam, 'Jasa Marga'));
  for (const cam of JORE_CAMERAS) cameras.push(toCctv(cam, 'Jasa Marga'));
  for (const cam of MBZ_CAMERAS) cameras.push(toCctv(cam, 'Jasa Marga'));

  for (const cam of JORS_CAMERAS) cameras.push(toCctv(cam, 'CCT Indonesia'));
  for (const cam of CMC_CAMERAS) cameras.push(toCctv(cam, 'CCT Indonesia'));
  // New infotol roads
  for (const cam of BLM_CAMERAS) cameras.push(toCctv(cam, 'Jasa Marga'));
  for (const cam of TBP_CAMERAS) cameras.push(toCctv(cam, 'CCT Indonesia'));
  for (const cam of TMR_CAMERAS) cameras.push(toCctv(cam, 'Jasa Marga'));
  for (const cam of SBG_CAMERAS) cameras.push(toCctv(cam, 'Jasa Marga'));
  for (const cam of SNG_CAMERAS) cameras.push(toCctv(cam, 'Jasa Marga'));
  for (const cam of SPN_CAMERAS) cameras.push(toCctv(cam, 'CCT Indonesia'));
  for (const cam of SDY_CAMERAS) cameras.push(toCctv(cam, 'Jasa Marga'));
  for (const cam of PBD_CAMERAS) cameras.push(toCctv(cam, 'CCT Indonesia'));
  for (const cam of PDM_CAMERAS) cameras.push(toCctv(cam, 'Jasa Marga'));
  for (const cam of PLI_CAMERAS) cameras.push(toCctv(cam, 'CCT Indonesia'));
  for (const cam of JNK_CAMERAS) cameras.push(toCctv(cam, 'Jasa Marga'));
  for (const cam of MJS_CAMERAS) cameras.push(toCctv(cam, 'Jasa Marga'));
  for (const cam of KLB_CAMERAS) cameras.push(toCctv(cam, 'CCT Indonesia'));
  for (const cam of KRM_CAMERAS) cameras.push(toCctv(cam, 'Jasa Marga'));
  for (const cam of JJS_CAMERAS) cameras.push(toCctv(cam, 'Jasa Marga'));
  for (const cam of GPS_CAMERAS) cameras.push(toCctv(cam, 'Jasa Marga'));
  for (const cam of GPD_CAMERAS) cameras.push(toCctv(cam, 'Jasa Marga'));
  for (const cam of ATP_CAMERAS) cameras.push(toCctv(cam, 'CCT Indonesia'));
  for (const cam of KDG_CAMERAS) cameras.push(toCctv(cam, 'CCT Indonesia'));
  for (const cam of PAD_CAMERAS) cameras.push(toCctv(cam, 'Jasa Marga'));
  for (const cam of BOR_CAMERAS) cameras.push(toCctv(cam, 'Jasa Marga'));
  for (const cam of W2U_CAMERAS) cameras.push(toCctv(cam, 'Jasa Marga'));
  for (const cam of JSK_CAMERAS) cameras.push(toCctv(cam, 'Jasa Marga'));
  for (const cam of JKC_CAMERAS) cameras.push(toCctv(cam, 'Jasa Marga'));
  for (const cam of W1_CAMERAS) cameras.push(toCctv(cam, 'CCT Indonesia'));


  for (const cam of BALI_TOWER_CAMERAS) cameras.push(toCctv(cam, 'Bali Tower', 'iframe'));

  cached = cameras;
  cacheTs = Date.now();
  return cameras;
}
