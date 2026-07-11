import React from 'react';
import ReportCard from '../components/ReportCard';
import SkeletonCard from '../components/SkeletonCard';
import { ShieldAlert } from 'lucide-react';

const ReportsPage = ({ incidents, loading, error, onIncidentUpdated }) => {
  if (error) {
    return (
      <div className="glass-panel" style={{ textAlign: 'center', padding: '50px', color: 'var(--color-danger)', marginTop: '20px' }}>
        <h3>{error}</h3>
      </div>
    );
  }

  return (
    <div className="glass-panel animate-fade-in" style={{ padding: '30px', minHeight: '80vh' }}>
      <h2 style={{ color: 'var(--color-primary)', borderBottom: '1px solid var(--border-glass)', paddingBottom: '15px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between' }}>
        All Community Reports
        <span style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>
          {loading ? '...' : `${incidents.length} Reports`}
        </span>
      </h2>
      
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : incidents.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            <ShieldAlert size={64} style={{ margin: '0 auto 20px', opacity: 0.5 }} />
            <h3 style={{ margin: '0 0 10px 0' }}>No Reports Yet</h3>
            <p style={{ margin: 0 }}>Be the first to report an incident in your community.</p>
          </div>
        ) : (
          incidents.map(inc => <ReportCard key={inc.id} incident={inc} onUpdate={onIncidentUpdated} />)
        )}
      </div>
    </div>
  );
};

export default ReportsPage;
