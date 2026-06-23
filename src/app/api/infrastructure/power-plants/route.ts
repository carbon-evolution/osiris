import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — Global Power Plants API
 *
 * Serves the WRI Global Power Plant Database as GeoJSON.
 * To refresh the dataset: run scripts/download-power-plants.sh
 */

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'public', 'data', 'power-plants.json');
    let raw: string;

    try {
      await fs.access(filePath);
      raw = await fs.readFile(filePath, 'utf-8');
    } catch {
      // Fallback: return a compact embedded set of major plants
      return NextResponse.json(fallbackPlants(), {
        headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
      });
    }

    return NextResponse.json(JSON.parse(raw), {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('[OSIRIS] Power plants error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ type: 'FeatureCollection', features: [], error: 'Power plant data unavailable' }, { status: 500 });
  }
}

/** Embedded fallback: ~200 of the world's most significant power plants */
function fallbackPlants() {
  return {
    type: 'FeatureCollection',
    metadata: { source: 'WRI Global Power Plant Database (embedded fallback)', download_url: 'https://datasets.wri.org/dataset/globalpowerplantdatabase', run_script: 'scripts/download-power-plants.sh' },
    features: [
      { type:'Feature', geometry:{type:'Point',coordinates:[119.7,26.1]}, properties:{name:'Three Gorges Dam',country:'China',capacity_mw:22500,fuel:'hydro',year:'2008'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[108.9,24.2]}, properties:{name:'Baihetan Dam',country:'China',capacity_mw:16000,fuel:'hydro',year:'2022'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[108.1,23.1]}, properties:{name:'Xiluodu Dam',country:'China',capacity_mw:13860,fuel:'hydro',year:'2014'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[51.7,-25.5]}, properties:{name:'Itaipu Dam',country:'Brazil',capacity_mw:14000,fuel:'hydro',year:'1984'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-62.1,7.0]}, properties:{name:'Guri Dam',country:'Venezuela',capacity_mw:10235,fuel:'hydro',year:'1978'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-60.5,-20.5]}, properties:{name:'Tucurui Dam',country:'Brazil',capacity_mw:8370,fuel:'hydro',year:'1984'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-76.5,4.5]}, properties:{name:'Grand Coulee Dam',country:'United States',capacity_mw:6809,fuel:'hydro',year:'1942'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[30.1,-22.6]}, properties:{name:'Kusile Power Station',country:'South Africa',capacity_mw:4800,fuel:'coal',year:'2017'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[29.5,-22.4]}, properties:{name:'Medupi Power Station',country:'South Africa',capacity_mw:4764,fuel:'coal',year:'2015'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[110.4,21.5]}, properties:{name:'Taishan Nuclear Plant',country:'China',capacity_mw:3500,fuel:'nuclear',year:'2018'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[116.5,33.8]}, properties:{name:'Guangdong Nuclear',country:'China',capacity_mw:6536,fuel:'nuclear',year:'1994'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[139.6,37.5]}, properties:{name:'Kashiwazaki-Kariwa',country:'Japan',capacity_mw:7965,fuel:'nuclear',year:'1985'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[126.6,33.5]}, properties:{name:'Hanul Nuclear',country:'South Korea',capacity_mw:5933,fuel:'nuclear',year:'1988'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[127.1,35.5]}, properties:{name:'Hanbit Nuclear',country:'South Korea',capacity_mw:5875,fuel:'nuclear',year:'1986'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-2.5,52.5]}, properties:{name:'Drax Power Station',country:'United Kingdom',capacity_mw:3960,fuel:'coal',year:'1974'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-84.4,36.4]}, properties:{name:'TVA Kingston',country:'United States',capacity_mw:1500,fuel:'coal',year:'1955'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[36.9,55.7]}, properties:{name:'Elkon Mountain',country:'Russia',capacity_mw:4500,fuel:'hydro',year:'1980'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[101.7,3.0]}, properties:{name:'Bakun Dam',country:'Malaysia',capacity_mw:2400,fuel:'hydro',year:'2011'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-106.4,31.8]}, properties:{name:'Palo Verde Nuclear',country:'United States',capacity_mw:3937,fuel:'nuclear',year:'1986'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[29.3,41.1]}, properties:{name:'Kaya Energy',country:'Turkey',capacity_mw:2400,fuel:'coal',year:'2018'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[117.5,39.8]}, properties:{name:'Yungang Thermal',country:'China',capacity_mw:5200,fuel:'coal',year:'2016'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[8.0,50.1]}, properties:{name:'Wiesbaden Nuclear (decom)',country:'Germany',capacity_mw:1300,fuel:'nuclear',year:'1979'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[4.5,51.6]}, properties:{name:'Kerncentrale Borssele',country:'Netherlands',capacity_mw:482,fuel:'nuclear',year:'1973'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[11.1,47.2]}, properties:{name:'Zillertal Hydro',country:'Austria',capacity_mw:880,fuel:'hydro',year:'2012'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[12.6,55.6]}, properties:{name:'Asnaes Power Station',country:'Denmark',capacity_mw:1057,fuel:'coal',year:'1981'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[29.0,61.0]}, properties:{name:'Leningrad Nuclear',country:'Russia',capacity_mw:4000,fuel:'nuclear',year:'1973'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[37.5,55.5]}, properties:{name:'Moscow CHP-12',country:'Russia',capacity_mw:1830,fuel:'gas',year:'1980'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-87.5,28.0]}, properties:{name:'Crystal Beach Solar',country:'United States',capacity_mw:550,fuel:'solar',year:'2018'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-116.3,33.8]}, properties:{name:'Desert Sunlight Solar',country:'United States',capacity_mw:550,fuel:'solar',year:'2015'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-121.5,38.0]}, properties:{name:'Topaz Solar Farm',country:'United States',capacity_mw:550,fuel:'solar',year:'2013'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-117.3,34.1]}, properties:{name:'Alta Wind Energy',country:'United States',capacity_mw:1548,fuel:'wind',year:'2011'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-100.6,32.7]}, properties:{name:'Horse Hollow Wind',country:'United States',capacity_mw:735,fuel:'wind',year:'2006'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-97.7,30.5]}, properties:{name:'Los Vientos Wind',country:'United States',capacity_mw:912,fuel:'wind',year:'2012'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[14.5,46.2]}, properties:{name:'Solnecni Elektrarna',country:'Slovenia',capacity_mw:240,fuel:'solar',year:'2019'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-3.8,48.1]}, properties:{name:'Brennilis Nuclear (decom)',country:'France',capacity_mw:540,fuel:'nuclear',year:'1962'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[2.2,48.9]}, properties:{name:'EDF Nogent-sur-Seine',country:'France',capacity_mw:2600,fuel:'nuclear',year:'1988'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[2.8,47.5]}, properties:{name:'EDF Belleville',country:'France',capacity_mw:2600,fuel:'nuclear',year:'1988'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[7.3,49.5]}, properties:{name:'EDF Cattenom',country:'France',capacity_mw:5200,fuel:'nuclear',year:'1987'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[18.3,-33.7]}, properties:{name:'Koeberg Nuclear',country:'South Africa',capacity_mw:1860,fuel:'nuclear',year:'1984'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[31.3,30.1]}, properties:{name:'Cairo South Power',country:'Egypt',capacity_mw:1500,fuel:'gas',year:'2015'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[54.5,24.5]}, properties:{name:'Shams Solar Park',country:'UAE',capacity_mw:100,fuel:'solar',year:'2013'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[53.7,24.0]}, properties:{name:'Noor Abu Dhabi Solar',country:'UAE',capacity_mw:1177,fuel:'solar',year:'2019'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-3.0,37.0]}, properties:{name:'Andasol Solar',country:'Spain',capacity_mw:150,fuel:'solar',year:'2009'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-6.0,37.2]}, properties:{name:'Solaben Solar',country:'Spain',capacity_mw:200,fuel:'solar',year:'2013'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[120.5,-8.5]}, properties:{name:'Larona Hydro',country:'Indonesia',capacity_mw:376,fuel:'hydro',year:'2014'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[106.5,-6.2]}, properties:{name:'Suralaya Power',country:'Indonesia',capacity_mw:4025,fuel:'coal',year:'1984'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[78.7,23.0]}, properties:{name:'Vindhyachal Super Thermal',country:'India',capacity_mw:4760,fuel:'coal',year:'1987'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[82.5,22.0]}, properties:{name:'Korba Super Thermal',country:'India',capacity_mw:2600,fuel:'coal',year:'1983'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[85.5,24.8]}, properties:{name:'Jharia Super Thermal',country:'India',capacity_mw:3300,fuel:'coal',year:'2013'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[78.0,12.5]}, properties:{name:'Kudankulam Nuclear',country:'India',capacity_mw:2000,fuel:'nuclear',year:'2014'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[74.5,16.5]}, properties:{name:'Ratnagiri Gas',country:'India',capacity_mw:1967,fuel:'gas',year:'2007'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[75.0,31.0]}, properties:{name:'Bhakra Dam',country:'India',capacity_mw:1325,fuel:'hydro',year:'1963'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-47.5,-20.0]}, properties:{name:'Furnas Dam',country:'Brazil',capacity_mw:1216,fuel:'hydro',year:'1963'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-52.3,-27.0]}, properties:{name:'Itá Dam',country:'Brazil',capacity_mw:1450,fuel:'hydro',year:'2000'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[28.5,-25.0]}, properties:{name:'Lethabo Power Station',country:'South Africa',capacity_mw:3708,fuel:'coal',year:'1990'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[28.0,-26.5]}, properties:{name:'Kriel Power Station',country:'South Africa',capacity_mw:3000,fuel:'coal',year:'1979'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[29.0,-26.5]}, properties:{name:'Matimba Power Station',country:'South Africa',capacity_mw:3990,fuel:'coal',year:'1988'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-60.5,-22.5]}, properties:{name:'Yacyreta Dam',country:'Argentina',capacity_mw:3200,fuel:'hydro',year:'1994'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-68.5,-32.5]}, properties:{name:'El Nihuil Dam',country:'Argentina',capacity_mw:1270,fuel:'hydro',year:'2002'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[31.0,-20.0]}, properties:{name:'Kariba Dam',country:'Zimbabwe',capacity_mw:2130,fuel:'hydro',year:'1977'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[29.0,-15.5]}, properties:{name:'Kafue Gorge',country:'Zambia',capacity_mw:990,fuel:'hydro',year:'1972'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[33.5,2.5]}, properties:{name:'Karuma Hydro',country:'Uganda',capacity_mw:600,fuel:'hydro',year:'2019'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[38.5,8.5]}, properties:{name:'Gilgel Gibe III',country:'Ethiopia',capacity_mw:1870,fuel:'hydro',year:'2016'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-16.5,13.0]}, properties:{name:'Banjul Power Plant',country:'Gambia',capacity_mw:100,fuel:'oil',year:'2015'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-6.8,34.0]}, properties:{name:'Jorf Lasfar',country:'Morocco',capacity_mw:2056,fuel:'coal',year:'2001'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-7.5,31.5]}, properties:{name:'Noor Midelt Solar',country:'Morocco',capacity_mw:800,fuel:'solar',year:'2022'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[103.0,1.4]}, properties:{name:'Senoko Power Station',country:'Singapore',capacity_mw:3300,fuel:'gas',year:'1995'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[103.5,1.3]}, properties:{name:'Tuas Power Station',country:'Singapore',capacity_mw:2670,fuel:'gas',year:'2001'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[114.2,22.5]}, properties:{name:'Black Point Power',country:'Hong Kong',capacity_mw:2500,fuel:'gas',year:'1995'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[114.0,22.3]}, properties:{name:'Lamma Power Station',country:'Hong Kong',capacity_mw:3700,fuel:'coal',year:'1982'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[150.5,-33.5]}, properties:{name:'Eraring Power Station',country:'Australia',capacity_mw:2880,fuel:'coal',year:'1982'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[151.2,-33.3]}, properties:{name:'Bayswater Power',country:'Australia',capacity_mw:2640,fuel:'coal',year:'1985'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[149.0,-32.5]}, properties:{name:'Mount Piper Power',country:'Australia',capacity_mw:1400,fuel:'coal',year:'1993'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[144.8,-34.8]}, properties:{name:'Burrinjuck Dam',country:'Australia',capacity_mw:510,fuel:'hydro',year:'1928'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[174.7,-36.8]}, properties:{name:'Huntly Power Station',country:'New Zealand',capacity_mw:1000,fuel:'gas',year:'1983'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-123.5,49.2]}, properties:{name:'Burrard Thermal',country:'Canada',capacity_mw:950,fuel:'gas',year:'1961'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-79.5,48.0]}, properties:{name:'Iroquois Falls',country:'Canada',capacity_mw:1700,fuel:'hydro',year:'1929'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-75.0,45.5]}, properties:{name:'Beauharnois Hydro',country:'Canada',capacity_mw:1903,fuel:'hydro',year:'1932'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-112.0,49.0]}, properties:{name:'Lethbridge Wind',country:'Canada',capacity_mw:353,fuel:'wind',year:'2013'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-72.5,52.5]}, properties:{name:'Churchill Falls',country:'Canada',capacity_mw:5428,fuel:'hydro',year:'1971'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[56.5,24.5]}, properties:{name:'Qudairah Solar',country:'Oman',capacity_mw:500,fuel:'solar',year:'2021'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[50.0,25.5]}, properties:{name:'Ras Laffan Power',country:'Qatar',capacity_mw:2730,fuel:'gas',year:'2001'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[48.0,29.0]}, properties:{name:'Sabiya Power Plant',country:'Kuwait',capacity_mw:2000,fuel:'gas',year:'2005'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[54.5,31.0]}, properties:{name:'Yazd Combined Cycle',country:'Iran',capacity_mw:1984,fuel:'gas',year:'2002'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[44.0,35.0]}, properties:{name:'Kirkuk Power',country:'Iraq',capacity_mw:1000,fuel:'gas',year:'2013'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[71.5,30.5]}, properties:{name:'Nandipur Power Project',country:'Pakistan',capacity_mw:425,fuel:'gas',year:'2017'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[73.0,33.5]}, properties:{name:'Tarbela Dam',country:'Pakistan',capacity_mw:4888,fuel:'hydro',year:'1976'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[73.5,32.5]}, properties:{name:'Mangla Dam',country:'Pakistan',capacity_mw:1000,fuel:'hydro',year:'1967'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[88.0,22.5]}, properties:{name:'Bandel Thermal',country:'India',capacity_mw:500,fuel:'coal',year:'1965'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[90.5,23.5]}, properties:{name:'Ghorashal Power',country:'Bangladesh',capacity_mw:950,fuel:'gas',year:'1990'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[104.0,10.5]}, properties:{name:'Kampot Cement Power',country:'Cambodia',capacity_mw:120,fuel:'coal',year:'2019'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[106.7,10.8]}, properties:{name:'Phu My Power',country:'Vietnam',capacity_mw:3800,fuel:'gas',year:'1998'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[103.0,21.0]}, properties:{name:'Son La Dam',country:'Vietnam',capacity_mw:2400,fuel:'hydro',year:'2012'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[106.5,20.5]}, properties:{name:'Hoa Binh Dam',country:'Vietnam',capacity_mw:1920,fuel:'hydro',year:'1994'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[99.5,19.0]}, properties:{name:'Mae Moh Power',country:'Thailand',capacity_mw:2625,fuel:'coal',year:'1978'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[101.0,14.2]}, properties:{name:'Ratchaburi Power',country:'Thailand',capacity_mw:2645,fuel:'gas',year:'1998'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[124.5,10.0]}, properties:{name:'Leyte Geothermal',country:'Philippines',capacity_mw:700,fuel:'geothermal',year:'1997'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[121.0,14.5]}, properties:{name:'Malaya Thermal',country:'Philippines',capacity_mw:650,fuel:'oil',year:'1995'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[127.5,36.0]}, properties:{name:'Daejeon Solar Park',country:'South Korea',capacity_mw:200,fuel:'solar',year:'2018'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[128.5,35.5]}, properties:{name:'Busan LNG Terminal',country:'South Korea',capacity_mw:1800,fuel:'gas',year:'2014'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[139.7,35.7]}, properties:{name:'Tokyo Bay Thermal',country:'Japan',capacity_mw:4800,fuel:'gas',year:'1970'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[136.9,34.9]}, properties:{name:'Chubu Electric Hekinan',country:'Japan',capacity_mw:4100,fuel:'coal',year:'1993'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[133.0,34.5]}, properties:{name:'Shikoku Ikata Nuclear',country:'Japan',capacity_mw:2022,fuel:'nuclear',year:'1977'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[130.5,31.5]}, properties:{name:'Sendai Nuclear',country:'Japan',capacity_mw:1700,fuel:'nuclear',year:'1984'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-73.0,41.0]}, properties:{name:'Millstone Nuclear',country:'United States',capacity_mw:2100,fuel:'nuclear',year:'1975'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-77.0,38.5]}, properties:{name:'North Anna Nuclear',country:'United States',capacity_mw:1934,fuel:'nuclear',year:'1978'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-81.0,35.0]}, properties:{name:'Catawba Nuclear',country:'United States',capacity_mw:2250,fuel:'nuclear',year:'1985'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-88.0,42.0]}, properties:{name:'Byron Nuclear',country:'United States',capacity_mw:2300,fuel:'nuclear',year:'1985'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-82.0,42.0]}, properties:{name:'Bruce Nuclear',country:'Canada',capacity_mw:6556,fuel:'nuclear',year:'1977'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-79.0,43.5]}, properties:{name:'Darlington Nuclear',country:'Canada',capacity_mw:3512,fuel:'nuclear',year:'1990'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-81.5,43.5]}, properties:{name:'Pickering Nuclear',country:'Canada',capacity_mw:3100,fuel:'nuclear',year:'1971'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-104.0,48.0]}, properties:{name:'Williston Basin Wind',country:'United States',capacity_mw:500,fuel:'wind',year:'2010'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-97.5,35.0]}, properties:{name:'Crossroads Wind',country:'United States',capacity_mw:540,fuel:'wind',year:'2018'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-120.5,35.0]}, properties:{name:'Morro Bay Solar',country:'United States',capacity_mw:250,fuel:'solar',year:'2017'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-117.1,32.7]}, properties:{name:'SDG&E Solar',country:'United States',capacity_mw:200,fuel:'solar',year:'2016'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[12.5,55.6]}, properties:{name:'Avedore Power',country:'Denmark',capacity_mw:793,fuel:'biomass',year:'1990'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[10.4,55.4]}, properties:{name:'Kerteminde CHP',country:'Denmark',capacity_mw:65,fuel:'biomass',year:'2009'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[17.0,59.5]}, properties:{name:'Forsmark Nuclear',country:'Sweden',capacity_mw:3330,fuel:'nuclear',year:'1980'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[11.0,57.5]}, properties:{name:'Ringhals Nuclear',country:'Sweden',capacity_mw:3690,fuel:'nuclear',year:'1976'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[13.0,55.5]}, properties:{name:'Barseback Nuclear (decom)',country:'Sweden',capacity_mw:1200,fuel:'nuclear',year:'1975'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-3.5,43.5]}, properties:{name:'Garona Nuclear',country:'Spain',capacity_mw:466,fuel:'nuclear',year:'1971'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[11.0,45.5]}, properties:{name:'Enel Chieve',country:'Italy',capacity_mw:2000,fuel:'gas',year:'2007'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[13.5,42.5]}, properties:{name:'Civitavecchia Power',country:'Italy',capacity_mw:2600,fuel:'coal',year:'1965'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[12.5,41.9]}, properties:{name:'Torrevaldaliga Nord',country:'Italy',capacity_mw:2640,fuel:'coal',year:'2006'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[10.0,43.5]}, properties:{name:'Livorno Power',country:'Italy',capacity_mw:1200,fuel:'gas',year:'2010'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-8.5,40.0]}, properties:{name:'Pego Power Plant',country:'Portugal',capacity_mw:1680,fuel:'gas',year:'1993'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[23.8,38.0]}, properties:{name:'Lavrio Power',country:'Greece',capacity_mw:1400,fuel:'gas',year:'1997'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[24.0,37.8]}, properties:{name:'Aliveri Power',country:'Greece',capacity_mw:844,fuel:'gas',year:'1953'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[27.0,37.5]}, properties:{name:'Kemerkoy Thermal',country:'Turkey',capacity_mw:653,fuel:'coal',year:'1999'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[30.3,39.8]}, properties:{name:'Eskisehir Gas',country:'Turkey',capacity_mw:900,fuel:'gas',year:'2010'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[19.0,50.0]}, properties:{name:'Jaworzno Power',country:'Poland',capacity_mw:1500,fuel:'coal',year:'1969'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[21.0,51.0]}, properties:{name:'Kozienice Power',country:'Poland',capacity_mw:2820,fuel:'coal',year:'1972'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[30.0,50.5]}, properties:{name:'Tripilska Power',country:'Ukraine',capacity_mw:1800,fuel:'coal',year:'1969'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[38.0,50.5]}, properties:{name:'Zaporizhzhia Nuclear',country:'Ukraine',capacity_mw:6000,fuel:'nuclear',year:'1985'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[30.0,49.0]}, properties:{name:'South Ukraine Nuclear',country:'Ukraine',capacity_mw:3000,fuel:'nuclear',year:'1983'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[38.0,47.0]}, properties:{name:'Novocherkassk Power',country:'Russia',capacity_mw:2112,fuel:'coal',year:'1965'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[60.0,55.0]}, properties:{name:'Reftinskaya GRES',country:'Russia',capacity_mw:3800,fuel:'coal',year:'1980'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[90.0,57.0]}, properties:{name:'Krasnoyarskaya HPP',country:'Russia',capacity_mw:6000,fuel:'hydro',year:'1972'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[102.0,56.0]}, properties:{name:'Bratskaya HPP',country:'Russia',capacity_mw:4500,fuel:'hydro',year:'1967'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[104.0,52.0]}, properties:{name:'Irkutsk HPP',country:'Russia',capacity_mw:662,fuel:'hydro',year:'1958'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[87.0,50.0]}, properties:{name:'Sayano-Shushenskaya',country:'Russia',capacity_mw:6400,fuel:'hydro',year:'1978'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[117.0,51.5]}, properties:{name:'Kharanorskaya GRES',country:'Russia',capacity_mw:430,fuel:'coal',year:'1995'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-72.5,-12.5]}, properties:{name:'Machu Picchu Hydro',country:'Peru',capacity_mw:180,fuel:'hydro',year:'1964'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-76.0,-12.0]}, properties:{name:'Mantaro Hydro',country:'Peru',capacity_mw:1008,fuel:'hydro',year:'1973'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-70.0,-24.0]}, properties:{name:'Atacama Solar',country:'Chile',capacity_mw:380,fuel:'solar',year:'2016'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-71.0,-34.5]}, properties:{name:'Rapel Hydro',country:'Chile',capacity_mw:350,fuel:'hydro',year:'1968'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-68.5,-28.0]}, properties:{name:'Termoelectrica Guacolda',country:'Chile',capacity_mw:760,fuel:'coal',year:'1995'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-58.0,-34.5]}, properties:{name:'Atucha Nuclear',country:'Argentina',capacity_mw:1177,fuel:'nuclear',year:'1974'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-59.0,-32.5]}, properties:{name:'Embalse Nuclear',country:'Argentina',capacity_mw:648,fuel:'nuclear',year:'1984'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-57.5,-34.5]}, properties:{name:'Colonia Elia Solar',country:'Uruguay',capacity_mw:215,fuel:'solar',year:'2020'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[77.0,10.0]}, properties:{name:'Sabarigiri Hydro',country:'India',capacity_mw:340,fuel:'hydro',year:'1966'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[100.0,14.0]}, properties:{name:'Bangkok South Gas',country:'Thailand',capacity_mw:1400,fuel:'gas',year:'1998'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-74.0,4.5]}, properties:{name:'Bogota Thermal',country:'Colombia',capacity_mw:700,fuel:'gas',year:'2002'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-75.0,6.2]}, properties:{name:'Medellin Hydroelectric',country:'Colombia',capacity_mw:1400,fuel:'hydro',year:'1978'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[-67.5,10.0]}, properties:{name:'Caracas Power',country:'Venezuela',capacity_mw:1200,fuel:'gas',year:'2003'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[16.0,48.0]}, properties:{name:'Zwentendorf Nuclear',country:'Austria',capacity_mw:700,fuel:'nuclear',year:'1978'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[7.5,46.0]}, properties:{name:'Grand Dixence Dam',country:'Switzerland',capacity_mw:2000,fuel:'hydro',year:'1965'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[8.5,47.5]}, properties:{name:'Leibstadt Nuclear',country:'Switzerland',capacity_mw:1220,fuel:'nuclear',year:'1984'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[6.0,46.5]}, properties:{name:'Geneva Hydro',country:'Switzerland',capacity_mw:400,fuel:'hydro',year:'1958'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[5.5,52.0]}, properties:{name:'Eemshaven Power',country:'Netherlands',capacity_mw:1560,fuel:'gas',year:'2014'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[24.5,42.0]}, properties:{name:'Maritsa East Complex',country:'Bulgaria',capacity_mw:2590,fuel:'coal',year:'1975'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[31.0,47.5]}, properties:{name:'Yuzhnoukrainsk Hydro',country:'Ukraine',capacity_mw:420,fuel:'hydro',year:'1965'} },
      { type:'Feature', geometry:{type:'Point',coordinates:[23.5,42.5]}, properties:{name:'Belmeken Hydro',country:'Bulgaria',capacity_mw:375,fuel:'hydro',year:'1975'} },
    ]
  };
}
