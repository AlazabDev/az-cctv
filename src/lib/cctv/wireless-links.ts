/** Wireless point-to-point geometry: indicative until terrain and Fresnel clearance are surveyed. */
export type GeoPoint = {lat:number;lng:number};
export type WirelessLink = {
 id:string; name:string; from:GeoPoint; to:GeoPoint;
 frequencyGHz:number; heightFromM:number; heightToM:number;
 productId?:string; model?:string;
};
export function geoDistanceM(a:GeoPoint,b:GeoPoint):number{
 if(![a.lat,a.lng,b.lat,b.lng].every(Number.isFinite))return NaN;
 const rad=Math.PI/180,R=6371000,dLat=(b.lat-a.lat)*rad,dLon=(b.lng-a.lng)*rad;
 const v=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2;
 return R*2*Math.asin(Math.min(1,Math.sqrt(v)));
}
export function wirelessLinkAssessment(link:WirelessLink){
 const distanceM=geoDistanceM(link.from,link.to);
 const frequencyGHz=link.frequencyGHz;
 const valid=Number.isFinite(distanceM)&&distanceM>0&&Number.isFinite(frequencyGHz)&&frequencyGHz>0&&
  Number.isFinite(link.heightFromM)&&link.heightFromM>0&&Number.isFinite(link.heightToM)&&link.heightToM>0;
 if(!valid)return {valid:false,distanceM,firstFresnelRadiusM:null,minimumClearanceM:null,losVerified:false};
 const wavelengthM=0.299792458/frequencyGHz;
 const firstFresnelRadiusM=Math.sqrt(wavelengthM*distanceM/4);
 return {valid:true,distanceM,firstFresnelRadiusM,minimumClearanceM:0.6*firstFresnelRadiusM,losVerified:false};
}
