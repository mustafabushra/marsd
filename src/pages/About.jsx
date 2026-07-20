import { CheckIcon } from '../components/icons'

export default function About() {
  return (
    <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '60px 28px 80px', direction: 'rtl' }}>
      <div style={{ textAlign: 'right', marginBottom: '54px' }}>
        <div style={{
          display: 'inline-flex',
          background: '#EEF2FF',
          color: '#1E2A52',
          borderRadius: '999px',
          padding: '7px 16px',
          fontSize: '13.5px',
          fontWeight: 800,
          marginBottom: '18px'
        }}>
          عن المنصة
        </div>
        <h1 style={{
          fontSize: '42px',
          fontWeight: 900,
          color: '#0F172A',
          margin: '0 0 16px',
          lineHeight: '1.3',
          textAlign: 'right'
        }}>
          نبني مرجعاً موثوقاً لتقييم شركاء الأعمال
        </h1>
        <p style={{
          fontSize: '19px',
          color: '#64748B',
          lineHeight: '1.8',
          margin: '0 auto',
          maxWidth: '680px',
          textAlign: 'right'
        }}>
          رسالتنا تمكين الشركات من اتخاذ قرارات تعامل مدروسة، عبر بيانات شفافة ومجتمع يساهم في حماية بعضه البعض.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '24px',
        marginBottom: '24px'
      }}>
        <div style={{
          background: '#fff',
          border: '1px solid #E2E8F0',
          borderRadius: '18px',
          padding: '32px'
        }}>
          <div style={{
            width: '50px',
            height: '50px',
            borderRadius: '13px',
            background: '#FEF2F2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '18px',
            fontSize: '24px'
          }}>
            ⚠
          </div>
          <h3 style={{
            fontSize: '22px',
            fontWeight: 800,
            color: '#1E2A52',
            margin: '0 0 12px',
            textAlign: 'right'
          }}>
            المشكلة
          </h3>
          <p style={{
            fontSize: '15.5px',
            lineHeight: '1.8',
            color: '#64748B',
            margin: 0,
            textAlign: 'right'
          }}>
            تتعامل الشركات مع شركاء جدد دون مرجع موحّد لتقييم التزامهم المالي، ما يعرّضها لمخاطر التعثّر والتأخر في السداد.
          </p>
        </div>

        <div style={{
          background: '#fff',
          border: '1px solid #E2E8F0',
          borderRadius: '18px',
          padding: '32px'
        }}>
          <div style={{
            width: '50px',
            height: '50px',
            borderRadius: '13px',
            background: '#ECFDF5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '18px',
            color: '#16A34A'
          }}>
            <CheckIcon />
          </div>
          <h3 style={{
            fontSize: '22px',
            fontWeight: 800,
            color: '#1E2A52',
            margin: '0 0 12px'
          }}>
            الحل
          </h3>
          <p style={{
            fontSize: '15.5px',
            lineHeight: '1.8',
            color: '#64748B',
            margin: 0
          }}>
            مؤشر ثقة موحّد ومستوى مخاطر واضح لكل شركة، مبني على بيانات رسمية وتقارير مجتمعية معتمدة
          </p>
        </div>
      </div>

      <div style={{
        background: '#fff',
        border: '1px solid #E2E8F0',
        borderRadius: '18px',
        padding: '38px',
        marginBottom: '24px'
      }}>
        <h3 style={{
          fontSize: '24px',
          fontWeight: 900,
          color: '#1E2A52',
          margin: '0 0 8px',
          textAlign: 'right'
        }}>
          نموذج الثقة — ثلاث طبقات
        </h3>
        <p style={{
          fontSize: '15.5px',
          color: '#64748B',
          margin: '0 0 26px',
          textAlign: 'right'
        }}>
          تقييم متوازن يصعب التلاعب به لأنه لا يعتمد على مصدر واحد.
        </p>
        <div style={{
          display: 'flex',
          borderRadius: '14px',
          overflow: 'hidden',
          height: '58px',
          marginBottom: '22px'
        }}>
          <div style={{
            width: '30%',
            background: '#1E2A52',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 800
          }}>
            رسمية 30%
          </div>
          <div style={{
            width: '50%',
            background: '#16A34A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 800
          }}>
            مجتمعية 50%
          </div>
          <div style={{
            width: '20%',
            background: '#64748B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 800
          }}>
            المنصة 20%
          </div>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '24px'
      }}>
        <div style={{
          background: '#fff',
          border: '1px solid #E2E8F0',
          borderRadius: '18px',
          padding: '32px'
        }}>
          <h3 style={{
            fontSize: '21px',
            fontWeight: 800,
            color: '#1E2A52',
            margin: '0 0 12px',
            textAlign: 'right'
          }}>
            كيف نحمي النظام من التلاعب؟
          </h3>
          <p style={{
            fontSize: '15.5px',
            lineHeight: '1.8',
            color: '#64748B',
            margin: 0,
            textAlign: 'right'
          }}>
            يقوم التقييم على مبدأ الإجماع، لا على رأي شركة واحدة. التقرير الفردي لا يؤثر بشكل حاسم، بل تتراكم المؤشرات من عدة مصادر معتمدة قبل أن تنعكس على المؤشر.
          </p>
        </div>

        <div style={{
          background: '#fff',
          border: '1px solid #E2E8F0',
          borderRadius: '18px',
          padding: '32px'
        }}>
          <h3 style={{
            fontSize: '21px',
            fontWeight: 800,
            color: '#1E2A52',
            margin: '0 0 12px',
            textAlign: 'right'
          }}>
            خصوصية بيانات المبلّغين
          </h3>
          <p style={{
            fontSize: '15.5px',
            lineHeight: '1.8',
            color: '#64748B',
            margin: 0,
            textAlign: 'right'
          }}>
            لا تُعرض أبداً أسماء الشركات المبلّغة. تظهر المؤشرات بشكل مجمّع وسرّي فقط، لحماية المساهمين وتشجيع المشاركة الصادقة.
          </p>
        </div>
      </div>
    </main>
  )
}
