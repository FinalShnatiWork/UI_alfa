import { useEffect, useState } from 'react';

interface NNAdvisorPanelProps {
  symbol: string;
  volume: number;
  currentPrice: number;
}

export function NNAdvisorPanel({ symbol, volume, currentPrice }: NNAdvisorPanelProps) {
  const [prediction, setPrediction] = useState<{
    matchProb: number;
    expectedSavings: number;
    routeRecommendation: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function fetchLivePrediction() {
      setLoading(true);
      setError(null);
      try {
        let scaledPrice = currentPrice;
        if (currentPrice > 0) {
          const log10 = Math.log10(currentPrice);
          const exp = Math.round(log10) - 2;
          scaledPrice = currentPrice / Math.pow(10, exp);
        }
        const buyQtyNorm = volume / 100.0;
        const sellQtyNorm = 0.45; 
        const spreadNorm = Math.min((scaledPrice * 0.00015) / 1.0, 1.0);  
        const imbalance = (volume - 45) / (volume + 45);
        const midPriceNorm = Math.min(scaledPrice / 200.0, 1.0);
        const bookDepthBuy = 0.6;
        const bookDepthSell = 0.5;
        const historicalMatchRate = 0.72;

        const response = await fetch('http://localhost:3005/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            features: [
              buyQtyNorm, sellQtyNorm, spreadNorm, imbalance,
              midPriceNorm, bookDepthBuy, bookDepthSell, historicalMatchRate
            ]
          })
        });

        if (response.ok) {
          const data = await response.json();
          if (active) {
            if (data.prediction && Array.isArray(data.prediction) && data.prediction.length >= 3) {
              setPrediction({
                matchProb: data.prediction[0],
                expectedSavings: data.prediction[1],
                routeRecommendation: data.prediction[2]
              });
            } else if (data.prediction) {
              setPrediction({
                matchProb: data.prediction.matchProb ?? 0.8,
                expectedSavings: data.prediction.expectedSavings ?? 0.12,
                routeRecommendation: data.prediction.routeRecommendation ?? 1
              });
            }
          }
        } else {
          throw new Error('Prediction server error');
        }
      } catch (err) {
        if (active) {
          setError('NN Advisor Server Offline');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    if (volume > 0 && currentPrice > 0) {
      void fetchLivePrediction();
    }

    return () => {
      active = false;
    };
  }, [symbol, volume, currentPrice]);

  if (volume <= 0 || currentPrice <= 0) return null;

  if (error) {
    return (
      <div style={{
        marginTop: '16px',
        padding: '12px 16px',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        borderRadius: '12px',
        background: 'rgba(239, 68, 68, 0.02)',
        color: 'var(--text-secondary, #94a3b8)',
        fontSize: '0.8rem',
        textAlign: 'center'
      }}>
        ⚠️ {error} (Port 3005)
      </div>
    );
  }

  if (loading && !prediction) {
    return (
      <div style={{
        marginTop: '16px',
        padding: '16px',
        border: '1px solid var(--border-light, rgba(255, 255, 255, 0.08))',
        borderRadius: '12px',
        textAlign: 'center',
        color: 'var(--text-secondary, #94a3b8)',
        fontSize: '0.82rem'
      }}>
        Analyzing order book parameters...
      </div>
    );
  }

  if (!prediction) return null;

  const isInternal = prediction.routeRecommendation > 0.5;

  return (
    <div style={{
      marginTop: '16px',
      background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(168, 85, 247, 0.05) 100%)',
      border: '1px solid rgba(99, 102, 241, 0.2)',
      borderRadius: '14px',
      padding: '16px',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
      fontFamily: "'Inter', sans-serif"
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <span style={{ fontSize: '1.2rem' }}>🧠</span>
        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#8b5cf6' }}>AI Smart Routing Advisor</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #94a3b8)' }}>ניתוב מומלץ:</span>
          <span style={{
            background: isInternal ? 'rgba(34, 197, 94, 0.15)' : 'rgba(99, 102, 241, 0.15)',
            color: isInternal ? '#22c55e' : '#6366f1',
            padding: '3px 10px',
            borderRadius: '20px',
            fontSize: '0.75rem',
            fontWeight: 700
          }}>
            {isInternal ? 'Internal Crossing (מקומי)' : 'External Market (MT5)'}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
            <span style={{ color: 'var(--text-secondary, #94a3b8)' }}>הסתברות התאמה:</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary, #fff)' }}>{(prediction.matchProb * 100).toFixed(1)}%</span>
          </div>
          <div style={{
            width: '100%',
            height: '5px',
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            borderRadius: '3px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${Math.min(100, Math.max(0, prediction.matchProb * 100))}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
              borderRadius: '3px',
              transition: 'width 0.4s ease-out'
            }} />
          </div>
        </div>

        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          borderTop: '1px solid rgba(255, 255, 255, 0.08)', 
          paddingTop: '8px',
          fontSize: '0.8rem'
        }}>
          <span style={{ color: 'var(--text-secondary, #94a3b8)' }}>חיסכון משוער בעמלה:</span>
          <span style={{ fontWeight: 700, color: '#22c55e', fontSize: '0.9rem' }}>
            ${(prediction.expectedSavings * volume).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
