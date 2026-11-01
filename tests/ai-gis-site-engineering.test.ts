import {describe,expect,it} from "vitest";
import {geoToLocal,localToGeo,pointInPolygon,screenToBearing,GOAL_PPM} from "../src/lib/cctv/auto-design";
import {distanceForPpm,ppmAtDistance} from "../src/lib/cctv/geometry";
import type {CameraSpec} from "../src/lib/cctv/types";

const spec:CameraSpec={
  id:"verified",productId:"product-id",brand:"Test",model:"TEST",label:"Test camera",
  type:"bullet",megapixel:4,hres:2560,vres:1440,focal:4,hfov:80,vfov:50,
  irRange:30,price:500,poeWatt:8,bitrateMbps:4,engineeringReady:true,opticsVerified:true
};
describe("AI GIS optics and coordinate assumptions",()=>{
  it("round-trips local east/south metric coordinates to latitude and longitude",()=>{
    const origin={lat:30,lng:31};
    const p={lat:29.9995,lng:31.0007};
    const local=geoToLocal(origin,p);
    expect(local.x).toBeGreaterThan(0);
    expect(local.y).toBeGreaterThan(0);
    const returned=localToGeo(origin,local);
    expect(returned.lat).toBeCloseTo(p.lat,7);
    expect(returned.lng).toBeCloseTo(p.lng,7);
  });
  it("rejects camera points outside the surveyed polygon",()=>{
    const polygon=[{x:0,y:0},{x:100,y:0},{x:100,y:70},{x:0,y:70}];
    expect(pointInPolygon({x:20,y:20},polygon)).toBe(true);
    expect(pointInPolygon({x:120,y:20},polygon)).toBe(false);
  });
  it("uses compass bearing conversion and standard PPM thresholds",()=>{
    expect(screenToBearing(0)).toBe(90);
    expect(screenToBearing(270)).toBe(0);
    expect(GOAL_PPM.detect).toBe(25);
    expect(GOAL_PPM.recognize).toBe(125);
    const maxDistance=distanceForPpm(spec,GOAL_PPM.recognize);
    expect(ppmAtDistance(spec,maxDistance)).toBeCloseTo(125,6);
  });
});
