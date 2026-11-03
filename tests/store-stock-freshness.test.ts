import { describe, expect, it } from "vitest";
import { isAvailable, type StoreProduct } from "../src/lib/store/catalog";
function stock(in_stock:boolean|null, stock_checked_at:string|null, metadata:Record<string,unknown>={}):StoreProduct{
  return {in_stock,stock_checked_at,metadata} as StoreProduct;
}
describe("Supplier inventory display semantics",()=>{
  it("exposes only recently verified supplier availability",()=>{
    const now=new Date().toISOString();
    expect(isAvailable(stock(true,now))).toBe(true);
    expect(isAvailable(stock(false,now))).toBe(false);
  });
  it("does not promote old imported metadata to verified stock",()=>{
    expect(isAvailable(stock(null,null,{available:true}))).toBe(null);
    const expired=new Date(Date.now()-50*60*60*1000).toISOString();
    expect(isAvailable(stock(true,expired,{available:true}))).toBe(null);
  });
  it("does not accept future-dated inventory as a verified signal",()=>{
    const future=new Date(Date.now()+60*60*1000).toISOString();
    expect(isAvailable(stock(true,future))).toBe(null);
  });
});