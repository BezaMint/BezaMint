import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'BezaMint — NFT Creation on Stellar';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #06271a 0%, #0a0f1a 60%, #111827 100%)',
        color: 'white',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 112,
          height: 112,
          borderRadius: 28,
          background: 'linear-gradient(135deg, #24a563, #7cd9a3)',
          marginBottom: 32,
        }}
      >
        <svg width="64" height="64" viewBox="0 0 40 40" fill="none">
          <path d="M12 28L20 10L28 28H12Z" fill="white" fillOpacity="0.9" />
        </svg>
      </div>
      <div style={{ display: 'flex', fontSize: 72, fontWeight: 700, marginBottom: 16 }}>
        BezaMint
      </div>
      <div style={{ display: 'flex', fontSize: 30, color: '#9ca3af', textAlign: 'center' }}>
        NFT creation and digital asset management on Stellar
      </div>
    </div>,
    { ...size },
  );
}
