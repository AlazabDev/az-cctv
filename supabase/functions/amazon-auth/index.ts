import { serveAdmin,accessToken,amazonMarket,amazonSandbox } from "../_shared/amazon.ts";
Deno.serve(req=>serveAdmin(req,async()=>{
 await accessToken(); // The token is NEVER returned to a browser or logged.
 return {configured:true,marketplace_id:amazonMarket(),sandbox:amazonSandbox(),token_ready:true};
}));