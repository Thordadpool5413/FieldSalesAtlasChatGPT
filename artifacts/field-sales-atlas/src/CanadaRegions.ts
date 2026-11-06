
import type { Airport } from './opsModels';

export type CanadianRegion = {
  code:string; name:string; country:'CA'; anchorCity:string; lat:number; lon:number;
};

export const CANADA_REGIONS: CanadianRegion[] = [
  {code:'AB',name:'Alberta',country:'CA',anchorCity:'Calgary',lat:51.0447,lon:-114.0719},
  {code:'BC',name:'British Columbia',country:'CA',anchorCity:'Vancouver',lat:49.2827,lon:-123.1207},
  {code:'MB',name:'Manitoba',country:'CA',anchorCity:'Winnipeg',lat:49.8951,lon:-97.1384},
  {code:'NB',name:'New Brunswick',country:'CA',anchorCity:'Moncton',lat:46.0878,lon:-64.7782},
  {code:'NL',name:'Newfoundland and Labrador',country:'CA',anchorCity:"St. John's",lat:47.5615,lon:-52.7126},
  {code:'NS',name:'Nova Scotia',country:'CA',anchorCity:'Halifax',lat:44.6488,lon:-63.5752},
  {code:'NT',name:'Northwest Territories',country:'CA',anchorCity:'Yellowknife',lat:62.4540,lon:-114.3718},
  {code:'NU',name:'Nunavut',country:'CA',anchorCity:'Iqaluit',lat:63.7467,lon:-68.5170},
  {code:'ON',name:'Ontario',country:'CA',anchorCity:'Toronto',lat:43.6532,lon:-79.3832},
  {code:'PE',name:'Prince Edward Island',country:'CA',anchorCity:'Charlottetown',lat:46.2382,lon:-63.1311},
  {code:'QC',name:'Quebec',country:'CA',anchorCity:'Montréal',lat:45.5017,lon:-73.5673},
  {code:'SK',name:'Saskatchewan',country:'CA',anchorCity:'Regina',lat:50.4452,lon:-104.6189},
  {code:'YT',name:'Yukon',country:'CA',anchorCity:'Whitehorse',lat:60.7212,lon:-135.0568},
];
export const CANADA_REGION_BY_CODE:Record<string,CanadianRegion>=Object.fromEntries(CANADA_REGIONS.map(r=>[r.code,r]));

export const CANADA_CITIES:Array<{code:string;name:string;state:string;lat:number;lon:number}> = [
  {code:'CAON-TOR',name:'Toronto',state:'ON',lat:43.6532,lon:-79.3832},
  {code:'CAON-OTT',name:'Ottawa',state:'ON',lat:45.4215,lon:-75.6972},
  {code:'CAON-HAM',name:'Hamilton',state:'ON',lat:43.2557,lon:-79.8711},
  {code:'CAON-LON',name:'London',state:'ON',lat:42.9849,lon:-81.2453},
  {code:'CAON-MIS',name:'Mississauga',state:'ON',lat:43.5890,lon:-79.6441},
  {code:'CAQC-MTL',name:'Montréal',state:'QC',lat:45.5017,lon:-73.5673},
  {code:'CAQC-QUE',name:'Québec City',state:'QC',lat:46.8139,lon:-71.2080},
  {code:'CAQC-SHE',name:'Sherbrooke',state:'QC',lat:45.4042,lon:-71.8929},
  {code:'CABC-VAN',name:'Vancouver',state:'BC',lat:49.2827,lon:-123.1207},
  {code:'CABC-VIC',name:'Victoria',state:'BC',lat:48.4284,lon:-123.3656},
  {code:'CABC-KEW',name:'Kelowna',state:'BC',lat:49.8880,lon:-119.4960},
  {code:'CAAB-CGY',name:'Calgary',state:'AB',lat:51.0447,lon:-114.0719},
  {code:'CAAB-YEG',name:'Edmonton',state:'AB',lat:53.5461,lon:-113.4938},
  {code:'CAMB-YWG',name:'Winnipeg',state:'MB',lat:49.8951,lon:-97.1384},
  {code:'CASK-YQR',name:'Regina',state:'SK',lat:50.4452,lon:-104.6189},
  {code:'CASK-YXE',name:'Saskatoon',state:'SK',lat:52.1579,lon:-106.6702},
  {code:'CANS-YHZ',name:'Halifax',state:'NS',lat:44.6488,lon:-63.5752},
  {code:'CANB-YQM',name:'Moncton',state:'NB',lat:46.0878,lon:-64.7782},
  {code:'CANB-YFC',name:'Fredericton',state:'NB',lat:45.9636,lon:-66.6431},
  {code:'CANL-YYT',name:"St. John's",state:'NL',lat:47.5615,lon:-52.7126},
  {code:'CAPE-YYG',name:'Charlottetown',state:'PE',lat:46.2382,lon:-63.1311},
  {code:'CAYT-YXY',name:'Whitehorse',state:'YT',lat:60.7212,lon:-135.0568},
  {code:'CANT-YZF',name:'Yellowknife',state:'NT',lat:62.4540,lon:-114.3718},
  {code:'CANU-YFB',name:'Iqaluit',state:'NU',lat:63.7467,lon:-68.5170},
];

export const CANADA_STARTER_AIRPORTS:Airport[] = [
  {iata:'YYZ',name:'Toronto Pearson International',state:'ON',tier:'Major',scheduled:true,lat:43.6777,lon:-79.6248,icao:'CYYZ'},
  {iata:'YTZ',name:'Billy Bishop Toronto City',state:'ON',tier:'Secondary',scheduled:true,lat:43.6275,lon:-79.3962,icao:'CYTZ'},
  {iata:'YOW',name:'Ottawa Macdonald–Cartier',state:'ON',tier:'Major',scheduled:true,lat:45.3225,lon:-75.6692,icao:'CYOW'},
  {iata:'YVR',name:'Vancouver International',state:'BC',tier:'Major',scheduled:true,lat:49.1947,lon:-123.1792,icao:'CYVR'},
  {iata:'YYJ',name:'Victoria International',state:'BC',tier:'Secondary',scheduled:true,lat:48.6469,lon:-123.4260,icao:'CYYJ'},
  {iata:'YUL',name:'Montréal–Trudeau International',state:'QC',tier:'Major',scheduled:true,lat:45.4706,lon:-73.7408,icao:'CYUL'},
  {iata:'YQB',name:'Québec City Jean Lesage',state:'QC',tier:'Secondary',scheduled:true,lat:46.7911,lon:-71.3933,icao:'CYQB'},
  {iata:'YYC',name:'Calgary International',state:'AB',tier:'Major',scheduled:true,lat:51.1139,lon:-114.0203,icao:'CYYC'},
  {iata:'YEG',name:'Edmonton International',state:'AB',tier:'Major',scheduled:true,lat:53.3097,lon:-113.5800,icao:'CYEG'},
  {iata:'YWG',name:'Winnipeg James Armstrong Richardson',state:'MB',tier:'Major',scheduled:true,lat:49.9100,lon:-97.2399,icao:'CYWG'},
  {iata:'YQR',name:'Regina International',state:'SK',tier:'Secondary',scheduled:true,lat:50.4319,lon:-104.6658,icao:'CYQR'},
  {iata:'YXE',name:'Saskatoon John G. Diefenbaker',state:'SK',tier:'Secondary',scheduled:true,lat:52.1708,lon:-106.6997,icao:'CYXE'},
  {iata:'YHZ',name:'Halifax Stanfield International',state:'NS',tier:'Major',scheduled:true,lat:44.8808,lon:-63.5086,icao:'CYHZ'},
  {iata:'YQM',name:'Greater Moncton Roméo LeBlanc',state:'NB',tier:'Secondary',scheduled:true,lat:46.1122,lon:-64.6786,icao:'CYQM'},
  {iata:'YYT',name:"St. John's International",state:'NL',tier:'Secondary',scheduled:true,lat:47.6186,lon:-52.7519,icao:'CYYT'},
  {iata:'YYG',name:'Charlottetown Airport',state:'PE',tier:'Secondary',scheduled:true,lat:46.2900,lon:-63.1211,icao:'CYYG'},
  {iata:'YZF',name:'Yellowknife Airport',state:'NT',tier:'Secondary',scheduled:true,lat:62.4628,lon:-114.4403,icao:'CYZF'},
  {iata:'YXY',name:'Erik Nielsen Whitehorse International',state:'YT',tier:'Secondary',scheduled:true,lat:60.7096,lon:-135.0674,icao:'CYXY'},
  {iata:'YFB',name:'Iqaluit Airport',state:'NU',tier:'Secondary',scheduled:true,lat:63.7564,lon:-68.5558,icao:'CYFB'},
];
