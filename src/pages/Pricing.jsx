import { mockPricingTiers } from '../data/mockData'
import { CheckIcon } from '../components/icons'

export default function Pricing() {
  return (
    <main style={{ maxWidth: '1240px', margin: '0 auto', padding: '60px 28px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: '46px' }}>
        <h1 style={{
          fontSize: '42px',
          fontWeight: 900,
          color: '#0F172A',
          margin: '0 0 14px 0',
          textAlign: 'right'
        }}>
          باقات تناسب كل حجم أعمال
        </h1>
        <p style={{
          fontSize: '18px',
          color: '#64748B',
          margin: '0 0 0 0',
          textAlign: 'right'
        }}>
          ابدأ مجاناً وارتقِ متى احتجت تقارير أعمق وأدوات أقوى
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '20px',
        alignItems: 'start'
      }}>
        {mockPricingTiers.map((tier, i) => (
          <div
            key={i}
            style={{
              background: '#fff',
              border: tier.border,
              borderRadius: '18px',
              padding: '30px 26px',
              position: 'relative',
              boxShadow: tier.shadow
            }}
          >
            {tier.badge && (
              <div style={{
                position: 'absolute',
                top: '-13px',
                right: '26px',
                background: '#16A34A',
                color: '#fff',
                fontSize: '12.5px',
                fontWeight: 800,
                padding: '6px 14px',
                borderRadius: '999px'
              }}>
                {tier.badge}
              </div>
            )}

            <h3 style={{
              fontSize: '21px',
              fontWeight: 900,
              color: '#1E2A52',
              margin: '0 0 6px'
            }}>
              {tier.name}
            </h3>
            <p style={{
              fontSize: '13.5px',
              color: '#64748B',
              margin: '0 0 18px',
              minHeight: '38px',
              lineHeight: '1.6'
            }}>
              {tier.tagline}
            </p>

            <div style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '6px',
              marginBottom: '22px'
            }}>
              <span style={{
                fontSize: '36px',
                fontWeight: 900,
                color: '#0F172A'
              }}>
                {tier.price}
              </span>
              <span style={{
                fontSize: '14px',
                color: '#94A3B8',
                fontWeight: 600
              }}>
                {tier.period}
              </span>
            </div>

            <button
              style={{
                width: '100%',
                border: 0,
                borderRadius: '11px',
                padding: '13px',
                fontSize: '15px',
                fontWeight: 800,
                cursor: 'pointer',
                marginBottom: '22px',
                background: tier.ctaBg,
                color: tier.ctaColor,
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => e.target.style.opacity = '0.9'}
              onMouseLeave={e => e.target.style.opacity = '1'}
            >
              {tier.cta}
            </button>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '13px'
            }}>
              {tier.features.map((feature, j) => (
                <div
                  key={j}
                  style={{
                    display: 'flex',
                    gap: '9px',
                    alignItems: 'flex-start'
                  }}
                >
                  <span style={{
                    color: '#16A34A',
                    fontWeight: 900,
                    flex: 'none',
                    marginTop: '1px',
                    display: 'flex',
                    alignItems: 'center'
                  }}>
                    <CheckIcon />
                  </span>
                  <span style={{
                    fontSize: '14px',
                    color: '#334155',
                    lineHeight: '1.5'
                  }}>
                    {feature}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
