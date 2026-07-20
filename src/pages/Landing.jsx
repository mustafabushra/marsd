import { useNavigate } from 'react-router-dom'
import { SearchIcon, BarChartIcon, CheckIcon } from '../components/icons'

export default function Landing() {
  const navigate = useNavigate()

  return (
    <main style={{ fontFamily: 'Tajawal, system-ui, sans-serif' }}>
      {/* HERO SECTION */}
      <section style={{
        background: 'linear-gradient(180deg, #fff 0%, #F8FAFC 100%)',
        borderBottom: '1px solid #EEF2F7'
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '72px 28px 80px',
          display: 'grid',
          gridTemplateColumns: '1.15fr 0.85fr',
          gap: '56px',
          alignItems: 'center'
        }}>
          {/* Left Column */}
          <div style={{ animation: 'fadeUp 0.5s ease both' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: '#ECFDF5',
              color: '#15803D',
              border: '1px solid #BBF7D0',
              borderRadius: '999px',
              padding: '7px 15px',
              fontSize: '13.5px',
              fontWeight: 700,
              marginBottom: '22px',
              lineHeight: '1.5'
            }}>
              منصة متخصصة لتقييم موثوقية الأعمال
            </div>
            <h1 style={{
              fontSize: '42px',
              lineHeight: '1.25',
              fontWeight: 900,
              color: '#0F172A',
              margin: '0 0 18px 0',
              letterSpacing: '-1px',
              textAlign: 'right'
            }}>
              اعرف موثوقية شركائك التجاريين قبل التعامل معهم
            </h1>
            <p style={{
              fontSize: '18.5px',
              lineHeight: '1.8',
              color: '#475569',
              margin: '0 0 30px',
              maxWidth: '560px'
            }}>
              منصة "مرصد" تمنحك مؤشر ثقة موحّداً ومستوى مخاطر دقيقاً لكل شركة، مبنياً على بيانات رسمية وتقارير مجتمعية مُعتمدة. تعامل بثقة، وقلّل المخاطر.
            </p>
            <div style={{ display: 'flex', gap: '14px', marginBottom: '30px' }}>
              <button
                onClick={() => navigate('/register')}
                style={{
                  background: '#16A34A',
                  color: '#fff',
                  border: 0,
                  borderRadius: '11px',
                  padding: '15px 32px',
                  fontSize: '16px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 6px 16px rgba(22, 163, 74, 0.25)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => e.target.style.opacity = '0.9'}
                onMouseLeave={e => e.target.style.opacity = '1'}
              >
                ابدأ مجاناً
              </button>
              <button
                onClick={() => navigate('/about')}
                style={{
                  background: '#fff',
                  color: '#1E2A52',
                  border: '1.5px solid #CBD5E1',
                  borderRadius: '11px',
                  padding: '15px 32px',
                  fontSize: '16px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => e.target.style.borderColor = '#1E2A52'}
                onMouseLeave={e => e.target.style.borderColor = '#CBD5E1'}
              >
                شاهد كيف تعمل
              </button>
            </div>
            <div style={{ display: 'flex', gap: '30px' }}>
              <div>
                <div style={{ fontSize: '26px', fontWeight: 900, color: '#1E2A52' }}>12,400+</div>
                <div style={{ fontSize: '13.5px', color: '#64748B', fontWeight: 600 }}>شركة مُقيّمة</div>
              </div>
              <div style={{ width: '1px', background: '#E2E8F0' }}></div>
              <div>
                <div style={{ fontSize: '26px', fontWeight: 900, color: '#1E2A52' }}>38,900+</div>
                <div style={{ fontSize: '13.5px', color: '#64748B', fontWeight: 600 }}>تقرير معتمد</div>
              </div>
              <div style={{ width: '1px', background: '#E2E8F0' }}></div>
              <div>
                <div style={{ fontSize: '26px', fontWeight: 900, color: '#1E2A52' }}>99.2%</div>
                <div style={{ fontSize: '13.5px', color: '#64748B', fontWeight: 600 }}>دقة البيانات الرسمية</div>
              </div>
            </div>
          </div>

          {/* Right Column - Trust Gauge */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{
              background: '#fff',
              border: '1px solid #E2E8F0',
              borderRadius: '24px',
              padding: '38px',
              boxShadow: '0 24px 60px rgba(15, 23, 42, 0.1)',
              width: '100%',
              maxWidth: '360px',
              textAlign: 'center',
              animation: 'fadeUp 0.6s ease both'
            }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#64748B', marginBottom: '20px' }}>
                مؤشر الثقة
              </div>
              <div style={{
                width: '178px',
                height: '178px',
                borderRadius: '50%',
                background: 'conic-gradient(#16A34A 0% 94%, #E2E8F0 94% 100%)',
                margin: '0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <div style={{
                  width: '138px',
                  height: '138px',
                  borderRadius: '50%',
                  background: '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: 'inset 0 2px 8px rgba(15, 23, 42, 0.05)'
                }}>
                  <span style={{ fontSize: '52px', fontWeight: 900, color: '#1E2A52', lineHeight: '1' }}>94</span>
                  <span style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 600 }}>من 100</span>
                </div>
              </div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                background: '#ECFDF5',
                color: '#15803D',
                borderRadius: '999px',
                padding: '8px 18px',
                fontSize: '14.5px',
                fontWeight: 800,
                marginTop: '20px'
              }}>
                ● موثوقية عالية
              </div>
              <div style={{
                marginTop: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '9px'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '13px',
                  color: '#64748B',
                  fontWeight: 600
                }}>
                  <span>نسبة الالتزام بالسداد</span>
                  <span style={{ color: '#16A34A', fontWeight: 800 }}>96%</span>
                </div>
                <div style={{
                  height: '7px',
                  background: '#F1F5F9',
                  borderRadius: '5px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: '96%',
                    height: '100%',
                    background: '#16A34A',
                    borderRadius: '5px'
                  }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS SECTION */}
      <section style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '74px 28px'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h2 style={{
            fontSize: '34px',
            fontWeight: 900,
            color: '#0F172A',
            margin: '0 0 12px'
          }}>
            كيف تعمل المنصة؟
          </h2>
          <p style={{
            fontSize: '17px',
            color: '#64748B',
            margin: 0
          }}>
            ثلاث خطوات تفصلك عن قرار تجاري أكثر أماناً
          </p>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '26px'
        }}>
          {[
            { icon: SearchIcon, title: 'ابحث عن شركة', desc: 'أدخل اسم الشركة أو رقم السجل التجاري' },
            { icon: BarChartIcon, title: 'اطّلع على التقييم', desc: 'مؤشر ثقة شامل ومستوى مخاطر دقيق' },
            { icon: CheckIcon, title: 'اتخذ قراراً آمناً', desc: 'قرر بثقة بناءً على بيانات موثوقة' }
          ].map((step, i) => {
            const IconComponent = step.icon
            return (
              <div
                key={i}
                style={{
                  background: '#fff',
                  border: '1px solid #E2E8F0',
                  borderRadius: '18px',
                  padding: '34px 30px',
                  position: 'relative'
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: '28px',
                  left: '30px',
                  fontSize: '54px',
                  fontWeight: 900,
                  color: '#F1F5F9',
                  lineHeight: '1'
                }}>
                  {i + 1}
                </div>
                <div style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '14px',
                  background: '#EEF2FF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '22px',
                  color: '#1E2A52'
                }}>
                  <IconComponent />
                </div>
                <h3 style={{
                  fontSize: '20px',
                  fontWeight: 800,
                  color: '#1E2A52',
                  margin: '0 0 10px'
                }}>
                  {step.title}
                </h3>
                <p style={{
                  fontSize: '15.5px',
                  lineHeight: '1.75',
                  color: '#64748B',
                  margin: 0
                }}>
                  {step.desc}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      {/* GIVE TO GET SECTION */}
      <section style={{
        background: '#1E2A52',
        color: '#fff'
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '68px 28px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '56px',
          alignItems: 'center'
        }}>
          <div>
            <div style={{
              display: 'inline-flex',
              background: 'rgba(22, 163, 74, 0.2)',
              color: '#86EFAC',
              borderRadius: '999px',
              padding: '7px 16px',
              fontSize: '13.5px',
              fontWeight: 800,
              marginBottom: '20px'
            }}>
              فلسفة Give to Get
            </div>
            <h2 style={{
              fontSize: '34px',
              fontWeight: 900,
              margin: '0 0 18px',
              lineHeight: '1.3'
            }}>
              ساهم بمعلوماتك، لتستفيد من معلومات الآخرين
            </h2>
            <p style={{
              fontSize: '17px',
              lineHeight: '1.85',
              color: '#CBD5E1',
              margin: '0 0 26px'
            }}>
              قوة "مرصد" تأتي من المجتمع. كلما ساهمت بتقارير معتمدة عن تعاملاتك، حصلت على وصول أوسع وتقارير أعمق عن شركائك المحتملين.
            </p>
            <div style={{ display: 'flex', gap: '14px' }}>
              <div style={{
                flex: 1,
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '14px',
                padding: '18px'
              }}>
                <div style={{ fontSize: '28px', fontWeight: 900, color: '#86EFAC' }}>+1</div>
                <div style={{ fontSize: '14px', color: '#CBD5E1', fontWeight: 600 }}>تقرير معتمد</div>
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                color: '#64748B',
                fontSize: '24px',
                fontWeight: 900
              }}>
                ←
              </div>
              <div style={{
                flex: 1,
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '14px',
                padding: '18px'
              }}>
                <div style={{ fontSize: '28px', fontWeight: 900, color: '#86EFAC' }}>+5</div>
                <div style={{ fontSize: '14px', color: '#CBD5E1', fontWeight: 600 }}>عمليات بحث</div>
              </div>
            </div>
          </div>
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '20px',
            padding: '30px'
          }}>
            <div style={{ fontSize: '15px', fontWeight: 800, marginBottom: '8px' }}>مستوى مساهمتك</div>
            <div style={{ fontSize: '13.5px', color: '#94A3B8', marginBottom: '18px' }}>
              أنت ضمن أعلى 15% من المساهمين هذا الشهر
            </div>
            <div style={{
              height: '12px',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              overflow: 'hidden',
              marginBottom: '8px'
            }}>
              <div style={{
                width: '78%',
                height: '100%',
                background: 'linear-gradient(90deg, #16A34A, #4ADE80)',
                borderRadius: '8px'
              }}></div>
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '12.5px',
              color: '#94A3B8',
              fontWeight: 600
            }}>
              <span>مساهم نشط</span>
              <span>78%</span>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST SCORE CALCULATION */}
      <section style={{
        maxWidth: '1100px',
        margin: '0 auto',
        padding: '74px 28px',
        textAlign: 'center'
      }}>
        <h2 style={{
          fontSize: '34px',
          fontWeight: 900,
          color: '#0F172A',
          margin: '0 0 12px'
        }}>
          كيف يُحسب مؤشر الثقة؟
        </h2>
        <p style={{ fontSize: '17px', color: '#64748B', margin: '0 0 44px' }}>
          ثلاث طبقات متكاملة تضمن تقييماً متوازناً يصعب التلاعب به
        </p>
        <div style={{
          background: '#fff',
          border: '1px solid #E2E8F0',
          borderRadius: '20px',
          padding: '40px'
        }}>
          <div style={{
            display: 'flex',
            borderRadius: '14px',
            overflow: 'hidden',
            height: '64px',
            marginBottom: '30px'
          }}>
            <div style={{
              width: '30%',
              background: '#1E2A52',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 800,
              fontSize: '16px'
            }}>
              30%
            </div>
            <div style={{
              width: '50%',
              background: '#16A34A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 800,
              fontSize: '16px'
            }}>
              50%
            </div>
            <div style={{
              width: '20%',
              background: '#64748B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 800,
              fontSize: '16px'
            }}>
              20%
            </div>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '24px',
            textAlign: 'right'
          }}>
            {[
              { color: '#1E2A52', title: 'البيانات الرسمية', desc: 'السجل التجاري، حالة الشركة، وعمرها من المصادر الرسمية.' },
              { color: '#16A34A', title: 'بيانات المجتمع', desc: 'تقارير معتمدة من شركات تعاملت معها فعلياً، بشكل مجمّع وسرّي.' },
              { color: '#64748B', title: 'تقييم المنصة', desc: 'تحليل آلي للأنماط ومؤشرات الالتزام عبر الزمن.' }
            ].map((layer, i) => (
              <div key={i}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '8px' }}>
                  <span style={{
                    width: '13px',
                    height: '13px',
                    borderRadius: '4px',
                    background: layer.color
                  }}></span>
                  <span style={{ fontWeight: 800, fontSize: '16px' }}>{layer.title}</span>
                </div>
                <p style={{
                  fontSize: '14.5px',
                  color: '#64748B',
                  lineHeight: '1.7',
                  margin: 0
                }}>
                  {layer.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '0 28px 80px'
      }}>
        <div style={{
          background: 'linear-gradient(120deg, #16A34A, #0E7C3A)',
          borderRadius: '24px',
          padding: '54px',
          textAlign: 'center',
          color: '#fff',
          boxShadow: '0 20px 50px rgba(22, 163, 74, 0.25)'
        }}>
          <h2 style={{ fontSize: '32px', fontWeight: 900, margin: '0 0 14px' }}>
            جاهز لاتخاذ قرارات تجارية أكثر أماناً؟
          </h2>
          <p style={{ fontSize: '17.5px', color: '#DCFCE7', margin: '0 0 28px' }}>
            انضم لآلاف الشركات التي تعتمد على "مرصد" قبل كل تعامل
          </p>
          <button
            onClick={() => navigate('/register')}
            style={{
              background: '#fff',
              color: '#15803D',
              border: 0,
              borderRadius: '12px',
              padding: '16px 40px',
              fontSize: '17px',
              fontWeight: 900,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => e.target.style.opacity = '0.9'}
            onMouseLeave={e => e.target.style.opacity = '1'}
          >
            أنشئ حسابك المجاني
          </button>
        </div>
      </section>
    </main>
  )
}
