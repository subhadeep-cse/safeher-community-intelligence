import React, { useState } from 'react';
import { AlertCircle, MapPin, Clock, ShieldCheck, ThumbsUp, ThumbsDown, User } from 'lucide-react';
import { verifyIncident } from '../services/api';
import toast from 'react-hot-toast';

const ReportCard = ({ incident, onUpdate, onGenerateTestRoutes }) => {
  const [isVerifying, setIsVerifying] = useState(false);

  const getSeverityColor = (sev) => {
    switch(sev.toLowerCase()) {
      case 'critical': return 'var(--color-danger)';
      case 'high': return 'var(--color-danger)';
      case 'medium': return 'var(--color-warning)';
      case 'low': return 'var(--color-safe)';
      default: return 'var(--text-secondary)';
    }
  };

  const handleVerify = async (action) => {
    const voted = localStorage.getItem(`voted_${incident.id}`);
    if (voted) {
      toast.error('You have already voted on this report.');
      return;
    }

    try {
      setIsVerifying(true);
      const updatedIncident = await verifyIncident(incident.id, action);
      localStorage.setItem(`voted_${incident.id}`, 'true');
      toast.success(action === 'verify' ? 'Report verified!' : 'Disagreement recorded.');
      if (onUpdate) onUpdate(updatedIncident);
    } catch (error) {
      toast.error('Failed to update verification.');
    } finally {
      setIsVerifying(false);
    }
  };

  // Build human readable multi-line address
  const buildAddressDisplay = () => {
    const parts = [
      incident.landmark,
      incident.street || incident.road,
      incident.neighbourhood || incident.locality,
      incident.suburb,
      incident.city,
      incident.postal_code,
      incident.state
    ].filter(Boolean);
    
    // Dedup adjacent identical elements 
    const uniqueParts = parts.filter((item, pos, arr) => pos === 0 || item !== arr[pos - 1]);

    if (uniqueParts.length === 0) {
      return `${incident.latitude.toFixed(4)}, ${incident.longitude.toFixed(4)}`;
    }

    // Split into readable lines or just comma separated
    // The prompt requested format like:
    // Anwar Shah Road,
    // Jyotish Roy Colony,
    // Lake Gardens,
    // Kolkata
    return uniqueParts.map((part, index) => (
      <span key={index} style={{ display: 'block' }}>
        {part}{index < uniqueParts.length - 1 ? ',' : ''}
      </span>
    ));
  };

  const isTrusted = incident.verified_count >= 5;

  return (
    <div className="glass-panel animate-fade-in" style={{ padding: '20px', marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '12px', border: isTrusted ? '1px solid var(--color-safe)' : '1px solid var(--border-glass)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={20} color="var(--color-primary)" />
            {incident.incident_type}
            
            {isTrusted && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(45, 212, 191, 0.1)', color: 'var(--color-safe)', padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}>
                <ShieldCheck size={14} /> Trusted
              </span>
            )}
          </h3>
        </div>
        <span style={{ 
          background: 'rgba(255,255,255,0.1)', 
          padding: '4px 8px', 
          borderRadius: '12px', 
          fontSize: '12px',
          color: getSeverityColor(incident.severity),
          fontWeight: 'bold'
        }}>
          {incident.severity}
        </span>
      </div>
      
      <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5', color: 'var(--text-primary)' }}>
        {incident.description}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
          <MapPin size={16} color="var(--text-muted)" style={{ marginTop: '2px', flexShrink: 0 }} />
          <div style={{ lineHeight: '1.4' }}>
            {buildAddressDisplay()}
          </div>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <User size={16} color="var(--text-muted)" />
            {incident.reporter_name || 'Anonymous'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={16} color="var(--text-muted)" />
            {new Date(incident.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '15px', borderTop: '1px solid var(--border-glass)' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={() => handleVerify('verify')} 
            disabled={isVerifying}
            className="glass-panel" 
            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', cursor: 'pointer', color: 'var(--color-safe)', border: '1px solid rgba(45, 212, 191, 0.3)', background: 'transparent' }}
          >
            <ThumbsUp size={14} /> {incident.verified_count}
          </button>
          <button 
            onClick={() => handleVerify('disagree')} 
            disabled={isVerifying}
            className="glass-panel" 
            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', cursor: 'pointer', color: 'var(--color-danger)', border: '1px solid rgba(244, 63, 94, 0.3)', background: 'transparent' }}
          >
            <ThumbsDown size={14} /> {incident.disagree_count || 0}
          </button>
        </div>
        <span style={{ fontSize: '13px', fontWeight: 'bold', color: incident.status === 'Active' ? 'var(--color-warning)' : 'var(--color-safe)' }}>
          {incident.status}
        </span>
      </div>


    </div>
  );
};

export default ReportCard;
