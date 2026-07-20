import { useState } from 'react'

export default function Partners() {
  const [formData, setFormData] = useState({
    company: '',
    contact: '',
    email: '',
    phone: '',
    message: ''
  })

  const [submitted, setSubmitted] = useState(false)

  const partners = [
    { name: 'شركة نجد للمقاولات', logo: 'ن', sector: 'مقاولات', reports: 450, joinDate: '2026-01-15', color: '#16A34A' },
    { name: 'الرياض للتجارة', logo: 'ر', sector: 'تجارة', reports: 380, joinDate: '2026-02-20', color: '#1E2A52' },
    { name: 'الخليج للخدمات', logo: 'خ', sector: 'خدمات', reports: 520, joinDate: '2025-11-10', color: '#16A34A' },
    { name: 'الشرق للتوريد', logo: 'ش', sector: 'توريد', reports: 290, joinDate: '2026-03-05', color: '#1E2A52' },
  ]

  const requirements = [
    { number: '01', title: 'حد أدنى من الإسهام', desc: '1000+ شركة مضافة أو 500+ تقرير معتمد سنوياً' },
    { number: '02', title: 'البيانات الموثوقة', desc: 'بيانات صحيحة وموثوقة عن الشركات والمعاملات' },
    { number: '03', title: 'الالتزام بالشروط', desc: 'الالتزام بسياسات المنصة وأخلاقيات الإبلاغ' },
    { number: '04', title: 'التواصل المنتظم', desc: 'التواصل مع فريق مرصد للتطوير المستمر' },
  ]

  const benefits = [
    { title: 'اشتراك مجاني سنوي', desc: 'اشتراك مجاني كامل لمدة 12 شهر' },
    { title: 'شعار الشركة على المنصة', desc: 'ظهور شعار شركتك في صفحة الشركاء المختارة' },
    { title: 'تقارير غير محدود', desc: 'رفع عدد غير محدود من التقارير' },
    { title: '100 بحث شهرياً', desc: '100 عملية بحث عن الشركات كل شهر' },
    { title: 'أولوية في المراجعة', desc: 'أولوية عالية وسريعة في مراجعة التقارير' },
    { title: 'شارة الشراكة', desc: 'شارة "شريك مرصد المعتمد" على ملفك' },
  ]

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setSubmitted(true)
    setTimeout(() => setSubmitted(false), 4000)
  }

  return (
    <main style={{ fontFamily: 'Tajawal, system-ui, sans-serif', background: '#ffffff', minHeight: '100vh' }}>
      {/* Hero Section - Refined */}
      <section style={{
        background: 'linear-gradient(135deg, #1E2A52 0%, #16A34A 100%)',
        color: '#fff',
        padding: '120px 28px 80px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Subtle Background Pattern */}
        <div style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '400px',
          height: '400px',
          background: 'radial-gradient(circle, rgba(255,255,255,.05) 1px, transparent 1px)',
          backgroundSize: '50px 50px',
          opacity: 0.3
        }} />

        <div style={{ maxWidth: '800px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#E2E8F0',
            marginBottom: '16px',
            letterSpacing: '2px',
            textTransform: 'uppercase'
          }}>
            برنامج حصري
          </div>

          <h1 style={{
            fontSize: '56px',
            fontWeight: 900,
            margin: '0 0 24px 0',
            letterSpacing: '-2px',
            lineHeight: 1.2,
            textAlign: 'right'
          }}>
            شركاء مرصد المختارون
          </h1>

          <p style={{
            fontSize: '18px',
            color: '#E2E8F0',
            margin: 0,
            lineHeight: 1.8,
            maxWidth: '650px',
            marginLeft: 'auto',
            marginRight: 'auto',
            textAlign: 'right'
          }}>
            انضم إلى شركائنا المختارين وساهم في بناء مؤشر ثقة موثوق يشكل مستقبل السوق السعودي
          </p>
        </div>
      </section>

      {/* Overview - Dual Column */}
      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '80px 28px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '80px',
          alignItems: 'center'
        }}>
          {/* Left */}
          <div>
            <div style={{
              fontSize: '12px',
              fontWeight: 700,
              color: '#16A34A',
              marginBottom: '12px',
              letterSpacing: '1px',
              textTransform: 'uppercase'
            }}>
              عن البرنامج
            </div>

            <h2 style={{
              fontSize: '42px',
              fontWeight: 900,
              color: '#1E2A52',
              margin: '0 0 24px 0',
              lineHeight: 1.2,
              textAlign: 'right'
            }}>
              نحتاج الشركات التي تؤمن بالشفافية
            </h2>

            <p style={{
              fontSize: '16px',
              color: '#475569',
              lineHeight: 1.9,
              margin: '0 0 20px 0',
              textAlign: 'right'
            }}>
              برنامجنا ليس للجميع. نختار شركاءنا بعناية شديدة — الشركات التي تسهم بكميات كبيرة من البيانات الموثوقة والمتسقة.
            </p>

            <p style={{
              fontSize: '16px',
              color: '#475569',
              lineHeight: 1.9,
              margin: 0,
              textAlign: 'right'
            }}>
              هؤلاء هم الشركات التي تفهم أن بناء نظام موثوق يتطلب التزام حقيقي. ونحن نكافئهم بشكل متناسب.
            </p>
          </div>

          {/* Right - Stats */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: '32px'
          }}>
            <div style={{
              borderLeft: '3px solid #16A34A',
              paddingLeft: '28px'
            }}>
              <div style={{
                fontSize: '36px',
                fontWeight: 900,
                color: '#1E2A52',
                marginBottom: '8px'
              }}>
                4
              </div>
              <div style={{
                fontSize: '14px',
                color: '#64748B',
                fontWeight: 600
              }}>
                شركاء معتمدون حالياً
              </div>
            </div>

            <div style={{
              borderLeft: '3px solid #16A34A',
              paddingLeft: '28px'
            }}>
              <div style={{
                fontSize: '36px',
                fontWeight: 900,
                color: '#1E2A52',
                marginBottom: '8px'
              }}>
                1,640+
              </div>
              <div style={{
                fontSize: '14px',
                color: '#64748B',
                fontWeight: 600
              }}>
                تقرير معتمد مجمعاً
              </div>
            </div>

            <div style={{
              borderLeft: '3px solid #16A34A',
              paddingLeft: '28px'
            }}>
              <div style={{
                fontSize: '36px',
                fontWeight: 900,
                color: '#1E2A52',
                marginBottom: '8px'
              }}>
                12 شهر
              </div>
              <div style={{
                fontSize: '14px',
                color: '#64748B',
                fontWeight: 600
              }}>
                اشتراك مجاني كامل
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits - Masonry Style */}
      <section style={{ background: '#F8FAFC', padding: '80px 28px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ marginBottom: '60px' }}>
            <div style={{
              fontSize: '12px',
              fontWeight: 700,
              color: '#16A34A',
              marginBottom: '12px',
              letterSpacing: '1px',
              textTransform: 'uppercase'
            }}>
              المميزات الحصرية
            </div>
            <h2 style={{
              fontSize: '42px',
              fontWeight: 900,
              color: '#1E2A52',
              margin: 0,
              textAlign: 'right'
            }}>
              ما الذي تحصل عليه
            </h2>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '24px'
          }}>
            {benefits.map((benefit, i) => (
              <div
                key={i}
                style={{
                  background: '#ffffff',
                  border: '1px solid #E2E8F0',
                  borderRadius: '12px',
                  padding: '32px',
                  transition: 'all 0.3s ease',
                  cursor: 'default'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,.08)'
                  e.currentTarget.style.transform = 'translateY(-4px)'
                  e.currentTarget.style.borderColor = '#16A34A'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = 'none'
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.borderColor = '#E2E8F0'
                }}
              >
                <div style={{
                  width: '48px',
                  height: '48px',
                  background: '#F0FDF4',
                  borderRadius: '8px',
                  marginBottom: '18px'
                }} />

                <h3 style={{
                  fontSize: '18px',
                  fontWeight: 800,
                  color: '#1E2A52',
                  margin: '0 0 10px 0'
                }}>
                  {benefit.title}
                </h3>

                <p style={{
                  fontSize: '14px',
                  color: '#64748B',
                  margin: 0,
                  lineHeight: 1.6
                }}>
                  {benefit.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Requirements - Numbered */}
      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '80px 28px' }}>
        <div style={{ marginBottom: '60px' }}>
          <div style={{
            fontSize: '12px',
            fontWeight: 700,
            color: '#16A34A',
            marginBottom: '12px',
            letterSpacing: '1px',
            textTransform: 'uppercase'
          }}>
            الشروط والمتطلبات
          </div>
          <h2 style={{
            fontSize: '42px',
            fontWeight: 900,
            color: '#1E2A52',
            margin: 0,
            textAlign: 'right'
          }}>
            من يمكنه الانضمام
          </h2>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '32px'
        }}>
          {requirements.map((req, i) => (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: '60px 1fr',
              gap: '20px'
            }}>
              <div style={{
                fontSize: '28px',
                fontWeight: 900,
                color: '#16A34A',
                lineHeight: 1
              }}>
                {req.number}
              </div>

              <div>
                <h3 style={{
                  fontSize: '18px',
                  fontWeight: 800,
                  color: '#1E2A52',
                  margin: '0 0 8px 0'
                }}>
                  {req.title}
                </h3>

                <p style={{
                  fontSize: '14px',
                  color: '#64748B',
                  margin: 0,
                  lineHeight: 1.6
                }}>
                  {req.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Current Partners - Showcase */}
      <section style={{ background: '#F8FAFC', padding: '80px 28px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ marginBottom: '60px' }}>
            <div style={{
              fontSize: '12px',
              fontWeight: 700,
              color: '#16A34A',
              marginBottom: '12px',
              letterSpacing: '1px',
              textTransform: 'uppercase'
            }}>
              الشركاء الحاليون
            </div>
            <h2 style={{
              fontSize: '42px',
              fontWeight: 900,
              color: '#1E2A52',
              margin: 0,
              textAlign: 'right'
            }}>
              شركاؤنا الموثوقون
            </h2>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '28px'
          }}>
            {partners.map((partner, i) => (
              <div
                key={i}
                style={{
                  background: '#ffffff',
                  border: '1px solid #E2E8F0',
                  borderRadius: '14px',
                  padding: '36px',
                  display: 'flex',
                  gap: '24px',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.boxShadow = '0 20px 40px rgba(22,163,74,.1)'
                  e.currentTarget.style.borderColor = '#16A34A'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = 'none'
                  e.currentTarget.style.borderColor = '#E2E8F0'
                }}
              >
                {/* Logo */}
                <div style={{
                  width: '72px',
                  height: '72px',
                  borderRadius: '12px',
                  background: `linear-gradient(135deg, ${partner.color}, ${partner.color}cc)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '28px',
                  fontWeight: 900,
                  flex: 'none'
                }}>
                  {partner.logo}
                </div>

                {/* Info */}
                <div style={{ flex: 1 }}>
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: 800,
                    color: '#1E2A52',
                    margin: '0 0 4px 0'
                  }}>
                    {partner.name}
                  </h3>

                  <p style={{
                    fontSize: '13px',
                    color: '#64748B',
                    margin: '0 0 14px 0',
                    fontWeight: 600
                  }}>
                    {partner.sector}
                  </p>

                  <div style={{
                    fontSize: '20px',
                    fontWeight: 900,
                    color: '#16A34A',
                    marginBottom: '2px'
                  }}>
                    {partner.reports}+
                  </div>

                  <div style={{
                    fontSize: '12px',
                    color: '#94A3B8',
                    marginBottom: '10px'
                  }}>
                    تقرير معتمد · منذ {partner.joinDate}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Application Form */}
      <section style={{ maxWidth: '900px', margin: '0 auto', padding: '80px 28px' }}>
        <div style={{ marginBottom: '60px' }}>
          <div style={{
            fontSize: '12px',
            fontWeight: 700,
            color: '#16A34A',
            marginBottom: '12px',
            letterSpacing: '1px',
            textTransform: 'uppercase'
          }}>
            تقديم الطلب
          </div>
          <h2 style={{
            fontSize: '42px',
            fontWeight: 900,
            color: '#1E2A52',
            margin: '0 0 18px 0',
            textAlign: 'right'
          }}>
            انضم إلى البرنامج
          </h2>
          <p style={{
            fontSize: '16px',
            color: '#64748B',
            margin: 0
          }}>
            أخبرنا عن شركتك واسهاماتك. سيراجع فريقنا طلبك وسنتواصل معك خلال 48 ساعة
          </p>
        </div>

        {!submitted ? (
          <form onSubmit={handleSubmit} style={{
            background: '#ffffff',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '48px'
          }}>
            <div style={{ marginBottom: '28px' }}>
              <label style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#334155',
                display: 'block',
                marginBottom: '10px'
              }}>
                اسم الشركة
              </label>
              <input
                type="text"
                name="company"
                value={formData.company}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  fontSize: '15px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                  transition: 'all 0.2s'
                }}
                onFocus={e => e.target.style.borderColor = '#16A34A'}
                onBlur={e => e.target.style.borderColor = '#E2E8F0'}
                placeholder="اسم شركتك"
              />
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '20px',
              marginBottom: '28px'
            }}>
              <div>
                <label style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#334155',
                  display: 'block',
                  marginBottom: '10px'
                }}>
                  الاسم الكامل
                </label>
                <input
                  type="text"
                  name="contact"
                  value={formData.contact}
                  onChange={handleChange}
                  required
                  style={{
                    width: '100%',
                    border: '1.5px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '14px 16px',
                    fontSize: '15px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                    transition: 'all 0.2s'
                  }}
                  onFocus={e => e.target.style.borderColor = '#16A34A'}
                  onBlur={e => e.target.style.borderColor = '#E2E8F0'}
                  placeholder="اسمك"
                />
              </div>

              <div>
                <label style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#334155',
                  display: 'block',
                  marginBottom: '10px'
                }}>
                  البريد الإلكتروني
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  style={{
                    width: '100%',
                    border: '1.5px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '14px 16px',
                    fontSize: '15px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                    transition: 'all 0.2s'
                  }}
                  onFocus={e => e.target.style.borderColor = '#16A34A'}
                  onBlur={e => e.target.style.borderColor = '#E2E8F0'}
                  placeholder="بريدك@مثال.com"
                />
              </div>
            </div>

            <div style={{ marginBottom: '28px' }}>
              <label style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#334155',
                display: 'block',
                marginBottom: '10px'
              }}>
                رقم الهاتف
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  fontSize: '15px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                  transition: 'all 0.2s'
                }}
                onFocus={e => e.target.style.borderColor = '#16A34A'}
                onBlur={e => e.target.style.borderColor = '#E2E8F0'}
                placeholder="رقم الهاتف"
              />
            </div>

            <div style={{ marginBottom: '32px' }}>
              <label style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#334155',
                display: 'block',
                marginBottom: '10px'
              }}>
                رسالة إضافية
              </label>
              <textarea
                name="message"
                value={formData.message}
                onChange={handleChange}
                style={{
                  width: '100%',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  fontSize: '15px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                  minHeight: '120px',
                  transition: 'all 0.2s',
                  resize: 'none'
                }}
                onFocus={e => e.target.style.borderColor = '#16A34A'}
                onBlur={e => e.target.style.borderColor = '#E2E8F0'}
                placeholder="أخبرنا عن إسهاماتك وسبب اهتمامك ببرنامج الشركاء"
              />
            </div>

            <button
              type="submit"
              style={{
                width: '100%',
                background: '#16A34A',
                color: '#fff',
                border: 0,
                borderRadius: '10px',
                padding: '16px',
                fontSize: '15px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => e.target.style.opacity = '0.92'}
              onMouseLeave={e => e.target.style.opacity = '1'}
            >
              إرسال الطلب
            </button>
          </form>
        ) : (
          <div style={{
            background: '#ECFDF5',
            border: '1px solid #BBF7D0',
            borderRadius: '16px',
            padding: '48px',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '48px',
              marginBottom: '20px'
            }}>
              ✓
            </div>
            <h3 style={{
              fontSize: '22px',
              fontWeight: 900,
              color: '#15803D',
              margin: '0 0 10px 0'
            }}>
              تم استقبال طلبك بنجاح
            </h3>
            <p style={{
              fontSize: '15px',
              color: '#166534',
              margin: 0,
              lineHeight: 1.6
            }}>
              شكراً على اهتمامك! سيراجع فريق مرصد طلبك بعناية وسنتواصل معك خلال 48 ساعة
            </p>
          </div>
        )}
      </section>

      {/* Contact Section */}
      <section style={{
        background: '#1E2A52',
        color: '#fff',
        padding: '80px 28px',
        textAlign: 'center'
      }}>
        <h2 style={{
          fontSize: '36px',
          fontWeight: 900,
          margin: '0 0 12px 0'
        }}>
          أسئلة أو استفسارات؟
        </h2>
        <p style={{
          fontSize: '16px',
          color: '#E2E8F0',
          margin: '0 0 32px 0'
        }}>
          تواصل معنا مباشرة — فريقنا جاهز للرد عليك
        </p>
        <a href="mailto:partners@marsad.sa" style={{
          display: 'inline-block',
          background: '#16A34A',
          color: '#fff',
          padding: '16px 40px',
          borderRadius: '10px',
          fontWeight: 800,
          textDecoration: 'none',
          fontSize: '15px',
          transition: 'all 0.2s',
          cursor: 'pointer'
        }}
        onMouseEnter={e => e.target.style.opacity = '0.9'}
        onMouseLeave={e => e.target.style.opacity = '1'}
        >
          partners@marsad.sa
        </a>
      </section>
    </main>
  )
}
