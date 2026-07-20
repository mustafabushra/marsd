export declare const MARSAD_SPECIFICATION: {
    readonly projectName: "مرصد — Marsad";
    readonly projectType: "B2B SaaS — Multi-Tenant";
    readonly targetMarket: "Kingdom of Saudi Arabia";
    readonly deadline: "2026-08-03";
    readonly version: "1.0";
    readonly language: "Arabic (RTL)";
    readonly currency: "Saudi Riyal (SAR)";
    readonly product: {
        readonly description: "منصة تقييم موثوقية الأعمال — Business Reliability Assessment Platform";
        readonly model: "Subscription SaaS with 4 tiers";
        readonly mechanism: {
            readonly officialData: "حالة السجل التجاري + عمر الشركة (30%)";
            readonly communityData: "تقارير من شركات تعاملت فعلياً (70%)";
            readonly trustScore: "مؤشر ثقة محسوب خوارزمياً من بيانات معتمدة فقط";
        };
        readonly protection: "كل تقرير يخضع لمراجعة إدارية إلزامية — هوية المُبلِّغ محمية تماماً";
    };
    readonly plans: readonly [{
        readonly id: "free";
        readonly name: "مجانية";
        readonly priceMonthly: 0;
        readonly limits: {
            readonly viewsPerMonth: "limited";
            readonly usersAllowed: 1;
            readonly watchlists: 0;
            readonly features: readonly ["basicSearch", "officialDataOnly"];
            readonly trustScoreVisible: false;
            readonly trustScoreAppearance: "blurred_with_upgrade_prompt";
        };
    }, {
        readonly id: "basic";
        readonly name: "أساسية";
        readonly priceMonthly: 299;
        readonly limits: {
            readonly viewsPerMonth: 25;
            readonly usersAllowed: 2;
            readonly watchlists: 1;
            readonly reportsPerMonth: 25;
            readonly features: readonly ["fullSearch", "communityData", "watchlist", "reports"];
        };
    }, {
        readonly id: "pro";
        readonly name: "احترافية";
        readonly priceMonthly: 799;
        readonly limits: {
            readonly viewsPerMonth: 100;
            readonly usersAllowed: 10;
            readonly watchlists: "unlimited";
            readonly reportsPerMonth: 100;
            readonly features: readonly ["fullSearch", "communityData", "watchlist", "reports", "compare", "businessRequests"];
        };
    }, {
        readonly id: "enterprise";
        readonly name: "مؤسسات";
        readonly priceMonthly: "custom";
        readonly limits: {
            readonly viewsPerMonth: "unlimited";
            readonly usersAllowed: "unlimited";
            readonly watchlists: "unlimited";
            readonly reportsPerMonth: "unlimited";
            readonly features: readonly ["all", "apiAccess", "sla", "accountManager"];
        };
    }];
    readonly functionalRequirements: {
        readonly FR01: "Registration & verification (company data + CR number)";
        readonly FR02: "Authentication (JWT Access + Refresh rotation)";
        readonly FR03: "Multi-tenancy (complete isolation per tenant)";
        readonly FR04: "RBAC (5 roles with defined permissions)";
        readonly FR05: "Company search (name/CR/sector/city with filters)";
        readonly FR06: "Company report page (4 display states)";
        readonly FR07: "Add new company request (admin approval)";
        readonly FR08: "Report wizard (4-step form)";
        readonly FR09: "Report review queue (approve/reject/request info)";
        readonly FR10: "Trust Score engine (auto-calculation from approved reports)";
        readonly FR11: "Reporter anonymity (no identity exposure ever)";
        readonly FR12: "Watchlists (add/monitor/notify on changes)";
        readonly FR13: "Compare up to 3 companies (side-by-side)";
        readonly FR14: "Business requests (inter-company)";
        readonly FR15: "Company user management (invite/roles/disable)";
        readonly FR16: "Subscriptions & billing (payment gateway integration)";
        readonly FR17: "Document upload (S3 with presigned URLs)";
        readonly FR18: "Notifications (in-app + email)";
        readonly FR19: "Audit logs (immutable record of all sensitive ops)";
        readonly FR20: "System settings (dashboard configurable)";
    };
    readonly nonFunctionalRequirements: {
        readonly NFR01: "Performance: API response ≤300ms (P95), page load ≤2.5s";
        readonly NFR02: "Availability: 99.5% monthly in v1";
        readonly NFR03: "Scalability: Support 10k companies + 100 req/sec without redesign";
        readonly NFR04: "Security: TLS 1.3, AES-256, OWASP Top 10, tenant isolation";
        readonly NFR05: "Privacy: Reporter identity impossible to infer (architectural)";
        readonly NFR06: "Maintainability: ≥70% test coverage, Clean Architecture";
        readonly NFR07: "Compatibility: Last 2 versions Chrome/Safari/Edge/Firefox, 360px+";
        readonly NFR08: "Accessibility: AA contrast, keyboard support for core forms";
        readonly NFR09: "RTL: Complete RTL support in all screens (no exceptions)";
        readonly NFR10: "Compliance: PDPL readiness (personal data handling)";
    };
    readonly userTypes: {
        readonly visitor: {
            readonly name: "الزائر";
            readonly accessPoints: readonly ["marketing_website"];
        };
        readonly companyMember: {
            readonly name: "موظف شركة";
            readonly permissions: readonly ["search", "viewReports", "submitReports", "watchlist"];
        };
        readonly companyAdmin: {
            readonly name: "مدير الشركة";
            readonly permissions: readonly ["all_company_member", "manageUsers", "billing", "subscription"];
        };
        readonly reviewer: {
            readonly name: "مراجع";
            readonly permissions: readonly ["reviewReports", "approveCo"];
        };
        readonly platformAdmin: {
            readonly name: "إدارة المنصة";
            readonly permissions: readonly ["all"];
        };
    };
    readonly businessRules: {
        readonly BR01: "No report counts until administratively approved";
        readonly BR02: "Reporter identity NEVER exposed — aggregated statistics only";
        readonly BR03: "Less than 5 approved reports = \"insufficient data\" (configurable)";
        readonly BR04: "No single report dominates: cap at 15% of community layer weight";
        readonly BR05: "One company: 1 report per 90 days to same target";
        readonly BR06: "2-4 reports = preliminary rating (warning, no final number)";
        readonly BR07: "Free tier: official data visible, trust score + community data LOCKED";
        readonly BR08: "Rejected report: returned to sender with reason, one re-submit allowed";
        readonly BR10: "Exceeding plan limits = upgrade prompt, NO auto-charge";
        readonly BR11: "Every sensitive operation in immutable Audit Log";
    };
    readonly trustScoreEngine: {
        readonly version: "v1";
        readonly formula: "TrustScore = clamp(W_official × S_official + W_community × S_community, 0, 100)";
        readonly defaultWeights: {
            readonly W_official: 0.3;
            readonly W_community: 0.7;
        };
        readonly officialDataComponents: {
            readonly registryStatus: {
                readonly weight: 0.5;
                readonly maxScore: 100;
            };
            readonly companyAge: {
                readonly weight: 0.3;
                readonly maxScore: 100;
                readonly threshold: 10;
            };
            readonly dataCompleteness: {
                readonly weight: 0.2;
                readonly maxScore: 100;
            };
        };
        readonly communityDataScoring: {
            readonly fullCompliance: 100;
            readonly delay_0_30days: 60;
            readonly delay_31_90days: 35;
            readonly delay_over_90days: 10;
            readonly defaulted: 0;
        };
        readonly recencyDecay: "exponential: 0.5^(months/12)";
        readonly capPerReport: 0.15;
        readonly riskBands: {
            readonly green: {
                readonly range: "70-100";
                readonly label: "مخاطر منخفضة";
                readonly color: "#15803D";
                readonly bg: "#ECFDF5";
            };
            readonly orange: {
                readonly range: "40-69";
                readonly label: "مخاطر متوسطة";
                readonly color: "#B45309";
                readonly bg: "#FFFBEB";
            };
            readonly red: {
                readonly range: "0-39";
                readonly label: "مخاطر مرتفعة";
                readonly color: "#B91C1C";
                readonly bg: "#FEF2F2";
            };
        };
        readonly minimumApprovedReports: 5;
        readonly tiers: {
            readonly full: {
                readonly minReports: 5;
                readonly displayScore: true;
                readonly displayStats: true;
            };
            readonly preliminary: {
                readonly minReports: 2;
                readonly displayScore: false;
                readonly displayCategory: true;
                readonly warning: true;
            };
            readonly none: {
                readonly minReports: 0;
                readonly displayMessage: "BR-03 message";
            };
            readonly locked: {
                readonly plan: "free";
                readonly displayScore: "blurred";
                readonly displayStats: false;
            };
        };
    };
    readonly reportStates: {
        readonly draft: "المسودة — locally unsent";
        readonly pending_review: "قيد المراجعة — awaiting admin decision";
        readonly approved: "معتمد — counts in stats";
        readonly rejected: "مرفوض — returned to sender";
        readonly awaiting_info: "بانتظار استكمال — request for more info";
        readonly approval_revoked: "ملغى الاعتماد — exceptional case";
    };
    readonly screens: {
        readonly marketing: readonly [{
            readonly id: 1;
            readonly name: "الرئيسية";
            readonly path: "/";
        }, {
            readonly id: 2;
            readonly name: "عن المنصة";
            readonly path: "/about";
        }, {
            readonly id: 3;
            readonly name: "الباقات والأسعار";
            readonly path: "/pricing";
        }, {
            readonly id: 4;
            readonly name: "الأسئلة الشائعة";
            readonly path: "/faq";
        }, {
            readonly id: 5;
            readonly name: "تواصل معنا";
            readonly path: "/contact";
        }, {
            readonly id: 6;
            readonly name: "إنشاء حساب";
            readonly path: "/register";
        }, {
            readonly id: 7;
            readonly name: "تسجيل الدخول";
            readonly path: "/login";
        }];
        readonly company: readonly [{
            readonly id: 8;
            readonly name: "لوحة التحكم";
            readonly path: "/company/dashboard";
        }, {
            readonly id: 9;
            readonly name: "البحث";
            readonly path: "/company/search";
        }, {
            readonly id: 10;
            readonly name: "تقرير الشركة";
            readonly path: "/company/company/:id";
            readonly states: "4 display variants";
        }, {
            readonly id: 11;
            readonly name: "إضافة شركة جديدة";
            readonly path: "/company/add-company";
        }, {
            readonly id: 12;
            readonly name: "معالج إضافة تقرير";
            readonly path: "/company/reports/new";
            readonly steps: 4;
        }, {
            readonly id: 13;
            readonly name: "تقاريري المرسلة";
            readonly path: "/company/reports/mine";
        }, {
            readonly id: 14;
            readonly name: "قوائم المراقبة";
            readonly path: "/company/watchlist";
        }, {
            readonly id: 15;
            readonly name: "مقارنة الشركات";
            readonly path: "/company/compare";
        }, {
            readonly id: 16;
            readonly name: "طلبات الأعمال";
            readonly path: "/company/business-requests";
        }, {
            readonly id: 17;
            readonly name: "إدارة المستخدمين";
            readonly path: "/company/team";
        }, {
            readonly id: 18;
            readonly name: "الاشتراك والفوترة";
            readonly path: "/company/billing";
        }, {
            readonly id: 19;
            readonly name: "الملف الشخصي والإشعارات";
            readonly path: "/company/profile";
        }];
        readonly admin: readonly [{
            readonly id: 20;
            readonly name: "لوحة الإدارة";
            readonly path: "/admin/dashboard";
        }, {
            readonly id: 21;
            readonly name: "طابور المراجعة";
            readonly path: "/admin/review-queue";
        }, {
            readonly id: 22;
            readonly name: "إدارة الشركات";
            readonly path: "/admin/companies";
        }, {
            readonly id: 23;
            readonly name: "إدارة المشتركين والباقات";
            readonly path: "/admin/subscriptions";
        }, {
            readonly id: 24;
            readonly name: "سجل العمليات";
            readonly path: "/admin/audit-logs";
        }, {
            readonly id: 25;
            readonly name: "إعدادات النظام";
            readonly path: "/admin/settings";
        }];
    };
    readonly designSystem: {
        readonly font: {
            readonly name: "Tajawal";
            readonly weights: readonly [400, 500, 700, 800, 900];
            readonly fallback: "system-ui, sans-serif";
        };
        readonly direction: "rtl";
        readonly colors: {
            readonly navy: {
                readonly value: "#1E2A52";
                readonly usage: "sidebar, headings, score number";
            };
            readonly brandGreen: {
                readonly value: "#16A34A";
                readonly usage: "buttons, logo, score fill";
            };
            readonly greenDark: {
                readonly value: "#15803D";
                readonly usage: "success badges";
            };
            readonly greenBg: {
                readonly value: "#ECFDF5";
                readonly usage: "success badge bg";
            };
            readonly ink: {
                readonly value: "#0F172A";
                readonly usage: "primary text";
            };
            readonly slate600: {
                readonly value: "#475569";
                readonly usage: "secondary text";
            };
            readonly border: {
                readonly value: "#E2E8F0";
                readonly usage: "card borders, most used";
            };
            readonly surface: {
                readonly value: "#FFFFFF";
                readonly usage: "card bg";
            };
            readonly bg: {
                readonly value: "#F8FAFC";
                readonly usage: "page bg";
            };
            readonly bgMuted: {
                readonly value: "#F1F5F9";
                readonly usage: "secondary bg";
            };
            readonly warning: {
                readonly value: "#F59E0B";
                readonly text: "#B45309";
                readonly bg: "#FFFBEB";
            };
            readonly danger: {
                readonly value: "#DC2626";
                readonly text: "#B91C1C";
                readonly bg: "#FEF2F2";
            };
        };
        readonly components: {
            readonly sidebar: {
                readonly width: "268px";
                readonly bg: "navy";
                readonly sticky: true;
            };
            readonly card: {
                readonly border: "1px solid #E2E8F0";
                readonly borderRadius: "12-18px";
                readonly shadow: "minimal";
            };
            readonly badge: {
                readonly borderRadius: "7px or 999px (pills)";
                readonly weight: 800;
                readonly size: "12.5-13.5px";
            };
            readonly trustGauge: {
                readonly diameter: "140px";
                readonly innerDiameter: "108px";
                readonly numberSize: "42px";
                readonly weight: 900;
            };
            readonly button: {
                readonly borderRadius: "10px";
                readonly weight: 800;
                readonly bg: "brandGreen";
                readonly text: "white";
            };
            readonly input: {
                readonly borderRadius: "10px";
                readonly border: "1px solid #E2E8F0";
                readonly bg: "bgMuted or white";
            };
        };
    };
    readonly security: {
        readonly owasp: readonly ["SQL Injection Prevention (Prisma parameterized)", "XSS Prevention (React.createElement, no innerHTML)", "CSRF Prevention (SameSite cookies)", "SSRF Prevention (whitelist URLs)", "XXE Prevention (disable XXE parsing)", "LDAP Injection Prevention", "Command Injection Prevention", "Template Injection Prevention", "Path Traversal Prevention", "IDOR Prevention (tenant_id validation)"];
        readonly authentication: {
            readonly passwordHashing: "Argon2id";
            readonly accessToken: {
                readonly ttl: "15 minutes";
            };
            readonly refreshToken: {
                readonly ttl: "7 days";
                readonly rotation: true;
            };
            readonly accountLockout: "after 5 failed attempts";
            readonly adminMFA: "TOTP required";
        };
        readonly encryption: {
            readonly transit: "TLS 1.3 mandatory (HSTS)";
            readonly storage: "AES-256 (RDS, S3)";
            readonly secrets: "AWS Secrets Manager";
        };
        readonly multiTenant: {
            readonly isolation: "RLS on all tenant_id columns";
            readonly enforcement: "Set LOCAL app.tenant_id in Middleware";
            readonly bypass: "NO BYPASSRLS for app role";
            readonly dbLevel: "Cannot leak even with app error";
        };
        readonly privacy: {
            readonly reporterIdentity: "NEVER exposed (architectural, not just filtering)";
            readonly dataMin: "minimum aggregation to prevent inference";
            readonly documentAccess: "reviewers only, never shared";
        };
        readonly auditTrail: {
            readonly immutable: "append-only, no UPDATE/DELETE";
            readonly scope: "all sensitive ops: approve, reject, suspend, settings change";
            readonly recording: "who, what, when, IP, User-Agent";
        };
    };
    readonly techStack: {
        readonly frontend: {
            readonly framework: "Next.js (App Router)";
            readonly library: "React";
            readonly language: "TypeScript";
        };
        readonly backend: {
            readonly framework: "NestJS";
            readonly orm: "Prisma";
            readonly language: "TypeScript";
        };
        readonly database: {
            readonly engine: "PostgreSQL 16 (AWS RDS)";
            readonly rls: true;
        };
        readonly cache: {
            readonly engine: "Redis (ElastiCache)";
            readonly queue: "BullMQ";
        };
        readonly storage: {
            readonly service: "AWS S3";
            readonly presignedUrls: true;
            readonly maxFileSize: "10MB";
        };
        readonly email: {
            readonly service: "AWS SES";
        };
        readonly payment: {
            readonly gateway: "Moyasar or Tap (TBD week 1)";
        };
        readonly edge: {
            readonly service: "Cloudflare (WAF, CDN, DDoS)";
        };
        readonly containers: {
            readonly runtime: "Docker";
            readonly orchestration: "ECS Fargate";
        };
        readonly cicd: {
            readonly platform: "GitHub Actions";
            readonly registry: "ECR";
            readonly deploymentStrategy: "Rolling (zero-downtime)";
        };
        readonly monitoring: {
            readonly logs: "CloudWatch";
            readonly errors: "Sentry";
            readonly metrics: "CloudWatch";
        };
    };
    readonly timeline: {
        readonly week1: {
            readonly period: "2026-07-03 to 2026-07-10";
            readonly name: "م1 — التأسيس";
            readonly deliverable: "Staging operational: signup, login, marketing site";
            readonly critical: "Deploy infra, CI/CD, Prisma schema, Auth";
        };
        readonly week2: {
            readonly period: "2026-07-11 to 2026-07-18";
            readonly name: "م2 — قلب المنتج";
            readonly deliverable: "Golden journey: search → report → upload";
            readonly critical: "Company search, report page (4 states), report wizard, Trust Score engine";
        };
        readonly week3: {
            readonly period: "2026-07-19 to 2026-07-26";
            readonly name: "م3 — الإدارة والتجارة";
            readonly deliverable: "Full cycle: paid subscription + admin approval changes score";
            readonly critical: "Review queue, subscriptions, payments, watchlists, compare, business requests";
        };
        readonly week4: {
            readonly period: "2026-07-27 to 2026-08-03";
            readonly name: "م4 — الصقل والإطلاق";
            readonly deliverable: "Production launch (GO LIVE)";
            readonly critical: "E2E tests, security audit, UAT, performance tuning, launch";
        };
    };
    readonly launchChecklist: readonly ["✔ All 25 screens operational per approved design", "✔ Golden journey complete and tested", "✔ Trust Score calculated accurately", "✔ Reporter identity protected (0% exposure)", "✔ RLS enforced: Tenant A cannot access Tenant B data", "✔ OWASP Top 10 coverage verified", "✔ Audit Log immutable and comprehensive", "✔ E2E tests passing", "✔ No 5xx errors", "✔ UAT sign-off from client"];
    readonly futurePhases: {
        readonly phase2: readonly ["Government registry integration", "Public API", "SMS/WhatsApp alerts", "PDF reports"];
        readonly phase3: readonly ["Mobile app", "Sector benchmarks", "AI analysis", "Gulf expansion"];
    };
};
export type MarsadSpec = typeof MARSAD_SPECIFICATION;
//# sourceMappingURL=SPECIFICATION_MANIFEST.d.ts.map