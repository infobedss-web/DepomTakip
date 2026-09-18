import { useEffect, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, X } from 'lucide-react';

type Props={role:string;page:string;navigate:(p:string)=>void};
const KEY='bedss_admin_guide_v1';
const steps=[
['BEDSS Yönetici Rehberi','dashboard','BEDSS kurulumunu baştan sona birlikte yapacağız.','Firma → lisans → firma yetkilisi → depo → lokasyon → ürün → stok → personel → sayım → transfer → kontrol.'],
['1. Firma oluştur','businesses','Firmalar ekranında “Firma Ekle” butonuna basın.','Firma adı, kodu, vergi numarası, yetkili ve iletişim bilgilerini girin. Durumu Aktif bırakıp kaydedin.'],
['2. Firmayı seç ve lisansla','businesses','Firma kartında “Firmayı Aç” ile çalışma firmasını seçin ve lisans yönetimini açın.','Lisans firmaya verilir; SUPER_ADMIN hesabına verilmez. Başlangıç, bitiş ve aktiflik durumunu kontrol edin.'],
['3. Firma yetkilisi','users','Personel & Davetler ekranından firma yöneticisini oluşturun.','Firmayı seçin; ad, e-posta ve FIRM_ADMIN rolünü tanımlayın.'],
['4. Depo oluştur','locations','“Depo Ekle” ile firmanın ilk deposunu oluşturun.','Örnek: MAVİ MARKET MERKEZ DEPO / MMD01. Doğru firmaya bağlandığını kontrol edin.'],
['5. Raf / lokasyon','locations','“Lokasyon Ekle” ile fiziksel depo yapısını kurun.','Bölüm → Reyon → Kat → Hücre hiyerarşisini kullanabilirsiniz. Örnek hücre: A-01.'],
['6. Ürün kartı','products','Ürün & Stok ekranında Ürün Kartları bölümünden ürünü ekleyin.','SKU, barkod ve ürün adı temel bilgilerdir. Ürün kartı oluşturmak stok oluşturmaz.'],
['7. İlk stok','initial-stock','Başlangıç Stoğu ekranından ilk fiziksel miktarı girin.','Doğru firma, depo/lokasyon ve ürünü seçin. Gerçek fiziksel miktarı esas alın.'],
['8. Mal kabul','goods-receipts','Yeni gelen ürünleri Mal Kabul ekranından kaydedin.','Mal kabul stoğu artıran gerçek depo hareketidir. Sonrasında ürün rafa yerleştirilebilir.'],
['9. Rafa yerleştirme','put-away','Kabul edilen ürünü gerçek raf/lokasyonuna taşıyın.','Ürünün hangi depoda ve hangi fiziksel konumda olduğunu BEDSS böyle takip eder.'],
['10. Personel ve depo ataması','users','Personeli oluşturup “Depo Ata” ile çalışma deposunu belirleyin.','COUNTER kör sayım içindir. WAREHOUSE_STAFF depo operasyonları içindir. Yetkiyi ihtiyaç kadar verin.'],
['11. Sayım odası','rooms','Sayım Odaları ekranından fiziksel sayımı planlayın.','Depo, kapsam ve görevli personeli belirleyin; sonra sayımı başlatın.'],
['12. Kör sayım','blind-counting','Personel beklenen sistem miktarını görmeden fiziksel ürünü sayar.','Örnek: sistem 100, personel 97 saydı. Personel 100’ü görmez; fark yönetici tarafında değerlendirilir.'],
['13. Depolar arası transfer','warehouse-transfer','Kaynak ve hedef depoyu seçerek transfer oluşturun.','Gönderilen, teslim alınan, eksik ve hasarlı miktarları gerçek duruma göre kaydedin.'],
['14. Sevkiyat','shipments','Depodan çıkan ürünü Sevkiyat / Mal Çıkışı ekranından yönetin.','Doğru depo, ürün ve miktarı kontrol edin. Stok hareket geçmişi korunur.'],
['15. İşlem kayıtları','logs','İşlem Kayıtları ekranından sistem hareketlerini kontrol edin.','Kim, ne zaman, hangi işlemi yaptı sorularının cevabı burada izlenir.'],
['Eğitim tamamlandı','dashboard','BEDSS temel yönetici akışını tamamladınız.','Rehberi istediğiniz zaman sağ üstteki BEDSS Rehberi butonundan yeniden açabilirsiniz.']
] as const;

export function BedssGuide({role,page,navigate}:Props){
 const enabled=!['COUNTER','AUDITOR','GUEST','WAREHOUSE_STAFF'].includes(String(role||'').toUpperCase());
 const [open,setOpen]=useState(false); const [step,setStep]=useState(0);
 useEffect(()=>{if(!enabled)return;const x=localStorage.getItem(KEY);if(!x){setOpen(true);return}try{setStep(Math.min(Number(JSON.parse(x).step||0),steps.length-1))}catch{}},[enabled]);
 useEffect(()=>{if(enabled)localStorage.setItem(KEY,JSON.stringify({step}))},[enabled,step]);
 if(!enabled)return null;
 const cur=steps[step];
 const go=(n:number)=>{const i=Math.max(0,Math.min(n,steps.length-1));setStep(i);navigate(steps[i][1])};
 const buttonStyle={border:'1px solid #d8dee8',background:'#fff',borderRadius:9,padding:'9px 12px',cursor:'pointer'} as const;
 return <>
  <button type="button" onClick={()=>{setOpen(true);go(step)}} style={{...buttonStyle,display:'inline-flex',gap:7,alignItems:'center',fontWeight:700}}><BookOpen size={17}/> BEDSS Rehberi</button>
  {open&&<>
   <div onClick={()=>setOpen(false)} style={{position:'fixed',inset:0,background:'rgba(15,23,42,.28)',zIndex:9998}}/>
   <section role="dialog" aria-modal="true" style={{position:'fixed',right:24,top:82,width:'min(430px,calc(100vw - 32px))',maxHeight:'calc(100vh - 110px)',overflow:'auto',zIndex:9999,background:'#fff',border:'1px solid #e5e7eb',borderRadius:18,boxShadow:'0 24px 70px rgba(15,23,42,.22)',padding:22,color:'#172033'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12}}><div><div style={{fontSize:12,fontWeight:800,color:'#667085'}}>BEDSS CANLI EĞİTİM · {step+1}/{steps.length}</div><h2 style={{margin:'8px 0 4px'}}>{cur[0]}</h2></div><button onClick={()=>setOpen(false)} style={{border:0,background:'transparent',cursor:'pointer'}}><X size={20}/></button></div>
    <div style={{height:7,background:'#eef2f6',borderRadius:999,margin:'14px 0 18px'}}><div style={{width:`${((step+1)/steps.length)*100}%`,height:'100%',borderRadius:999,background:'#172033'}}/></div>
    <p style={{fontSize:16,lineHeight:1.55}}>{cur[2]}</p>
    <div style={{padding:14,borderRadius:12,background:'#f7f9fc',border:'1px solid #e8edf4',lineHeight:1.55}}>{cur[3]}</div>
    {page!==cur[1]&&<button onClick={()=>navigate(cur[1])} style={{marginTop:14,width:'100%',border:0,borderRadius:10,padding:'11px 14px',background:'#172033',color:'#fff',fontWeight:800,cursor:'pointer'}}>Bu ekranı aç</button>}
    <div style={{display:'flex',justifyContent:'space-between',gap:10,marginTop:18}}>
     <button disabled={step===0} onClick={()=>go(step-1)} style={buttonStyle}><ChevronLeft size={16}/> Geri</button>
     {step<steps.length-1?<button onClick={()=>go(step+1)} style={{...buttonStyle,background:'#172033',color:'#fff',fontWeight:800}}>Sonraki <ChevronRight size={16}/></button>:<button onClick={()=>{localStorage.setItem(KEY,JSON.stringify({step,completed:true}));setOpen(false);navigate('dashboard')}} style={{...buttonStyle,background:'#172033',color:'#fff',fontWeight:800}}>BEDSS’e Başla</button>}
    </div>
    <button onClick={()=>go(0)} style={{marginTop:12,border:0,background:'transparent',color:'#667085',cursor:'pointer'}}>Eğitimi baştan başlat</button>
   </section>
  </>}
 </>;
}