import { useState } from 'react'
import { CheckIcon } from '../components/icons'

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    subject: '',
    message: ''
  })
  const [submitted, setSubmitted] = useState(false)

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setSubmitted(true)
    setTimeout(() => setSubmitted(false), 3000)
    setFormData({ name: '', company: '', email: '', phone: '', subject: '', message: '' })
  }

  return (
    <main style={{ maxWidth: '1080px', margin: '0 auto', padding: '60px 28px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: '46px' }}>
        <h1 style={{
          fontSize: '40px',
          fontWeight: 900,
          color: '#0F172A',
          margin: '0 0 14px 0',
          textAlign: 'right'
        }}>
          تواصل معنا
        </h1>
        <p style={{
          fontSize: '18px',
          color: '#64748B',
          margin: '0 0 0 0',
          textAlign: 'right'
        }}>
          سعداء بالإجابة على استفساراتك ومساعدتك في اختيار الباقة المناسبة
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.3fr 1fr',
        gap: '24px',
        alignItems: 'start'
      }}>
        {/* Contact Form */}
        <div style={{
          background: '#fff',
          border: '1px solid #E2E8F0',
          borderRadius: '20px',
          padding: '34px'
        }}>
          <h3 style={{
            fontSize: '21px',
            fontWeight: 900,
            color: '#0F172A',
            margin: '0 0 22px 0',
            textAlign: 'right'
          }}>
            أرسل لنا رسالة
          </h3>

          <form onSubmit={handleSubmit}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px'
            }}>
              <div>
                <label style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#334155',
                  display: 'block',
                  marginBottom: '7px',
                  textAlign: 'right'
                }}>
                  الاسم الكامل
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="اسمك"
                  style={{
                    width: '100%',
                    border: '1.5px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    fontSize: '15px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  required
                />
              </div>

              <div>
                <label style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#334155',
                  display: 'block',
                  marginBottom: '7px',
                  textAlign: 'right'
                }}>
                  اسم الشركة
                </label>
                <input
                  type="text"
                  name="company"
                  value={formData.company}
                  onChange={handleChange}
                  placeholder="شركتك"
                  style={{
                    width: '100%',
                    border: '1.5px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    fontSize: '15px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  required
                />
              </div>

              <div>
                <label style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#334155',
                  display: 'block',
                  marginBottom: '7px',
                  textAlign: 'right'
                }}>
                  البريد الإلكتروني
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@company.sa"
                  style={{
                    width: '100%',
                    border: '1.5px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    fontSize: '15px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  required
                />
              </div>

              <div>
                <label style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#334155',
                  display: 'block',
                  marginBottom: '7px',
                  textAlign: 'right'
                }}>
                  رقم الجوال
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="05XXXXXXXX"
                  style={{
                    width: '100%',
                    border: '1.5px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    fontSize: '15px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  required
                />
              </div>

              <div style={{ gridColumn: '1/3' }}>
                <label style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#334155',
                  display: 'block',
                  marginBottom: '7px',
                  textAlign: 'right'
                }}>
                  موضوع الرسالة
                </label>
                <input
                  type="text"
                  name="subject"
                  value={formData.subject}
                  onChange={handleChange}
                  placeholder="استفسار عن الباقات"
                  style={{
                    width: '100%',
                    border: '1.5px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    fontSize: '15px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  required
                />
              </div>

              <div style={{ gridColumn: '1/3' }}>
                <label style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#334155',
                  display: 'block',
                  marginBottom: '7px',
                  textAlign: 'right'
                }}>
                  رسالتك
                </label>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  placeholder="اكتب استفسارك هنا..."
                  style={{
                    width: '100%',
                    border: '1.5px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    fontSize: '15px',
                    outline: 'none',
                    minHeight: '120px',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box'
                  }}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              style={{
                background: '#16A34A',
                color: '#fff',
                border: 0,
                borderRadius: '11px',
                padding: '14px 30px',
                fontSize: '16px',
                fontWeight: 800,
                cursor: 'pointer',
                marginTop: '20px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => e.target.style.opacity = '0.9'}
              onMouseLeave={e => e.target.style.opacity = '1'}
            >
              إرسال الرسالة
            </button>

            {submitted && (
              <div style={{
                background: '#DCFCE7',
                color: '#166534',
                padding: '12px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                marginTop: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <CheckIcon />
                شكراً لتواصلك معنا. سنرد عليك قريباً.
              </div>
            )}
          </form>
        </div>

        {/* Contact Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{
            background: '#fff',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '24px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '13px',
              marginBottom: '14px'
            }}>
              <span style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: '#ECFDF5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px'
              }}>
                ✉
              </span>
              <div>
                <div style={{
                  fontSize: '13px',
                  color: '#94A3B8',
                  fontWeight: 700
                }}>
                  البريد الإلكتروني
                </div>
                <div style={{
                  fontSize: '15.5px',
                  fontWeight: 800,
                  color: '#0F172A',
                  direction: 'ltr',
                  textAlign: 'right'
                }}>
                  support@marsad.sa
                </div>
              </div>
            </div>
          </div>

          <div style={{
            background: '#fff',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '24px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '13px',
              marginBottom: '14px'
            }}>
              <span style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: '#EEF2FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px'
              }}>
                ☎
              </span>
              <div>
                <div style={{
                  fontSize: '13px',
                  color: '#94A3B8',
                  fontWeight: 700
                }}>
                  الهاتف الموحّد
                </div>
                <div style={{
                  fontSize: '15.5px',
                  fontWeight: 800,
                  color: '#0F172A',
                  direction: 'ltr',
                  textAlign: 'right'
                }}>
                  920 000 000
                </div>
              </div>
            </div>
          </div>

          <div style={{
            background: '#fff',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '24px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '13px'
            }}>
              <span style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: '#F5F3FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px'
              }}>
                📍
              </span>
              <div>
                <div style={{
                  fontSize: '13px',
                  color: '#94A3B8',
                  fontWeight: 700
                }}>
                  المقر
                </div>
                <div style={{
                  fontSize: '15.5px',
                  fontWeight: 800,
                  color: '#0F172A'
                }}>
                  الرياض، المملكة العربية السعودية
                </div>
              </div>
            </div>
          </div>

          <div style={{
            background: '#1E2A52',
            borderRadius: '16px',
            padding: '24px',
            color: '#fff'
          }}>
            <div style={{
              fontSize: '15px',
              fontWeight: 800,
              marginBottom: '6px'
            }}>
              ساعات العمل
            </div>
            <div style={{
              fontSize: '14px',
              color: '#CBD5E1',
              lineHeight: '1.8'
            }}>
              الأحد – الخميس<br />
              9:00 صباحاً – 5:00 مساءً
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
