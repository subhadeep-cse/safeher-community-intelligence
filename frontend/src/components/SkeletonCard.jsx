import React from 'react';

const SkeletonCard = () => {
  return (
    <div className="glass-panel skeleton-container" style={{ padding: '15px', marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="skeleton" style={{ width: '120px', height: '20px', borderRadius: '4px' }}></div>
        <div className="skeleton" style={{ width: '60px', height: '24px', borderRadius: '12px' }}></div>
      </div>
      <div className="skeleton" style={{ width: '100%', height: '40px', borderRadius: '4px' }}></div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div className="skeleton" style={{ width: '100px', height: '15px', borderRadius: '4px' }}></div>
        <div className="skeleton" style={{ width: '80px', height: '15px', borderRadius: '4px' }}></div>
      </div>
    </div>
  );
};

export default SkeletonCard;
