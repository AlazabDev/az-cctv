import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
export const Route=createFileRoute("/checkout/result")({
 head:()=>({meta:[{title:"نتيجة عملية الدفع | AZ-CCTV"},{name:"robots",content:"noindex,nofollow"}]}),
 component:ResultPage,
});
function ResultPage(){
 return <div dir="rtl" className="min-h-screen bg-[#F6F8FC]"><SiteHeader/><main className="mx-auto max-w-xl px-5 py-12">
 <section className="rounded-3xl bg-white p-9 text-center shadow-sm">
 <h1 className="text-2xl font-black text-[#030957]">عودة من بوابة الدفع</h1>
 <p className="mt-4 leading-8 text-slate-600">لا تعد العودة من PayTabs إثباتًا لنجاح الدفع. يجري التحقق من المعاملة على الخادم بشكل مستقل. لا تعاود الدفع قبل التأكد من حالتها.</p>
 <p className="mt-4 text-sm text-slate-500">سيتم إصدار الفاتورة وإرسالها بعد تأكيد الدفع واكتمال الربط المالي.</p>
 <Link to="/store" className="mt-7 inline-block rounded-xl bg-[#FFB900] px-7 py-3 font-black text-[#030957]">العودة للمتجر</Link>
 </section></main></div>
}
