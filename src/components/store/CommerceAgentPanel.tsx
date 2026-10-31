import { useEffect,useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bot,MessageCircle,Send,X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Message={role:"user"|"assistant";content:string};
export function CommerceAgentPanel(){
 const [open,setOpen]=useState(false);
 const [signedIn,setSignedIn]=useState<boolean|null>(null);
 const [messages,setMessages]=useState<Message[]>([]);
 const [text,setText]=useState("");
 const [threadId,setThreadId]=useState<string|null>(null);
 const [sending,setSending]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{
  let active=true;
  void supabase.auth.getUser().then(({data})=>{if(active)setSignedIn(Boolean(data.user))});
  const {data}=supabase.auth.onAuthStateChange((_event,session)=>setSignedIn(Boolean(session)));
  return()=>{active=false;data.subscription.unsubscribe()};
 },[]);
 async function send(){
  const message=text.trim();if(!message||sending)return;
  setMessages(x=>[...x,{role:"user",content:message}]);setText("");setError("");setSending(true);
  try{
   const {data,error}=await supabase.functions.invoke("az-commerce-agent",{body:{message,thread_id:threadId}});
   if(error||!data?.response)throw error||new Error("تعذر الوصول للمساعد التجاري");
   setThreadId(typeof data.thread_id==="string"?data.thread_id:null);
   setMessages(x=>[...x,{role:"assistant",content:String(data.response)}]);
  }catch{setError("المساعد التجاري غير متاح الآن. يمكنك استخدام البحث أو طلب عرض السعر.");}
  finally{setSending(false)}
 }
 return <>
  <button type="button" onClick={()=>setOpen(true)} className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full bg-[#030957] px-5 py-4 font-extrabold text-white shadow-xl hover:bg-[#071379]" aria-label="افتح مساعد اختيار المعدات"><MessageCircle size={19} className="text-[#FFB900]"/> استشر مساعد المعدات</button>
  {open&&<div className="fixed inset-0 z-50 flex items-end justify-center bg-[#030957]/75 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
   <section dir="rtl" role="dialog" aria-modal="true" aria-label="مساعد معدات AZ-CCTV" className="flex h-[min(90vh,680px)] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white text-slate-900 shadow-2xl sm:rounded-3xl">
    <header className="flex items-center justify-between gap-3 bg-[#030957] px-5 py-4 text-white"><div className="flex items-center gap-3"><span className="rounded-xl bg-white/10 p-2 text-[#FFB900]"><Bot size={25}/></span><div><h2 className="font-black">مساعد اختيار المعدات</h2><p className="text-xs text-slate-300">البحث والمقارنة والتقدير الأولي</p></div></div><button onClick={()=>setOpen(false)} aria-label="إغلاق المساعد" className="rounded-lg p-2 hover:bg-white/10"><X size={20}/></button></header>
    {signedIn===false?<div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center"><p className="text-sm leading-8">يحتاج المساعد إلى حساب لحفظ محادثتك وطلباتك. تصفح المتجر متاح للجميع بدون تسجيل.</p><Link to="/auth" onClick={()=>setOpen(false)} className="rounded-xl bg-[#FFB900] px-6 py-3 font-black text-[#030957]">تسجيل الدخول</Link></div>:
    <><div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 px-5 py-5" aria-live="polite">{!messages.length&&<p className="rounded-2xl bg-white p-5 text-sm leading-8 text-slate-600">اسأل عن كاميرا أو موديل أو تقدير مبدئي لعدد الأجهزة. الأسعار تُقرأ من الكتالوج؛ الحسابات الهندسية النهائية تحتاج مخططًا ومواصفات موثقة.</p>}{messages.map((m,i)=><div key={i} className={`max-w-[88%] whitespace-pre-wrap rounded-2xl p-4 text-sm leading-7 ${m.role==="user"?"mr-auto bg-[#030957] text-white":"ml-auto bg-white text-slate-700 shadow-sm"}`}>{m.content}</div>)}{sending&&<p className="text-xs text-slate-500">جارٍ الاستعلام…</p>}{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}</div>
    <form onSubmit={e=>{e.preventDefault();void send()}} className="flex gap-2 border-t border-slate-200 bg-white p-4"><input aria-label="سؤالك عن المعدات" placeholder="ما أفضل كاميرا خارجية 4MP؟" maxLength={2000} disabled={sending||signedIn!==true} value={text} onChange={e=>setText(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-[#030957]"/><button disabled={!text.trim()||sending||signedIn!==true} type="submit" aria-label="إرسال السؤال" className="rounded-xl bg-[#FFB900] p-3 text-[#030957] disabled:opacity-50"><Send size={20}/></button></form></>}
   </section>
  </div>}
 </>;
}