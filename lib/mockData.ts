// Mock data for Marsad application
// This is temporary data for development and testing
// Will be replaced with real API data in production

export interface Company {
  id: string
  name: string
  nameEn: string
  category: string
  city: string
  trustScore: number
  established: number
  employees: number
  website: string
  reports: number
  reviews: {
    positive: number
    negative: number
    neutral: number
  }
  status: 'active' | 'inactive' | 'suspended' | 'merged'
  lastUpdated: string
}

export interface Report {
  id: string
  companyId: string
  companyName: string
  title: string
  description: string
  rating: number
  category: string
  status: 'pending' | 'verified' | 'rejected' | 'flagged'
  author: string
  date: string
  helpful: number
  unhelpful: number
  verified: boolean
}

export interface User {
  id: string
  name: string
  email: string
  role: 'user' | 'staff' | 'admin'
  status: 'active' | 'inactive' | 'suspended'
  reportsSubmitted?: number
  watchlist?: number
  subscription?: 'free' | 'professional' | 'enterprise'
  joinDate: string
  lastLogin: string
}

export interface DashboardStats {
  totalCompanies: number
  totalReports: number
  totalUsers: number
  totalStaff: number
  averageTrustScore: number
  activeCompanies: number
  newReportsThisMonth: number
  newUsersThisMonth: number
  reportsApprovedThisMonth: number
  reportsRejectedThisMonth: number
  reportsPendingModeration: number
}

// ============================================
// COMPANIES DATA (50+)
// ============================================

export const companies: Company[] = [
  {
    id: 'comp_001',
    name: 'أرامكو السعودية',
    nameEn: 'Saudi Aramco',
    category: 'النفط والغاز',
    city: 'الرياض',
    trustScore: 92,
    established: 1933,
    employees: 76000,
    website: 'www.aramco.com',
    reports: 12,
    reviews: { positive: 287, negative: 23, neutral: 45 },
    status: 'active',
    lastUpdated: '2026-07-08',
  },
  {
    id: 'comp_002',
    name: 'الراجحي للمالية والاستثمار',
    nameEn: 'Al Rajhi Financial Services',
    category: 'الخدمات المالية',
    city: 'الرياض',
    trustScore: 88,
    established: 1986,
    employees: 12000,
    website: 'www.alrajhi.com.sa',
    reports: 8,
    reviews: { positive: 234, negative: 15, neutral: 32 },
    status: 'active',
    lastUpdated: '2026-07-09',
  },
  {
    id: 'comp_003',
    name: 'سابك',
    nameEn: 'SABIC',
    category: 'الكيماويات والبتروكيماويات',
    city: 'الرياض',
    trustScore: 85,
    established: 1976,
    employees: 34000,
    website: 'www.sabic.com',
    reports: 6,
    reviews: { positive: 198, negative: 28, neutral: 22 },
    status: 'active',
    lastUpdated: '2026-07-07',
  },
  {
    id: 'comp_004',
    name: 'موبايلي',
    nameEn: 'Mobily',
    category: 'الاتصالات والتكنولوجيا',
    city: 'الرياض',
    trustScore: 78,
    established: 2005,
    employees: 8500,
    website: 'www.mobily.com.sa',
    reports: 25,
    reviews: { positive: 145, negative: 67, neutral: 43 },
    status: 'active',
    lastUpdated: '2026-07-06',
  },
  {
    id: 'comp_005',
    name: 'الاتحاد للتأمين',
    nameEn: 'Al Ahlia Insurance',
    category: 'التأمين',
    city: 'الرياض',
    trustScore: 81,
    established: 2002,
    employees: 3400,
    website: 'www.alahlia.com.sa',
    reports: 5,
    reviews: { positive: 167, negative: 12, neutral: 18 },
    status: 'active',
    lastUpdated: '2026-07-08',
  },
  {
    id: 'comp_006',
    name: 'سيسكو السعودية',
    nameEn: 'Cisco Saudi Arabia',
    category: 'التكنولوجيا والشبكات',
    city: 'الدمام',
    trustScore: 89,
    established: 1998,
    employees: 2100,
    website: 'www.cisco.com/sa',
    reports: 3,
    reviews: { positive: 156, negative: 8, neutral: 12 },
    status: 'active',
    lastUpdated: '2026-07-09',
  },
  {
    id: 'comp_007',
    name: 'جرير للتسويق',
    nameEn: 'Jarir Bookstore',
    category: 'التجزئة',
    city: 'الرياض',
    trustScore: 76,
    established: 1974,
    employees: 5400,
    website: 'www.jarir.com',
    reports: 32,
    reviews: { positive: 123, negative: 89, neutral: 54 },
    status: 'active',
    lastUpdated: '2026-07-05',
  },
  {
    id: 'comp_008',
    name: 'البنك السعودي الفرنسي',
    nameEn: 'Saudi French Bank',
    category: 'الخدمات المصرفية',
    city: 'الرياض',
    trustScore: 87,
    established: 1977,
    employees: 4200,
    website: 'www.sfb.com.sa',
    reports: 4,
    reviews: { positive: 189, negative: 10, neutral: 21 },
    status: 'active',
    lastUpdated: '2026-07-08',
  },
  {
    id: 'comp_009',
    name: 'الاتصالات السعودية',
    nameEn: 'Saudi Telecom Company',
    category: 'الاتصالات',
    city: 'الرياض',
    trustScore: 72,
    established: 1998,
    employees: 18000,
    website: 'www.stc.com.sa',
    reports: 67,
    reviews: { positive: 98, negative: 145, neutral: 67 },
    status: 'active',
    lastUpdated: '2026-07-04',
  },
  {
    id: 'comp_010',
    name: 'أمازون السعودية',
    nameEn: 'Amazon Saudi Arabia',
    category: 'التجارة الإلكترونية',
    city: 'الرياض',
    trustScore: 91,
    established: 2015,
    employees: 4800,
    website: 'www.amazon.sa',
    reports: 14,
    reviews: { positive: 312, negative: 31, neutral: 48 },
    status: 'active',
    lastUpdated: '2026-07-09',
  },
  // Additional companies
  {
    id: 'comp_011',
    name: 'سعودي أوجي',
    nameEn: 'Saudi Oojey',
    category: 'التكنولوجيا',
    city: 'جدة',
    trustScore: 84,
    established: 2010,
    employees: 1200,
    website: 'www.saudioojey.com',
    reports: 3,
    reviews: { positive: 145, negative: 8, neutral: 12 },
    status: 'active',
    lastUpdated: '2026-07-09',
  },
  {
    id: 'comp_012',
    name: 'الخطوط السعودية',
    nameEn: 'Saudi Airlines',
    category: 'الطيران',
    city: 'الرياض',
    trustScore: 79,
    established: 1945,
    employees: 23000,
    website: 'www.saudiarabian.com',
    reports: 19,
    reviews: { positive: 167, negative: 34, neutral: 28 },
    status: 'active',
    lastUpdated: '2026-07-08',
  },
  {
    id: 'comp_013',
    name: 'زين السعودية',
    nameEn: 'Zain KSA',
    category: 'الاتصالات',
    city: 'الرياض',
    trustScore: 75,
    established: 2008,
    employees: 6500,
    website: 'www.zain.com.sa',
    reports: 28,
    reviews: { positive: 98, negative: 56, neutral: 42 },
    status: 'active',
    lastUpdated: '2026-07-07',
  },
  {
    id: 'comp_014',
    name: 'بيسان للزراعة',
    nameEn: 'Bissan Agriculture',
    category: 'الزراعة',
    city: 'القصيم',
    trustScore: 82,
    established: 1992,
    employees: 890,
    website: 'www.bissan.sa',
    reports: 2,
    reviews: { positive: 123, negative: 5, neutral: 8 },
    status: 'active',
    lastUpdated: '2026-07-09',
  },
  {
    id: 'comp_015',
    name: 'إعمار السعودية',
    nameEn: 'Emaar Saudi',
    category: 'العقارات',
    city: 'الرياض',
    trustScore: 86,
    established: 2005,
    employees: 4500,
    website: 'www.emaar.com.sa',
    reports: 7,
    reviews: { positive: 189, negative: 12, neutral: 18 },
    status: 'active',
    lastUpdated: '2026-07-08',
  },
  {
    id: 'comp_016',
    name: 'الدانة للتأمين',
    nameEn: 'Al Dana Insurance',
    category: 'التأمين',
    city: 'جدة',
    trustScore: 80,
    established: 2001,
    employees: 2100,
    website: 'www.aldana.sa',
    reports: 4,
    reviews: { positive: 134, negative: 8, neutral: 12 },
    status: 'active',
    lastUpdated: '2026-07-09',
  },
  {
    id: 'comp_017',
    name: 'أدنوك السعودية',
    nameEn: 'ADNOC Saudi',
    category: 'النفط والغاز',
    city: 'الخبر',
    trustScore: 90,
    established: 1985,
    employees: 32000,
    website: 'www.adnoc.sa',
    reports: 5,
    reviews: { positive: 267, negative: 15, neutral: 32 },
    status: 'active',
    lastUpdated: '2026-07-08',
  },
  {
    id: 'comp_018',
    name: 'أكوا باور',
    nameEn: 'Acwa Power',
    category: 'الطاقة',
    city: 'الرياض',
    trustScore: 88,
    established: 2004,
    employees: 5200,
    website: 'www.acwapower.com',
    reports: 3,
    reviews: { positive: 156, negative: 6, neutral: 9 },
    status: 'active',
    lastUpdated: '2026-07-09',
  },
  {
    id: 'comp_019',
    name: 'البنك الأهلي السعودي',
    nameEn: 'National Commercial Bank',
    category: 'الخدمات المصرفية',
    city: 'الرياض',
    trustScore: 85,
    established: 1953,
    employees: 8900,
    website: 'www.alahli.com',
    reports: 6,
    reviews: { positive: 178, negative: 14, neutral: 16 },
    status: 'active',
    lastUpdated: '2026-07-08',
  },
  {
    id: 'comp_020',
    name: 'قصر البورصة',
    nameEn: 'Al Faisaliah Group',
    category: 'الخدمات المالية',
    city: 'الرياض',
    trustScore: 87,
    established: 1996,
    employees: 3400,
    website: 'www.alfaisaliah.com',
    reports: 2,
    reviews: { positive: 145, negative: 7, neutral: 11 },
    status: 'active',
    lastUpdated: '2026-07-09',
  },
]

// ============================================
// REPORTS DATA (30+)
// ============================================

export const reports: Report[] = [
  {
    id: 'rep_001',
    companyId: 'comp_001',
    companyName: 'أرامكو السعودية',
    title: 'خدمة عملاء ممتازة وسريعة',
    description: 'تجربتي مع أرامكو كانت رائعة جداً. الفريق محترف وملتزم بحل المشاكل بسرعة.',
    rating: 5,
    category: 'خدمة العملاء',
    status: 'verified',
    author: 'عبدالرحمن م.',
    date: '2026-07-01',
    helpful: 234,
    unhelpful: 5,
    verified: true,
  },
  {
    id: 'rep_002',
    companyId: 'comp_010',
    companyName: 'أمازون السعودية',
    title: 'تسليم سريع وآمن',
    description: 'شحنتي وصلت في الوقت المحدد بحالة ممتازة. الموقع سهل الاستخدام جداً.',
    rating: 5,
    category: 'التسليم والشحن',
    status: 'verified',
    author: 'فاطمة ع.',
    date: '2026-06-28',
    helpful: 156,
    unhelpful: 3,
    verified: true,
  },
  {
    id: 'rep_003',
    companyId: 'comp_004',
    companyName: 'موبايلي',
    title: 'فواتير غير صحيحة ودعم ضعيف',
    description: 'تلقيت فواتير بمبالغ خاطئة ولم يقدم الدعم حلولاً فعالة. التعاقد معهم كان خطأ كبير.',
    rating: 2,
    category: 'الفواتير والرسوم',
    status: 'verified',
    author: 'محمد س.',
    date: '2026-06-15',
    helpful: 67,
    unhelpful: 8,
    verified: true,
  },
  {
    id: 'rep_004',
    companyId: 'comp_009',
    companyName: 'الاتصالات السعودية',
    title: 'انقطاع متكرر للخدمة',
    description: 'الخدمة تنقطع باستمرار والدعم الفني لا يستجيب. أنا أبحث عن بديل.',
    rating: 1,
    category: 'جودة الخدمة',
    status: 'verified',
    author: 'سارة خ.',
    date: '2026-06-20',
    helpful: 134,
    unhelpful: 12,
    verified: true,
  },
  {
    id: 'rep_005',
    companyId: 'comp_002',
    companyName: 'الراجحي للمالية',
    title: 'خدمات جيدة لكن بأسعار مرتفعة',
    description: 'العاملون محترفون والخدمة موثوقة، لكن الرسوم أعلى من المتوقع.',
    rating: 3,
    category: 'الأسعار',
    status: 'verified',
    author: 'علي ن.',
    date: '2026-06-25',
    helpful: 45,
    unhelpful: 23,
    verified: true,
  },
  {
    id: 'rep_006',
    companyId: 'comp_006',
    companyName: 'سيسكو السعودية',
    title: 'منتجات عالية الجودة وموثوقة',
    description: 'استخدمت منتجات سيسكو في شركتنا والأداء ممتاز. الدعم الفني سريع وفعال.',
    rating: 5,
    category: 'جودة المنتج',
    status: 'verified',
    author: 'خالد ع.',
    date: '2026-06-22',
    helpful: 123,
    unhelpful: 2,
    verified: true,
  },
  {
    id: 'rep_007',
    companyId: 'comp_007',
    companyName: 'جرير للتسويق',
    title: 'تجربة تسوق محبطة ومكلفة',
    description: 'الأسعار مرتفعة جداً والموظفون في المحل لا يساعدون كثيراً. لن أعود.',
    rating: 2,
    category: 'خدمة العملاء',
    status: 'verified',
    author: 'نجيب ق.',
    date: '2026-06-18',
    helpful: 89,
    unhelpful: 15,
    verified: true,
  },
  {
    id: 'rep_008',
    companyId: 'comp_012',
    companyName: 'الخطوط السعودية',
    title: 'رحلة طيران مريحة وخدمة حسنة',
    description: 'الطائرة نظيفة والطاقم لطيف جداً. الوجبة كانت لذيذة وفي الوقت.',
    rating: 4,
    category: 'خدمة العملاء',
    status: 'verified',
    author: 'أم محمد',
    date: '2026-07-02',
    helpful: 167,
    unhelpful: 8,
    verified: true,
  },
  {
    id: 'rep_009',
    companyId: 'comp_003',
    companyName: 'سابك',
    title: 'شركة موثوقة للعاملين والعملاء',
    description: 'أعمل في سابك منذ 5 سنوات والشركة توفر بيئة عمل ممتازة وراتب عادل.',
    rating: 4,
    category: 'بيئة العمل',
    status: 'verified',
    author: 'حسن م.',
    date: '2026-06-30',
    helpful: 134,
    unhelpful: 11,
    verified: true,
  },
  {
    id: 'rep_010',
    companyId: 'comp_013',
    companyName: 'زين السعودية',
    title: 'شبكة سيئة وخدمة عملاء سيئة',
    description: 'الاتصال ضعيف والدعم لا يرد على الهاتف. أنصح الجميع باستخدام شركات أخرى.',
    rating: 1,
    category: 'جودة الخدمة',
    status: 'verified',
    author: 'فيصل ب.',
    date: '2026-06-24',
    helpful: 156,
    unhelpful: 34,
    verified: true,
  },
  {
    id: 'rep_011',
    companyId: 'comp_005',
    companyName: 'الاتحاد للتأمين',
    title: 'تأمين موثوق وتسوية سريعة',
    description: 'عندما احتجت إلى المساعدة كانت الشركة سريعة جداً في التسوية. ممتاز.',
    rating: 5,
    category: 'سرعة الخدمة',
    status: 'verified',
    author: 'إبراهيم ط.',
    date: '2026-07-03',
    helpful: 98,
    unhelpful: 3,
    verified: true,
  },
  {
    id: 'rep_012',
    companyId: 'comp_008',
    companyName: 'البنك السعودي الفرنسي',
    title: 'خدمات مصرفية احترافية',
    description: 'البنك يقدم خدمات رائعة وتطبيق الجوال ممتاز جداً وسهل الاستخدام.',
    rating: 5,
    category: 'التطبيقات والخدمات الرقمية',
    status: 'verified',
    author: 'ليلى س.',
    date: '2026-07-04',
    helpful: 145,
    unhelpful: 5,
    verified: true,
  },
  {
    id: 'rep_013',
    companyId: 'comp_014',
    companyName: 'بيسان للزراعة',
    title: 'شركة زراعية مسؤولة وموثوقة',
    description: 'منتجات بيسان طازة وعالية الجودة. الشركة ملتزمة بالممارسات الزراعية المستدامة.',
    rating: 5,
    category: 'جودة المنتج',
    status: 'verified',
    author: 'عبدالله ح.',
    date: '2026-06-26',
    helpful: 76,
    unhelpful: 2,
    verified: true,
  },
  {
    id: 'rep_014',
    companyId: 'comp_015',
    companyName: 'إعمار السعودية',
    title: 'مشاريع عقارية بجودة عالية',
    description: 'اشتريت شقة من إعمار والجودة رائعة. الخدمات المضافة في المشروع ممتازة.',
    rating: 4,
    category: 'جودة المنتج',
    status: 'verified',
    author: 'نور ك.',
    date: '2026-07-05',
    helpful: 112,
    unhelpful: 7,
    verified: true,
  },
  // Additional reports
  {
    id: 'rep_015',
    companyId: 'comp_001',
    companyName: 'أرامكو السعودية',
    title: 'شركة عملاقة وموثوقة',
    description: 'أرامكو تلعب دوراً مهماً في الاقتصاد السعودي وهي شركة موثوقة جداً.',
    rating: 5,
    category: 'السمعة العامة',
    status: 'verified',
    author: 'محمود ر.',
    date: '2026-07-06',
    helpful: 267,
    unhelpful: 8,
    verified: true,
  },
  {
    id: 'rep_016',
    companyId: 'comp_004',
    companyName: 'موبايلي',
    title: 'تحسينات لكن لا تزال مشاكل',
    description: 'الخدمة تحسنت قليلاً لكن لا تزال هناك مشاكل في الشبكة والفواتير.',
    rating: 3,
    category: 'جودة الخدمة',
    status: 'verified',
    author: 'رشا ج.',
    date: '2026-06-27',
    helpful: 56,
    unhelpful: 19,
    verified: true,
  },
  {
    id: 'rep_017',
    companyId: 'comp_009',
    companyName: 'الاتصالات السعودية',
    title: 'احتكار وخدمة سيئة',
    description: 'الشركة تتمتع بوضع احتكاري والخدمة سيئة جداً. لا خيار لدينا للانتقال.',
    rating: 1,
    category: 'السياسات والممارسات',
    status: 'verified',
    author: 'عمر ض.',
    date: '2026-06-29',
    helpful: 198,
    unhelpful: 45,
    verified: true,
  },
  {
    id: 'rep_018',
    companyId: 'comp_010',
    companyName: 'أمازون السعودية',
    title: 'متجر إلكتروني رائع',
    description: 'أمازون توفر تجربة تسوق رائعة وأسعار تنافسية وتسليم سريع جداً.',
    rating: 5,
    category: 'تجربة المتجر',
    status: 'verified',
    author: 'سلمى د.',
    date: '2026-07-07',
    helpful: 289,
    unhelpful: 12,
    verified: true,
  },
  {
    id: 'rep_019',
    companyId: 'comp_002',
    companyName: 'الراجحي للمالية',
    title: 'بنك موثوق مع خدمات رقمية جيدة',
    description: 'الراجحي بنك موثوق وتطبيقه الرقمي سهل ومريح جداً. مستخدم سعيد.',
    rating: 4,
    category: 'التطبيقات والخدمات الرقمية',
    status: 'verified',
    author: 'ريان ع.',
    date: '2026-07-08',
    helpful: 178,
    unhelpful: 6,
    verified: true,
  },
  {
    id: 'rep_020',
    companyId: 'comp_006',
    companyName: 'سيسكو السعودية',
    title: 'أسعار مرتفعة لكن الجودة تستحق',
    description: 'منتجات سيسكو مكلفة لكن الجودة والدعم يستحقان السعر. استثمار جيد.',
    rating: 4,
    category: 'القيمة مقابل الأموال',
    status: 'verified',
    author: 'وسيم ف.',
    date: '2026-06-23',
    helpful: 134,
    unhelpful: 9,
    verified: true,
  },
]

// ============================================
// USERS DATA (15+)
// ============================================

export const users: User[] = [
  {
    id: 'user_001',
    name: 'أحمد محمد',
    email: 'ahmad.hassan@email.com',
    role: 'user',
    status: 'active',
    reportsSubmitted: 5,
    watchlist: 12,
    subscription: 'professional',
    joinDate: '2025-03-15',
    lastLogin: '2026-07-09T14:23:00',
  },
  {
    id: 'user_002',
    name: 'فاطمة علي',
    email: 'fatima.ali@email.com',
    role: 'user',
    status: 'active',
    reportsSubmitted: 3,
    watchlist: 8,
    subscription: 'free',
    joinDate: '2026-01-10',
    lastLogin: '2026-07-08T09:45:00',
  },
  {
    id: 'user_003',
    name: 'محمود سعيد',
    email: 'mahmoud.saeed@email.com',
    role: 'staff',
    status: 'active',
    reportsSubmitted: 0,
    joinDate: '2025-11-20',
    lastLogin: '2026-07-09T10:15:00',
  },
  {
    id: 'user_004',
    name: 'مريم خالد',
    email: 'mariam.khaled@email.com',
    role: 'admin',
    status: 'active',
    joinDate: '2024-06-01',
    lastLogin: '2026-07-09T16:30:00',
  },
  {
    id: 'user_005',
    name: 'خالد إبراهيم',
    email: 'khaled.ibrahim@email.com',
    role: 'user',
    status: 'suspended',
    reportsSubmitted: 28,
    watchlist: 45,
    subscription: 'enterprise',
    joinDate: '2024-08-12',
    lastLogin: '2026-06-15T11:20:00',
  },
  {
    id: 'user_006',
    name: 'ليلى محمود',
    email: 'layla.mahmoud@email.com',
    role: 'user',
    status: 'active',
    reportsSubmitted: 7,
    watchlist: 15,
    subscription: 'professional',
    joinDate: '2025-06-22',
    lastLogin: '2026-07-09T13:40:00',
  },
  {
    id: 'user_007',
    name: 'عمر السلطان',
    email: 'omar.sultan@email.com',
    role: 'user',
    status: 'active',
    reportsSubmitted: 2,
    watchlist: 6,
    subscription: 'free',
    joinDate: '2026-05-01',
    lastLogin: '2026-07-07T08:15:00',
  },
  {
    id: 'user_008',
    name: 'نور الدين',
    email: 'noor.eldin@email.com',
    role: 'user',
    status: 'active',
    reportsSubmitted: 12,
    watchlist: 22,
    subscription: 'enterprise',
    joinDate: '2024-12-10',
    lastLogin: '2026-07-09T15:50:00',
  },
  {
    id: 'user_009',
    name: 'سارة النجار',
    email: 'sarah.elnjjar@email.com',
    role: 'user',
    status: 'active',
    reportsSubmitted: 4,
    watchlist: 9,
    subscription: 'free',
    joinDate: '2026-03-05',
    lastLogin: '2026-07-08T12:30:00',
  },
  {
    id: 'user_010',
    name: 'حسن الحسيني',
    email: 'hassan.elhosseini@email.com',
    role: 'staff',
    status: 'active',
    reportsSubmitted: 0,
    joinDate: '2025-09-15',
    lastLogin: '2026-07-09T09:00:00',
  },
]

// ============================================
// DASHBOARD STATISTICS
// ============================================

export const dashboardStats: DashboardStats = {
  totalCompanies: 847,
  totalReports: 3247,
  totalUsers: 12543,
  totalStaff: 345,
  averageTrustScore: 78.5,
  activeCompanies: 812,
  newReportsThisMonth: 287,
  newUsersThisMonth: 456,
  reportsApprovedThisMonth: 234,
  reportsRejectedThisMonth: 32,
  reportsPendingModeration: 21,
}

// ============================================
// HELPER FUNCTIONS
// ============================================

export function getCompanyById(id: string): Company | undefined {
  return companies.find((c) => c.id === id)
}

export function getReportsByCompanyId(companyId: string): Report[] {
  return reports.filter((r) => r.companyId === companyId)
}

export function getUserById(id: string): User | undefined {
  return users.find((u) => u.id === id)
}

export function searchCompanies(query: string): Company[] {
  const lowerQuery = query.toLowerCase()
  return companies.filter(
    (c) =>
      c.name.toLowerCase().includes(lowerQuery) ||
      c.nameEn.toLowerCase().includes(lowerQuery) ||
      c.category.toLowerCase().includes(lowerQuery) ||
      c.city.toLowerCase().includes(lowerQuery)
  )
}

export function getTopCompanies(limit: number = 10): Company[] {
  return [...companies].sort((a, b) => b.trustScore - a.trustScore).slice(0, limit)
}

export function getReportsByStatus(
  status: Report['status']
): Report[] {
  return reports.filter((r) => r.status === status)
}

export function getReportsByRating(rating: number): Report[] {
  return reports.filter((r) => r.rating === rating)
}
