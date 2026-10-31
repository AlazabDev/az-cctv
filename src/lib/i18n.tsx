import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Lang = 'ar' | 'en';

const dict = {
  ar: {
    brandName: 'AZ-CCTV',
    brandTagline: 'الأمان أولاً',
    heroTitle: 'كاميرات مراقبة وأجهزة شبكات بأسعار الجملة',
    heroSubtitle: 'أكثر من 870 منتجاً أصلياً من أشهر الماركات العالمية — كاميرات، DVR وNVR، سويتشات، كابلات ومستلزمات الشبكات.',
    heroCta: 'تسوّق الآن',
    heroCtaSecondary: 'استعرض الأقسام',
    navHome: 'الرئيسية',
    navProducts: 'كل المنتجات',
    navCctv: 'كاميرات المراقبة',
    navNetwork: 'الشبكات',
    navAbout: 'من نحن',
    searchPlaceholder: 'ابحث عن منتج، ماركة أو موديل…',
    categoriesTitle: 'تسوّق حسب القسم',
    categoriesSubtitle: 'كل ما تحتاجه لأنظمة المراقبة والشبكات في مكان واحد',
    featuredTitle: 'منتجات مختارة',
    latestTitle: 'أحدث المنتجات',
    viewAll: 'عرض الكل',
    aboutTitle: 'عن AZ-CCTV',
    aboutText: 'نوفر لك أحدث أنظمة كاميرات المراقبة وأجهزة الشبكات من الماركات العالمية الموثوقة، مع ضمان رسمي وأسعار تنافسية وخدمة فنية متخصصة.',
    whyTitle: 'لماذا تختارنا؟',
    whyGenuine: 'منتجات أصلية 100%',
    whyGenuineText: 'من موردين معتمدين مع ضمان الوكيل الرسمي',
    whyDelivery: 'توصيل سريع',
    whyDeliveryText: 'تغطية كل محافظات مصر',
    whySupport: 'دعم فني متخصص',
    whySupportText: 'فريق يساعدك في اختيار وتصميم نظامك',
    whyPrice: 'أسعار تنافسية',
    whyPriceText: 'خصومات على الكميات لمشاريع الشركات',
    addToBag: 'أضف إلى السلة',
    addedToBag: 'تمت الإضافة إلى السلة',
    outOfStock: 'غير متوفر حالياً',
    inStock: 'متوفر',
    quantity: 'الكمية',
    bag: 'سلة التسوق',
    bagEmpty: 'سلتك فارغة',
    bagEmptyText: 'لم تضف أي منتجات بعد.',
    continueShopping: 'متابعة التسوق',
    subtotal: 'المجموع الفرعي',
    shipping: 'الشحن',
    free: 'مجاناً',
    total: 'الإجمالي',
    checkout: 'إتمام الشراء',
    remove: 'إزالة',
    checkoutTitle: 'إتمام الطلب',
    checkoutComingSoon: 'الدفع الإلكتروني قريباً',
    checkoutNotice: 'أكمل بياناتك وسنتواصل معك لتأكيد طلبك ودفعك عند الاستلام.',
    submitOrder: 'إرسال الطلب',
    orderSubmitted: 'تم استلام طلبك!',
    orderSubmittedText: 'سنتواصل معك قريباً لتأكيد الطلب. تم تفريغ سلة التسوق.',
    fullName: 'الاسم بالكامل',
    email: 'البريد الإلكتروني',
    phone: 'رقم الهاتف',
    address: 'العنوان بالتفصيل',
    city: 'المدينة / المحافظة',
    notes: 'ملاحظات على الطلب (اختياري)',
    orderSummary: 'ملخص الطلب',
    filters: 'الفلاتر',
    allCategories: 'كل الأقسام',
    allBrands: 'كل الماركات',
    sortBy: 'ترتيب حسب',
    sortFeatured: 'المختارة',
    sortPriceAsc: 'السعر: من الأقل للأعلى',
    sortPriceDesc: 'السعر: من الأعلى للأقل',
    sortName: 'الاسم أبجدياً',
    results: 'منتج',
    prevPage: 'السابق',
    nextPage: 'التالي',
    page: 'صفحة',
    brandLabel: 'الماركة',
    modelLabel: 'الموديل',
    skuLabel: 'رقم المنتج',
    categoryLabel: 'القسم',
    specsTitle: 'المواصفات الفنية',
    shippingTitle: 'الشحن',
    shippingText: 'توصيل لكل محافظات مصر',
    returnsTitle: 'الضمان',
    returnsText: 'ضمان الوكيل الرسمي',
    relatedTitle: 'منتجات مشابهة',
    productNotFound: 'المنتج غير موجود',
    productNotFoundText: 'المنتج الذي تبحث عنه غير متاح.',
    browseProducts: 'تصفح كل المنتجات',
    language: 'English',
    quickLinks: 'روابط سريعة',
    footerCategories: 'الأقسام',
    contactUs: 'تواصل معنا',
    rights: 'جميع الحقوق محفوظة',
    featured: 'مختار',
    sectionCctv: 'كاميرات المراقبة',
    sectionNetwork: 'منتجات الشبكات',
    wishlist: 'المفضلة',
    wishlistAdded: 'أضيف إلى المفضلة',
    wishlistRemoved: 'أزيل من المفضلة',
  },
  en: {
    brandName: 'AZ-CCTV',
    brandTagline: 'Security First',
    heroTitle: 'CCTV & Networking Gear at Wholesale Prices',
    heroSubtitle: 'Over 870 genuine products from the world’s leading brands — cameras, DVRs & NVRs, switches, cables and network supplies.',
    heroCta: 'Shop Now',
    heroCtaSecondary: 'Browse Categories',
    navHome: 'Home',
    navProducts: 'All Products',
    navCctv: 'CCTV',
    navNetwork: 'Networking',
    navAbout: 'About Us',
    searchPlaceholder: 'Search product, brand or model…',
    categoriesTitle: 'Shop by Category',
    categoriesSubtitle: 'Everything for surveillance and networking in one place',
    featuredTitle: 'Featured Products',
    latestTitle: 'Latest Products',
    viewAll: 'View All',
    aboutTitle: 'About AZ-CCTV',
    aboutText: 'We bring you the latest surveillance cameras and networking equipment from trusted global brands, with official warranty, competitive prices and expert technical support.',
    whyTitle: 'Why Choose Us?',
    whyGenuine: '100% Genuine Products',
    whyGenuineText: 'From authorized suppliers with official warranty',
    whyDelivery: 'Fast Delivery',
    whyDeliveryText: 'Covering all Egyptian governorates',
    whySupport: 'Expert Support',
    whySupportText: 'A team that helps you design your system',
    whyPrice: 'Competitive Prices',
    whyPriceText: 'Volume discounts for corporate projects',
    addToBag: 'Add to Bag',
    addedToBag: 'Added to bag',
    outOfStock: 'Out of stock',
    inStock: 'In stock',
    quantity: 'Quantity',
    bag: 'Shopping Bag',
    bagEmpty: 'Your bag is empty',
    bagEmptyText: 'You haven’t added any products yet.',
    continueShopping: 'Continue Shopping',
    subtotal: 'Subtotal',
    shipping: 'Shipping',
    free: 'Free',
    total: 'Total',
    checkout: 'Checkout',
    remove: 'Remove',
    checkoutTitle: 'Complete Your Order',
    checkoutComingSoon: 'Online payment coming soon',
    checkoutNotice: 'Fill in your details and we’ll contact you to confirm your order — pay on delivery.',
    submitOrder: 'Submit Order',
    orderSubmitted: 'Order received!',
    orderSubmittedText: 'We’ll contact you shortly to confirm. Your bag has been cleared.',
    fullName: 'Full name',
    email: 'Email',
    phone: 'Phone number',
    address: 'Full address',
    city: 'City / Governorate',
    notes: 'Order notes (optional)',
    orderSummary: 'Order Summary',
    filters: 'Filters',
    allCategories: 'All Categories',
    allBrands: 'All Brands',
    sortBy: 'Sort by',
    sortFeatured: 'Featured',
    sortPriceAsc: 'Price: Low to High',
    sortPriceDesc: 'Price: High to Low',
    sortName: 'Alphabetical',
    results: 'products',
    prevPage: 'Previous',
    nextPage: 'Next',
    page: 'Page',
    brandLabel: 'Brand',
    modelLabel: 'Model',
    skuLabel: 'SKU',
    categoryLabel: 'Category',
    specsTitle: 'Technical Specifications',
    shippingTitle: 'Shipping',
    shippingText: 'Delivery across all of Egypt',
    returnsTitle: 'Warranty',
    returnsText: 'Official distributor warranty',
    relatedTitle: 'Related Products',
    productNotFound: 'Product not found',
    productNotFoundText: 'The product you’re looking for is unavailable.',
    browseProducts: 'Browse All Products',
    language: 'العربية',
    quickLinks: 'Quick Links',
    footerCategories: 'Categories',
    contactUs: 'Contact Us',
    rights: 'All rights reserved',
    featured: 'Featured',
    sectionCctv: 'CCTV',
    sectionNetwork: 'Networking',
    wishlist: 'Wishlist',
    wishlistAdded: 'Added to wishlist',
    wishlistRemoved: 'Removed from wishlist',
  },
} as const;

export type TKey = keyof (typeof dict)['ar'];

const categoryLabels: Record<string, { ar: string; en: string }> = {
  'SURVEILLANCE CAMERAS': { ar: 'كاميرات المراقبة', en: 'Surveillance Cameras' },
  'STAND CAMERA': { ar: 'حوامل الكاميرات', en: 'Camera Stands' },
  'DVR': { ar: 'أجهزة DVR', en: 'DVR' },
  'NVR': { ar: 'أجهزة NVR', en: 'NVR' },
  'WATER PROOF BOX': { ar: 'صناديق مقاومة للماء', en: 'Waterproof Boxes' },
  'COAXIAL CABLES': { ar: 'كابلات محورية', en: 'Coaxial Cables' },
  'COAXIAL CONNECTORS': { ar: 'وصلات الكابلات المحورية', en: 'Coaxial Connectors' },
  'POWER SUPPLY FOR CAMERA': { ar: 'محولات تغذية الكاميرات', en: 'Camera Power Supplies' },
  'VIDEO BALUN': { ar: 'محوّلات إشارة الفيديو', en: 'Video Balun' },
  'CAM POWER CABLE': { ar: 'كابلات تغذية الكاميرات', en: 'Camera Power Cables' },
  'MICROPHONE FOR DVR': { ar: 'ميكروفونات DVR', en: 'DVR Microphones' },
  'Network Connector': { ar: 'وصلات الشبكات', en: 'Network Connectors' },
  'Network Adapter': { ar: 'كروت الشبكة', en: 'Network Adapters' },
  'Network Cable': { ar: 'كابلات الشبكات', en: 'Network Cables' },
  'Access Point': { ar: 'نقاط الوصول', en: 'Access Points' },
  'Network Rack': { ar: 'رفوف الشبكات', en: 'Network Racks' },
  'Network Switch': { ar: 'سويتشات الشبكات', en: 'Network Switches' },
  'Range Extender': { ar: 'موسعات نطاق الشبكة', en: 'Range Extenders' },
  'Router': { ar: 'الراوترات', en: 'Routers' },
  'Intercom / Doorbell': { ar: 'الاتصال الداخلي والأجراس', en: 'Intercom & Doorbell' },
  'Other Network Products': { ar: 'منتجات شبكات أخرى', en: 'Other Network Products' },
  'Time Attendance': { ar: 'أنظمة الحضور والانصراف', en: 'Time Attendance' },
  'Fiber Optic': { ar: 'الألياف الضوئية', en: 'Fiber Optic' },
};

interface LanguageContextValue {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  setLang: (lang: Lang) => void;
  t: (key: TKey) => string;
  catLabel: (category: string) => string;
  fmtPrice: (price: number) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export const fmtNumber = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('az-lang') : null;
    return saved === 'en' ? 'en' : 'ar';
  });

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem('az-lang', lang);
  }, [lang]);

  const t = (key: TKey) => dict[lang][key] ?? key;

  const catLabel = (category: string) => {
    const entry = categoryLabels[category];
    return entry ? entry[lang] : category;
  };

  const fmtPrice = (price: number) =>
    lang === 'ar' ? `${fmtNumber(price)} ج.م` : `EGP ${fmtNumber(price)}`;

  return (
    <LanguageContext.Provider value={{ lang, dir: lang === 'ar' ? 'rtl' : 'ltr', setLang: setLangState, t, catLabel, fmtPrice }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
