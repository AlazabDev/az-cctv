import { describe, expect, it } from "vitest";
import { geoDistanceM, wirelessLinkAssessment, type WirelessLink } from "../src/lib/cctv/wireless-links";
import { normalizeSiteMap } from "../src/lib/cctv/site-map";

const link:WirelessLink={
  id:"ptp-1",name:"Building A to B",
  from:{lat:30,lng:31},to:{lat:30,lng:31.001},
  frequencyGHz:5.8,heightFromM:6,heightToM:6
};
describe("Site map wireless PTP engineering",()=>{
  it("computes geographic distance in meters and Fresnel 60% minimum clearance",()=>{
    const assessment=wirelessLinkAssessment(link);
    expect(assessment.valid).toBe(true);
    expect(assessment.distanceM).toBeGreaterThan(90);
    expect(assessment.distanceM).toBeLessThan(100);
    expect(assessment.firstFresnelRadiusM).toBeGreaterThan(0);
    expect(assessment.minimumClearanceM).toBeCloseTo(assessment.firstFresnelRadiusM!*0.6,6);
    expect(assessment.losVerified).toBe(false);
  });
  it("never claims LOS verified on missing terrain/obstacle survey",()=>{
    expect(wirelessLinkAssessment({...link,heightFromM:0}).valid).toBe(false);
    expect(wirelessLinkAssessment({...link,frequencyGHz:0}).valid).toBe(false);
    expect(wirelessLinkAssessment({...link,to:link.from}).valid).toBe(false);
    expect(geoDistanceM(link.from,link.from)).toBe(0);
  });
  it("round trips saved wireless links and upgrades legacy plans",()=>{
    expect(normalizeSiteMap({wirelessLinks:[link]}).wirelessLinks).toEqual([link]);
    expect(normalizeSiteMap({cameras:[]})).toMatchObject({wirelessLinks:[]});
  });
});
